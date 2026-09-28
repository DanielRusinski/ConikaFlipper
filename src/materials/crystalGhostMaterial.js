import * as THREE from 'three';

/**
 * ============================================================================
 * CRYSTAL GHOST SILHOUETTE MATERIAL
 * ============================================================================
 * 
 * Ghost silhouette material for crystals during their activation phase
 * (after player uncovers them, while bouncing and bobbing before becoming collectable).
 * Mirrors the ghost ball silhouette shader:
 * - Glowing neon Fresnel edge rim
 * - Rhythmic pulsing core
 * - Dynamic instancing support (#ifdef USE_INSTANCING)
 * - Per-type radiant colors (Gold, Emerald, Magenta)
 */

export const crystalGhostVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  #ifdef USE_INSTANCING
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
  #endif

  vWorldPosition = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  // Pull slightly towards camera in view space so silhouette stays cleanly on top of tile
  mvPosition.z += 0.0004;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const crystalGhostFragShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uFresnelPower;
uniform float uPulseSpeed;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

float fresnelEffect(vec3 worldNormal, vec3 viewDir, float power) {
  vec3 n = normalize(worldNormal);
  vec3 v = normalize(viewDir);
  float cosTheta = max(dot(n, v), 0.0);
  return pow(clamp(1.0 - cosTheta, 0.0, 1.0), power);
}

void main() {
  vec3 viewDir = cameraPosition - vWorldPosition;
  float fresnel = fresnelEffect(vWorldNormal, viewDir, uFresnelPower);
  
  // Ghost silhouette pulsating edge glow (exact formula matching ball ghost silhouette)
  float pulse = (sin(uTime * uPulseSpeed) * 0.5 + 0.5) * 0.25 + 0.75;
  vec3 finalColor = uColor * (fresnel * 2.2 + 0.50) * pulse;
  
  // Edge rim alpha: sharp glowing edge rim and solid ghost presence matching ball silhouette
  float alpha = clamp(fresnel * 0.80 + 0.45, 0.0, 1.0) * uOpacity;
  
  gl_FragColor = vec4(finalColor, alpha);
}
`;

const GHOST_CRYSTAL_COLORS = Object.freeze({
  points_crystal: '#ffaa00',
  points: '#ffaa00',
  emerald_crystal: '#00ff66',
  emerald: '#00ff66',
  modifier: '#ff00cc',
  card: '#ff00cc'
});

const _activeCrystalGhostMaterials = new Set();

/**
 * Updates uTime on all active crystal ghost silhouette materials
 * @param {number} elapsedTime
 */
export function updateCrystalGhostTime(elapsedTime) {
  for (const mat of _activeCrystalGhostMaterials) {
    if (mat && mat.uniforms && mat.uniforms.uTime) {
      mat.uniforms.uTime.value = elapsedTime;
    }
  }
}

/**
 * Creates a crystal ghost silhouette material
 * @param {'points_crystal'|'emerald_crystal'|'modifier'|string} type
 * @param {Object} [options={}]
 * @returns {THREE.ShaderMaterial}
 */
export function createCrystalGhostMaterial(type = 'modifier', options = {}) {
  const hexColor = options.color || GHOST_CRYSTAL_COLORS[type] || GHOST_CRYSTAL_COLORS.modifier;
  const color = hexColor instanceof THREE.Color ? hexColor.clone() : new THREE.Color(hexColor);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: options.uOpacity !== undefined ? options.uOpacity : 0.95 },
      uColor: { value: color },
      uFresnelPower: { value: options.uFresnelPower !== undefined ? options.uFresnelPower : 1.8 },
      uPulseSpeed: { value: options.uPulseSpeed !== undefined ? options.uPulseSpeed : 4.0 }
    },
    vertexShader: crystalGhostVertexShader,
    fragmentShader: crystalGhostFragShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -4.0,
    side: THREE.FrontSide
  });

  material.crystalType = type;
  _activeCrystalGhostMaterials.add(material);
  return material;
}

/**
 * Disposes all registered crystal ghost materials
 */
export function disposeCrystalGhostMaterials() {
  for (const mat of _activeCrystalGhostMaterials) {
    mat.dispose();
  }
  _activeCrystalGhostMaterials.clear();
}
