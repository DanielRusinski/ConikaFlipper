import * as THREE from 'three';
import { qualityManager } from '../core/QualityManager.js';
import { graphicsSettingsController } from '../core/GraphicsSettingsController.js';

// ============================================================================
// CENTRAL VISUAL CONFIGURATION
// ============================================================================
export const ITEM_BEAM_CONFIG = {
    BEAM: {
        height: 520,
        coreRadius: 2.2,
        glowRadius: 9.5,
        topScale: 0.20,
        speed: 1.0,
        pulseFrequency: 3.5,
        energyStreamSpeed: 24.0,
        coreShimmerSpeed: 16.0
    },
    PARTICLES: {
        mainCount: 90,
        microCount: 50,
        sparkCount: 30,
        mainRadius: 18.0,
        microRadius: 12.0,
        sparkRadius: 26.0,
        upwardSpeed: 38.0,
        sparkDriftSpeed: 48.0,
        fadeSpeed: 5.0
    },
    LIGHT: {
        baseIntensity: 1.8,
        secondaryIntensity: 0.65,
        baseDistance: 42.0,
        secondaryDistance: 68.0,
        pulseAmount: 0.35,
        secondaryHeightOffset: 35.0
    },
    BASE_GLOW: {
        innerRingRadius: 3.2,
        outerRingRadius: 16.5,
        coreDiscRadius: 8.5,
        pulseAmount: 0.25,
        rotationSpeed: 1.6
    }
};

/**
 * ItemBeam
 *
 * Upgraded, highly polished arcade item beam effect.
 * Coordinated visual layers:
 * 1. Bright high-intensity core beam (tapered, additive, near-white highlights)
 * 2. Soft, wide outer glow beam (volumetric falloff, pulsing, energy stream ripples)
 * 3. Ground / Item contact glow (additive disc + spinning concentric energy ring)
 * 4. Multi-tier particle system:
 *    - Main fast-rising energetic beam particles
 *    - Micro slow-floating ambient particles
 *    - Lateral spark particles drifting outward
 * 5. Dynamic lighting (primary contact PointLight + optional secondary elevation light)
 * 6. Centralized harmonic pulse & graphics-quality scaling (MOBILE/LOW -> ULTRA)
 */
export class ItemBeam {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'ItemBeamGroup';

        this.materials = [];
        this.particleMaterials = [];
        this.geometries = [];
        this.lights = [];

        // Colors
        this._rawColor = options.color ? (options.color instanceof THREE.Color ? options.color.clone() : new THREE.Color(options.color)) : new THREE.Color(0x00ffff);
        this._mainColor = this._rawColor.clone();
        this._coreColor = new THREE.Color(1.0, 1.0, 1.0).lerp(this._mainColor, 0.28); // Bright desaturated core
        this._outerGlowColor = this._mainColor.clone().multiplyScalar(0.9);
        this._particleHighlightColor = new THREE.Color(1.0, 1.0, 1.0).lerp(this._mainColor, 0.50);

        this.options = {
            position: new THREE.Vector3(0, 0, 20),
            height: ITEM_BEAM_CONFIG.BEAM.height,
            coreRadius: ITEM_BEAM_CONFIG.BEAM.coreRadius,
            glowRadius: ITEM_BEAM_CONFIG.BEAM.glowRadius,
            topScale: ITEM_BEAM_CONFIG.BEAM.topScale,
            particleCount: ITEM_BEAM_CONFIG.PARTICLES.mainCount,
            particleRadius: ITEM_BEAM_CONFIG.PARTICLES.mainRadius,
            color: this._rawColor,
            enableLights: true,
            bloomBoost: options.bloomBoost !== undefined ? options.bloomBoost : 1.0,
            baseGlowOpacity: options.baseGlowOpacity !== undefined ? options.baseGlowOpacity : 1.0,
            particleBrightness: options.particleBrightness !== undefined ? options.particleBrightness : 1.0,
            ...options
        };

        // Cache objects for per-frame updates (zero GC allocation)
        this._primaryLight = null;
        this._secondaryLight = null;
        this._baseGlowGroup = null;
        this._baseRingMesh = null;
        this._baseDiscMesh = null;
        this._baseDiscMat = null;
        this._baseRingMat = null;
        this._mainParticles = null;
        this._sparkParticles = null;
        this._swirlParticles = null;

