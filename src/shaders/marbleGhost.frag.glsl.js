import { fresnelGLSL } from './shared/fresnel.glsl.js';
import { noiseGLSL } from './shared/noise.glsl.js';

export const marbleGhostFragShader = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uFresnelPower;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

${noiseGLSL}
${fresnelGLSL}

void main() {
    vec3 viewDir = cameraPosition - vWorldPosition;
    float fresnel = fresnelEffect(vWorldNormal, viewDir, uFresnelPower);
    
    float noise = fbm2(vWorldPosition.xy * 5.0 + uTime * 0.5, 2);
    float vein = smoothstep(0.4, 0.6, noise) * 0.3;
    
    vec3 baseColor = uColor - vec3(vein);
    float pulse = (sin(uTime * 4.0) * 0.5 + 0.5) * 0.2 + 0.8;
    vec3 finalColor = baseColor * (fresnel * 1.8 + 0.6) * pulse;
    
    float alpha = clamp(fresnel * 0.8 + 0.45 + vein * 0.2, 0.0, 1.0) * uOpacity;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;
