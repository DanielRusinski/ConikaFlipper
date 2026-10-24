import * as THREE from 'three';
import { getJellyExrMap, loadJellyExrMap } from './jellyMaterials.js';

/**
 * ============================================================================
 * CHROMATIC GLASS SHOP CRYSTAL MATERIAL
 * ============================================================================
 * 
 * Custom glass shader designed for cellShop.glb:
 * - Transparent glass with physical Fresnel falloff
 * - Chromatic aberration (RGB split) across refracted / reflected view rays
 * - Equirectangular HDR reflection / refraction using the environment map
 * - Internal prismatic dispersion & rainbow caustics
 * - Pulsing core glow with configurable base glass tint & edge sheen
 * - Fog and camera view support
 */

export const glassCrystalVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  vUv = uv;

  #ifdef USE_INSTANCING
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  #else
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
  #endif

  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

export const glassCrystalFragShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uEnv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uTime;
uniform float uOpacity;
uniform float uRefractionRatio;
uniform float uChromaticAberration;
uniform float uFresnelPower;
uniform float uDispersion;
uniform float uGlowIntensity;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

vec2 dirToEquirectUV(vec3 dir) {
  return vec2(
    atan(dir.z, dir.x) / 6.28318530718 + 0.5,
    1.0 - (acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265359)
  );
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  // Fresnel effect for outer glass reflection & edge highlight
  float fresnel = pow(clamp(1.0 - max(0.0, dot(normal, viewDir)), 0.0, 1.0), uFresnelPower);

  // Refraction indices for R, G, B channels (prismatic chromatic aberration)
  float ior = uRefractionRatio; // e.g. 1.33 - 1.52
  float ca = uChromaticAberration * 0.08;
  float etaR = (1.0 / ior) - ca;
  float etaG = (1.0 / ior);
  float etaB = (1.0 / ior) + ca;

  vec3 refrR = refract(-viewDir, normal, etaR);
  vec3 refrG = refract(-viewDir, normal, etaG);
  vec3 refrB = refract(-viewDir, normal, etaB);

  // Fallback to reflection if total internal reflection occurs
  vec3 reflDir = reflect(-viewDir, normal);
  if (length(refrR) < 0.001) refrR = reflDir;
  if (length(refrG) < 0.001) refrG = reflDir;
  if (length(refrB) < 0.001) refrB = reflDir;

  // Sample RGB channels with chromatic dispersion offset
  float r = texture2D(uEnv, dirToEquirectUV(refrR)).r;
  float g = texture2D(uEnv, dirToEquirectUV(refrG)).g;
  float b = texture2D(uEnv, dirToEquirectUV(refrB)).b;
  vec3 refractedColor = vec3(r, g, b);

  // Sample environment reflection
  vec3 reflectedColor = texture2D(uEnv, dirToEquirectUV(reflDir)).rgb;

  // Spectral rainbow dispersion shimmer inside crystal
  float dispersionWave = sin(dot(normal, vec3(1.0, 2.0, 1.0)) * 6.0 + uTime * 2.5);
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + dispersionWave * 0.4 + vUv.y));
  refractedColor = mix(refractedColor, rainbow, uDispersion * 0.35);

  // Blend reflection and refraction via Fresnel
  vec3 glassBase = mix(refractedColor * uColor, reflectedColor, fresnel * 0.65);

  // Animated crystalline inner pulsing core
  float pulse = 0.75 + 0.25 * sin(uTime * 3.5);
  vec3 innerGlow = uCoreColor * uGlowIntensity * pulse * (1.0 - fresnel * 0.5);

  // Brilliant sharp edge sheen
  vec3 edgeSheen = uEdgeColor * pow(fresnel, 2.0) * 1.5;

  vec3 finalColor = glassBase + innerGlow + edgeSheen;
  float finalAlpha = clamp(uOpacity * (0.45 + fresnel * 0.55), 0.0, 1.0);

  gl_FragColor = vec4(finalColor, finalAlpha);

  #include <fog_fragment>
}
`;

/**
 * Creates a configured ShaderMaterial for the shop glass crystal.
 */
export function createGlassCrystalMaterial(options = {}) {
  const envMap = options.uEnv || getJellyExrMap() || getFallbackCrystalEnv();

  // If env map isn't loaded yet, kick off loader
  if (!getJellyExrMap()) {
    loadJellyExrMap().then(tex => {
      if (tex && mat && mat.uniforms && mat.uniforms.uEnv) {
        mat.uniforms.uEnv.value = tex;
        mat.needsUpdate = true;
      }
    }).catch(() => {});
  }

  const mat = new THREE.ShaderMaterial({
    vertexShader: glassCrystalVertexShader,
    fragmentShader: glassCrystalFragShader,
    uniforms: {
      uEnv: { value: envMap },
      uColor: { value: new THREE.Color(options.uColor !== undefined ? options.uColor : 0xffe6a3) },
      uCoreColor: { value: new THREE.Color(options.uCoreColor !== undefined ? options.uCoreColor : 0xff9900) },
      uEdgeColor: { value: new THREE.Color(options.uEdgeColor !== undefined ? options.uEdgeColor : 0x00f0ff) },
      uTime: { value: 0.0 },
      uOpacity: { value: options.uOpacity !== undefined ? options.uOpacity : 0.85 },
      uRefractionRatio: { value: options.uRefractionRatio !== undefined ? options.uRefractionRatio : 1.45 },
      uChromaticAberration: { value: options.uChromaticAberration !== undefined ? options.uChromaticAberration : 0.35 },
      uFresnelPower: { value: options.uFresnelPower !== undefined ? options.uFresnelPower : 2.2 },
      uDispersion: { value: options.uDispersion !== undefined ? options.uDispersion : 0.45 },
      uGlowIntensity: { value: options.uGlowIntensity !== undefined ? options.uGlowIntensity : 0.90 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true
  });

  return mat;
}

let _fallbackEnv = null;
function getFallbackCrystalEnv() {
  if (_fallbackEnv) return _fallbackEnv;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = Math.floor((y / size) * 200) + 55;
      data[idx] = v;
      data[idx + 1] = Math.min(255, v + 25);
      data[idx + 2] = Math.min(255, v + 50);
      data[idx + 3] = 255;
    }
  }
  _fallbackEnv = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  _fallbackEnv.needsUpdate = true;
  return _fallbackEnv;
}
