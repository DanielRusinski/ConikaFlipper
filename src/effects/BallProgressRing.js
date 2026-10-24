import * as THREE from 'three';
import { qualityManager } from '../core/QualityManager.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';

/**
 * Default visual configuration for the BallProgressRing
 */
export const BALL_PROGRESS_RING_CONFIG = {
    ringRadiusMultiplier: 1.5,
    segmentCount: 18,
    maxLevel: 9,
    lineThickness: 0.0011,        // radial thickness of filament in world units (~1.1mm)
    radialSegmentsPerArc: 8,      // number of quads along each segment arc
    segmentGap: 0.045,            // angular gap fraction between segments (~0.045 rad)
    verticalOffset: 0.0135,       // default: allocated at 1/2 of ball height (ballRadius * 1.0)
    followBallY: true,            // true: follows ball.y + offset; false: projected to ground y
    
    // Smooth responsive inertial lag follow for the ring
    lagLerpSpeed: 14.0,           // Inertial follow delay / lag for organic movement
    tiltTiltMultiplier: 0.35,     // Slight dynamic tilt reaction when ball accelerates
    
    // Floating Equipment Dots configuration (4 equipped item circles in an elastic chain)
    equipmentOrbCount: 4,
    equipmentOrbRadius: 0.0019,   // Small delicate floating circles / dots
    equipmentSegmentRestLength: 0.0085, // Equilibrium spacing between orbs in the chain
    equipmentElevation: 0.0065,   // Float height above ball equator
    elasticChainStiffness: 18.0,  // Spring stiffness between adjacent chained orbs
    elasticBallStiffness: 16.0,   // Spring pull between ball and the 1st orb
    elasticDamping: 0.83,         // Damping factor for loose but controlled motion
    randomFloatAmplitude: 0.0022, // Organic subtle random float wander amplitude when resting
    randomFloatSpeed: 1.6,        // Speed of organic wander oscillation
    tiltFollowStrength: 0.024,    // Slope pull distance under board tilt
    
    // Colours
    activeColour: 0xffffff,       // Pure luminous white / silver
    inactiveColour: 0x485263,     // Translucent dark slate / cool grey
    dangerColour: 0xff1453,       // Hot neon red/pink danger colour
    levelUpColour: 0x88f5ff,      // Soft luminous cyan-white energy wave
    orbColour: 0xc8f0ff,          // Luminous soft cyan/silver for item orbs
    
    // Opacities & emissive
    activeOpacity: 0.95,
    inactiveOpacity: 0.32,
    baseEmissiveIntensity: 0.75,
    dangerGlowIntensity: 2.8,
    
    // Danger detection defaults
    dangerInnerRadius: 0.035,     // Danger factor = 1.0 (imminent danger)
    dangerOuterRadius: 0.22,      // Danger factor = 0.0 (safe zone)
    
    // Organic Breathing Displacement
    organicDisplacementScale: 0.020, // ~2.0% of ring radius breathing (smooth, non-wavy)
    organicSpeed: 1.5,
    
    // Directional danger influence
    directionalDangerWeight: 0.70 // segments facing danger get up to 70% direct directional boost
};

/**
 * BallProgressRing
 *
 * Implements an organic 3D Level / Progress / Danger Ring surrounding the player ball:
 * - Allocated higher at 1/2 ball height (ball equator level).
 * - Smooth animation delay / lag movement when ball moves.
 * - Gentle planar organic breathing without vertical perimeter waving.
 * - 4 floating item circles / dots connected in a row by an INVISIBLE elastic line.
 * - Dynamic tilt slope & velocity trailing:
 *   When the board tilts (e.g. right side lower -> ball rolls right/downslope), the dots
 *   organically shift towards the downhill/tilt direction and follow the ball's movement vector.
 * - When stationary, the dots float with subtle organic random wandering while remaining
 *   loosely tethered in a row.
 * - 18 discrete arc segments mapping 2 segments per ball level (9 levels max).
 * - Fill amount dynamically tracks ball level + exact XP progress towards the next level.
 * - Multi-ball independent progression support (smoothly transitions across ball type switches).
 * - Spatial and directional danger proximity detection (pink/red warning glow & pulse).
 * - Single BufferGeometry with per-vertex attributes for maximum WebGL performance.
 * - Fully integrated with graphics quality presets (mobile/low/medium/high/ultra).
 */
