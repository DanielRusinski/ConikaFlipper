import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { qualityManager } from '../core/QualityManager.js';

const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        intensity: { value: 0.08 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;
        
        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float noise = (random(vUv * 600.0 + fract(time * 47.123) * 100.0) - 0.5) * intensity;
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
    }

    init(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.composer = new EffectComposer(this.renderer);
        
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
        this.bloomPass = new UnrealBloomPass(resolution, 0.35, 1.0, 0.80);
        this.bloomPass.strength = 0.35;
        this.bloomPass.radius = 1.0;
        this.bloomPass.threshold = 0.80;
        this.composer.addPass(this.bloomPass);

        this.grainPass = new ShaderPass(FilmGrainShader);
        this.composer.addPass(this.grainPass);

        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        if (qualityManager && qualityManager.config) {
            this.setQuality(qualityManager.config);
        }
    }

    setQuality(qualityConfig) {
        const useBloom = qualityConfig.bloomEnabled === true;
        if (this.bloomPass) {
            this.bloomPass.enabled = useBloom;
            if (qualityConfig.bloomStrength !== undefined) this.bloomPass.strength = qualityConfig.bloomStrength;
            if (qualityConfig.bloomRadius !== undefined) this.bloomPass.radius = qualityConfig.bloomRadius;
            if (qualityConfig.bloomThreshold !== undefined) this.bloomPass.threshold = qualityConfig.bloomThreshold;
        }
        
        const grainIntensity = (qualityConfig.grainIntensity !== undefined && qualityConfig.grainIntensity > 0)
            ? qualityConfig.grainIntensity
            : 0.06;
        if (this.grainPass) {
            this.grainPass.enabled = true;
            this.grainPass.uniforms.intensity.value = grainIntensity;
        }
        
        this.enabled = qualityConfig.postProcessing !== false;
    }

    updateTime(time) {
        if (this.grainPass) {
            this.grainPass.uniforms.time.value = (time * 0.001) % 1000.0;
        }
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
            this.composer.render();
        } else if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
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
