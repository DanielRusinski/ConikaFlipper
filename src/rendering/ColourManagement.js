import * as THREE from 'three';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { eventBus } from '../core/EventBus.js';

class ColourManagement {
    constructor() {
        this.renderer = null;
        this.saturation = 1.0;
    }

    init(renderer) {
        this.renderer = renderer;
        
        if (THREE.ColorManagement) {
            THREE.ColorManagement.enabled = true;
        }

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        const toneMappingMap = {
            'NoToneMapping': THREE.NoToneMapping,
            'LinearToneMapping': THREE.LinearToneMapping,
            'ReinhardToneMapping': THREE.ReinhardToneMapping,
            'CineonToneMapping': THREE.CineonToneMapping,
            'ACESFilmicToneMapping': THREE.ACESFilmicToneMapping,
            'AgXToneMapping': THREE.AgXToneMapping
        };
        
        this.renderer.toneMapping = toneMappingMap[GRAPHICS_CONFIG.toneMapping] !== undefined 
            ? toneMappingMap[GRAPHICS_CONFIG.toneMapping] 
            : THREE.ACESFilmicToneMapping;
            
        this.renderer.toneMappingExposure = GRAPHICS_CONFIG.toneMappingExposure || 1.0;
        this.saturation = GRAPHICS_CONFIG.saturation !== undefined ? GRAPHICS_CONFIG.saturation : 1.0;
    }

    setSaturation(value) {
        this.saturation = value;
        eventBus.emit('graphics:saturationChanged', { saturation: this.saturation });
    }

    setExposure(value) {
        if (this.renderer) {
            this.renderer.toneMappingExposure = value;
        }
    }

    dispose() {
        this.renderer = null;
    }
}

export const colourManagement = new ColourManagement();
