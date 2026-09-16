import * as THREE from 'three';
import { chargingCrystalVertexShader } from '../shaders/chargingCrystal.vert.glsl.js';
import { chargingCrystalFragShader } from '../shaders/chargingCrystal.frag.glsl.js';

const materialCache = new Map();

/**
 * Creates a ShaderMaterial that keeps the charging/inactive crystal barely visible
 * with faint translucent fresnel edges and subtle shimmer.
 * @param {number|THREE.Color} color - Base tint of the crystal (emerald, gold, or magenta)
 * @returns {THREE.ShaderMaterial}
 */
export function createChargingCrystalMaterial(color) {
    const key = typeof color === 'number' ? color : color.getHex();
    
    // Each active crystal can have its own material instance or shared uniform
    // We create an instance so uChargeProgress can be updated individually per crystal.
    const matColor = new THREE.Color(color);
    
    return new THREE.ShaderMaterial({
        vertexShader: chargingCrystalVertexShader,
        fragmentShader: chargingCrystalFragShader,
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: matColor },
            uChargeProgress: { value: 0.0 }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        blending: THREE.NormalBlending
    });
}
