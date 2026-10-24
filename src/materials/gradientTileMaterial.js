import * as THREE from 'three';
import { loadImperfectionsTexture } from './tileMaterials.js';
import { getJellyEnvironmentMap } from './jellyMaterials.js';

let _gradientMaterialTemplate = null;

/**
 * Creates a dynamic multi-stop gradient tile material using custom GLSL shader.
 * 
 * Shader Features:
 * - Multi-stop color blending (e.g. Electric Cyan -> Neon Magenta -> Warm Sun Gold -> Electric Violet)
 * - Flowing angular motion (`uAngle`, `uFlowSpeed`, `uTime`)
 * - Radial / Angular flow modes (`uRadialMode`)
 * - Shimmer & touch-flash emissive radiance
 * - Wave distortion frequency & amplitude for liquid holographic look
 */
export function createGradientTileMaterial(textureLoader = null, envMap = null, options = {}) {
  const resolvedEnvMap = envMap || (getJellyEnvironmentMap ? getJellyEnvironmentMap() : null);
  const roughnessBumpMap = loadImperfectionsTexture(textureLoader);

  // Gradient color stops (default: vibrant arcade holographic neon wave)
  const colorsHex = options.colors || [
    0x00f0ff, // Electric Cyan
    0x7000ff, // Deep Neon Purple
    0xff007b, // Vivid Hot Pink
    0xffb700  // Warm Sun Gold
  ];

  const colorObjects = colorsHex.map(c => new THREE.Color(c));
  // Pad or slice to exactly 4 color stops for optimal GLSL uniform vector arrays
  while (colorObjects.length < 4) {
    colorObjects.push(colorObjects[colorObjects.length - 1].clone());
  }

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.20,
    roughness: 0.10,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    sheen: 0.9,
    sheenColor: new THREE.Color(0xffffff),
    roughnessMap: roughnessBumpMap,
    bumpMap: roughnessBumpMap,
    bumpScale: 0.04,
    envMap: resolvedEnvMap,
    envMapIntensity: 1.6
  });

  material.userData = {
    uTime: { value: 0 },
    uColors: { value: colorObjects.slice(0, 4) },
    uAngle: { value: options.angle !== undefined ? options.angle : 0.785398 }, // 45 degrees
    uFlowSpeed: { value: options.flowSpeed !== undefined ? options.flowSpeed : 1.8 },
    uFrequency: { value: options.frequency !== undefined ? options.frequency : 3.5 },
    uTouchFlash: { value: 0.0 },
    uRadialMode: { value: options.radial ? 1.0 : 0.0 }
  };

  material.onBeforeCompile = (shader) => {
    material.userData.shader = shader;

    shader.uniforms.uTime = material.userData.uTime;
    shader.uniforms.uColors = material.userData.uColors;
    shader.uniforms.uAngle = material.userData.uAngle;
    shader.uniforms.uFlowSpeed = material.userData.uFlowSpeed;
    shader.uniforms.uFrequency = material.userData.uFrequency;
    shader.uniforms.uTouchFlash = material.userData.uTouchFlash;
    shader.uniforms.uRadialMode = material.userData.uRadialMode;

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

    shader.fragmentShader = `
      uniform float uTime;
      uniform vec3 uColors[4];
      uniform float uAngle;
      uniform float uFlowSpeed;
      uniform float uFrequency;
      uniform float uTouchFlash;
      uniform float uRadialMode;
      varying vec3 vModelPosition;
      varying vec2 vGlobalUv;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      vec2 dir = vec2(cos(uAngle), sin(uAngle));
      float coord = 0.0;

      if (uRadialMode > 0.5) {
        coord = length(vModelPosition.xz * 30.0) - uTime * uFlowSpeed;
      } else {
        coord = dot(vModelPosition.xz * 35.0, dir) - uTime * uFlowSpeed;
      }

      // Sine wave distortion ripple for iridescent silk gradient look
      float wave = sin(coord * uFrequency * 0.1) * 0.15;
      float t = fract((coord * 0.18) + wave);

      // Smooth multi-stop gradient between 4 color keys (0 -> 1 -> 2 -> 3 -> 0)
      float stepT = t * 4.0;
      int idx = int(floor(stepT));
      float f = smoothstep(0.0, 1.0, fract(stepT));

      vec3 cA = uColors[0];
      vec3 cB = uColors[1];

      if (idx == 0) {
        cA = uColors[0];
        cB = uColors[1];
      } else if (idx == 1) {
        cA = uColors[1];
        cB = uColors[2];
      } else if (idx == 2) {
        cA = uColors[2];
        cB = uColors[3];
      } else {
        cA = uColors[3];
        cB = uColors[0];
      }

      vec3 gradientColor = mix(cA, cB, f);

      // Subtle metallic highlight sheen on tile rim
      float rim = 1.0 - clamp(dot(vec3(0.0, 1.0, 0.0), vNormal), 0.0, 1.0);
      gradientColor += vec3(0.12) * pow(rim, 2.0);

      diffuseColor.rgb = gradientColor;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      if (uTouchFlash > 0.0) {
        totalEmissiveRadiance += vec3(1.5, 1.8, 2.2) * uTouchFlash * 2.5;
      }
      `
    );
  };

  _gradientMaterialTemplate = material;
  return material;
}

export function updateGradientMaterialTime(dt, material = null) {
  const mat = material || _gradientMaterialTemplate;
  if (mat && mat.userData && mat.userData.uTime) {
    mat.userData.uTime.value += dt;
    if (mat.userData.uTouchFlash.value > 0) {
      mat.userData.uTouchFlash.value = Math.max(0, mat.userData.uTouchFlash.value - dt * 3.5);
    }
  }
}

export function disposeGradientTileMaterial() {
  if (_gradientMaterialTemplate) {
    _gradientMaterialTemplate.dispose();
    _gradientMaterialTemplate = null;
  }
}
