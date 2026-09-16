import * as THREE from 'three';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { LIGHTING_CONFIG } from '../config/lightingConfig.js';
import { eventBus } from '../core/EventBus.js';

export class RendererManager {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10);
        this.container.appendChild(this.renderer.domElement);
    }

    init() {
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
        
        const defaultPreset = LIGHTING_CONFIG.presets[LIGHTING_CONFIG.defaultPreset];
        if (defaultPreset && defaultPreset.background) {
            this.renderer.setClearColor(new THREE.Color(defaultPreset.background));
        }
        
        const pixelRatio = Math.min(window.devicePixelRatio, GRAPHICS_CONFIG.pixelRatioCap || 2);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        if (GRAPHICS_CONFIG.fog && GRAPHICS_CONFIG.fog.enabled && defaultPreset && defaultPreset.fog) {
            this.scene.fog = new THREE.Fog(
                new THREE.Color(defaultPreset.fog.color),
                GRAPHICS_CONFIG.fog.near,
                GRAPHICS_CONFIG.fog.far
            );
        }
    }

    resize(width, height) {
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        const pixelRatio = Math.min(window.devicePixelRatio, GRAPHICS_CONFIG.pixelRatioCap || 2);
        this.renderer.setPixelRatio(pixelRatio);
    }

    setQuality(qualityConfig) {
        const pixelRatio = Math.min(window.devicePixelRatio, qualityConfig.pixelRatioCap || GRAPHICS_CONFIG.pixelRatioCap || 2);
        this.renderer.setPixelRatio(pixelRatio);
        if (qualityConfig.shadows !== undefined) {
            this.renderer.shadowMap.enabled = qualityConfig.shadows;
        }
    }

    getRenderer() {
        return this.renderer;
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    dispose() {
        if (this.renderer) {
            if (this.container && this.renderer.domElement && this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement);
            }
            this.renderer.dispose();
        }
        if (this.scene) {
            this.scene.clear();
        }
    }
}
