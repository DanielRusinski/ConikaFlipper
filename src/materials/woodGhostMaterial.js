import * as THREE from 'three';
import { ghostBallVertexShader } from '../shaders/ghostBall.vert.glsl.js';
import { woodGhostFragShader } from '../shaders/woodGhost.frag.glsl.js';

let woodMaterialCache = null;

export function createWoodGhostMaterial() {
    if (woodMaterialCache) return woodMaterialCache;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.85 },
            uColor: { value: new THREE.Color(0.85, 0.45, 0.15) },
            uFresnelPower: { value: 2.2 }
        },
        vertexShader: ghostBallVertexShader,
        fragmentShader: woodGhostFragShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0,
        side: THREE.FrontSide
    });

    woodMaterialCache = material;
    return material;
}

export function disposeWoodGhostMaterial() {
    if (woodMaterialCache) {
        woodMaterialCache.dispose();
        woodMaterialCache = null;
    }
}
