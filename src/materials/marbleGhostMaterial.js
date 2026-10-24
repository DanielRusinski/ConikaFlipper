import * as THREE from 'three';
import { ghostBallVertexShader } from '../shaders/ghostBall.vert.glsl.js';
import { marbleGhostFragShader } from '../shaders/marbleGhost.frag.glsl.js';

let marbleMaterialCache = null;

export function createMarbleGhostMaterial() {
    if (marbleMaterialCache) return marbleMaterialCache;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.85 },
            uColor: { value: new THREE.Color(0.95, 0.95, 1.0) },
            uFresnelPower: { value: 1.8 }
        },
        vertexShader: ghostBallVertexShader,
        fragmentShader: marbleGhostFragShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0,
        side: THREE.FrontSide
    });

    marbleMaterialCache = material;
    return material;
}

export function disposeMarbleGhostMaterial() {
    if (marbleMaterialCache) {
        marbleMaterialCache.dispose();
        marbleMaterialCache = null;
    }
}