export class BallProgressRing {
    constructor(options = {}) {
        this.options = { ...BALL_PROGRESS_RING_CONFIG, ...options };
        
        this.ball = options.ball || null;
        this.parentGroup = options.parentGroup || null;
        this.radiusMultiplier = this.options.ringRadiusMultiplier;
        this.segmentCount = this.options.segmentCount;
        this.maxLevel = this.options.maxLevel;
        
        // Base ball radius
        this.ballRadius = (this.ball && this.ball.radius) 
            ? this.ball.radius 
            : (GAME_CONFIG?.ball?.radius || 0.0135);
        this.baseRadius = this.ballRadius * this.radiusMultiplier;
        
        // Progression state
        this.ballType = (options.ballType || 'brass').toLowerCase();
        this.currentLevel = 1;
        this.currentXp = 0;
        this.requiredXp = 500;
        this.isMaxLevel = false;
        
        // Fill fraction: 0.0 -> 18.0 (active segments counter)
        this.targetFillSegments = 0.0;
        this.currentFillSegments = 0.0;
        
        // Danger tracking
        this.dangerSources = [];
        this.dangerFactor = 0.0;           // Normalized 0..1
        this.targetDangerFactor = 0.0;
        this.dangerAngle = 0.0;            // Angle in radians (X-Z plane) towards nearest danger
        this.hasDangerDirection = false;
        
        // Animation & visual event timers
        this._time = 0.0;
        this._levelUpPulseTimer = 0.0;     // > 0 when pulsing after level up
        this._xpGainPulseTimer = 0.0;      // > 0 when travelling highlight
        this._typeTransitionTimer = 1.0;
        
        // Board tilt slope storage
        this._tiltX = 0.0;
        this._tiltY = 0.0;
        
        // Inertial delayed position & velocity for organic floating lag
        this._ballPos = new THREE.Vector3();
        this._prevBallPos = new THREE.Vector3();
        this._ballVelocity = new THREE.Vector3();
        this._delayedRingPos = new THREE.Vector3();
        this._hasInitializedPos = false;
        
        // Quality scaling
        this._qualityTier = 'high';
        this._enableOrganic = true;
        this._enableDirectionalDanger = true;
        
        // Colors scratchpad
        this._activeColor = new THREE.Color(this.options.activeColour);
        this._inactiveColor = new THREE.Color(this.options.inactiveColour);
        this._dangerColor = new THREE.Color(this.options.dangerColour);
        this._levelUpColor = new THREE.Color(this.options.levelUpColour);
        this._orbColor = new THREE.Color(this.options.orbColour);
        this._segColor = new THREE.Color();
        
        // Root 3D Object
        this.group = new THREE.Group();
        this.group.name = 'BallProgressRingGroup';
        
        // Precompute segment noise seeds (stable smooth breathing noise)
        this._initSegmentSeeds();
        
        // Initialize Mesh & BufferGeometry
        this._initMesh();
        
        // Initialize 4 Floating Equipment Orbs connected in a row by an invisible elastic line
        this._initEquipmentOrbs();
        
        // Apply initial progress
        if (options.progress) {
            this.setProgress(options.progress);
            this.currentFillSegments = this.targetFillSegments;
        } else {
            this.calculateFillSegments(1, 0, 500);
            this.currentFillSegments = this.targetFillSegments;
        }
        
        // Hook into QualityManager
        this._applyQualityPreset(qualityManager?.level || 'high');
        this._unsubQuality = eventBus.on('quality:changed', (e) => {
            if (e && e.level) this._applyQualityPreset(e.level);
        });
        
        // Auto-add to parent if provided
        if (this.parentGroup) {
            this.parentGroup.add(this.group);
        }
    }
    
    /**
     * Precomputes procedural seeds for each segment to give organic, gentle breathing
     */
    _initSegmentSeeds() {
        this._seeds = [];
        for (let i = 0; i < this.segmentCount; i++) {
            this._seeds.push({
                radialFreq: 1.1 + ((i * 37) % 17) * 0.07,
                radialPhase: (i * 1.618) % (Math.PI * 2),
                radialAmp: 0.012 + ((i * 13) % 7) * 0.003
            });
        }
    }
    
