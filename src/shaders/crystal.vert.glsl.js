export const crystalVertexShader = `
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
    vUv = uv;
    
    vec3 pos = position;
    // Subtle wobble
    pos.y += sin(pos.x * 5.0 + uTime * 2.0) * 0.05;
    
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
