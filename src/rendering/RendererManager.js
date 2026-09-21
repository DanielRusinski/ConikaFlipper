import * as THREE from 'three';
import { GRAPHICS_CONFIG, PERFORMANCE_CONFIG } from '../config/graphicsConfig.js';
import { LIGHTING_CONFIG } from '../config/lightingConfig.js';
import { eventBus } from '../core/EventBus.js';

export class RendererManager {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'default'
        });
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10);
        this.container.appendChild(this.renderer.domElement);

        this._currentQualityConfig = null;
        this._qualityUnsub = null;
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
        
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = (GRAPHICS_CONFIG.toneMappingExposure !== undefined) 
            ? GRAPHICS_CONFIG.toneMappingExposure 
            : 0.62;
        
        const defaultPreset = LIGHTING_CONFIG.presets[LIGHTING_CONFIG.defaultPreset];
        if (defaultPreset && defaultPreset.background) {
            const bgCol = new THREE.Color(defaultPreset.background);
            this.renderer.setClearColor(bgCol);
            this.scene.background = bgCol;
        }
        
        const initialLevel = 'low';
        const initialConfig = (PERFORMANCE_CONFIG.levels && PERFORMANCE_CONFIG.levels[initialLevel]) || {};
        this.setQuality(initialConfig);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        if (GRAPHICS_CONFIG.fog && GRAPHICS_CONFIG.fog.enabled && defaultPreset && defaultPreset.fog) {
            this.scene.fog = new THREE.Fog(
                new THREE.Color(defaultPreset.fog.color),
                GRAPHICS_CONFIG.fog.near,
                GRAPHICS_CONFIG.fog.far
            );
        } else {
            this.scene.fog = null;
        }

        // Listen for real-time adaptive quality changes
        this._qualityUnsub = eventBus.on('quality:changed', ({ config }) => {
            if (config) {
                this.setQuality(config);
            }
        });
    }

    resize(width, height) {
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        const targetRatio = (this._currentQualityConfig && this._currentQualityConfig.pixelRatio)
            || (GRAPHICS_CONFIG.isMobile ? 0.80 : 1.0);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, targetRatio);
        this.renderer.setPixelRatio(pixelRatio);
    }

    setQuality(qualityConfig) {
        if (!qualityConfig) return;
        this._currentQualityConfig = qualityConfig;

        const targetRatio = qualityConfig.pixelRatio || (GRAPHICS_CONFIG.isMobile ? 0.80 : 1.0);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, targetRatio);
        this.renderer.setPixelRatio(pixelRatio);

        if (qualityConfig.shadows !== undefined) {
            this.renderer.shadowMap.enabled = qualityConfig.shadows;
        }

        if (qualityConfig.shadowType) {
            this.renderer.shadowMap.type = (qualityConfig.shadowType === 'soft' && !GRAPHICS_CONFIG.isMobile)
                ? THREE.PCFSoftShadowMap
                : THREE.PCFShadowMap;
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
        if (this._qualityUnsub) {
            this._qualityUnsub();
            this._qualityUnsub = null;
        }
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
