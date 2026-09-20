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
        this.pointLightsEnabled = true;
        this.pointLightsBaseIntensity = 2.0;
        this.pointLightsAutoCycle = true;
        this.pointLightsPulsing = true;
        this.pointLightsPulseSpeed = 3.0;
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

        // 1. Pink atmospheric accent point light (no shadows, mixing across playfield)
        this.pinkFill = new THREE.PointLight(0xff44aa, 2.0, 30);
        this.pinkFill.name = 'AtmosphericPinkFill';
        this.pinkFill.castShadow = false;
        this._pinkBasePos = new THREE.Vector3(0.85, 1.2, -0.65);
        this.pinkFill.position.copy(this._pinkBasePos);
        this.scene.add(this.pinkFill);

        // 2. Blue atmospheric accent point light (no shadows, opposite side of playfield)
        this.blueFill = new THREE.PointLight(0x3377ff, 2.0, 50);
        this.blueFill.name = 'AtmosphericBlueFill';
        this.blueFill.castShadow = false;
        this._blueBasePos = new THREE.Vector3(-0.85, 1.2, 0.65);
        this.blueFill.position.copy(this._blueBasePos);
        this.scene.add(this.blueFill);

        this._time = 0;
        this._accentLightScale = 1.0;
        this.randomizeAccentLights();

        // Load EXR map for realistic PBR ambient illumination and reflections
        new EXRLoader().load('src/exr/OPT_EXR_AmbientLight001.exr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.environmentTexture = texture;
        }, undefined, (error) => {
            console.warn('EXR ambient lighting load failed:', error);
        });

        this.applyPreset(LIGHTING_CONFIG.defaultPreset);

        this._qualityUnsub = eventBus.on('quality:changed', ({ config }) => {
            if (config) {
                this.setQuality(config);
            }
        });
    }

    randomizeAccentLights() {
        // Randomize placements on strictly opposite quadrants of the board
        const sideA = Math.random() < 0.5 ? 1 : -1;
        const sideB = -sideA;
        const zA = Math.random() < 0.5 ? 1 : -1;
        const zB = -zA;

        this._pinkBasePos.set(
            sideA * (0.75 + Math.random() * 0.35),
            1.1 + Math.random() * 0.4,
            zA * (0.50 + Math.random() * 0.30)
        );
        this._blueBasePos.set(
            sideB * (0.75 + Math.random() * 0.35),
            1.1 + Math.random() * 0.4,
            zB * (0.50 + Math.random() * 0.30)
        );
        if (this.pinkFill) this.pinkFill.position.copy(this._pinkBasePos);
        if (this.blueFill) this.blueFill.position.copy(this._blueBasePos);
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
        if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;
        this._time += deltaTime;

        if (!this.pointLightsEnabled) {
            if (this.pinkFill) this.pinkFill.intensity = 0;
            if (this.blueFill) this.blueFill.intensity = 0;
            return;
        }

        // Dynamic 30-second intensity oscillation strictly in the 2.0 - 4.0 range:
        // Half-period = 30s (full cycle = 60s), transitioning smoothly between 2.0 and 4.0
        const baseIntensity = this.pointLightsAutoCycle
            ? 3.0 + Math.sin(this._time * (Math.PI / 30.0)) * 1.0
            : this.pointLightsBaseIntensity;

        const pulsePink = this.pointLightsPulsing ? Math.sin(this._time * this.pointLightsPulseSpeed) * 0.15 : 0;
        const pulseBlue = this.pointLightsPulsing ? Math.sin(this._time * (this.pointLightsPulseSpeed * 0.87) + 1.2) * 0.15 : 0;

        if (this.pinkFill) {
            const pinkIntensity = (baseIntensity + pulsePink) * this._accentLightScale;
            this.pinkFill.intensity = Math.max(0, pinkIntensity);
            this.pinkFill.position.x = this._pinkBasePos.x + Math.sin(this._time * 0.8) * 0.06;
            this.pinkFill.position.z = this._pinkBasePos.z + Math.cos(this._time * 0.6) * 0.06;
        }

        if (this.blueFill) {
            const blueIntensity = (baseIntensity + pulseBlue) * this._accentLightScale;
            this.blueFill.intensity = Math.max(0, blueIntensity);
            this.blueFill.position.x = this._blueBasePos.x + Math.cos(this._time * 0.7) * 0.06;
            this.blueFill.position.z = this._blueBasePos.z + Math.sin(this._time * 0.9) * 0.06;
        }
    }

    setPointLightsAutoCycle(autoCycle) {
        this.pointLightsAutoCycle = !!autoCycle;
    }

    setPointLightsEnabled(enabled) {
        this.pointLightsEnabled = !!enabled;
        if (this.pinkFill) this.pinkFill.visible = this.enabled && this.pointLightsEnabled;
        if (this.blueFill) this.blueFill.visible = this.enabled && this.pointLightsEnabled;
    }

    setPointLightsIntensity(intensity) {
        this.pointLightsBaseIntensity = Math.max(0, Number(intensity) || 0);
    }

    setPointLightsPulsing(pulsing) {
        this.pointLightsPulsing = !!pulsing;
    }

    setPointLightsSpeed(speed) {
        this.pointLightsPulseSpeed = Math.max(0.1, Number(speed) || 3.0);
    }

    setPinkLightColor(colorHex) {
        if (this.pinkFill) this.pinkFill.color.set(colorHex);
    }

    setPinkLightDistance(dist) {
        if (this.pinkFill) this.pinkFill.distance = Math.max(1, Number(dist) || 30);
    }

    setBlueLightColor(colorHex) {
        if (this.blueFill) this.blueFill.color.set(colorHex);
    }

    setBlueLightDistance(dist) {
        if (this.blueFill) this.blueFill.distance = Math.max(1, Number(dist) || 50);
    }

    setQuality(qualityConfig) {
        const level = typeof qualityConfig === 'string'
            ? qualityConfig.toLowerCase()
            : (qualityConfig && qualityConfig.name ? qualityConfig.name.toLowerCase() : 'high');

        if (level === 'low') {
            this.fillLight.visible = false;
            this._accentLightScale = 0.60;
            if (this.pinkFill) this.pinkFill.distance = 18;
            if (this.blueFill) this.blueFill.distance = 25;
        } else if (level === 'medium') {
            this.fillLight.visible = this.enabled;
            this._accentLightScale = 0.85;
            if (this.pinkFill) this.pinkFill.distance = 26;
            if (this.blueFill) this.blueFill.distance = 40;
        } else {
            this.fillLight.visible = this.enabled;
            this._accentLightScale = 1.0;
            if (this.pinkFill) this.pinkFill.distance = 30;
            if (this.blueFill) this.blueFill.distance = 50;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.hemisphereLight.visible = enabled;
        this.keyLight.visible = enabled;
        this.fillLight.visible = enabled;
        if (this.pinkFill) this.pinkFill.visible = enabled && this.pointLightsEnabled;
        if (this.blueFill) this.blueFill.visible = enabled && this.pointLightsEnabled;
    }

    updateBounds(boardBounds) {
        // Handled by ShadowSystem mainly
    }

    getKeyLight() {
        return this.keyLight;
    }

    dispose() {
        if (this._qualityUnsub) {
            this._qualityUnsub();
            this._qualityUnsub = null;
        }
        if (this.scene) {
            if (this.hemisphereLight) this.scene.remove(this.hemisphereLight);
            if (this.keyLight) this.scene.remove(this.keyLight);
            if (this.keyLightTarget) this.scene.remove(this.keyLightTarget);
            if (this.fillLight) this.scene.remove(this.fillLight);
            if (this.pinkFill) this.scene.remove(this.pinkFill);
            if (this.blueFill) this.scene.remove(this.blueFill);
        }
        
        if (this.environmentTexture) {
            this.environmentTexture.dispose();
            this.environmentTexture = null;
        }
        if (this.hemisphereLight) { this.hemisphereLight.dispose(); this.hemisphereLight = null; }
        if (this.keyLight) { this.keyLight.dispose(); this.keyLight = null; }
        if (this.fillLight) { this.fillLight.dispose(); this.fillLight = null; }
        if (this.pinkFill) { this.pinkFill.dispose(); this.pinkFill = null; }
        if (this.blueFill) { this.blueFill.dispose(); this.blueFill = null; }
        this.keyLightTarget = null;
        this.scene = null;
    }
}
