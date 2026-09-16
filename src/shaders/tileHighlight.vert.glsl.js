export const tileHighlightVertexShader = `
varying vec2 vUv;
varying vec3 vInstanceColor;

void main() {
    vUv = uv;
    #ifdef USE_INSTANCING
        vInstanceColor = instanceColor;
        vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
    #else
        vInstanceColor = vec3(1.0);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    #endif
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
