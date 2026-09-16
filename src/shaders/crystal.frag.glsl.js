import { fresnelGLSL } from './shared/fresnel.glsl.js';

export const crystalFragShader = `
uniform float uTime;
uniform vec3 uColor;
uniform float uEmissiveIntensity;
uniform float uFresnelPower;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUv;

${fresnelGLSL}

void main() {
    vec3 viewDir = cameraPosition - vWorldPosition;
    float fresnel = fresnelEffect(vWorldNormal, viewDir, uFresnelPower);
    
    float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
    vec3 emissive = uColor * uEmissiveIntensity * pulse;
    
    // Bottom to top gradient based on local UV y roughly mapped
    vec3 gradient = mix(uColor * 0.5, uColor, vUv.y);
    
    vec3 finalColor = gradient + emissive + uColor * fresnel;
    
    gl_FragColor = vec4(finalColor, 0.8 + fresnel * 0.2);
}
`;
