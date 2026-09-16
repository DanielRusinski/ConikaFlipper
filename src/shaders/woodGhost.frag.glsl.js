import { fresnelGLSL } from './shared/fresnel.glsl.js';
import { noiseGLSL } from './shared/noise.glsl.js';

export const woodGhostFragShader = `
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
    
    vec2 p = vWorldPosition.xy * vec2(2.0, 10.0);
    float grain = noise2D(p + uTime * 0.2);
    float pulse = (sin(uTime * 4.0) * 0.5 + 0.5) * 0.25 + 0.75;
    
    vec3 finalColor = uColor * (0.8 + 0.2 * grain) * (fresnel * 1.8 + 0.6) * pulse;
    float alpha = clamp(fresnel * 0.8 + 0.45, 0.0, 1.0) * uOpacity;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;
