import * as THREE from 'three';

class ShaderManager {
    constructor() {
        this.materials = new Map();
    }

    createMaterial(name, config) {
        if (this.materials.has(name)) {
            return this.materials.get(name);
        }

        const material = new THREE.ShaderMaterial({
            uniforms: config.uniforms || {},
            vertexShader: config.vertexShader,
            fragmentShader: config.fragmentShader,
            transparent: config.transparent || false,
            depthWrite: config.depthWrite !== undefined ? config.depthWrite : true,
            side: config.side || THREE.FrontSide,
            blending: config.blending || THREE.NormalBlending
        });

        this.materials.set(name, material);
        return material;
    }

    getMaterial(name) {
        return this.materials.get(name) || null;
    }

    updateUniform(name, uniformKey, value) {
        const material = this.materials.get(name);
        if (material && material.uniforms[uniformKey]) {
            material.uniforms[uniformKey].value = value;
        }
    }

    updateAllTime(time) {
        for (const [name, material] of this.materials.entries()) {
            if (material.uniforms && material.uniforms.uTime) {
                material.uniforms.uTime.value = time;
            }
        }
    }

    setQuality(level) {
        let qualityValue = 1.0;
        if (level === 'medium') qualityValue = 0.5;
        if (level === 'low') qualityValue = 0.0;

        for (const [name, material] of this.materials.entries()) {
            if (material.uniforms && material.uniforms.uQuality) {
                material.uniforms.uQuality.value = qualityValue;
            }
        }
    }

    dispose() {
        for (const [name, material] of this.materials.entries()) {
            material.dispose();
        }
        this.materials.clear();
    }
}

export const shaderManager = new ShaderManager();
