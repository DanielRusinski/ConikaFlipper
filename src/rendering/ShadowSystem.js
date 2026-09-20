import * as THREE from 'three';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { eventBus } from '../core/EventBus.js';

export class ShadowSystem {
    constructor() {
        this.keyLight = null;
        this.scene = null;
        this.enabled = true;
        this.updateFrequency = 1;
        this._frameCounter = 0;
        this._qualityUnsub = null;
    }

    init(keyLight, scene) {
        this.keyLight = keyLight;
        this.scene = scene;

        this.keyLight.castShadow = true;
        const initialSize = GRAPHICS_CONFIG.isMobile ? 512 : 1024;
        this.keyLight.shadow.mapSize.width = initialSize;
        this.keyLight.shadow.mapSize.height = initialSize;
        this.keyLight.shadow.bias = -0.0004;
        this.keyLight.shadow.normalBias = 0.015;
        this.keyLight.shadow.camera.near = 0.2;
        this.keyLight.shadow.camera.far = 10.0;

        const dX = 0.75;
        const dY = 0.95;
        this.keyLight.shadow.camera.left = -dX;
        this.keyLight.shadow.camera.right = dX;
        this.keyLight.shadow.camera.top = dY;
        this.keyLight.shadow.camera.bottom = -dY;
        this.keyLight.shadow.camera.updateProjectionMatrix();

        this._qualityUnsub = eventBus.on('quality:changed', ({ config }) => {
            if (config) {
                this.setQuality(config);
            }
        });
    }

    setQuality(qualityConfig) {
        if (!qualityConfig) return;

        if (qualityConfig.shadows !== undefined) {
            this.setEnabled(qualityConfig.shadows);
        }

        this.updateFrequency = (qualityConfig.shadowUpdateFrequency !== undefined)
            ? qualityConfig.shadowUpdateFrequency
            : 1;

        const shadowMapSize = qualityConfig.shadowMapSize || (GRAPHICS_CONFIG.isMobile ? 512 : 1024);
        if (this.keyLight && this.keyLight.shadow && this.keyLight.shadow.mapSize.width !== shadowMapSize) {
            this.keyLight.shadow.mapSize.width = shadowMapSize;
            this.keyLight.shadow.mapSize.height = shadowMapSize;
            if (this.keyLight.shadow.map) {
                this.keyLight.shadow.map.dispose();
                this.keyLight.shadow.map = null;
            }
        }
    }

    update(renderer) {
        if (!this.enabled || !renderer || !renderer.shadowMap.enabled) return;

        this._frameCounter++;

        if (this.updateFrequency <= 1 || !this.keyLight || !this.keyLight.shadow || !this.keyLight.shadow.map) {
            renderer.shadowMap.autoUpdate = true;
            renderer.shadowMap.needsUpdate = true;
        } else {
            renderer.shadowMap.autoUpdate = false;
            if (this._frameCounter % this.updateFrequency === 0) {
                renderer.shadowMap.needsUpdate = true;
            }
        }
    }

    updateBounds(boardBounds) {
        if (!this.keyLight || !boardBounds) return;
        
        const padding = 0.1;
        const width = (boardBounds.width || 0.514) / 2 + padding;
        const height = (boardBounds.height || 1.07) / 2 + padding;

        this.keyLight.shadow.camera.left = -width;
        this.keyLight.shadow.camera.right = width;
        this.keyLight.shadow.camera.top = height;
        this.keyLight.shadow.camera.bottom = -height;
        this.keyLight.shadow.camera.updateProjectionMatrix();
    }

    invalidate() {
        if (this.keyLight && this.keyLight.shadow) {
            this.keyLight.shadow.needsUpdate = true;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.keyLight) {
            this.keyLight.castShadow = enabled;
        }
    }

    dispose() {
        if (this._qualityUnsub) {
            this._qualityUnsub();
            this._qualityUnsub = null;
        }
        if (this.keyLight && this.keyLight.shadow && this.keyLight.shadow.map) {
            this.keyLight.shadow.map.dispose();
            this.keyLight.shadow.map = null;
        }
        this.keyLight = null;
        this.scene = null;
    }
}
