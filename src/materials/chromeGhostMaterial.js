import * as THREE from 'three';
import { ghostBallVertexShader } from '../shaders/ghostBall.vert.glsl.js';
import { brassGhostFragShader } from '../shaders/brassGhost.frag.glsl.js';

let chromeMaterialCache = null;

export function createChromeGhostMaterial() {
    if (chromeMaterialCache) return chromeMaterialCache;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.88 },
            uColor: { value: new THREE.Color(0.85, 0.30, 1.0) }, // Glowing neon purple
            uFresnelPower: { value: 1.8 }
        },
        vertexShader: ghostBallVertexShader,
        fragmentShader: brassGhostFragShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0,
        side: THREE.FrontSide
    });

    chromeMaterialCache = material;
    return material;
}

export function disposeChromeGhostMaterial() {
    if (chromeMaterialCache) {
        chromeMaterialCache.dispose();
        chromeMaterialCache = null;
    }
}
