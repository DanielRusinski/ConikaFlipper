import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { qualityManager } from '../core/QualityManager.js';
import { eventBus } from '../core/EventBus.js';
import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';

const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        intensity: { value: 0.04 },
        chromaticAberration: { value: 0.0 },
        flashIntensity: { value: 0.0 },
        saturation: { value: 1.0 }
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
        uniform float chromaticAberration;
        uniform float flashIntensity;
        uniform float saturation;
        varying vec2 vUv;
        
        float random(vec2 co) {
            highp float dt = dot(co.xy, vec2(12.9898, 78.233));
            highp float sn = mod(dt, 3.14159265);
            return fract(sin(sn) * 43758.5453);
        }

        void main() {
            vec4 color;
            if (chromaticAberration > 0.0001) {
                vec2 dir = vUv - 0.5;
                float dist = length(dir);
                vec2 shift = dir * (dist * chromaticAberration * 4.8);
                float r = texture2D(tDiffuse, vUv - shift).r;
                float g = texture2D(tDiffuse, vUv).g;
                float b = texture2D(tDiffuse, vUv + shift).b;
                float a = texture2D(tDiffuse, vUv).a;
                color = vec4(r, g, b, a);
            } else {
                color = texture2D(tDiffuse, vUv);
            }

            // Dynamic Saturation
            if (abs(saturation - 1.0) > 0.01) {
                float gray = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                color.rgb = clamp(mix(vec3(gray), color.rgb, saturation), 0.0, 1.0);
            }

            // Accompanying flash burst on impacts & explosions
            if (flashIntensity > 0.0001) {
                color.rgb += vec3(flashIntensity * 0.95, flashIntensity * 0.98, flashIntensity * 1.15);
            }

            // Single static fixed noise frame - not animated per frame for zero GPU overhead
            if (intensity > 0.001) {
                float noise = (random(vUv * 750.0) - 0.5) * intensity;
                color.rgb += noise;
            }

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
        this._eventUnsubs = [];

        // Chromatic aberration dynamic impulse state
        this._chromaticAberration = 0.0;
        this._chromaticDuration = 0.35;
        this._chromaticTimer = 0.0;

        // Dynamic impact flash state
        this._flashIntensity = 0.0;
        this._flashDuration = 0.25;
        this._flashTimer = 0.0;
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
        this.bloomPass = new UnrealBloomPass(resolution, 0.62, 1.05, 0.60);
        this.bloomPass.strength = 0.62;
        this.bloomPass.radius = 1.05;
        this.bloomPass.threshold = 0.60;
        this.composer.addPass(this.bloomPass);

        this.grainPass = new ShaderPass(FilmGrainShader);
        if (this.grainPass.uniforms.saturation) {
            this.grainPass.uniforms.saturation.value = (GRAPHICS_CONFIG.saturation !== undefined) 
                ? GRAPHICS_CONFIG.saturation 
                : 1.0;
        }
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

        const chromaUnsub = eventBus.on('fx:chromaticAberration', ({ intensity, duration, flash }) => {
            this.triggerChromaticAberration(intensity, duration, flash);
        });
        this._eventUnsubs.push(chromaUnsub);

        const satUnsub = eventBus.on('graphics:saturationChanged', ({ saturation }) => {
            this.setSaturation(saturation);
        });
        this._eventUnsubs.push(satUnsub);
    }

    setSaturation(value) {
        if (this.grainPass && this.grainPass.uniforms.saturation) {
            this.grainPass.uniforms.saturation.value = (value !== undefined && !isNaN(value)) ? Number(value) : 1.0;
        }
    }

    triggerChromaticAberration(amount = 0.035, duration = 0.35, flash = null) {
        this._chromaticAberration = Math.max(this._chromaticAberration, amount);
        this._chromaticDuration = Math.max(0.05, duration);
        this._chromaticTimer = this._chromaticDuration;

        const flashAmount = (flash !== null && flash !== undefined) 
            ? flash 
            : Math.min(0.70, amount * 12.0);
        this._flashIntensity = Math.max(this._flashIntensity, flashAmount);
        this._flashDuration = Math.max(0.05, duration * 0.85);
        this._flashTimer = this._flashDuration;

        if (this.grainPass && this.grainPass.uniforms.chromaticAberration) {
            this.grainPass.uniforms.chromaticAberration.value = this._chromaticAberration;
        }
        if (this.grainPass && this.grainPass.uniforms.flashIntensity) {
            this.grainPass.uniforms.flashIntensity.value = this._flashIntensity;
        }
    }

    update(deltaTime) {
        let needsUpdate = false;
        if (this._chromaticTimer > 0) {
            this._chromaticTimer -= deltaTime;
            if (this._chromaticTimer <= 0) {
                this._chromaticTimer = 0;
                this._chromaticAberration = 0;
            } else {
                const progress = this._chromaticTimer / this._chromaticDuration;
                // Quadratic decay for punchy flash falloff
                this._chromaticAberration = this._chromaticAberration * Math.pow(progress, 2.0);
            }
            needsUpdate = true;
        }

        if (this._flashTimer > 0) {
            this._flashTimer -= deltaTime;
            if (this._flashTimer <= 0) {
                this._flashTimer = 0;
                this._flashIntensity = 0;
            } else {
                const fProgress = this._flashTimer / this._flashDuration;
                this._flashIntensity = this._flashIntensity * Math.pow(fProgress, 2.2);
            }
            needsUpdate = true;
        }

        if (needsUpdate && this.grainPass) {
            if (this.grainPass.uniforms.chromaticAberration) {
                this.grainPass.uniforms.chromaticAberration.value = this._chromaticAberration;
            }
            if (this.grainPass.uniforms.flashIntensity) {
                this.grainPass.uniforms.flashIntensity.value = this._flashIntensity;
            }
        }
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
        if (this._eventUnsubs) {
            this._eventUnsubs.forEach(u => u && u());
            this._eventUnsubs = [];
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
