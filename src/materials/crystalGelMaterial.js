import * as THREE from 'three';
import { getJellyExrMap, loadJellyExrMap } from './jellyMaterials.js';

/**
 * ============================================================================
 * CRYSTAL GEL GLITTER MATERIAL (BoarderGelMaterialImpl)
 * ============================================================================
 * 
 * Shader material for crystals featuring:
 * - 3-stop vertical color gradient (uColorBot -> uColorMid -> uColorTop)
 * - Animated wave oscillation on world Y coordinates
 * - Procedural 3D noise glitter / internal sparkles with refraction vector displacement
 * - Fake Ambient Occlusion on underside (uAoColor & uAoIntensity)
 * - Equirectangular spherical environment reflection from .exr map
 * - Fresnel edge glow with customizable glass thickness
 * - Full Three.js fog integration
 * - Support for both THREE.InstancedMesh and regular THREE.Mesh
 */

export const crystalGelVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vFakeAO;

void main() {
  #ifdef USE_INSTANCING
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  #else
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
  #endif

  vWorldPosition = worldPosition.xyz;
  
  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPosition = -mvPosition.xyz;

  vFakeAO = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

export const crystalGelFragShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uEnv;
uniform vec3 uColorTop, uColorMid, uColorBot, uAoColor;
uniform float uTime, uGradientStretch, uOpacity, uGlitterDensity, uGlitterSize, uRefractionRatio, uGlassThickness, uEnvReflection, uAoIntensity;

varying vec3 vNormal, vViewPosition, vWorldPosition;
varying float vFakeAO;

float rand(vec3 co) { 
  return fract(sin(dot(co, vec3(12.9898, 78.233, 144.7232))) * 43758.5453); 
}

float noise3D(vec3 p) {
  vec3 ip = floor(p); 
  vec3 fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);
  float n000 = rand(ip); 
  float n100 = rand(ip + vec3(1.0, 0.0, 0.0));
  float n010 = rand(ip + vec3(0.0, 1.0, 0.0)); 
  float n110 = rand(ip + vec3(1.0, 1.0, 0.0));
  float n001 = rand(ip + vec3(0.0, 0.0, 1.0)); 
  float n101 = rand(ip + vec3(1.0, 0.0, 1.0));
  float n011 = rand(ip + vec3(0.0, 1.0, 1.0)); 
  float n111 = rand(ip + vec3(1.0, 1.0, 1.0));
  float n0 = mix(mix(n000, n100, fp.x), mix(n010, n110, fp.x), fp.y);
  float n1 = mix(mix(n001, n101, fp.x), mix(n011, n111, fp.x), fp.y);
  return mix(n0, n1, fp.z);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 reflectDir = reflect(-viewDir, normal);

  // Equirectangular spherical reflection mapping with safe clamp
  vec2 envUV = vec2(
    atan(reflectDir.z, reflectDir.x) / 6.28318530718 + 0.5, 
    1.0 - (acos(clamp(reflectDir.y, -1.0, 1.0)) / 3.14159265359)
  );
  vec3 envColor = texture2D(uEnv, envUV).rgb;

  // Fresnel edge glow with safe clamp
  float fresnel = pow(clamp(1.0 - max(0.0, dot(normal, viewDir)), 0.0, 1.0), uGlassThickness);

  // Vertical wave oscillation and gel mix
  float wave = sin(vWorldPosition.y * uGradientStretch + uTime) * 0.2;
  float gelMix = clamp(normal.y + wave + 0.5, 0.0, 1.0);
  vec3 gelColor = mix(mix(uColorBot, uColorMid, smoothstep(0.0, 0.5, gelMix)), uColorTop, smoothstep(0.5, 1.0, gelMix));
  
  gelColor = mix(gelColor, envColor, uEnvReflection * 0.3);

  // Glitter / Sparkles with 3D noise and refraction displacement
  vec3 refrPos = vWorldPosition - reflect(viewDir, normal) * uRefractionRatio * 0.1;
  float gNoise = noise3D(refrPos * uGlitterDensity + uTime * 0.05);
  float sparkle = smoothstep(1.0 - uGlitterSize, 1.0 - uGlitterSize + 0.02, gNoise);
  
  vec3 finalInterior = mix(gelColor, vec3(1.0), sparkle * 0.9);
  finalInterior = mix(finalInterior, uAoColor, (1.0 - vFakeAO) * uAoIntensity);

  vec3 color = mix(finalInterior, envColor, fresnel * uEnvReflection);
  color += envColor * fresnel * 0.5;

  gl_FragColor = vec4(color, uOpacity);

  #include <fog_fragment>
}
`;

/**
 * Predefined color presets tailored to each crystal type in the game:
 * - points / points_crystal: Warm amber gold / sunny yellow (Score +250💎)
 * - emerald / emerald_crystal: Vibrant neon emerald green (Life +1❤️)
 * - modifier / card: Cyberpunk neon magenta & deep purple (Cards 🃏)
 * - candyPink: Pastel pink & purple (Base reference palette)
 */
export const CRYSTAL_GEL_PRESETS = Object.freeze({
  points: {
    uColorTop: '#ffffff',
    uColorMid: '#ffc125',
    uColorBot: '#e66000',
    uAoColor: '#662200',
    uGradientStretch: 8.0,
    uGlitterDensity: 85.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.18,
    uAoIntensity: 0.55
  },
  points_crystal: {
    uColorTop: '#ffffff',
    uColorMid: '#ffc125',
    uColorBot: '#e66000',
    uAoColor: '#662200',
    uGradientStretch: 8.0,
    uGlitterDensity: 85.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.18,
    uAoIntensity: 0.55
  },
  emerald: {
    uColorTop: '#ffffff',
    uColorMid: '#00ff66',
    uColorBot: '#00883a',
    uAoColor: '#003318',
    uGradientStretch: 8.0,
    uGlitterDensity: 80.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.15,
    uAoIntensity: 0.50
  },
  emerald_crystal: {
    uColorTop: '#ffffff',
    uColorMid: '#00ff66',
    uColorBot: '#00883a',
    uAoColor: '#003318',
    uGradientStretch: 8.0,
    uGlitterDensity: 80.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.15,
    uAoIntensity: 0.50
  },
  modifier: {
    uColorTop: '#ffffff',
    uColorMid: '#ff2ebd',
    uColorBot: '#9900ee',
    uAoColor: '#9900ff',
    uGradientStretch: 8.0,
    uGlitterDensity: 80.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.16,
    uAoIntensity: 0.50
  },
  card: {
    uColorTop: '#ffffff',
    uColorMid: '#ff2ebd',
    uColorBot: '#9900ee',
    uAoColor: '#9900ff',
    uGradientStretch: 8.0,
    uGlitterDensity: 80.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.16,
    uAoIntensity: 0.50
  },
  candyPink: {
    uColorTop: '#ffffff',
    uColorMid: '#fee1f0',
    uColorBot: '#f2a6e4',
    uAoColor: '#9900ff',
    uGradientStretch: 8.0,
    uGlitterDensity: 75.0,
    uGlitterSize: 0.08,
    uRefractionRatio: 1.6,
    uGlassThickness: 0.6,
    uEnvReflection: 0.1,
    uAoIntensity: 0.5
  }
});

/** Safe 1x1 fallback texture while EXR map is loading */
let _fallbackEnvTexture = null;
export function getFallbackEnvTexture() {
  if (!_fallbackEnvTexture) {
    const data = new Uint8Array([200, 220, 255, 255]); // soft ambient sky
    _fallbackEnvTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    _fallbackEnvTexture.needsUpdate = true;
  }
  return _fallbackEnvTexture;
}

/** Registry of active crystal materials for synchronized time and EXR texture updates */
const _activeCrystalMaterials = new Set();
let _crystalTimeMultiplier = 1.19;

/**
 * Returns set of active crystal materials
 * @returns {Set<CrystalGelMaterial>}
 */
export function getActiveCrystalMaterials() {
  return _activeCrystalMaterials;
}

/**
 * Sets the time animation multiplier (default 1.19)
 * @param {number} mult
 */
export function setCrystalTimeMultiplier(mult) {
  if (Number.isFinite(mult)) {
    _crystalTimeMultiplier = mult;
  }
}

/**
 * Gets the current time animation multiplier
 * @returns {number}
 */
export function getCrystalTimeMultiplier() {
  return _crystalTimeMultiplier;
}

/**
 * Sets the environment reflection map on all active crystal gel materials.
 * @param {THREE.Texture} texture
 */
export function setCrystalEnvironmentMap(texture) {
  if (!texture) return;
  for (const mat of _activeCrystalMaterials) {
    if (mat && mat.uniforms && mat.uniforms.uEnv) {
      mat.uniforms.uEnv.value = texture;
    }
  }
}

/**
 * Updates the uTime uniform on all active crystal gel materials.
 * Frequency multiplier matches the authored design.
 * @param {number} elapsedTime
 */
export function updateCrystalGelTime(elapsedTime) {
  const t = elapsedTime * _crystalTimeMultiplier;
  for (const mat of _activeCrystalMaterials) {
    if (mat && mat.uniforms && mat.uniforms.uTime) {
      mat.uniforms.uTime.value = t;
    }
  }
}

/**
 * Dynamically updates shader uniforms on active crystal materials.
 * Can target all crystals or a specific preset/type.
 * @param {Object} params - Key-value map of uniform names and values
 * @param {string} [targetPreset='all'] - 'all' or specific preset key (e.g. 'points_crystal', 'emerald_crystal', 'modifier')
 */
export function updateCrystalUniforms(params = {}, targetPreset = 'all') {
  for (const mat of _activeCrystalMaterials) {
    if (!mat || !mat.uniforms) continue;
    if (targetPreset !== 'all' && mat.presetName) {
      const match = (mat.presetName === targetPreset) ||
        (targetPreset === 'points_crystal' && (mat.presetName === 'points' || mat.presetName === 'points_crystal')) ||
        (targetPreset === 'emerald_crystal' && (mat.presetName === 'emerald' || mat.presetName === 'emerald_crystal')) ||
        (targetPreset === 'modifier' && (mat.presetName === 'modifier' || mat.presetName === 'card'));
      if (!match) continue;
    }

    for (const [key, val] of Object.entries(params)) {
      if (mat.uniforms[key] !== undefined) {
        if (mat.uniforms[key].value instanceof THREE.Color) {
          if (val instanceof THREE.Color) {
            mat.uniforms[key].value.copy(val);
          } else if (typeof val === 'string' || typeof val === 'number') {
            mat.uniforms[key].value.set(val);
          }
        } else if (Number.isFinite(val)) {
          mat.uniforms[key].value = val;
        }
      }
    }
  }
}

/**
 * CrystalGelMaterial (BoarderGelMaterialImpl)
 * Standard Three.js ShaderMaterial implementation.
 */
export class CrystalGelMaterial extends THREE.ShaderMaterial {
  /**
   * @param {Object} [parameters={}]
   */
  constructor(parameters = {}) {
    const preset = (parameters.preset && CRYSTAL_GEL_PRESETS[parameters.preset]) 
      ? CRYSTAL_GEL_PRESETS[parameters.preset] 
      : CRYSTAL_GEL_PRESETS.modifier;

    const topColor = parameters.uColorTop || preset.uColorTop || '#ffffff';
    const midColor = parameters.uColorMid || preset.uColorMid || '#fee1f0';
    const botColor = parameters.uColorBot || preset.uColorBot || '#f2a6e4';
    const aoColor = parameters.uAoColor || preset.uAoColor || '#9900ff';

    const envTex = parameters.uEnv || getJellyExrMap() || getFallbackEnvTexture();

    const uniforms = {
      uTime: { value: parameters.uTime !== undefined ? parameters.uTime : 0 },
      uEnv: { value: envTex },
      uColorTop: { value: topColor instanceof THREE.Color ? topColor.clone() : new THREE.Color(topColor) },
      uColorMid: { value: midColor instanceof THREE.Color ? midColor.clone() : new THREE.Color(midColor) },
      uColorBot: { value: botColor instanceof THREE.Color ? botColor.clone() : new THREE.Color(botColor) },
      uGradientStretch: { value: parameters.uGradientStretch !== undefined ? parameters.uGradientStretch : (preset.uGradientStretch || 20.0) },
      uGlitterDensity: { value: parameters.uGlitterDensity !== undefined ? parameters.uGlitterDensity : (preset.uGlitterDensity || 50.0) },
      uGlitterSize: { value: parameters.uGlitterSize !== undefined ? parameters.uGlitterSize : (preset.uGlitterSize || 0.2) },
      uRefractionRatio: { value: parameters.uRefractionRatio !== undefined ? parameters.uRefractionRatio : (preset.uRefractionRatio || 1.6) },
      uGlassThickness: { value: parameters.uGlassThickness !== undefined ? parameters.uGlassThickness : (preset.uGlassThickness || 0.6) },
      uEnvReflection: { value: parameters.uEnvReflection !== undefined ? parameters.uEnvReflection : (preset.uEnvReflection || 0.1) },
      uOpacity: { value: parameters.uOpacity !== undefined ? parameters.uOpacity : 1.0 },
      uAoColor: { value: aoColor instanceof THREE.Color ? aoColor.clone() : new THREE.Color(aoColor) },
      uAoIntensity: { value: parameters.uAoIntensity !== undefined ? parameters.uAoIntensity : (preset.uAoIntensity || 0.5) },

      // Three.js fog uniforms
      fogColor: { value: new THREE.Color('#ffffff') },
      fogNear: { value: 0 },
      fogFar: { value: 0 },
      fogDensity: { value: 0.00025 }
    };

    super({
      uniforms,
      vertexShader: crystalGelVertexShader,
      fragmentShader: crystalGelFragShader,
      transparent: parameters.transparent !== undefined ? parameters.transparent : true,
      depthWrite: parameters.depthWrite !== undefined ? parameters.depthWrite : true,
      depthTest: parameters.depthTest !== undefined ? parameters.depthTest : true,
      side: parameters.side || THREE.FrontSide,
      fog: parameters.fog !== undefined ? parameters.fog : true
    });

    this.presetName = (parameters.preset && CRYSTAL_GEL_PRESETS[parameters.preset]) ? parameters.preset : 'modifier';
    _activeCrystalMaterials.add(this);

    // Auto-resolve EXR texture if not already present
    if (!getJellyExrMap()) {
      loadJellyExrMap().then(tex => {
        if (tex && this.uniforms.uEnv) {
          this.uniforms.uEnv.value = tex;
        }
      }).catch(() => {});
    }
  }

  /**
   * Property setters for convenient uniform manipulation
   */
  set uTime(v) {
    if (this.uniforms.uTime) this.uniforms.uTime.value = v;
  }
  get uTime() {
    return this.uniforms.uTime ? this.uniforms.uTime.value : 0;
  }

  set uOpacity(v) {
    if (this.uniforms.uOpacity) this.uniforms.uOpacity.value = v;
  }
  get uOpacity() {
    return this.uniforms.uOpacity ? this.uniforms.uOpacity.value : 1.0;
  }

  dispose() {
    _activeCrystalMaterials.delete(this);
    super.dispose();
  }
}

/** Alias for direct equivalence with user code */
export const BoarderGelMaterialImpl = CrystalGelMaterial;

/**
 * Functional component/factory equivalent to BoarderGelGlitterMaterial
 * @param {Object} [props={}]
 * @returns {CrystalGelMaterial}
 */
export function BoarderGelGlitterMaterial(props = {}) {
  return new CrystalGelMaterial({
    transparent: true,
    fog: true,
    ...props
  });
}

/**
 * Creates a configured CrystalGelMaterial for a specific crystal type or preset.
 * @param {'points'|'points_crystal'|'emerald'|'emerald_crystal'|'modifier'|'card'|'candyPink'|Object} presetOrOptions
 * @param {Object} [customOptions={}]
 * @returns {CrystalGelMaterial}
 */
export function createCrystalGelShaderMaterial(presetOrOptions = 'modifier', customOptions = {}) {
  let config = {};
  if (typeof presetOrOptions === 'string') {
    config = { preset: presetOrOptions, ...customOptions };
  } else if (presetOrOptions && typeof presetOrOptions === 'object') {
    config = { ...presetOrOptions, ...customOptions };
  }
  return new CrystalGelMaterial(config);
}

/**
 * Helper to clean up all tracked crystal gel materials.
 */
export function disposeCrystalGelMaterials() {
  for (const mat of _activeCrystalMaterials) {
    mat.dispose();
  }
  _activeCrystalMaterials.clear();
}
