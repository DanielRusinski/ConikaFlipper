/**
 * chargingCrystal.vert.glsl.js
 * Vertex shader for charging/inactive crystals.
 * Keeps the crystal faint with subtle pulsing/breathing.
 */
export const chargingCrystalVertexShader = `
precision highp float;

uniform float uTime;
uniform float uChargeProgress;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    
    // Very subtle breathing vertex displacement
    vec3 pos = position;
    float pulse = sin(uTime * 3.0 + pos.y * 100.0) * 0.02 * (0.3 + 0.7 * uChargeProgress);
    pos += normal * pulse;
    
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
