import * as THREE from 'three';

const ringVert = `
precision highp float;
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const ringFrag = `
precision highp float;

uniform float uProgress; // 0.0 to 1.0
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vWorldPosition;

#define PI 3.141592653589793

void main() {
    vec2 p = vUv - vec2(0.5);
    float dist = length(p) * 2.0; // 0.0 at center, 1.0 at outer edge
    
    // Radial band mask: smooth ring edges for thin delicate circle
    float radial = smoothstep(0.85, 0.90, dist) * smoothstep(1.0, 0.95, dist);
    if (radial <= 0.001) {
        discard;
    }
    
    // Angle starting at top (12 o'clock, +Y in UV) and sweeping clockwise
    // In UV space, atan(y, x): 12 o'clock is x=0, y=0.5 -> angle = PI/2
    float angle = atan(-p.x, p.y); // 0 at top, PI at bottom, increases clockwise from 0 to 2*PI
    if (angle < 0.0) angle += 2.0 * PI;
    float normAngle = angle / (2.0 * PI); // 0.0 at 12 o'clock, sweeping to 1.0
    
    // Angular fill with smooth anti-aliased edge
    float edgeSmooth = 0.008;
    float filled = smoothstep(normAngle - edgeSmooth, normAngle + edgeSmooth, uProgress);
    
    // Leading bright spark / needle dot at the current fill tip
    float headDiff = abs(normAngle - uProgress);
    float headSpark = exp(-pow(headDiff * 60.0, 2.0)) * step(0.01, uProgress);
    
    // Subtle background track so the player sees the delicate target circle
    float trackAlpha = 0.12;
    float activeAlpha = 0.95;
    float alpha = radial * mix(trackAlpha, activeAlpha, filled) * uOpacity;
    
    // Color blend: faint track color vs high-intensity neon fill + white-hot head spark
    vec3 trackColor = uColor * 0.45;
    vec3 fillColor = uColor * 1.35 + vec3(headSpark * 0.8);
    vec3 col = mix(trackColor, fillColor, filled);
    
    gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Factory and manager for the delicate horizontal circular loading bar.
 * Sits flat, parallel to the table, and smoothly fills up as the crystal charges.
 */
export class CircularLoadingRingManager {
    constructor() {
        // Shared geometry: thin delicate ring, 64 segments for buttery smooth curvature
        // Inner radius 0.0185, Outer radius 0.0205 (delicate thickness 0.002, smaller radius)
        this._geometry = new THREE.RingGeometry(0.0185, 0.0205, 64);
        this._geometry.rotateX(-Math.PI / 2); // Horizontal - parallel to table surface
    }

    createRingMesh(colorHex) {
        const material = new THREE.ShaderMaterial({
            vertexShader: ringVert,
            fragmentShader: ringFrag,
            uniforms: {
                uProgress: { value: 0.0 },
                uColor: { value: new THREE.Color(colorHex) },
                uTime: { value: 0.0 },
                uOpacity: { value: 1.0 }
            },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        const mesh = new THREE.Mesh(this._geometry, material);
        mesh.renderOrder = 3;
        mesh.visible = true;
        return mesh;
    }

    updateRing(mesh, progress, time, opacity = 1.0) {
        if (!mesh || !mesh.material || !mesh.material.uniforms) return;
        mesh.material.uniforms.uProgress.value = Math.min(1.0, Math.max(0.0, progress));
        mesh.material.uniforms.uTime.value = time;
        mesh.material.uniforms.uOpacity.value = opacity;
    }

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
        }
    }
}
