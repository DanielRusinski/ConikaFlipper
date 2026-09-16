export const tileHighlightFragShader = `
uniform float uTime;
uniform float uFlashIntensity;

varying vec2 vUv;
varying vec3 vInstanceColor;

void main() {
    vec3 flashColor = vec3(1.0, 1.0, 1.0);
    float pulse = (sin(uTime * 5.0) * 0.5 + 0.5) * uFlashIntensity;
    
    vec3 finalColor = mix(vInstanceColor, flashColor, pulse);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;
