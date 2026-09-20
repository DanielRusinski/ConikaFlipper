import * as THREE from 'three';
import { animate } from 'animejs';

export class TransitionManager {
    constructor() {
        this._renderer = null;
        this._renderTargetA = null;
        this._renderTargetB = null;
        this._transitionScene = null;
        this._transitionCamera = null;
        this._transitionMaterial = null;
        this._transitionMesh = null;
        this._transitioning = false;
        this._progress = 0;
        this._onComplete = null;
        this._currentAnimation = null;
    }
    init(renderer) {
        this._renderer = renderer;
        const size = renderer.getSize(new THREE.Vector2());
        const pixelRatio = renderer.getPixelRatio();
        
        this._renderTargetA = new THREE.WebGLRenderTarget(size.width * pixelRatio, size.height * pixelRatio, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            colorSpace: THREE.SRGBColorSpace
        });
        this._renderTargetB = this._renderTargetA.clone();
        
        this._transitionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._transitionScene = new THREE.Scene();
        
        const geometry = new THREE.PlaneGeometry(2, 2);
        
        // Generate high-quality procedural Perlin noise texture
        this._perlinTexture = this._generatePerlinNoiseTexture(512, 512);

        this._transitionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse1: { value: null },
                tDiffuse2: { value: null },
                tTransition: { value: this._perlinTexture },
                mixRatio: { value: 0.0 },
                threshold: { value: 0.12 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float mixRatio;
                uniform float threshold;
                uniform sampler2D tDiffuse1;
                uniform sampler2D tDiffuse2;
                uniform sampler2D tTransition;
                varying vec2 vUv;

                void main() {
                    vec4 texel1 = texture2D(tDiffuse1, vUv); // Old stage
                    vec4 texel2 = texture2D(tDiffuse2, vUv); // New stage
                    
                    // Sample the Perlin noise texture for organic organic dissolve
                    float pat = texture2D(tTransition, vUv).r;
                    
                    // Smooth threshold transition (Three.js TransitionNode algorithm)
                    float th = clamp(threshold, 0.01, 0.5);
                    float r = mixRatio * (1.0 + th * 2.0) - th;
                    float mixf = clamp((pat - r) * (1.0 / th), 0.0, 1.0);
                    
                    // Luminous neon boundary at the transition front
                    float edge = 1.0 - abs(mixf - 0.5) * 2.0;
                    float edgeGlow = pow(clamp(edge, 0.0, 1.0), 3.0);
                    vec3 glowColor = vec3(0.0, 0.95, 1.0) * edgeGlow * 1.5;
                    
                    vec4 blended = mix(texel2, texel1, mixf);
                    gl_FragColor = vec4(blended.rgb + glowColor, 1.0);
                }
            `
        });
        
        this._transitionMesh = new THREE.Mesh(geometry, this._transitionMaterial);
        this._transitionScene.add(this._transitionMesh);
    }

    /**
     * Generates a 2D seamless multi-octave Perlin / Simplex fractal noise DataTexture.
     */
    _generatePerlinNoiseTexture(width = 512, height = 512) {
        // Standard Perlin permutation table
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }
        const perm = new Uint8Array(512);
        const permMod12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) {
            perm[i] = p[i & 255];
            permMod12[i] = perm[i] % 12;
        }

        // 12 gradient vectors for 2D Perlin noise
        const grad3 = [
            [1, 1], [-1, 1], [1, -1], [-1, -1],
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [-1, 1], [0, -1], [0, 1]
        ];

        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        const lerp = (a, b, t) => a + t * (b - a);
        const dot2 = (g, x, y) => g[0] * x + g[1] * y;

        // Periodic 2D Perlin noise to ensure seamless wrap
        function perlin2D(x, y, periodX, periodY) {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = x - xi;
            const yf = y - yi;

            const X0 = ((xi % periodX) + periodX) % periodX;
            const Y0 = ((yi % periodY) + periodY) % periodY;
            const X1 = (X0 + 1) % periodX;
            const Y1 = (Y0 + 1) % periodY;

            const u = fade(xf);
            const v = fade(yf);

            const g00 = grad3[permMod12[X0 + perm[Y0]]];
            const g10 = grad3[permMod12[X1 + perm[Y0]]];
            const g01 = grad3[permMod12[X0 + perm[Y1]]];
            const g11 = grad3[permMod12[X1 + perm[Y1]]];

            const n00 = dot2(g00, xf, yf);
            const n10 = dot2(g10, xf - 1, yf);
            const n01 = dot2(g01, xf, yf - 1);
            const n11 = dot2(g11, xf - 1, yf - 1);

            const nx0 = lerp(n00, n10, u);
            const nx1 = lerp(n01, n11, u);
            return lerp(nx0, nx1, v);
        }

        const data = new Uint8Array(width * height * 4);
        const baseFreq = 4; // base frequency (cells across texture)

        for (let y = 0; y < height; y++) {
            const ny = y / height;
            for (let x = 0; x < width; x++) {
                const nx = x / width;

                // Multi-octave fractal Brownian motion (fBm)
                let value = 0;
                let amplitude = 0.55;
                let freq = baseFreq;
                let totalAmp = 0;

                for (let o = 0; o < 4; o++) {
                    const noise = perlin2D(nx * freq, ny * freq, freq, freq);
                    value += noise * amplitude;
                    totalAmp += amplitude;
                    amplitude *= 0.5;
                    freq *= 2;
                }

                // Normalize from [-totalAmp, totalAmp] to [0, 1]
                const norm = Math.min(1, Math.max(0, (value / totalAmp) * 0.5 + 0.5));
                const byteVal = Math.floor(norm * 255);

                const idx = (y * width + x) * 4;
                data[idx] = byteVal;     // R
                data[idx + 1] = byteVal; // G
                data[idx + 2] = byteVal; // B
                data[idx + 3] = 255;     // A
            }
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    captureTargetA(renderFn) {
        if (!this._renderer || !this._renderTargetA) return;
        this._renderer.setRenderTarget(this._renderTargetA);
        this._renderer.clear();
        if (renderFn) renderFn();
        this._renderer.setRenderTarget(null);
    }

    captureTargetB(renderFn) {
        if (!this._renderer || !this._renderTargetB) return;
        this._renderer.setRenderTarget(this._renderTargetB);
        this._renderer.clear();
        if (renderFn) renderFn();
        this._renderer.setRenderTarget(null);
    }

    getTransitionScene() {
        return this._transitionScene;
    }

    getTransitionCamera() {
        return this._transitionCamera;
    }

    updateTargets(renderer) {
        if (!this._transitioning) return;
        
        if (this.onRenderA) {
            renderer.setRenderTarget(this._renderTargetA);
            renderer.clear();
            this.onRenderA();
        }
        if (this.onRenderB) {
            renderer.setRenderTarget(this._renderTargetB);
            renderer.clear();
            this.onRenderB();
        }
        
        renderer.setRenderTarget(null);
        this._transitionMaterial.uniforms.tDiffuse1.value = this._renderTargetA.texture;
        this._transitionMaterial.uniforms.tDiffuse2.value = this._renderTargetB.texture;
        this._transitionMaterial.uniforms.mixRatio.value = this._progress;
    }

    transitionTo(targetState, options = {}) {
        const { duration = 1000, onRenderA, onRenderB, onComplete } = options;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animDuration = prefersReducedMotion ? 0 : duration;
        
        this._transitioning = true;
        this._progress = 0;
        this._onComplete = onComplete;
        this.onRenderA = onRenderA;
        this.onRenderB = onRenderB;
        
        if (this._currentAnimation) this._currentAnimation.pause();
        
        if (animDuration <= 0) {
            this._progress = 1.0;
            this._finishTransition();
            return;
        }
        
        const obj = { progress: 0 };
        this._currentAnimation = animate({
            targets: obj,
            progress: 1,
            duration: animDuration,
            easing: 'easeInOutQuad',
            update: () => {
                this._progress = obj.progress;
            },
            complete: () => {
                this._finishTransition();
            }
        });
    }
    _finishTransition() {
        this._transitioning = false;
        if (this._onComplete) this._onComplete();
    }
    update(deltaTime) {
        // Handled by Anime.js
    }
    render(renderer) {
        if (!this._transitioning) return;
        this.updateTargets(renderer);
        renderer.render(this._transitionScene, this._transitionCamera);
    }
    resize(width, height, pixelRatio) {
        if (this._renderTargetA) {
            this._renderTargetA.setSize(width * pixelRatio, height * pixelRatio);
            this._renderTargetB.setSize(width * pixelRatio, height * pixelRatio);
        }
    }
    isTransitioning() {
        return this._transitioning;
    }
    cancel() {
        if (this._currentAnimation) {
            this._currentAnimation.pause();
            this._currentAnimation = null;
        }
        this._transitioning = false;
    }
    dispose() {
        this.cancel();
        if (this._renderTargetA) this._renderTargetA.dispose();
        if (this._renderTargetB) this._renderTargetB.dispose();
        if (this._perlinTexture) this._perlinTexture.dispose();
        if (this._transitionMaterial) this._transitionMaterial.dispose();
        if (this._transitionMesh) this._transitionMesh.geometry.dispose();
    }
}
