import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { qualityManager } from '../core/QualityManager.js';
import { eventBus } from '../core/EventBus.js';

const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.04 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float intensity;
        varying vec2 vUv;
        
        float random(vec2 co) {
            highp float dt = dot(co.xy, vec2(12.9898, 78.233));
            highp float sn = mod(dt, 3.14159265);
            return fract(sin(sn) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            // Single static fixed noise frame - not animated per frame for zero GPU overhead
            float noise = (random(vUv * 750.0) - 0.5) * intensity;
            color.rgb += noise;
            gl_FragColor = color;
        }
    `
};

export class PostProcessingManager {
    constructor() {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.composer = null;
        this.renderPass = null;
        this.bloomPass = null;
        this.grainPass = null;
        this.outputPass = null;
        this.enabled = true;
        this._qualityUnsub = null;
    }

    init(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.composer = new EffectComposer(this.renderer);
        this.composer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
        this.bloomPass = new UnrealBloomPass(resolution, 0.20, 0.5, 0.84);
        this.bloomPass.strength = 0.20;
        this.bloomPass.radius = 0.5;
        this.bloomPass.threshold = 0.84;
        this.composer.addPass(this.bloomPass);

        this.grainPass = new ShaderPass(FilmGrainShader);
        this.composer.addPass(this.grainPass);

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        if (qualityManager && qualityManager.config) {
            this.setQuality(qualityManager.config);
        }

        this._qualityUnsub = eventBus.on('quality:changed', ({ config }) => {
            if (config) {
                this.setQuality(config);
            }
        });
    }

    setQuality(qualityConfig) {
        if (!qualityConfig) return;

        // When postProcessing is explicitly disabled (e.g. LOW quality tier),
        // we bypass the EffectComposer completely, rendering directly with WebGLRenderer.
        this.enabled = qualityConfig.postProcessing !== false;

        const useBloom = qualityConfig.bloomEnabled === true;
        if (this.bloomPass) {
            this.bloomPass.enabled = useBloom;
            if (qualityConfig.bloomStrength !== undefined) this.bloomPass.strength = qualityConfig.bloomStrength;
            if (qualityConfig.bloomRadius !== undefined) this.bloomPass.radius = qualityConfig.bloomRadius;
            if (qualityConfig.bloomThreshold !== undefined) this.bloomPass.threshold = qualityConfig.bloomThreshold;
        }
        
        const grainIntensity = (qualityConfig.grainIntensity !== undefined && qualityConfig.grainIntensity > 0)
            ? qualityConfig.grainIntensity
            : 0.04;
        if (this.grainPass) {
            this.grainPass.enabled = qualityConfig.grainIntensity !== 0;
            this.grainPass.uniforms.intensity.value = grainIntensity;
        }
    }

    updateTime(time) {
        // Static grain requested: keep single fixed frame (no per-frame noise regeneration)
    }

    setBloomStrength(strength) {
        if (this.bloomPass) {
            this.bloomPass.strength = Number(strength);
        }
    }

    setBloomRadius(radius) {
        if (this.bloomPass) {
            this.bloomPass.radius = Number(radius);
        }
    }

    setBloomThreshold(threshold) {
        if (this.bloomPass) {
            this.bloomPass.threshold = Number(threshold);
        }
    }

    setBloomEnabled(enabled) {
        if (this.bloomPass) {
            this.bloomPass.enabled = Boolean(enabled);
        }
    }

    render() {
        if (this.enabled && this.composer) {
            try {
                this.composer.render();
            } catch (err) {
                console.error('EffectComposer error, falling back to direct render:', err);
                if (this.renderer && this.scene && this.camera) {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        } else if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    renderTransition(transitionScene, transitionCamera) {
        if (this.enabled && this.composer && this.renderPass) {
            const oldScene = this.renderPass.scene;
            const oldCamera = this.renderPass.camera;
            this.renderPass.scene = transitionScene;
            this.renderPass.camera = transitionCamera;
            try {
                this.composer.render();
            } catch (err) {
                console.error('Composer transition render failed, fallback:', err);
                if (this.renderer) {
                    this.renderer.render(transitionScene, transitionCamera);
                }
            } finally {
                this.renderPass.scene = oldScene;
                this.renderPass.camera = oldCamera;
            }
        } else if (this.renderer) {
            this.renderer.render(transitionScene, transitionCamera);
        }
    }

    resize(width, height, pixelRatio) {
        if (this.composer) {
            this.composer.setSize(width, height);
            this.composer.setPixelRatio(pixelRatio);
        }
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    getComposer() {
        return this.composer;
    }

    dispose() {
        if (this._qualityUnsub) {
            this._qualityUnsub();
            this._qualityUnsub = null;
        }
        if (this.composer) {
            this.composer.passes.forEach(pass => {
                if (pass.dispose) pass.dispose();
            });
            this.composer.dispose();
        }
        
        this.renderPass = null;
        this.bloomPass = null;
        this.grainPass = null;
        this.outputPass = null;
        this.composer = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }
}