    /**
     * Builds the unified 18-arc BufferGeometry and custom vertex-colored emissive shader material
     */
    _initMesh() {
        const segs = this.segmentCount;
        const subPerSeg = this.options.radialSegmentsPerArc;
        
        const quadsPerSeg = subPerSeg;
        const totalQuads = segs * quadsPerSeg;
        const totalVerts = totalQuads * 4;
        const totalIndices = totalQuads * 6;
        
        const positions = new Float32Array(totalVerts * 3);
        const colors = new Float32Array(totalVerts * 3);
        const alphas = new Float32Array(totalVerts);
        const segmentIndices = new Float32Array(totalVerts);
        const indices = new Uint16Array(totalIndices);
        
        let vIdx = 0;
        let iIdx = 0;
        
        const segAngleSpan = (Math.PI * 2) / segs;
        const gap = this.options.segmentGap;
        
        for (let s = 0; s < segs; s++) {
            for (let q = 0; q < quadsPerSeg; q++) {
                const vertBase = vIdx;
                
                for (let corner = 0; corner < 4; corner++) {
                    segmentIndices[vIdx + corner] = s + (q + (corner >= 2 ? 1 : 0)) / quadsPerSeg;
                    colors[(vIdx + corner) * 3] = 1.0;
                    colors[(vIdx + corner) * 3 + 1] = 1.0;
                    colors[(vIdx + corner) * 3 + 2] = 1.0;
                    alphas[vIdx + corner] = 1.0;
                }
                
                indices[iIdx++] = vertBase;
                indices[iIdx++] = vertBase + 1;
                indices[iIdx++] = vertBase + 2;
                
                indices[iIdx++] = vertBase + 2;
                indices[iIdx++] = vertBase + 1;
                indices[iIdx++] = vertBase + 3;
                
                vIdx += 4;
            }
        }
        
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        this.geometry.setAttribute('segIndex', new THREE.BufferAttribute(segmentIndices, 1));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        
        this.material = new THREE.ShaderMaterial({
            vertexShader: `
                attribute float alpha;
                attribute vec3 color;
                varying vec4 vColor;
                varying vec2 vUv;
                
                void main() {
                    vColor = vec4(color, alpha);
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec4 vColor;
                uniform float uGlobalOpacity;
                uniform float uGlowBoost;
                
                void main() {
                    vec3 finalCol = vColor.rgb * (1.0 + uGlowBoost);
                    float finalAlpha = vColor.a * uGlobalOpacity;
                    gl_FragColor = vec4(finalCol, finalAlpha);
                }
            `,
            uniforms: {
                uGlobalOpacity: { value: 1.0 },
                uGlowBoost: { value: 0.25 }
            },
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.NormalBlending,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.renderOrder = 999;
        this.group.add(this.mesh);
        
        this._updateGeometry(0);
    }

    /**
     * Initializes 4 floating circles (representing equipped items)
     * Connected in a row by an INVISIBLE elastic line:
     * - No polygon or tether mesh between points
     * - Points do not rotate around the ball
     * - Float randomly when idle, trail with delay when ball moves or tilts
     */
    _initEquipmentOrbs() {
        this.equipmentOrbs = [];
        this.orbGroup = new THREE.Group();
        this.orbGroup.name = 'EquipmentOrbsGroup';
        this.group.add(this.orbGroup);
        
        const count = this.options.equipmentOrbCount;
        const orbRadius = this.options.equipmentOrbRadius;
        const elevation = this.options.equipmentElevation;
        const segDist = this.options.equipmentSegmentRestLength;
        
        // Single geometry for 4 floating circles (small flat circle ribbons)
        const segmentsPerCircle = 16;
        const circleGeo = new THREE.BufferGeometry();
        const cPositions = new Float32Array((segmentsPerCircle + 1) * 3);
        const cIndices = new Uint16Array(segmentsPerCircle * 3);
        
        // Center vertex
        cPositions[0] = 0; cPositions[1] = 0; cPositions[2] = 0;
        for (let i = 0; i < segmentsPerCircle; i++) {
            const angle = (i / segmentsPerCircle) * Math.PI * 2;
            cPositions[(i + 1) * 3] = Math.cos(angle) * orbRadius;
            cPositions[(i + 1) * 3 + 1] = 0;
            cPositions[(i + 1) * 3 + 2] = Math.sin(angle) * orbRadius;
            
            const next = ((i + 1) % segmentsPerCircle) + 1;
            cIndices[i * 3] = 0;
            cIndices[i * 3 + 1] = i + 1;
            cIndices[i * 3 + 2] = next;
        }
        circleGeo.setAttribute('position', new THREE.BufferAttribute(cPositions, 3));
        circleGeo.setIndex(new THREE.BufferAttribute(cIndices, 1));
        this._orbSharedGeo = circleGeo;
        
        // Initialize orbs trailing along +Z initially
        for (let i = 0; i < count; i++) {
            const initialDist = (i + 1) * segDist;
            const initX = 0;
            const initZ = initialDist;
            const initY = elevation;
            
            const orbMat = new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uOpacity;
                    void main() {
                        gl_FragColor = vec4(uColor, uOpacity);
                    }
                `,
                uniforms: {
                    uColor: { value: new THREE.Color(this.options.orbColour) },
                    uOpacity: { value: 0.92 }
                },
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            
            const orbMesh = new THREE.Mesh(this._orbSharedGeo, orbMat);
            orbMesh.renderOrder = 1000;
            orbMesh.position.set(initX, initY, initZ);
            this.orbGroup.add(orbMesh);
            
            // Unique random frequencies and phases for organic wandering
            this.equipmentOrbs.push({
                index: i,
                mesh: orbMesh,
                material: orbMat,
                pos: new THREE.Vector3(initX, initY, initZ),
                vel: new THREE.Vector3(0, 0, 0),
                
                // Procedural smooth frequencies for idle wandering
                noiseFreqX: 0.8 + ((i * 17) % 7) * 0.15,
                noiseFreqZ: 0.9 + ((i * 29) % 11) * 0.12,
                noiseFreqY: 1.4 + ((i * 13) % 5) * 0.18,
                phaseX: (i * 1.832) % (Math.PI * 2),
                phaseZ: (i * 2.718) % (Math.PI * 2),
                phaseY: (i * 0.915) % (Math.PI * 2)
            });
        }
    }
    
    /**
     * Scales graphics fidelity according to active quality preset
     */
    _applyQualityPreset(level) {
        this._qualityTier = (level || 'high').toLowerCase();
        if (this._qualityTier === 'mobile' || this._qualityTier === 'low') {
            this._enableOrganic = false;
            this._enableDirectionalDanger = false;
            if (this.material && this.material.uniforms) {
                this.material.uniforms.uGlowBoost.value = 0.05;
            }
        } else if (this._qualityTier === 'medium') {
            this._enableOrganic = true;
            this._enableDirectionalDanger = true;
            if (this.material && this.material.uniforms) {
                this.material.uniforms.uGlowBoost.value = 0.20;
            }
        } else { // high or ultra
            this._enableOrganic = true;
            this._enableDirectionalDanger = true;
            if (this.material && this.material.uniforms) {
                this.material.uniforms.uGlowBoost.value = 0.45;
            }
        }
    }
    
    setBallType(type) {
        if (!type) return;
        const cleanType = type.toLowerCase();
        if (this.ballType !== cleanType) {
            this.ballType = cleanType;
            this._typeTransitionTimer = 0.0;
        }
    }
    
    setProgress({ level = 1, currentXp = 0, xp = 0, xpForNextLevel = 500, requiredXp = 500 }) {
        this.currentLevel = Math.max(1, Math.min(this.maxLevel, level));
        this.currentXp = Math.max(0, currentXp || xp || 0);
        this.requiredXp = Math.max(1, xpForNextLevel || requiredXp || 500);
        this.isMaxLevel = (this.currentLevel >= this.maxLevel);
        
        this.calculateFillSegments(this.currentLevel, this.currentXp, this.requiredXp);
    }
    
    calculateFillSegments(level, currentXp, requiredXp) {
        if (level >= this.maxLevel) {
            this.targetFillSegments = this.segmentCount;
            return;
        }
        
        const completedLevels = Math.max(0, level - 1);
        const baseSegments = completedLevels * 2.0;
        const progressFraction = Math.max(0.0, Math.min(1.0, currentXp / requiredXp));
        const nextLevelSegments = progressFraction * 2.0;
        
        this.targetFillSegments = Math.min(this.segmentCount, baseSegments + nextLevelSegments);
    }
    
    setDangerSources(sources) {
        if (!sources) {
            this.dangerSources = [];
            return;
        }
        this.dangerSources = Array.isArray(sources) ? sources : [sources];
    }
    
    onLevelUp(level) {
        this._levelUpPulseTimer = 1.25;
        if (level !== undefined) {
            this.currentLevel = Math.min(this.maxLevel, level);
            this.isMaxLevel = (this.currentLevel >= this.maxLevel);
        }
    }
    
    onXpGain(amount) {
        this._xpGainPulseTimer = 0.75;
    }
    
    /**
     * Primary update loop called per frame
     * Accepts optional tiltX and tiltY parameters to align with table tilt slope
     */
    update(deltaTime = 0.016, tiltX = null, tiltY = null) {
        const dt = Math.min(deltaTime, 0.1);
        this._time += dt;
        
        if (typeof tiltX === 'number') this._tiltX = tiltX;
        if (typeof tiltY === 'number') this._tiltY = tiltY;
        
        // 1. Synchronize position with ball (with organic animation delay / lag)
        this._updateTransform(dt);
        
        // 2. Update 4 floating equipment dots with slope tilt & velocity direction follow
        this._updateEquipmentOrbs(dt);
        
        // 3. Smoothly interpolate segment fill (avoid snapping, e.g. on ball switch)
        const fillLerpSpeed = this._typeTransitionTimer < 1.0 ? 8.0 : 12.0;
        this.currentFillSegments += (this.targetFillSegments - this.currentFillSegments) * Math.min(1.0, dt * fillLerpSpeed);
        if (this._typeTransitionTimer < 1.0) {
            this._typeTransitionTimer = Math.min(1.0, this._typeTransitionTimer + dt * 2.0);
        }
        
        // 4. Update event pulse timers
        if (this._levelUpPulseTimer > 0) {
            this._levelUpPulseTimer = Math.max(0, this._levelUpPulseTimer - dt);
        }
        if (this._xpGainPulseTimer > 0) {
            this._xpGainPulseTimer = Math.max(0, this._xpGainPulseTimer - dt);
        }
        
        // 5. Update Danger evaluation
        this._evaluateDangers();
        
        // 6. Smoothly interpolate dangerFactor
        this.dangerFactor += (this.targetDangerFactor - this.dangerFactor) * Math.min(1.0, dt * 10.0);
        
        // 7. Update BufferGeometry (gentle planar breathing without standing wave) & Vertex Colors
        this._updateGeometry(this._time);
        this._updateColors(this._time);
    }
    
    /**
     * Positions and aligns ring around the ball:
     * - Height allocated at 1/2 ball height (ball equator level: ballRadius * 1.0)
     * - Smooth animation delay / lag movement (gives floating inertia instead of being rigid)
     * - Dynamic banking tilt clamped to stay predominantly horizontal
     */
    _updateTransform(dt = 0.016) {
        if (!this.ball) return;
        
        let bx = 0, by = 0, bz = 0;
        
        if (this.ball.mesh && this.ball.mesh.position) {
            bx = this.ball.mesh.position.x;
            by = this.ball.mesh.position.y;
            bz = this.ball.mesh.position.z;
            this.group.visible = this.ball.mesh.visible !== false;
        } else if (this.ball.position) {
            bx = this.ball.position.x;
            by = this.ball.position.y;
            bz = this.ball.position.z;
        }
        
        this._ballPos.set(bx, by, bz);
        
        // Calculate velocity based on frame displacement
        if (dt > 0.0001 && this._hasInitializedPos) {
            this._ballVelocity.x = (bx - this._prevBallPos.x) / dt;
            this._ballVelocity.y = (by - this._prevBallPos.y) / dt;
            this._ballVelocity.z = (bz - this._prevBallPos.z) / dt;
        } else {
            this._ballVelocity.set(0, 0, 0);
        }
        this._prevBallPos.set(bx, by, bz);
        
        // Target vertical elevation: 1/2 ball height (ball equator level)
        const halfBallHeightOffset = this.options.verticalOffset || this.ballRadius;
        const targetY = this.options.followBallY
            ? (by + (halfBallHeightOffset - this.ballRadius))
            : (halfBallHeightOffset);
            
        // Initial setup
        if (!this._hasInitializedPos) {
            this._delayedRingPos.set(bx, targetY, bz);
            this._hasInitializedPos = true;
        }
        
        // Animation delay / inertial lag movement
        const lerpFactor = Math.min(1.0, dt * this.options.lagLerpSpeed);
        this._delayedRingPos.x += (bx - this._delayedRingPos.x) * lerpFactor;
        this._delayedRingPos.y += (targetY - this._delayedRingPos.y) * lerpFactor;
        this._delayedRingPos.z += (bz - this._delayedRingPos.z) * lerpFactor;
        
        this.group.position.set(this._delayedRingPos.x, this._delayedRingPos.y, this._delayedRingPos.z);
        
        // Dynamic tilt reaction when ball accelerates (subtle bank)
        const tiltX = -this._ballVelocity.z * 0.05 * this.options.tiltTiltMultiplier;
        const tiltZ = this._ballVelocity.x * 0.05 * this.options.tiltTiltMultiplier;
        const clampedTiltX = Math.max(-0.15, Math.min(0.15, tiltX));
        const clampedTiltZ = Math.max(-0.15, Math.min(0.15, tiltZ));
        
        this.group.rotation.set(clampedTiltX, 0, clampedTiltZ);
    }

    /**
     * Updates 4 floating equipment dots connected in a row by an INVISIBLE elastic line:
     * - NO polygons or visible cords between points
     * - Points do NOT rotate around the ball
     * - Organic slope alignment: positions and trails naturally towards the board slope / downhill direction
     *   (e.g., if right is lower, dots position themselves towards the slope and trail the movement vector)
     * - Smooth organic random wander when stationary without waving the main ring
     */
    _updateEquipmentOrbs(dt = 0.016) {
        if (!this.equipmentOrbs || this.equipmentOrbs.length === 0) return;
        
        const count = this.equipmentOrbs.length;
        const elevation = this.options.equipmentElevation;
        const restLen = this.options.equipmentSegmentRestLength;
        const ballStiffness = this.options.elasticBallStiffness;
        const chainStiffness = this.options.elasticChainStiffness;
        const damping = this.options.elasticDamping;
        const randAmp = this.options.randomFloatAmplitude;
        const randSpeed = this.options.randomFloatSpeed;
        const slopePull = this.options.tiltFollowStrength;
        
        // Ball position in group local coordinate space
        const localBallX = this._ballPos.x - this.group.position.x;
        const localBallY = this._ballPos.y - this.group.position.y;
        const localBallZ = this._ballPos.z - this.group.position.z;
        
        // Ball movement vector
        const vx = this._ballVelocity.x;
        const vz = this._ballVelocity.z;
        const ballSpeed = Math.hypot(vx, vz);
        
        // Downhill board tilt direction vector:
        // In this coordinate system, tiltX tilts around table axis, tiltY tilts around X axis.
        // Downhill acceleration is proportional to (sin(tiltX), sin(tiltY))
        const slopeDirX = Math.sin(this._tiltX || 0);
        const slopeDirZ = Math.sin(this._tiltY || 0);
        const slopeMag = Math.hypot(slopeDirX, slopeDirZ);
        
        // Combined trailing direction:
        // When ball is moving fast, trail opposite to ball velocity (-vx, -vz).
        // When ball is slowing or reacting to tilt, align with the downhill slope direction.
        let targetTrailDirX = 0;
        let targetTrailDirZ = 1.0; // default rest trail direction (+Z)
        
        if (ballSpeed > 0.015) {
            // Trailing behind ball movement direction
            targetTrailDirX = -vx / ballSpeed;
            targetTrailDirZ = -vz / ballSpeed;
        } else if (slopeMag > 0.001) {
            // Organic alignment with the downhill tilt direction
            targetTrailDirX = slopeDirX / slopeMag;
            targetTrailDirZ = slopeDirZ / slopeMag;
        }
        
        for (let i = 0; i < count; i++) {
            const orb = this.equipmentOrbs[i];
            
            // 1. Organic gentle random wander offsets (smooth multi-harmonic oscillation)
            const t = this._time * randSpeed;
            const wanderX = Math.sin(t * orb.noiseFreqX + orb.phaseX) * randAmp
                          + Math.cos(t * orb.noiseFreqZ * 0.7 + orb.phaseZ) * (randAmp * 0.4);
            const wanderZ = Math.cos(t * orb.noiseFreqZ + orb.phaseZ) * randAmp
                          + Math.sin(t * orb.noiseFreqX * 0.8 + orb.phaseX) * (randAmp * 0.4);
            const wanderY = Math.sin(t * orb.noiseFreqY + orb.phaseY) * (randAmp * 0.35);
            
            // 2. Chain leader/target: orb 0 connects to the ball; subsequent orbs connect to the preceding orb
            let leadX, leadY, leadZ, stiffness;
            if (i === 0) {
                // First dot anchored near ball in the trail direction
                const anchorDist = this.ballRadius * 1.25;
                leadX = localBallX + targetTrailDirX * anchorDist;
                leadY = localBallY + elevation;
                leadZ = localBallZ + targetTrailDirZ * anchorDist;
                stiffness = ballStiffness;
            } else {
                const prevOrb = this.equipmentOrbs[i - 1];
                leadX = prevOrb.pos.x;
                leadY = prevOrb.pos.y;
                leadZ = prevOrb.pos.z;
                stiffness = chainStiffness;
            }
            
            // Vector from current orb to leader
            const dx = leadX - orb.pos.x;
            const dy = leadY - orb.pos.y;
            const dz = leadZ - orb.pos.z;
            const dist = Math.hypot(dx, dz);
            
            // Elastic spring force along the invisible line
            let fx = 0, fy = 0, fz = 0;
            
            if (dist > 0.0001) {
                const targetDist = i === 0 ? (this.ballRadius * 0.35) : restLen;
                const stretch = dist - targetDist;
                
                const nx = dx / dist;
                const nz = dz / dist;
                fx = nx * stretch * stiffness;
                fz = nz * stretch * stiffness;
            } else {
                fx = dx * stiffness;
                fz = dz * stiffness;
            }
            
            fy = (dy + wanderY) * (stiffness * 0.8);
            
            // Add board tilt downhill gravity bias onto dots
            fx += slopeDirX * slopePull * 10.0;
            fz += slopeDirZ * slopePull * 10.0;
            
            // Add idle wandering force when stationary/slow
            const idleWeight = Math.max(0.0, 1.0 - Math.min(1.0, ballSpeed * 8.0));
            fx += wanderX * 8.0 * idleWeight;
            fz += wanderZ * 8.0 * idleWeight;
            
            // Integrate velocity with spring-damper
            const frameDamp = Math.pow(damping, dt * 60);
            orb.vel.x = (orb.vel.x + fx * dt) * frameDamp;
            orb.vel.y = (orb.vel.y + fy * dt) * frameDamp;
            orb.vel.z = (orb.vel.z + fz * dt) * frameDamp;
            
            // Integrate position
            orb.pos.x += orb.vel.x * dt;
            orb.pos.y += orb.vel.y * dt;
            orb.pos.z += orb.vel.z * dt;
            
            orb.mesh.position.set(orb.pos.x, orb.pos.y, orb.pos.z);
            
            // Danger proximity coloration
            if (orb.material && orb.material.uniforms && orb.material.uniforms.uColor) {
                this._segColor.copy(this._orbColor);
                if (this.dangerFactor > 0.05) {
                    this._segColor.lerp(this._dangerColor, this.dangerFactor * 0.85);
                }
                orb.material.uniforms.uColor.value.copy(this._segColor);
            }
        }
    }
    
    /**
     * Evaluates nearest hazard capable of killing the ball
     * Calculates dangerFactor (0..1) and spatial direction
     */
    _evaluateDangers() {
        let minDistance = Infinity;
        let nearestDx = 0;
        let nearestDz = 0;
        let foundHazard = false;
        
        const bx = this._ballPos.x;
        const bz = this._ballPos.z;
        
        for (let i = 0; i < this.dangerSources.length; i++) {
            const src = this.dangerSources[i];
            if (!src) continue;
            
            // A. LaserHazardSystem: check if FIRING or WARNING
            if (src._corridors && (src.state === 'FIRING' || src.state === 'WARNING')) {
                const corr = src._corridors[src._activeCorridorIndex];
                if (corr && corr.p1 && corr.p2) {
                    const d = this._distancePointToSegment(bx, bz, corr.p1.x, corr.p1.z, corr.p2.x, corr.p2.z);
                    if (d.dist < minDistance) {
                        const stateWeight = src.state === 'FIRING' ? 1.0 : 0.65;
                        minDistance = d.dist / Math.max(0.1, stateWeight);
                        nearestDx = d.projX - bx;
                        nearestDz = d.projZ - bz;
                        foundHazard = true;
                    }
                }
            }
            
            // B. CentipedeSystem: check distance to all alive segments
            if (src._segments && Array.isArray(src._segments)) {
                for (let s = 0; s < src._segments.length; s++) {
                    const seg = src._segments[s];
                    if (seg && seg.alive) {
                        const dist = Math.hypot(bx - seg.x, bz - seg.z);
                        if (dist < minDistance) {
                            minDistance = dist;
                            nearestDx = seg.x - bx;
                            nearestDz = seg.z - bz;
                            foundHazard = true;
                        }
                    }
                }
            }
            
            // C. BombSystem: check falling/ticking bombs (unless player is immune)
            if (src._activeBombs && Array.isArray(src._activeBombs)) {
                for (let b = 0; b < src._activeBombs.length; b++) {
                    const bomb = src._activeBombs[b];
                    if (bomb && !bomb.isExploded && !bomb.selfDamageImmune) {
                        const dist = Math.hypot(bx - bomb.targetX, bz - bomb.targetZ);
                        if (dist < minDistance) {
                            minDistance = dist;
                            nearestDx = bomb.targetX - bx;
                            nearestDz = bomb.targetZ - bz;
                            foundHazard = true;
                        }
                    }
                }
            }
            
            // D. Generic hazard position objects / vectors
            if (src.position && typeof src.position.x === 'number') {
                const dist = Math.hypot(bx - src.position.x, bz - src.position.z);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestDx = src.position.x - bx;
                    nearestDz = src.position.z - bz;
                    foundHazard = true;
                }
            }
        }
        
        if (foundHazard && minDistance < Infinity) {
            const inner = this.options.dangerInnerRadius;
            const outer = this.options.dangerOuterRadius;
            
            const normalized = Math.max(0.0, Math.min(1.0, 1.0 - (minDistance - inner) / (outer - inner)));
            this.targetDangerFactor = normalized;
            
            if (minDistance > 0.0001) {
                this.dangerAngle = Math.atan2(nearestDz, nearestDx);
                this.hasDangerDirection = true;
            } else {
                this.hasDangerDirection = false;
            }
        } else {
            this.targetDangerFactor = 0.0;
            this.hasDangerDirection = false;
        }
    }
    
    _distancePointToSegment(px, pz, x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 0.000001) {
            return { dist: Math.hypot(px - x1, pz - z1), projX: x1, projZ: z1 };
        }
        let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
        t = Math.max(0.0, Math.min(1.0, t));
        const projX = x1 + t * dx;
        const projZ = z1 + t * dz;
        return { dist: Math.hypot(px - projX, pz - projZ), projX, projZ };
    }
    
    /**
     * Updates vertex positions with gentle, smooth planar breathing.
     * Perimeter vertical waving when stationary is completely removed.
     */
    _updateGeometry(time) {
        const posAttr = this.geometry.attributes.position;
        const positions = posAttr.array;
        
        const segs = this.segmentCount;
        const quadsPerSeg = this.options.radialSegmentsPerArc;
        const segAngleSpan = (Math.PI * 2) / segs;
        const gap = this.options.segmentGap;
        const activeArcSpan = Math.max(0.01, segAngleSpan - gap);
        
        const halfThick = this.options.lineThickness * 0.5;
        const rBase = this.baseRadius;
        
        const motionSpeed = (this.options.organicSpeed + this.dangerFactor * 2.2);
        const organicScale = this._enableOrganic ? this.options.organicDisplacementScale : 0.0;
        
        let pIdx = 0;
        
        for (let s = 0; s < segs; s++) {
            const seed = this._seeds[s];
            const segStartAngle = s * segAngleSpan + gap * 0.5;
            
            // Smooth, subtle radial breathing displacement around the perimeter (no vertical waving)
            const radDisp = organicScale * rBase * Math.sin(time * motionSpeed * seed.radialFreq + seed.radialPhase);
            
            const rInner = (rBase - halfThick) + radDisp;
            const rOuter = (rBase + halfThick) + radDisp;
            
            for (let q = 0; q < quadsPerSeg; q++) {
                const a0 = segStartAngle + (q / quadsPerSeg) * activeArcSpan;
                const a1 = segStartAngle + ((q + 1) / quadsPerSeg) * activeArcSpan;
                
                const cos0 = Math.cos(a0);
                const sin0 = Math.sin(a0);
                const cos1 = Math.cos(a1);
                const sin1 = Math.sin(a1);
                
                // Quad Vert 0: Inner a0
                positions[pIdx] = rInner * cos0;
                positions[pIdx + 1] = 0;
                positions[pIdx + 2] = rInner * sin0;
                
                // Quad Vert 1: Outer a0
                positions[pIdx + 3] = rOuter * cos0;
                positions[pIdx + 4] = 0;
                positions[pIdx + 5] = rOuter * sin0;
                
                // Quad Vert 2: Inner a1
                positions[pIdx + 6] = rInner * cos1;
                positions[pIdx + 7] = 0;
                positions[pIdx + 8] = rInner * sin1;
                
                // Quad Vert 3: Outer a1
                positions[pIdx + 9] = rOuter * cos1;
                positions[pIdx + 10] = 0;
                positions[pIdx + 11] = rOuter * sin1;
                
                pIdx += 12;
            }
        }
        
        posAttr.needsUpdate = true;
    }
    
    /**
     * Updates vertex colors and alphas to render progression, danger, and visual highlights
     */
    _updateColors(time) {
        const colAttr = this.geometry.attributes.color;
        const alphaAttr = this.geometry.attributes.alpha;
        const colors = colAttr.array;
        const alphas = alphaAttr.array;
        
        const segs = this.segmentCount;
        const quadsPerSeg = this.options.radialSegmentsPerArc;
        const currentFill = this.currentFillSegments;
        const danger = this.dangerFactor;
        
        const dangerPulse = danger > 0.05 ? Math.sin(time * (4.0 + danger * 8.0)) * 0.18 * danger : 0.0;
        const effectiveDanger = Math.min(1.0, Math.max(0.0, danger + dangerPulse));
        const isMaxLevel = (currentFill >= 17.95);
        
        let cIdx = 0;
        let aIdx = 0;
        
        for (let s = 0; s < segs; s++) {
            const segFill = Math.max(0.0, Math.min(1.0, currentFill - s));
            const segAngle = ((s + 0.5) / segs) * (Math.PI * 2);
            
            let dirDangerFactor = effectiveDanger;
            if (this._enableDirectionalDanger && this.hasDangerDirection && danger > 0.01) {
                let angleDiff = Math.abs(segAngle - this.dangerAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                const alignment = Math.max(0.0, Math.cos(angleDiff));
                const dirBoost = alignment * this.options.directionalDangerWeight;
                dirDangerFactor = Math.min(1.0, effectiveDanger + dirBoost * (1.0 - effectiveDanger * 0.5));
            }
            
            for (let q = 0; q < quadsPerSeg; q++) {
                const quadProgressStart = q / quadsPerSeg;
                const quadProgressEnd = (q + 1) / quadsPerSeg;
                
                let isFilled = false;
                let partialFill = 0.0;
                
                if (segFill >= quadProgressEnd) {
                    isFilled = true;
                    partialFill = 1.0;
                } else if (segFill > quadProgressStart) {
                    isFilled = true;
                    partialFill = (segFill - quadProgressStart) / (quadProgressEnd - quadProgressStart);
                } else {
                    isFilled = false;
                    partialFill = 0.0;
                }
                
                if (isFilled) {
                    this._segColor.copy(this._activeColor);
                    
                    if (dirDangerFactor > 0.001) {
                        this._segColor.lerp(this._dangerColor, Math.pow(dirDangerFactor, 1.2));
                    }
                    
                    if (this._levelUpPulseTimer > 0) {
                        const wavePhase = (1.25 - this._levelUpPulseTimer) * 16.0;
                        const distToWave = Math.sin(s * 0.8 - wavePhase);
                        if (distToWave > 0.5) {
                            this._segColor.lerp(this._levelUpColor, (distToWave - 0.5) * 2.0 * (this._levelUpPulseTimer / 1.25));
                        }
                    }
                    
                    if (this._xpGainPulseTimer > 0) {
                        const tipSeg = Math.floor(currentFill);
                        if (Math.abs(s - tipSeg) <= 1) {
                            this._segColor.addScalar(0.40 * (this._xpGainPulseTimer / 0.75));
                        }
                    }
                    
                    if (isMaxLevel) {
                        const shimmer = 0.15 * Math.sin(time * 3.0 + s * 0.45);
                        this._segColor.addScalar(shimmer);
                    }
                } else {
                    this._segColor.copy(this._inactiveColor);
                    
                    if (dirDangerFactor > 0.05) {
                        this._segColor.lerp(this._dangerColor, dirDangerFactor * 0.40);
                    }
                }
                
                let alpha = isFilled 
                    ? (this.options.activeOpacity * partialFill) 
                    : this.options.inactiveOpacity;
                
                if (dirDangerFactor > 0.1) {
                    alpha = Math.min(1.0, alpha + dirDangerFactor * 0.25);
                }
                
                for (let k = 0; k < 4; k++) {
                    colors[cIdx] = this._segColor.r;
                    colors[cIdx + 1] = this._segColor.g;
                    colors[cIdx + 2] = this._segColor.b;
                    alphas[aIdx] = alpha;
                    
                    cIdx += 3;
                    aIdx += 1;
                }
            }
        }
        
        colAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        
        if (this.material && this.material.uniforms) {
            const baseGlow = this.options.baseEmissiveIntensity;
            const dangerGlow = effectiveDanger * this.options.dangerGlowIntensity;
            const levelUpGlow = (this._levelUpPulseTimer / 1.25) * 1.5;
            this.material.uniforms.uGlowBoost.value = baseGlow + dangerGlow + levelUpGlow;
        }
    }
    
    /**
     * Clean disposal of geometry, materials, listeners, floating orbs and scene graph bindings
     */
    dispose() {
        if (this._unsubQuality && typeof this._unsubQuality === 'function') {
            this._unsubQuality();
            this._unsubQuality = null;
        }
        
        if (this.geometry) {
            this.geometry.dispose();
            this.geometry = null;
        }
        
        if (this.material) {
            this.material.dispose();
            this.material = null;
        }
        
        if (this._orbSharedGeo) {
            this._orbSharedGeo.dispose();
            this._orbSharedGeo = null;
        }
        
        if (this.equipmentOrbs) {
            for (const orb of this.equipmentOrbs) {
                if (orb.material) orb.material.dispose();
                if (orb.mesh && orb.mesh.parent) orb.mesh.parent.remove(orb.mesh);
            }
            this.equipmentOrbs = [];
        }
        
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
            this.mesh = null;
        }
        
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
        
        this.dangerSources = [];
    }
}
