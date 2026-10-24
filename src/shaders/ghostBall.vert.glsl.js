export const ghostBallVertexShader = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * worldPosition;
    // Pull slightly towards camera in view space so ghost depth is strictly less than opaque ball surface
    mvPosition.z += 0.0004;
    gl_Position = projectionMatrix * mvPosition;
}
`;