        this._qualityTier = this._resolveQualityTier();
        this._disposed = false;

        this.init();
    }

    _resolveQualityTier() {
        if (graphicsSettingsController && graphicsSettingsController.quality) {
            return graphicsSettingsController.quality;
        }
        if (qualityManager && qualityManager.level) {
            return qualityManager.level;
        }
        return 'medium';
    }

    init() {
        const {
            position,
            height,
            coreRadius,
            glowRadius,
            topScale
        } = this.options;

        this.group.position.copy(position);

        const quality = this._qualityTier;
        const isUltra = quality === 'ultra';
        const isHigh = quality === 'high' || isUltra;
        const isMedium = quality === 'medium';
        const isLowOrMobile = quality === 'low' || quality === 'mobile';

        // --------------------------------------------------------------------
        // 1. BEAM CORE & OUTER GLOW CYLINDERS
        // --------------------------------------------------------------------
        const radialSegmentsGlow = isHigh ? 32 : (isMedium ? 24 : 16);
        const radialSegmentsCore = isHigh ? 24 : 16;

        const glowGeometry = new THREE.CylinderGeometry(
            glowRadius * topScale,
            glowRadius,
            height,
            radialSegmentsGlow,
            1,
            true
        );
        this.geometries.push(glowGeometry);

        const coreGeometry = new THREE.CylinderGeometry(
            coreRadius * topScale,
            coreRadius,
            height,
            radialSegmentsCore,
            1,
            true
        );
        this.geometries.push(coreGeometry);

        const createBeamMaterial = (isCore) => {
            const bloomBoost = Math.max(0.0, this.options.bloomBoost !== undefined ? this.options.bloomBoost : 1.0);
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0.0 },
                    uColor: { value: isCore ? this._coreColor.clone() : this._outerGlowColor.clone() },
                    uCore: { value: isCore ? 1.0 : 0.0 },
                    uPulse: { value: 1.0 },
                    uBloomBoost: { value: bloomBoost }
                },
                vertexShader: `
                    varying vec2 vUv;
                    varying vec3 vNormal;
                    varying vec3 vViewPosition;

                    void main() {
                        vUv = uv;
                        vNormal = normalize(normalMatrix * normal);
                        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                        vViewPosition = -mvPos.xyz;
                        gl_Position = projectionMatrix * mvPos;
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform vec3 uColor;
                    uniform float uCore;
                    uniform float uPulse;
                    uniform float uBloomBoost;
                    varying vec2 vUv;
                    varying vec3 vNormal;
                    varying vec3 vViewPosition;

                    void main() {
                        // Smooth radial edge falloff
                        float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
                        edge = pow(max(edge, 0.0), mix(2.6, 0.6, uCore));

                        // Vertical atmospheric fade
                        float bottomFade = smoothstep(0.0, 0.05, vUv.y);
                        float topFade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
                        float verticalFade = bottomFade * topFade;

                        // Flowing energetic pulses ascending along the beam
                        float pulsePos1 = fract(uTime * 0.95);
                        float pulseDist1 = abs(vUv.y - pulsePos1);
                        pulseDist1 = min(pulseDist1, 1.0 - pulseDist1);
                        float movingPulse1 = exp(-pulseDist1 * 26.0);

                        float pulsePos2 = fract(uTime * 1.55 + 0.45);
                        float pulseDist2 = abs(vUv.y - pulsePos2);
                        pulseDist2 = min(pulseDist2, 1.0 - pulseDist2);
                        float movingPulse2 = exp(-pulseDist2 * 32.0) * 0.65;

                        // High frequency energy shimmering along length
                        float shimmer = 0.84 + 0.16 * sin(vUv.y * 110.0 - uTime * 22.0);

                        float alpha = edge * verticalFade * shimmer * uPulse;
                        alpha *= mix(0.24, 0.96, uCore);
                        alpha += (movingPulse1 + movingPulse2) * mix(0.22, 0.85, uCore) * verticalFade;

                        // Additive core bloom boost scaled by uBloomBoost
                        vec3 finalColor = uColor * ((1.6 + uCore * 3.0 + (movingPulse1 + movingPulse2) * 2.4) * uBloomBoost);
                        gl_FragColor = vec4(finalColor, alpha);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            this.materials.push(material);
            return material;
        };

        const glowMesh = new THREE.Mesh(glowGeometry, createBeamMaterial(false));
        glowMesh.name = 'ItemBeamOuterGlow';
        const coreMesh = new THREE.Mesh(coreGeometry, createBeamMaterial(true));
        coreMesh.name = 'ItemBeamInnerCore';

        this.group.add(glowMesh, coreMesh);

        // --------------------------------------------------------------------
        // 2. BASE / CONTACT IMPACT GLOW (Anchors beam to item / table surface)
        // --------------------------------------------------------------------
        this._createBaseGlow();

        // --------------------------------------------------------------------
        // 3. MULTI-TIER PARTICLE SYSTEMS
        // --------------------------------------------------------------------
        this._createParticles(quality);

        // --------------------------------------------------------------------
        // 4. ANIMATED DYNAMIC LIGHTING
        // --------------------------------------------------------------------
        if (this.options.enableLights && !isLowOrMobile) {
            this._createLighting(isUltra || isHigh);
        }

        this.scene.add(this.group);
    }

    /**
     * Concentrated base impact contact glow
     */
    _createBaseGlow() {
        this._baseGlowGroup = new THREE.Group();
        this._baseGlowGroup.name = 'ItemBeamBaseGlow';
        // Positioned at the very foot of the beam
        this._baseGlowGroup.position.set(0, -this.options.height * 0.5, 0);

        // Derive ring and disc radii proportionally from options if specified,
        // otherwise fall back to ITEM_BEAM_CONFIG defaults.
        const innerRingRadius = this.options.coreRadius
            ? Math.max(0.001, this.options.coreRadius * 0.9)
            : ITEM_BEAM_CONFIG.BASE_GLOW.innerRingRadius;
        const outerRingRadius = this.options.glowRadius
            ? Math.max(innerRingRadius * 1.5, this.options.glowRadius * 1.15)
            : ITEM_BEAM_CONFIG.BASE_GLOW.outerRingRadius;
        const coreDiscRadius = this.options.glowRadius
            ? Math.max(0.001, this.options.glowRadius * 0.65)
            : ITEM_BEAM_CONFIG.BASE_GLOW.coreDiscRadius;

        // 1. Concentric pulsing energy ring
        const ringGeom = new THREE.RingGeometry(
            innerRingRadius,
            outerRingRadius,
            32
        );
        ringGeom.rotateX(-Math.PI / 2);
        this.geometries.push(ringGeom);

        const baseGlowMult = Math.max(0.0, this.options.baseGlowOpacity !== undefined ? this.options.baseGlowOpacity : 1.0);

        this._baseRingMat = new THREE.MeshBasicMaterial({
            color: this._mainColor,
            transparent: true,
            opacity: 0.45 * baseGlowMult,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.materials.push(this._baseRingMat);

        this._baseRingMesh = new THREE.Mesh(ringGeom, this._baseRingMat);
        this._baseGlowGroup.add(this._baseRingMesh);

        // 2. High-intensity soft center contact disc
        const discGeom = new THREE.CircleGeometry(coreDiscRadius, 24);
        discGeom.rotateX(-Math.PI / 2);
        this.geometries.push(discGeom);

        this._baseDiscMat = new THREE.MeshBasicMaterial({
            color: this._coreColor,
            transparent: true,
            opacity: 0.60 * baseGlowMult,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this.materials.push(this._baseDiscMat);

        this._baseDiscMesh = new THREE.Mesh(discGeom, this._baseDiscMat);
        this._baseGlowGroup.add(this._baseDiscMesh);

        this.group.add(this._baseGlowGroup);
    }

    /**
     * Particles: Main upward flow + Micro aura + Outward sparks
     */
    _createParticles(quality) {
        const { height, topScale } = this.options;
        const cfg = ITEM_BEAM_CONFIG.PARTICLES;
        const isLowOrMobile = quality === 'low' || quality === 'mobile';

        // Particle count: if options.particleCount is provided, use it directly!
        let mainCount = this.options.particleCount !== undefined ? this.options.particleCount : cfg.mainCount;
        let microCount = Math.round(mainCount * 0.45);
        let sparkCount = Math.round(mainCount * 0.30);

        if (this.options.particleCount === undefined) {
            if (quality === 'ultra') {
                mainCount = 130;
                microCount = 70;
                sparkCount = 45;
            } else if (quality === 'high') {
                mainCount = 100;
                microCount = 50;
                sparkCount = 30;
            } else if (quality === 'medium') {
                mainCount = 65;
                microCount = 30;
                sparkCount = 15;
            } else {
                // LOW & MOBILE: minimal budget, single lightweight particle pass
                mainCount = 32;
                microCount = 16;
                sparkCount = 10;
            }
        }

        const particleRadius = this.options.particleRadius || cfg.mainRadius;
        const microRadius = this.options.particleRadius ? this.options.particleRadius * 0.65 : cfg.microRadius;
        const sparkRadius = this.options.particleRadius ? this.options.particleRadius * 1.5 : cfg.sparkRadius;
        const speedScale = this.options.height ? (this.options.height / 520.0) : 1.0;
        const upwardSpeedBase = cfg.upwardSpeed * speedScale;
        const lateralSwirlScale = particleRadius * 0.15;

        // Tier 1: Main Energetic Upward Rising Particles + Micro Aura
        const totalStandardCount = mainCount + microCount;
        const positions = new Float32Array(totalStandardCount * 3);
        const phases = new Float32Array(totalStandardCount);
        const sizes = new Float32Array(totalStandardCount);
        const speeds = new Float32Array(totalStandardCount);

        for (let i = 0; i < totalStandardCount; i++) {
            const isMicro = i >= mainCount;
            const y = Math.random();
            const taper = THREE.MathUtils.lerp(1.0, topScale, y);
            const angle = Math.random() * Math.PI * 2;
            const baseRadius = isMicro ? (Math.random() * microRadius) : (particleRadius * 0.2 + Math.random() * particleRadius * 0.8);
            const radius = baseRadius * taper;

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = (y - 0.5) * height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            phases[i] = Math.random() * Math.PI * 2;
            sizes[i] = isMicro ? (0.8 + Math.random() * 1.0) : (1.2 + Math.random() * 1.6);
            speeds[i] = isMicro ? (upwardSpeedBase * 0.4 + Math.random() * upwardSpeedBase * 0.3) : (upwardSpeedBase * 0.8 + Math.random() * upwardSpeedBase * 0.6);
        }

        const mainGeom = new THREE.BufferGeometry();
        mainGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        mainGeom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        mainGeom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        mainGeom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
        this.geometries.push(mainGeom);

        const particleBrightness = Math.max(0.0, this.options.particleBrightness !== undefined ? this.options.particleBrightness : 1.0);

        const mainMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uColor: { value: this._mainColor.clone() },
                uHighlightColor: { value: this._particleHighlightColor.clone() },
                uHeight: { value: height },
                uPulse: { value: 1.0 },
                uSwirl: { value: lateralSwirlScale },
                uCoreRadius: { value: Math.max(0.001, particleRadius * 0.7) },
                uBrightness: { value: particleBrightness },
                uParticleScale: { value: this.options.particleSize !== undefined ? this.options.particleSize : 1.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uHeight;
                uniform float uPulse;
                uniform float uSwirl;
                uniform float uCoreRadius;
                uniform float uParticleScale;
                attribute float aPhase;
                attribute float aSize;
                attribute float aSpeed;
                varying float vAlpha;
                varying float vCoreRatio;

                void main() {
                    vec3 animPos = position;

                    // Accelerated upward movement along beam
                    animPos.y = mod(
                        position.y + uHeight * 0.5 + uTime * aSpeed + aPhase * (uHeight * 0.1),
                        uHeight
                    ) - uHeight * 0.5;

                    // Subtle harmonic lateral swirl scaled to particle radius
                    float swirl = sin(uTime * 2.4 + aPhase + animPos.y * 0.022);
                    animPos.x += swirl * uSwirl;
                    animPos.z += cos(uTime * 1.9 + aPhase) * uSwirl;

                    float normY = animPos.y / uHeight + 0.5;
                    float bottomFade = smoothstep(0.0, 0.06, normY);
                    float topFade = 1.0 - smoothstep(0.62, 1.0, normY);
                    vAlpha = bottomFade * topFade * (0.60 + 0.40 * sin(uTime * 5.5 + aPhase)) * uPulse;

                    // Proximity to beam center produces brighter core highlight
                    float distFromAxis = length(animPos.xz);
                    vCoreRatio = clamp(1.0 - (distFromAxis / uCoreRadius), 0.0, 1.0);

                    vec4 mvPosition = modelViewMatrix * vec4(animPos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = (aSize * uParticleScale) * (320.0 / max(1.0, -mvPosition.z));
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform vec3 uHighlightColor;
                uniform float uBrightness;
                varying float vAlpha;
                varying float vCoreRatio;

                void main() {
                    vec2 pt = gl_PointCoord - vec2(0.5);
                    float d = length(pt);
                    if (d > 0.5) discard;

                    float glow = 1.0 - smoothstep(0.02, 0.5, d);
                    vec3 col = mix(uColor, uHighlightColor, vCoreRatio);
                    // Emit delicate particle color without full-screen blown bloom
                    col *= (0.4 + glow * 0.8) * uBrightness;
                    gl_FragColor = vec4(col, glow * vAlpha * 0.85);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.materials.push(mainMat);
        this.particleMaterials.push(mainMat);

        this._mainParticles = new THREE.Points(mainGeom, mainMat);
        this._mainParticles.frustumCulled = false;
        this.group.add(this._mainParticles);

        // Tier 2: Lateral drifting sparks (High & Ultra tiers)
        if (sparkCount > 0) {
            const sparkPositions = new Float32Array(sparkCount * 3);
            const sparkPhases = new Float32Array(sparkCount);
            const sparkSizes = new Float32Array(sparkCount);
            const sparkAngles = new Float32Array(sparkCount);

            for (let i = 0; i < sparkCount; i++) {
                const y = Math.random() * 0.45; // Spawn in lower portion of the beam
                sparkPositions[i * 3] = 0;
                sparkPositions[i * 3 + 1] = (y - 0.5) * height;
                sparkPositions[i * 3 + 2] = 0;

                sparkPhases[i] = Math.random() * Math.PI * 2;
                sparkSizes[i] = 1.0 + Math.random() * 1.2;
                sparkAngles[i] = Math.random() * Math.PI * 2;
            }

            const sparkGeom = new THREE.BufferGeometry();
            sparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
            sparkGeom.setAttribute('aPhase', new THREE.BufferAttribute(sparkPhases, 1));
            sparkGeom.setAttribute('aSize', new THREE.BufferAttribute(sparkSizes, 1));
            sparkGeom.setAttribute('aAngle', new THREE.BufferAttribute(sparkAngles, 1));
            this.geometries.push(sparkGeom);

            const sparkRadialLimit = sparkRadius * 1.2;
            const sparkBrightness = Math.max(0.0, this.options.particleBrightness !== undefined ? this.options.particleBrightness : 1.0);

            const sparkMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0.0 },
                    uColor: { value: this._coreColor.clone() },
                    uHeight: { value: height },
                    uPulse: { value: 1.0 },
                    uSparkRadialLimit: { value: sparkRadialLimit },
                    uBrightness: { value: sparkBrightness },
                    uParticleScale: { value: this.options.particleSize !== undefined ? this.options.particleSize : 1.0 }
                },
                vertexShader: `
                    uniform float uTime;
                    uniform float uHeight;
                    uniform float uPulse;
                    uniform float uSparkRadialLimit;
                    uniform float uParticleScale;
                    attribute float aPhase;
                    attribute float aSize;
                    attribute float aAngle;
                    varying float vAlpha;

                    void main() {
                        float cycle = fract(uTime * 0.65 + aPhase * 0.15);
                        vec3 p = position;

                        // Rise upward while expanding radially outward scaled to particle radius
                        p.y += cycle * uHeight * 0.55;
                        float radialDist = cycle * uSparkRadialLimit + sin(uTime * 3.0 + aPhase) * (uSparkRadialLimit * 0.15);
                        p.x += cos(aAngle) * radialDist;
                        p.z += sin(aAngle) * radialDist;

                        // Spark fade envelope: quick burst in, soft fade out
                        vAlpha = sin(cycle * 3.14159) * uPulse * 0.85;

                        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                        gl_Position = projectionMatrix * mvPos;
                        gl_PointSize = (aSize * uParticleScale) * (260.0 / max(1.0, -mvPos.z));
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uBrightness;
                    varying float vAlpha;

                    void main() {
                        vec2 pt = gl_PointCoord - vec2(0.5);
                        float d = length(pt);
                        if (d > 0.5) discard;
                        float glow = pow(1.0 - d * 2.0, 1.2);
                        gl_FragColor = vec4(uColor * (0.8 * uBrightness), glow * vAlpha * 0.75);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            this.materials.push(sparkMat);
            this.particleMaterials.push(sparkMat);

            this._sparkParticles = new THREE.Points(sparkGeom, sparkMat);
            this._sparkParticles.frustumCulled = false;
            this.group.add(this._sparkParticles);
        }

        // Tier 3: Non-glowing Swirling Particles along and around the beam
        let swirlCount = this.options.swirlParticleCount !== undefined
            ? this.options.swirlParticleCount
            : (isLowOrMobile ? 18 : 36);

        if (swirlCount > 0) {
            const swirlRadius = this.options.swirlRadius || (this.options.glowRadius ? this.options.glowRadius * 1.35 : 14.0);
            const swirlPositions = new Float32Array(swirlCount * 3);
            const swirlPhases = new Float32Array(swirlCount);
            const swirlRadii = new Float32Array(swirlCount);
            const swirlSpeeds = new Float32Array(swirlCount);
            const swirlSizes = new Float32Array(swirlCount);

            for (let i = 0; i < swirlCount; i++) {
                const y = Math.random();
                swirlPositions[i * 3] = 0;
                swirlPositions[i * 3 + 1] = (y - 0.5) * height;
                swirlPositions[i * 3 + 2] = 0;

                swirlPhases[i] = Math.random() * Math.PI * 2;
                // Layered radii around the beam column
                swirlRadii[i] = swirlRadius * (0.65 + Math.random() * 0.70);
                // Orbit swirl velocity and ascending speed variation
                swirlSpeeds[i] = (Math.random() > 0.3 ? 1.0 : -0.7) * (1.8 + Math.random() * 2.2);
                swirlSizes[i] = 1.0 + Math.random() * 1.4;
            }

            const swirlGeom = new THREE.BufferGeometry();
            swirlGeom.setAttribute('position', new THREE.BufferAttribute(swirlPositions, 3));
            swirlGeom.setAttribute('aPhase', new THREE.BufferAttribute(swirlPhases, 1));
            swirlGeom.setAttribute('aRadius', new THREE.BufferAttribute(swirlRadii, 1));
            swirlGeom.setAttribute('aSpeed', new THREE.BufferAttribute(swirlSpeeds, 1));
            swirlGeom.setAttribute('aSize', new THREE.BufferAttribute(swirlSizes, 1));
            this.geometries.push(swirlGeom);

            // Shaded with NormalBlending (standard alpha) and dark/matte core - NO GLOW / NO ADDITIVE BLOOM
            const swirlMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0.0 },
                    uColor: { value: this._mainColor.clone() },
                    uHeight: { value: height },
                    uTopScale: { value: topScale },
                    uSwirlParticleScale: { value: this.options.swirlParticleSize !== undefined ? this.options.swirlParticleSize : 0.022 },
                    uSwirlOpacity: { value: this.options.swirlParticleOpacity !== undefined ? this.options.swirlParticleOpacity : 0.85 }
                },
                vertexShader: `
                    uniform float uTime;
                    uniform float uHeight;
                    uniform float uTopScale;
                    uniform float uSwirlParticleScale;
                    attribute float aPhase;
                    attribute float aRadius;
                    attribute float aSpeed;
                    attribute float aSize;
                    varying float vAlpha;
                    varying vec2 vUvCoord;

                    void main() {
                        // Rising helical trajectory around the beam axis
                        float relY = mod(position.y + uHeight * 0.5 + uTime * (uHeight * 0.22 * abs(aSpeed) * 0.4) + aPhase * (uHeight * 0.15), uHeight);
                        float worldY = relY - uHeight * 0.5;

                        float normY = relY / uHeight;
                        float taper = mix(1.0, uTopScale, normY);

                        // Angular rotation swirling around Y-axis
                        float angle = aPhase + uTime * aSpeed + normY * 6.28318;
                        float r = aRadius * taper;

                        vec3 p = vec3(
                            cos(angle) * r,
                            worldY,
                            sin(angle) * r
                        );

                        // Vertical fade out at top and bottom edges
                        float bottomFade = smoothstep(0.0, 0.08, normY);
                        float topFade = 1.0 - smoothstep(0.78, 1.0, normY);
                        vAlpha = bottomFade * topFade;

                        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                        gl_Position = projectionMatrix * mvPos;
                        gl_PointSize = (aSize * uSwirlParticleScale) * (280.0 / max(1.0, -mvPos.z));
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uSwirlOpacity;
                    varying float vAlpha;

                    void main() {
                        vec2 pt = gl_PointCoord - vec2(0.5);
                        float d = length(pt);
                        if (d > 0.5) discard;

                        // Crisp solid particle disc with dark shaded rim - NO BLOOM / NO GLOW
                        float edgeSoft = smoothstep(0.5, 0.42, d);
                        // Subdued, unblown colors (0.6 - 0.8 intensity) so bloom threshold (0.66) won't blow them out
                        vec3 particleColor = uColor * 0.72;
                        // Darker edge rim for depth
                        particleColor = mix(particleColor * 0.4, particleColor, smoothstep(0.48, 0.15, d));

                        gl_FragColor = vec4(particleColor, edgeSoft * vAlpha * uSwirlOpacity);
                    }
                `,
                transparent: true,
                blending: THREE.NormalBlending, // Normal alpha blending prevents blown additive bloom/glow
                depthWrite: false
            });

            this.materials.push(swirlMat);
            this.particleMaterials.push(swirlMat);

            this._swirlParticles = new THREE.Points(swirlGeom, swirlMat);
            this._swirlParticles.frustumCulled = false;
            this.group.add(this._swirlParticles);
        }
    }

    /**
     * Subtle dynamic scene illumination
     */
    _createLighting(hasSecondaryLight) {
        const cfg = ITEM_BEAM_CONFIG.LIGHT;
        const footY = -this.options.height * 0.5;

        // Scale light distance proportional to height/glowRadius if customized (e.g. tile marker)
        const lightDistBase = this.options.glowRadius ? Math.max(0.04, this.options.glowRadius * 3.5) : cfg.baseDistance;
        const lightDistSec = this.options.glowRadius ? Math.max(0.06, this.options.glowRadius * 5.5) : cfg.secondaryDistance;
        const secOffset = this.options.height ? this.options.height * 0.25 : cfg.secondaryHeightOffset;
        const footOffset = this.options.height ? this.options.height * 0.05 : 4.0;

        // 1. Primary Contact PointLight (at item base)
        this._primaryLight = new THREE.PointLight(
            this._mainColor,
            cfg.baseIntensity,
            lightDistBase
        );
        this._primaryLight.position.set(0, footY + footOffset, 0);
        this.group.add(this._primaryLight);
        this.lights.push(this._primaryLight);

        // 2. Secondary elevated fill light for nearby geometry
        if (hasSecondaryLight) {
            this._secondaryLight = new THREE.PointLight(
                this._coreColor,
                cfg.secondaryIntensity,
                lightDistSec
            );
            this._secondaryLight.position.set(0, footY + secOffset, 0);
            this.group.add(this._secondaryLight);
            this.lights.push(this._secondaryLight);
        }
    }

    /**
     * Updates beam animation, particle simulation, and dynamic lights
     * @param {number} time - Elapsed time in seconds
     * @param {number} speed - Playback speed multiplier
     * @param {boolean} enabled - Visibility toggle
     */
    update(time, speed = 1.0, enabled = true) {
        this.group.visible = enabled;
        if (!enabled || this._disposed) return;

        const effectiveSpeed = (speed !== undefined && !isNaN(speed)) ? speed : 1.0;
        const animationTime = time * 0.35 * effectiveSpeed;

        // Shared harmonic pulse system (influences beam opacity, glow, light intensity)
        const pulseFreq = ITEM_BEAM_CONFIG.BEAM.pulseFrequency;
        const pulse = 0.85 + 0.15 * Math.sin(animationTime * pulseFreq);

        // Update beam cylinder shader materials
        for (let i = 0; i < this.materials.length; i++) {
            const mat = this.materials[i];
            if (mat.uniforms && mat.uniforms.uTime) {
                mat.uniforms.uTime.value = animationTime;
            }
            if (mat.uniforms && mat.uniforms.uPulse) {
                mat.uniforms.uPulse.value = pulse;
            }
        }

        // Base impact contact glow animation
        if (this._baseRingMesh) {
            this._baseRingMesh.rotation.y = animationTime * ITEM_BEAM_CONFIG.BASE_GLOW.rotationSpeed;
            if (this._baseRingMat) {
                const baseGlowMult = Math.max(0.0, this.options.baseGlowOpacity !== undefined ? this.options.baseGlowOpacity : 1.0);
                this._baseRingMat.opacity = (0.45 + 0.20 * Math.sin(animationTime * 4.2)) * baseGlowMult;
            }
        }
        if (this._baseDiscMesh) {
            const discScale = 1.0 + 0.12 * Math.sin(animationTime * 5.0 + 0.7);
            this._baseDiscMesh.scale.set(discScale, discScale, discScale);
            if (this._baseDiscMat) {
                const baseGlowMult = Math.max(0.0, this.options.baseGlowOpacity !== undefined ? this.options.baseGlowOpacity : 1.0);
                this._baseDiscMat.opacity = (0.65 + 0.25 * Math.sin(animationTime * 5.0)) * baseGlowMult;
            }
        }

        // Dynamic lighting modulation
        if (this._primaryLight) {
            const lightPulse = 1.0 + Math.sin(animationTime * 4.5) * ITEM_BEAM_CONFIG.LIGHT.pulseAmount;
            this._primaryLight.intensity = ITEM_BEAM_CONFIG.LIGHT.baseIntensity * lightPulse;
        }
        if (this._secondaryLight) {
            const secLightPulse = 1.0 + Math.sin(animationTime * 3.8 + 1.2) * (ITEM_BEAM_CONFIG.LIGHT.pulseAmount * 0.75);
            this._secondaryLight.intensity = ITEM_BEAM_CONFIG.LIGHT.secondaryIntensity * secLightPulse;
        }
    }

    /**
     * Updates position dynamically
     */
    setPosition(x, y, z) {
        if (this.group) {
            this.group.position.set(x, y, z);
        }
    }

    /**
     * Cleanly deallocates all GPU and scene resources
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        // 1. Remove and nullify lights
        for (let i = 0; i < this.lights.length; i++) {
            const light = this.lights[i];
            if (light && light.parent) {
                light.parent.remove(light);
            }
            if (light && typeof light.dispose === 'function') {
                light.dispose();
            }
        }
        this.lights = [];
        this._primaryLight = null;
        this._secondaryLight = null;

        // 2. Dispose all tracked geometries
        for (let i = 0; i < this.geometries.length; i++) {
            const geo = this.geometries[i];
            if (geo && typeof geo.dispose === 'function') {
                geo.dispose();
            }
        }
        this.geometries = [];

        // 3. Dispose all tracked materials
        for (let i = 0; i < this.materials.length; i++) {
            const mat = this.materials[i];
            if (mat && typeof mat.dispose === 'function') {
                mat.dispose();
            }
        }
        this.materials = [];
        this.particleMaterials = [];

        // 4. Recursive traverse safeguard to ensure no lingering resources
        this.group.traverse((child) => {
            if (child.geometry && typeof child.geometry.dispose === 'function') {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m && typeof m.dispose === 'function' && m.dispose());
                } else if (typeof child.material.dispose === 'function') {
                    child.material.dispose();
                }
            }
        });

        // 5. Remove group from parent scene
        if (this.group.parent) {
            this.group.parent.remove(this.group);
        } else if (this.scene) {
            this.scene.remove(this.group);
        }

        this._mainParticles = null;
        this._sparkParticles = null;
        this._swirlParticles = null;
        this._baseGlowGroup = null;
        this._baseRingMesh = null;
        this._baseDiscMesh = null;
    }
}
