import { fresnelGLSL } from './shared/fresnel.glsl.js';

export const brassGhostFragShader = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uFresnelPower;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

${fresnelGLSL}

void main() {
    vec3 viewDir = cameraPosition - vWorldPosition;
    float fresnel = fresnelEffect(vWorldNormal, viewDir, uFresnelPower);
    
    float pulse = (sin(uTime * 4.0) * 0.5 + 0.5) * 0.25 + 0.75;
    vec3 finalColor = uColor * (fresnel * 2.0 + 0.5) * pulse;
    
    float alpha = clamp(fresnel * 0.8 + 0.45, 0.0, 1.0) * uOpacity;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;
