/**
 * chargingCrystal.frag.glsl.js
 * Fragment shader governing the visibility of inactive/charging crystals.
 * Renders the crystal barely visible (delicate translucent silhouette,
 * faint fresnel rim glow, subtle holographic energy shimmer).
 */
export const chargingCrystalFragShader = `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform float uChargeProgress; // 0.0 to 1.0

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);
    
    // Fresnel rim effect - delicate edge glow
    float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
    fresnel = pow(fresnel, 2.5);
    
    // Holographic scanlines & subtle shimmer
    float scanline = sin(vWorldPosition.y * 220.0 + uTime * 4.0) * 0.5 + 0.5;
    float shimmer = sin(uTime * 2.5 + vWorldPosition.x * 60.0 + vWorldPosition.z * 60.0) * 0.5 + 0.5;
    
    // Crystal is barely visible while charging: base opacity between 0.08 and 0.22
    float baseAlpha = 0.08 + 0.12 * uChargeProgress;
    float edgeAlpha = fresnel * (0.32 + 0.28 * uChargeProgress);
    float finalAlpha = clamp(baseAlpha + edgeAlpha + scanline * 0.04, 0.0, 0.60);
    
    // Color: faint crystal base tint mixed with delicate neon edge
    vec3 faintColor = uColor * 0.40;
    vec3 edgeColor = uColor * (1.1 + 0.5 * shimmer);
    vec3 finalColor = mix(faintColor, edgeColor, fresnel);
    
    // Subtle inner spark when close to 100%
    if (uChargeProgress > 0.8) {
        float chargeSpark = pow(uChargeProgress, 4.0) * shimmer * 0.35;
        finalColor += vec3(chargeSpark);
    }

    gl_FragColor = vec4(finalColor, finalAlpha);
}
`;
