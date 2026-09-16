import * as THREE from 'three';
import { ghostBallVertexShader } from '../shaders/ghostBall.vert.glsl.js';
import { brassGhostFragShader } from '../shaders/brassGhost.frag.glsl.js';

let brassMaterialCache = null;

export function createBrassGhostMaterial() {
    if (brassMaterialCache) return brassMaterialCache;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.85 },
            uColor: { value: new THREE.Color(0.95, 0.75, 0.2) },
            uFresnelPower: { value: 2.0 }
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

    brassMaterialCache = material;
    return material;
}

export function disposeBrassGhostMaterial() {
    if (brassMaterialCache) {
        brassMaterialCache.dispose();
        brassMaterialCache = null;
    }
}
