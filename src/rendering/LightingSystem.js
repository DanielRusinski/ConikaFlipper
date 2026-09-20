import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { LIGHTING_CONFIG } from '../config/lightingConfig.js';
import { eventBus } from '../core/EventBus.js';

export class LightingSystem {
    constructor() {
        this.scene = null;
        this.hemisphereLight = null;
        this.keyLight = null;
        this.keyLightTarget = null;
        this.fillLight = null;
        this.environmentTexture = null;
        this.enabled = true;
        this.currentPresetName = null;
    }

    init(scene) {
        this.scene = scene;
        
        this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        this.scene.add(this.hemisphereLight);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
        this.keyLightTarget = new THREE.Object3D();
        this.keyLightTarget.position.set(0, 0, 0);
        this.scene.add(this.keyLightTarget);
        this.keyLight.target = this.keyLightTarget;
        this.scene.add(this.keyLight);
        
        this.fillLight = new THREE.PointLight(0xffffff, 0.4, 10);
        this.scene.add(this.fillLight);

        // Load EXR map for realistic PBR ambient illumination and reflections
        new EXRLoader().load('src/exr/OPT_EXR_AmbientLight001.exr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.environmentTexture = texture;
        }, undefined, (error) => {
            console.warn('EXR ambient lighting load failed:', error);
        });

        this.applyPreset(LIGHTING_CONFIG.defaultPreset);
    }

    applyPreset(presetName) {
        const preset = LIGHTING_CONFIG.presets[presetName];
        if (!preset) return;

        this.currentPresetName = presetName;

        this.hemisphereLight.color.set(preset.hemisphere.skyColor);
        this.hemisphereLight.groundColor.set(preset.hemisphere.groundColor);
        this.hemisphereLight.intensity = preset.hemisphere.intensity;

        this.keyLight.color.set(preset.directional.color);
        this.keyLight.intensity = preset.directional.intensity;
        this.keyLight.position.set(
            preset.directional.position.x,
            preset.directional.position.y,
            preset.directional.position.z
        );

        if (preset.fill) {
            this.fillLight.color.set(preset.fill.color);
            this.fillLight.intensity = preset.fill.intensity;
            this.fillLight.position.set(
                preset.fill.position.x,
                preset.fill.position.y,
                preset.fill.position.z
            );
        } else {
            this.fillLight.intensity = 0;
        }

        if (this.scene.fog && preset.fog) {
            this.scene.fog.color.set(preset.fog.color);
        }

        if (this.scene && preset.background !== undefined) {
            if (!this.scene.background) {
                this.scene.background = new THREE.Color(preset.background);
            } else {
                this.scene.background.set(preset.background);
            }
        }
        
        eventBus.emit('lighting:presetChanged', { presetName, preset });
    }

    update(deltaTime) {
        // Reserved for animated lighting
    }

    setQuality(level) {
        if (level === 'low') {
            this.fillLight.visible = false;
        } else {
            this.fillLight.visible = this.enabled;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.hemisphereLight.visible = enabled;
        this.keyLight.visible = enabled;
        this.fillLight.visible = enabled;
    }

    updateBounds(boardBounds) {
        // Handled by ShadowSystem mainly
    }

    getKeyLight() {
        return this.keyLight;
    }

    dispose() {
        if (this.scene) {
            if (this.hemisphereLight) this.scene.remove(this.hemisphereLight);
            if (this.keyLight) this.scene.remove(this.keyLight);
            if (this.keyLightTarget) this.scene.remove(this.keyLightTarget);
            if (this.fillLight) this.scene.remove(this.fillLight);
        }
        
        if (this.environmentTexture) {
            this.environmentTexture.dispose();
            this.environmentTexture = null;
        }
        if (this.hemisphereLight) { this.hemisphereLight.dispose(); this.hemisphereLight = null; }
        if (this.keyLight) { this.keyLight.dispose(); this.keyLight = null; }
        if (this.fillLight) { this.fillLight.dispose(); this.fillLight = null; }
        this.keyLightTarget = null;
        this.scene = null;
    }
}
