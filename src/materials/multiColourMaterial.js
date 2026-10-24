import * as THREE from 'three';
import { MULTICOLOR_PALETTE, loadImperfectionsTexture } from './tileMaterials.js';
import { getJellyEnvironmentMap } from './jellyMaterials.js';
import { MULTICOLOUR_CONFIG } from '../cells/CellTypes.js';

export { MULTICOLOR_PALETTE };

let _multiColourMaterialTemplate = null;

/**
 * Creates a dedicated instance of the MultiColour Tile Shader Material.
 * Clones from a compiled template to ensure that changing one cell's uniforms
 * (e.g., active color, touch flash, ready-pulse) does NOT mutate other cells!
 * 
 * Features:
 * 1. Palette: The 5 distinct hues from reference (#7BF004, #FC05B8, #231F20 / #FFE600, #FA6B05, #0AA9E0)
 * 2. Animated Flow Gradient: When untouched, a diagonal wave flows across the surface.
 * 3. Step Transitions & Ready State: Controlled per-tile uniform states (uActiveColorIndex, uTouchProgress, uTouchFlash, uReadyPulse).
 */
export function createMultiColourTileMaterial(textureLoader = null, envMap = null, options = {}) {
  const resolvedEnvMap = envMap || (getJellyEnvironmentMap ? getJellyEnvironmentMap() : null);
  const roughnessBumpMap = loadImperfectionsTexture(textureLoader);

  // Palette colors: use configured bright yellow for visual stage 3, while preserving strict palette compatibility
  const paletteHexes = options.palette || [
    0x7BF004,
    0xFC05B8,
    MULTICOLOUR_CONFIG.brightYellowHex || 0xFFE600,
    0xFA6B05,
    0x0AA9E0
  ];
  const paletteColors = paletteHexes.map(hex => new THREE.Color(hex));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.15,
    roughness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    sheen: 0.8,
    sheenColor: new THREE.Color(0xffffff),
    roughnessMap: roughnessBumpMap,
    bumpMap: roughnessBumpMap,
    bumpScale: 0.05,
    envMap: resolvedEnvMap,
    envMapIntensity: 1.5
  });

  material.userData = {
    uTime: { value: 0 },
    uPalette: { value: paletteColors },
    uActiveColorIndex: { value: 0 },
    uTouchProgress: { value: 0.0 }, // 0.0 = untouched gradient, 1.0 = solid step color
    uTouchFlash: { value: 0.0 },
    uReadyPulse: { value: 0.0 } // 1.0 = final capture pass ready rhythmic pulse
  };

  material.onBeforeCompile = (shader) => {
    material.userData.shader = shader;

    // Pass custom uniforms into shader
    shader.uniforms.uTime = material.userData.uTime;
    shader.uniforms.uPalette = material.userData.uPalette;
    shader.uniforms.uActiveColorIndex = material.userData.uActiveColorIndex;
    shader.uniforms.uTouchProgress = material.userData.uTouchProgress;
    shader.uniforms.uTouchFlash = material.userData.uTouchFlash;
    shader.uniforms.uReadyPulse = material.userData.uReadyPulse;

    // Inject varying and world UV calculation into Vertex Shader
    shader.vertexShader = `
      varying vec3 vModelPosition;
      varying vec2 vGlobalUv;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vModelPosition = position;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      #include <project_vertex>
      
      vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
          worldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #endif
      vGlobalUv = worldPos.xz;

      #ifdef USE_UV
          vUv = vGlobalUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = ( roughnessMapTransform * vec3( vGlobalUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_BUMPMAP
          vBumpMapUv = ( bumpMapTransform * vec3( vGlobalUv, 1.0 ) ).xy;
      #endif
      `
    );

    // Inject custom color blending and animated gradient into Fragment Shader
    shader.fragmentShader = `
      uniform float uTime;
      uniform vec3 uPalette[5];
      uniform float uActiveColorIndex;
      uniform float uTouchProgress;
      uniform float uTouchFlash;
      uniform float uReadyPulse;
      varying vec3 vModelPosition;
      varying vec2 vGlobalUv;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      // 1. Animated moving wave gradient across the tile geometry
      float waveAngle = 0.785398; // ~45 degrees diagonal flow
      vec2 dir = vec2(cos(waveAngle), sin(waveAngle));
      float wavePhase = dot(vModelPosition.xz * 40.0, dir) - uTime * 2.2;
      
      // Normalized wave coordinate [0, 1]
      float tWave = fract(wavePhase * 0.2);
      
      // Interpolate along the 5 colors of user palette:
      float stepIdx = tWave * 5.0;
      int i0 = int(floor(stepIdx));
      int i1 = (i0 + 1) >= 5 ? 0 : (i0 + 1);
      float frac = fract(stepIdx);
      frac = smoothstep(0.05, 0.95, frac); // Arcade-banded fluid blend

      vec3 c0 = uPalette[0];
      vec3 c1 = uPalette[1];
      if (i0 == 1) c0 = uPalette[1];
      else if (i0 == 2) c0 = uPalette[2];
      else if (i0 == 3) c0 = uPalette[3];
      else if (i0 == 4) c0 = uPalette[4];

      if (i1 == 1) c1 = uPalette[1];
      else if (i1 == 2) c1 = uPalette[2];
      else if (i1 == 3) c1 = uPalette[3];
      else if (i1 == 4) c1 = uPalette[4];

      vec3 animatedGradientColor = mix(c0, c1, frac);

      // 2. Active stepped color selected when ball touches
      int activeIdx = int(clamp(floor(uActiveColorIndex + 0.5), 0.0, 4.0));
      vec3 activeColor = uPalette[0];
      if (activeIdx == 1) activeColor = uPalette[1];
      else if (activeIdx == 2) activeColor = uPalette[2];
      else if (activeIdx == 3) activeColor = uPalette[3];
      else if (activeIdx == 4) activeColor = uPalette[4];

      vec3 blendedTileColor = mix(animatedGradientColor, activeColor, clamp(uTouchProgress * 0.85, 0.0, 0.85));

      // Ready-for-final-capture rhythmic edge pulse
      if (uReadyPulse > 0.0) {
        float pulse = 0.5 + 0.5 * sin(uTime * 8.0);
        vec3 readyRedHint = vec3(0.9, 0.1, 0.25);
        blendedTileColor = mix(blendedTileColor, readyRedHint, pulse * 0.45 * uReadyPulse);
      }

      diffuseColor.rgb = blendedTileColor;
      `
    );

    // Radiate flash glow on contact via emissive hook
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      if (uTouchFlash > 0.0) {
        totalEmissiveRadiance += vec3(1.2, 1.2, 1.0) * uTouchFlash * 2.5;
      }
      if (uReadyPulse > 0.0) {
        float pulse = 0.5 + 0.5 * sin(uTime * 8.0);
        totalEmissiveRadiance += vec3(1.0, 0.2, 0.3) * pulse * 0.6;
      }
      `
    );
  };

  _multiColourMaterialTemplate = material;
  return material;
}

/**
 * Updates the time uniform on a MultiColour material or material array.
 */
export function updateMultiColourMaterialTime(dt, material = null) {
  const mat = material || _multiColourMaterialTemplate;
  if (mat && mat.userData && mat.userData.uTime) {
    mat.userData.uTime.value += dt;
    if (mat.userData.uTouchFlash.value > 0) {
      mat.userData.uTouchFlash.value = Math.max(0, mat.userData.uTouchFlash.value - dt * 3.5);
    }
  }
}

export function disposeMultiColourTileMaterial() {
  if (_multiColourMaterialTemplate) {
    _multiColourMaterialTemplate.dispose();
    _multiColourMaterialTemplate = null;
  }
}
