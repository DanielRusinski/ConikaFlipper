import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';
import { ENEMY_TABLE, SPAWN_RULES } from '../config/balanceTables.js';

/**
 * ButterflySystem
 * Manages the "Butterflies" environmental hazard / swarm (ENEMY_BUTTERFLIES):
 * - Lightweight instanced rendering using THREE.InstancedMesh (15 butterflies x 2 wings = 30 wing instances).
 * - Shared circle geometry with inner edge pivot and double-sided pastel emissive material.
 * - Procedural sinusoidal movement based on MeadowButterflies reference adapted to OPT Flipper scale.
 * - Invisible 8x8 cell gameplay influence zone centred on swarm anchor.
 * - Applies temporary environmental slowdown modifier (MOD_BUTTERFLY_SLOW, ball.speedScale x 0.50).
 * - Full lifecycle: spawn, despawn, ball entry/exit, pause adherence, stage clear, game over, life loss cleanup.
 * - Supports multiple swarms with unique instance IDs and STRONGEST_ONLY stacking rule.
 * - Debug influence zone visualization and telemetry.
 */
export class ButterflySystem {
    constructor() {
        this._parentGroup = null;
        this._tileManager = null;
        this._ballController = null;

        this.group = new THREE.Group();
        this.group.name = 'ButterflySystemGroup';

        // Grid & board metrics
        this._tableWidth = GAME_CONFIG.table.width;
        this._tableHeight = GAME_CONFIG.table.height;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;

        // Configuration driven by balance tables (ENEMY_TABLE.butterflies / SPAWN_RULES.butterflies)
        this._config = ENEMY_TABLE.butterflies;
        this._spawnRules = { ...SPAWN_RULES.butterflies };

        // Swarm collection: array of active swarm instances
        this._swarms = [];
        this._nextSwarmSequence = 1;

        // Stage & lifecycle state
        this._currentStage = 1;
        this._spawnTimer = 0.0;
        this._respawnTimer = 0.0;
        this._initialDelay = this._spawnRules.initialDelaySeconds;
        this._hasSpawnedInitial = false;

        // Shared geometry and material for wings across all swarms
        this._wingGeometry = null;
        this._wingMaterial = null;
        this._debugMaterial = null;

        // Matrix helper to avoid allocations in frame loop
        this._matrixHelper = new THREE.Object3D();
        this._cachedBallPos = new THREE.Vector3();

        // Debug visualization state
        this._debugInfluenceVisible = false;

        this._unsubs = [];
    }

    /**
     * Initializes the system and wires event subscriptions.
     */
    init(parentGroup, tileManager, ballController) {
        this._parentGroup = parentGroup;
        this._tileManager = tileManager;
        this._ballController = ballController;

        if (this._parentGroup) {
            this._parentGroup.add(this.group);
        }

        this._initResources();

        // Subscribe to lifecycle events
        this._unsubs.push(
            eventBus.on('stage:started', ({ stage }) => this.onStageStart(stage)),
            eventBus.on('stage:completed', () => this.onStageClear()),
            eventBus.on('game:over', () => this.onGameOver()),
            eventBus.on('life:lost', () => this.onLifeLost()),
            eventBus.on('ball:typeChanged', () => this.onBallTypeChanged()),
            eventBus.on('debug:toggleButterflyZones', (enabled) => this.setDebugVisibility(enabled)),
            eventBus.on('debug:spawnButterflies', () => this.spawnSwarm()),
            eventBus.on('debug:despawnButterflies', () => this.despawnAllSwarms()),
            eventBus.on('debug:moveButterfliesToBall', () => this.moveActiveSwarmToBall())
        );
    }

    /**
     * Creates shared instancing geometry and materials.
     */
    _initResources() {
        const visual = this._config.visual;

        // Circle geometry with pivot at the inner edge (translated by radius along X)
        const radius = visual.wingScale;
        const segments = visual.circleSegments || 12;
        this._wingGeometry = new THREE.CircleGeometry(radius, segments);
        this._wingGeometry.translate(radius, 0, 0); // Inner wing edge at origin

        const color = new THREE.Color(visual.color || '#ffb3ba');
        const emissiveColor = new THREE.Color(visual.emissiveColor || '#ffb3ba');

        this._wingMaterial = new THREE.MeshStandardMaterial({
            color: color,
            emissive: emissiveColor,
            emissiveIntensity: visual.emissiveIntensity !== undefined ? visual.emissiveIntensity : 2.0,
            roughness: 0.35,
            metalness: 0.10,
            transparent: true,
            opacity: visual.opacity !== undefined ? visual.opacity : 0.85,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Primary visual hitbox zone material: glowing neon pink/magenta translucent surface
        this._zoneFillMaterial = new THREE.MeshBasicMaterial({
            color: 0xff33aa,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        // Glowing border wireframe box/frame material for crisp 8x8 cell boundary definition (3x higher box)
        this._zoneBorderMaterial = new THREE.MeshBasicMaterial({
            color: 0xff66ee,
            wireframe: true,
            transparent: true,
            opacity: 0.85
        });

        // Floating particle cloud material inside the 3x higher box
        this._particleMaterial = (typeof THREE.PointsMaterial === 'function')
            ? new THREE.PointsMaterial({
                color: 0xff99ee,
                size: 0.008,
                transparent: true,
                opacity: 0.75,
                depthWrite: false
            })
            : null;

        // Debug outline/plane material for influence zone visualization
        this._debugMaterial = new THREE.MeshBasicMaterial({
            color: 0xff66cc,
            transparent: true,
            opacity: 0.28,
            wireframe: true,
            depthWrite: false
        });
    }

    /**
     * Called when a new stage begins.
     */
    onStageStart(stage = 1) {
        this._currentStage = stage;
        this.despawnAllSwarms();

        this._spawnTimer = 0.0;
        this._respawnTimer = 0.0;
        this._hasSpawnedInitial = false;
        this._initialDelay = this._spawnRules.initialDelaySeconds;
    }

    /**
     * Called on stage clear.
     */
    onStageClear() {
        this.despawnAllSwarms();
    }

    /**
     * Called on game over.
     */
    onGameOver() {
        this.despawnAllSwarms();
    }

    /**
     * Called when the ball loses a life / dies.
     * Clears modifiers and inside flags immediately so respawned ball enters cleanly.
     */
    onLifeLost() {
        for (const swarm of this._swarms) {
            if (swarm.ballInside) {
                this._removeSwarmModifier(swarm);
                swarm.ballInside = false;
                eventBus.emit('butterflies:ballExited', { swarmId: swarm.id });
                eventBus.emit('butterflies:effectRemoved', { swarmId: swarm.id });
            }
        }
    }

    /**
     * Called when the player changes ball type.
     */
    onBallTypeChanged() {
        // Re-evaluate modifiers on next update frame
        for (const swarm of this._swarms) {
            if (swarm.ballInside) {
                this._reapplyModifier(swarm);
            }
        }
    }

    /**
     * Spawns a single Butterfly swarm instance at a valid position.
     * @param {Object} [fixedCell] Optional { gridX, gridY } override
     * @returns {Object|null} Swarm instance or null if placement failed
     */
    spawnSwarm(fixedCell = null) {
        if (!this._config.enabled) return null;
        if (this._swarms.length >= this._spawnRules.maximumActive) return null;

        const zoneCfg = this._config.influenceZone;
        const widthCells = zoneCfg.widthCells || 8;
        const depthCells = zoneCfg.depthCells || 8;

        const anchor = fixedCell || this._findValidAnchor(widthCells, depthCells);
        if (!anchor) {
            return null;
        }

        const worldAnchor = this._tileManager.getTileWorldPos(anchor.gridX, anchor.gridY);
        const swarmId = `butterflies_stage_${this._currentStage}_${String(this._nextSwarmSequence++).padStart(2, '0')}`;
        const sourceKey = `environmental-zone:${swarmId}`;

        // Calculate world bounds of the influence zone
        const halfWidthWorld = (widthCells * this._tileWidth) / 2;
        const halfDepthWorld = (depthCells * this._tileHeight) / 2;

        const bounds = {
            minX: worldAnchor.x - halfWidthWorld,
            maxX: worldAnchor.x + halfWidthWorld,
            minZ: worldAnchor.z - halfDepthWorld,
            maxZ: worldAnchor.z + halfDepthWorld,
            minY: zoneCfg.minY !== undefined ? zoneCfg.minY : -0.5,
            maxY: zoneCfg.maxY !== undefined ? zoneCfg.maxY : 2.5
        };

        const butterflyCount = this._config.visual.butterflyCount || 15;
        const instanceCount = butterflyCount * 2; // Left wing + right wing

        // Create InstancedMesh for this swarm
        const instMesh = new THREE.InstancedMesh(this._wingGeometry, this._wingMaterial, instanceCount);
        instMesh.name = `ButterfliesWings_${swarmId}`;
        if (instMesh.instanceMatrix && typeof instMesh.instanceMatrix.setUsage === 'function') {
            instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        }
        this.group.add(instMesh);

        // Visible 8x8 Hitbox Zone Ground Plane
        const zoneWidth = widthCells * this._tileWidth;
        const zoneDepth = depthCells * this._tileHeight;
        const zonePlaneGeo = (typeof THREE.PlaneGeometry === 'function')
            ? new THREE.PlaneGeometry(zoneWidth, zoneDepth)
            : null;
        
        let zoneFillMesh = null;
        if (zonePlaneGeo) {
            zoneFillMesh = new THREE.Mesh(zonePlaneGeo, this._zoneFillMaterial);
            zoneFillMesh.name = `ButterfliesZoneFill_${swarmId}`;
            // Orient plane flat facing up on X-Z plane, slightly above tile level (Y = 0.003)
            zoneFillMesh.rotation.x = -Math.PI / 2;
            zoneFillMesh.position.set(worldAnchor.x, 0.003, worldAnchor.z);
            this.group.add(zoneFillMesh);
        }

        // Visible Perimeter Outline Border Frame for crisp 8x8 boundary - 3x higher box (height = 0.045)
        const boxHeight = 0.045; // 3x higher than previous 0.015
        let zoneBorderMesh = null;
        let zoneBorderGeo = null;
        if (typeof THREE.BoxGeometry === 'function') {
            zoneBorderGeo = new THREE.BoxGeometry(zoneWidth, boxHeight, zoneDepth);
            zoneBorderMesh = new THREE.Mesh(zoneBorderGeo, this._zoneBorderMaterial);
            zoneBorderMesh.name = `ButterfliesZoneBorder_${swarmId}`;
            zoneBorderMesh.position.set(worldAnchor.x, boxHeight / 2, worldAnchor.z);
            this.group.add(zoneBorderMesh);
        }

        // Particle System within the 3x higher 8x8 box
        const particleCount = 45;
        let particlePointsMesh = null;
        let particleGeo = null;
        const particleVelocities = [];
        const particleInitialOffsets = [];

        if (typeof THREE.BufferGeometry === 'function' && typeof THREE.Points === 'function' && this._particleMaterial) {
            const particlePositions = new Float32Array(particleCount * 3);
            const hw = zoneWidth * 0.44;
            const hd = zoneDepth * 0.44;

            for (let pIdx = 0; pIdx < particleCount; pIdx++) {
                // Seed positions inside the 3x higher box
                const offX = ((pIdx % 9) / 8 - 0.5) * 2 * hw + ((pIdx % 3) - 1) * 0.006;
                const offY = 0.005 + ((pIdx % 7) / 6) * (boxHeight - 0.010);
                const offZ = (Math.floor(pIdx / 9) / 4 - 0.5) * 2 * hd + ((pIdx % 4) - 1.5) * 0.005;

                particlePositions[pIdx * 3] = offX;
                particlePositions[pIdx * 3 + 1] = offY;
                particlePositions[pIdx * 3 + 2] = offZ;

                particleInitialOffsets.push({ x: offX, y: offY, z: offZ });
                particleVelocities.push({
                    speedY: 0.008 + (pIdx % 5) * 0.003,
                    driftSpeedX: 1.2 + (pIdx % 4) * 0.3,
                    driftSpeedZ: 1.0 + (pIdx % 6) * 0.25,
                    phase: pIdx * 0.45
                });
            }

            particleGeo = new THREE.BufferGeometry();
            if (typeof THREE.BufferAttribute === 'function') {
                particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
            }
            particlePointsMesh = new THREE.Points(particleGeo, this._particleMaterial);
            particlePointsMesh.name = `ButterfliesParticles_${swarmId}`;
            particlePointsMesh.position.set(worldAnchor.x, 0, worldAnchor.z);
            this.group.add(particlePointsMesh);
        }

        // Debug wireframe box mesh for influence zone (for optional debug wireframe toggling)
        const debugBoxGeo = (typeof THREE.BoxGeometry === 'function')
            ? new THREE.BoxGeometry(zoneWidth, 0.10, zoneDepth)
            : (zonePlaneGeo || null);
        const debugMesh = debugBoxGeo ? new THREE.Mesh(debugBoxGeo, this._debugMaterial) : new THREE.Object3D();
        debugMesh.name = `ButterfliesDebugZone_${swarmId}`;
        debugMesh.position.set(worldAnchor.x, 0.05, worldAnchor.z);
        debugMesh.visible = this._debugInfluenceVisible || Boolean(zoneCfg.debugVisible);
        this.group.add(debugMesh);

        // Seed individual procedural butterfly parameters (created ONCE at spawn)
        const butterflies = [];
        for (let i = 0; i < butterflyCount; i++) {
            butterflies.push({
                index: i,
                timeOffset: i * 0.42 + (i % 3) * 0.17,
                flightFactor: 0.75 + (i % 5) * 0.12,
                orbitRadiusX: 0.25 + (i % 4) * 0.18,
                orbitRadiusZ: 0.25 + ((i + 2) % 4) * 0.18,
                orbitSpeed: 0.6 + (i % 3) * 0.25,
                verticalPhase: i * 0.85,
                scaleVariation: 0.85 + (i % 4) * 0.10,
                flapPhaseOffset: i * 0.35,
                driftOffsetX: ((i % 5) - 2) * 0.18,
                driftOffsetZ: (Math.floor(i / 3) - 2) * 0.18
            });
        }

        const introDuration = this._spawnRules.introDurationSeconds || 1.2;
        const outroDuration = this._spawnRules.outroDurationSeconds || 1.2;

        const swarm = {
            id: swarmId,
            sourceKey,
            anchorCell: { gridX: anchor.gridX, gridY: anchor.gridY },
            worldAnchor,
            bounds,
            widthCells,
            depthCells,
            boxHeight,
            activeTimer: this._spawnRules.activeDurationSeconds || 10.0,
            elapsedTime: 0.0,
            introDuration,
            outroDuration,
            phase: 'intro', // 'intro' | 'active' | 'outro' | 'dead'
            phaseTimer: 0.0,
            transitionProgress: 0.0, // 0.0 -> 1.0 (intro: 0->1, outro: 1->0)
            butterflies,
            mesh: instMesh,
            zoneFillMesh,
            zonePlaneGeo,
            zoneBorderMesh,
            zoneBorderGeo,
            particlePointsMesh,
            particleGeo,
            particleVelocities,
            particleInitialOffsets,
            debugMesh,
            debugBoxGeo,
            ballInside: false,
            modifierApplied: false
        };

        this._swarms.push(swarm);
        this._hasSpawnedInitial = true;

        eventBus.emit('butterflies:spawned', {
            swarmId,
            anchorCell: swarm.anchorCell,
            worldAnchor: swarm.worldAnchor,
            bounds: swarm.bounds
        });

        return swarm;
    }

    /**
     * Despawns a specific swarm by ID and cleans up its resources.
     */
    despawnSwarm(swarmId) {
        const idx = this._swarms.findIndex(s => s.id === swarmId);
        if (idx === -1) return;

        const swarm = this._swarms[idx];
        if (swarm.ballInside) {
            this._removeSwarmModifier(swarm);
            swarm.ballInside = false;
            eventBus.emit('butterflies:ballExited', { swarmId: swarm.id });
            eventBus.emit('butterflies:effectRemoved', { swarmId: swarm.id });
        }

        if (swarm.mesh) {
            this.group.remove(swarm.mesh);
            if (typeof swarm.mesh.dispose === 'function') {
                swarm.mesh.dispose();
            }
        }
        if (swarm.zoneFillMesh) {
            this.group.remove(swarm.zoneFillMesh);
            if (swarm.zonePlaneGeo && typeof swarm.zonePlaneGeo.dispose === 'function') {
                swarm.zonePlaneGeo.dispose();
            }
        }
        if (swarm.zoneBorderMesh) {
            this.group.remove(swarm.zoneBorderMesh);
            if (swarm.zoneBorderGeo && typeof swarm.zoneBorderGeo.dispose === 'function') {
                swarm.zoneBorderGeo.dispose();
            }
        }
        if (swarm.particlePointsMesh) {
            this.group.remove(swarm.particlePointsMesh);
            if (swarm.particleGeo && typeof swarm.particleGeo.dispose === 'function') {
                swarm.particleGeo.dispose();
            }
        }
        if (swarm.debugMesh) {
            this.group.remove(swarm.debugMesh);
            if (swarm.debugBoxGeo && typeof swarm.debugBoxGeo.dispose === 'function') {
                swarm.debugBoxGeo.dispose();
            }
        }

        this._swarms.splice(idx, 1);
        eventBus.emit('butterflies:despawned', { swarmId });
    }

    /**
     * Despawns all active swarms.
     */
    despawnAllSwarms() {
        while (this._swarms.length > 0) {
            this.despawnSwarm(this._swarms[0].id);
        }
    }

    /**
     * Finds a valid anchor grid coordinate such that the entire widthCells x depthCells zone fits safely on the board.
     * Excludes ball spawn, shop portal, and board edges.
     */
    _findValidAnchor(widthCells, depthCells) {
        if (!this._tileManager) return null;

        const halfW = Math.floor(widthCells / 2);
        const halfD = Math.floor(depthCells / 2);

        const minGX = halfW;
        const maxGX = this._tilesX - 1 - halfW;
        const minGY = halfD;
        const maxGY = this._tilesY - 1 - halfD;

        if (minGX > maxGX || minGY > maxGY) {
            return null;
        }

        const ballSpawnGX = GAME_CONFIG.spawn.defaultGridX;
        const ballSpawnGY = GAME_CONFIG.spawn.defaultGridY;
        const shopGX = this._tileManager.shopTileGridX;
        const shopGY = this._tileManager.shopTileGridY;

        const maxAttempts = this._spawnRules.maximumPlacementAttempts || 20;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Select uniformly random candidates across the safe playable board area
            const spanX = maxGX - minGX + 1;
            const spanY = maxGY - minGY + 1;
            const candidateGX = minGX + Math.floor(Math.random() * spanX);
            const candidateGY = minGY + Math.floor(Math.random() * spanY);

            // Bounds check
            if (candidateGX < minGX || candidateGX > maxGX || candidateGY < minGY || candidateGY > maxGY) {
                continue;
            }

            // Check overlap with initial ball spawn
            if (this._spawnRules.avoidBallSpawn) {
                const distBall = Math.hypot(candidateGX - ballSpawnGX, candidateGY - ballSpawnGY);
                if (distBall < (halfW + 2)) {
                    continue;
                }
            }

            // Check overlap with shop portal
            if (this._spawnRules.avoidShopPortal && shopGX >= 0 && shopGY >= 0) {
                const distShop = Math.hypot(candidateGX - shopGX, candidateGY - shopGY);
                if (distShop < (halfW + 2)) {
                    continue;
                }
            }

            return { gridX: candidateGX, gridY: candidateGY };
        }

        // Fallback: pick safe center candidate if bounds allow
        const fallbackGX = Math.floor((minGX + maxGX) / 2);
        const fallbackGY = Math.floor((minGY + maxGY) / 2);
        return { gridX: fallbackGX, gridY: fallbackGY };
    }

    /**
     * Main per-frame update loop.
     * Uses gameplayDelta so timers and animation respect TimeManager and pause.
     */
    update(gameplayDelta) {
        if (!gameplayDelta || gameplayDelta <= 0) return;

        // Stage eligibility check
        if (this._currentStage < this._spawnRules.minimumStage) {
            if (this._swarms.length > 0) this.despawnAllSwarms();
            return;
        }

        // Spawn timer management
        if (!this._hasSpawnedInitial) {
            this._spawnTimer += gameplayDelta;
            if (this._spawnTimer >= this._initialDelay) {
                this._hasSpawnedInitial = true;
                this._spawnTimer = 0.0;
                this.spawnSwarm();
            }
        } else if (this._swarms.length < this._spawnRules.maximumActive) {
            this._respawnTimer += gameplayDelta;
            if (this._respawnTimer >= this._spawnRules.respawnDelaySeconds) {
                this._respawnTimer = 0.0;
                this.spawnSwarm();
            }
        }

        // Get ball position in board X/Z coordinates
        const ballPos = this._getBallPosition();

        // Update each active swarm
        for (let i = this._swarms.length - 1; i >= 0; i--) {
            const swarm = this._swarms[i];

            // 1. Tick active duration and update lifecycle phase (intro -> active -> outro)
            swarm.activeTimer -= gameplayDelta;
            if (swarm.activeTimer <= 0) {
                this.despawnSwarm(swarm.id);
                continue;
            }

            swarm.elapsedTime += gameplayDelta;

            const introDur = swarm.introDuration || 1.2;
            const outroDur = swarm.outroDuration || 1.2;

            if (swarm.elapsedTime < introDur) {
                // Intro phase: 0.0 -> 1.0
                swarm.phase = 'intro';
                const p = Math.min(1.0, Math.max(0.0, swarm.elapsedTime / introDur));
                // Smooth cubic ease-out
                swarm.transitionProgress = p * p * (3.0 - 2.0 * p);
            } else if (swarm.activeTimer < outroDur) {
                // Outro phase: 1.0 -> 0.0
                swarm.phase = 'outro';
                const p = Math.min(1.0, Math.max(0.0, swarm.activeTimer / outroDur));
                // Smooth cubic ease-in
                swarm.transitionProgress = p * p * (3.0 - 2.0 * p);
            } else {
                swarm.phase = 'active';
                swarm.transitionProgress = 1.0;
            }

            // 2. Animate visual butterfly swarm (applying intro/outro transition)
            this._updateSwarmVisuals(swarm, gameplayDelta);

            // 3. Evaluate ball entry/exit on influence zone (only active during gameplay)
            this._evaluateBallInfluence(swarm, ballPos);
        }
    }

    /**
     * Resolves the ball's current board-space X/Z position.
     */
    _getBallPosition() {
        if (!this._ballController || !this._ballController.isActive()) {
            return null;
        }
        if (this._ballController.mesh && this._ballController.mesh.visible) {
            const p = this._ballController.mesh.position;
            this._cachedBallPos.set(p.x, p.y !== undefined ? p.y : 0.0135, p.z);
            return this._cachedBallPos;
        }
        const physPos = this._ballController.getPhysicsPosition();
        if (physPos) {
            this._cachedBallPos.set(
                physPos.x - this._tableWidth / 2,
                GAME_CONFIG.ball.radius,
                physPos.y - this._tableHeight / 2
            );
            return this._cachedBallPos;
        }
        return null;
    }

    /**
     * Updates instance matrices for butterfly wings based on MeadowButterflies sinusoidal motion model.
     */
    _updateSwarmVisuals(swarm, gameplayDelta) {
        const instMesh = swarm.mesh;
        if (!instMesh) return;

        const vis = this._config.visual;
        const baseHeight = vis.baseHeight || 0.035; // Hovering smoothly above tiles
        const vertAmp = vis.verticalAmplitude || 0.012;
        const horizAmpX = vis.horizontalAmplitudeX || 0.055;
        const horizAmpZ = vis.horizontalAmplitudeZ || 0.055;
        const flightSpeed = vis.flightSpeed || 0.7;
        const flapSpeed = vis.flapSpeed || 18.0;
        const maxFlapAngle = vis.maximumFlapRadians || 0.9;

        const t = swarm.elapsedTime * flightSpeed;
        const flapT = swarm.elapsedTime * flapSpeed;
        const anchor = swarm.worldAnchor;

        const dummy = this._matrixHelper;
        const butterflies = swarm.butterflies;
        // Animation transition progress (0.0 to 1.0)
        const progress = (swarm.transitionProgress !== undefined) ? swarm.transitionProgress : 1.0;
        const isIntro = swarm.phase === 'intro';
        const isOutro = swarm.phase === 'outro';

        for (let i = 0; i < butterflies.length; i++) {
            const b = butterflies[i];
            const localT = t + b.timeOffset;

            // Direct stable position within the 8x8 hitbox zone: no chaotic particle drifting
            // Butterflies stay clearly hovering above their assigned location within the hitbox
            let x = anchor.x + b.driftOffsetX;
            let z = anchor.z + b.driftOffsetZ;
            let y = baseHeight + Math.sin(localT * 1.5 + b.verticalPhase) * (vertAmp * 0.4);

            // Intro animation: butterflies rise smoothly up from the surface
            if (isIntro) {
                const introInvert = 1.0 - progress; // 1.0 -> 0.0
                y -= introInvert * 0.020;
            } else if (isOutro) {
                // Outro animation: butterflies ascend and fade smoothly
                const outroInvert = 1.0 - progress; // 0.0 -> 1.0
                y += outroInvert * 0.035;
            }

            // Clean heading facing outward from center
            const heading = Math.atan2(b.driftOffsetX || 0.01, b.driftOffsetZ || 0.01);

            // Wing flap angle
            const flapAngle = Math.sin(swarm.elapsedTime * flapSpeed + b.flapPhaseOffset) * maxFlapAngle;

            // Scale shrinks smoothly to zero during intro start and outro end
            const scale = Math.max(0.0001, vis.wingScale * b.scaleVariation * progress);

            // 1. Left wing instance (index = i * 2)
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, heading, flapAngle);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            instMesh.setMatrixAt(i * 2, dummy.matrix);

            // 2. Right wing instance (index = i * 2 + 1)
            // Mirrored flap angle and mirrored along X
            dummy.position.set(x, y, z);
            dummy.rotation.set(0, heading, -flapAngle);
            dummy.scale.set(-scale, scale, scale);
            dummy.updateMatrix();
            instMesh.setMatrixAt(i * 2 + 1, dummy.matrix);
        }

        if (instMesh.instanceMatrix) {
            instMesh.instanceMatrix.needsUpdate = true;
        }

        // Animate the visible 8x8 hitbox zone (scale and pulse with intro/outro transitions)
        const pulse = 1.0 + Math.sin(swarm.elapsedTime * 3.5) * 0.02;
        const zoneScale = Math.max(0.001, progress * pulse);
        const boxHeight = swarm.boxHeight || 0.045;

        if (swarm.zoneFillMesh) {
            swarm.zoneFillMesh.scale.set(zoneScale, zoneScale, 1.0);
            swarm.zoneFillMesh.position.set(anchor.x, 0.003, anchor.z);
        }
        if (swarm.zoneBorderMesh) {
            swarm.zoneBorderMesh.scale.set(zoneScale, 1.0, zoneScale);
            swarm.zoneBorderMesh.position.set(anchor.x, boxHeight / 2, anchor.z);
        }

        // Animate floating particle system inside the 3x higher box
        if (swarm.particlePointsMesh && swarm.particleGeo && swarm.particleGeo.attributes && swarm.particleGeo.attributes.position) {
            const posAttr = swarm.particleGeo.attributes.position;
            const positions = posAttr.array;
            const count = positions.length / 3;
            const vels = swarm.particleVelocities;
            const inits = swarm.particleInitialOffsets;

            for (let p = 0; p < count; p++) {
                const vel = vels[p];
                const init = inits[p];
                const pTime = swarm.elapsedTime + vel.phase;

                // Gentle vertical drifting looping between 0.004 and boxHeight - 0.004
                const spanY = boxHeight - 0.008;
                let curY = init.y + (swarm.elapsedTime * vel.speedY) % spanY;
                if (curY > boxHeight - 0.004) curY -= spanY;

                // Gentle subtle swirl within the box
                const curX = (init.x + Math.sin(pTime * vel.driftSpeedX) * 0.006) * zoneScale;
                const curZ = (init.z + Math.cos(pTime * vel.driftSpeedZ) * 0.006) * zoneScale;

                positions[p * 3] = curX;
                positions[p * 3 + 1] = curY * Math.min(1.0, progress * 1.2);
                positions[p * 3 + 2] = curZ;
            }

            posAttr.needsUpdate = true;
            swarm.particlePointsMesh.position.set(anchor.x, 0, anchor.z);
        }
    }

    /**
     * Evaluates whether the ball entered, stayed inside, or exited the swarm's influence zone.
     */
    _evaluateBallInfluence(swarm, ballPos) {
        if (!ballPos) {
            // Ball deactivated or off-board: clean up if previously inside
            if (swarm.ballInside) {
                this._onBallExit(swarm);
            }
            return;
        }

        const b = swarm.bounds;
        const insideX = ballPos.x >= b.minX && ballPos.x <= b.maxX;
        const insideZ = ballPos.z >= b.minZ && ballPos.z <= b.maxZ;
        const insideY = ballPos.y >= b.minY && ballPos.y <= b.maxY;
        const isInside = insideX && insideZ && insideY;

        if (isInside && !swarm.ballInside) {
            this._onBallEnter(swarm);
        } else if (!isInside && swarm.ballInside) {
            this._onBallExit(swarm);
        }
    }

    /**
     * Transition: Ball Entered Zone
     */
    _onBallEnter(swarm) {
        swarm.ballInside = true;

        this._applySwarmModifier(swarm);

        eventBus.emit('butterflies:ballEntered', {
            swarmId: swarm.id,
            modifierId: this._config.effect.modifierId,
            multiplier: this._config.effect.value
        });
        eventBus.emit('butterflies:effectApplied', {
            swarmId: swarm.id,
            targetStat: this._config.effect.targetStat,
            value: this._config.effect.value
        });

        // Trigger subtle visual feedback (chromatic aberration or cell drift)
        eventBus.emit('fx:butterfliesDrift', { active: true, swarmId: swarm.id });
    }

    /**
     * Transition: Ball Exited Zone
     */
    _onBallExit(swarm) {
        swarm.ballInside = false;

        this._removeSwarmModifier(swarm);

        eventBus.emit('butterflies:ballExited', {
            swarmId: swarm.id,
            modifierId: this._config.effect.modifierId
        });
        eventBus.emit('butterflies:effectRemoved', {
            swarmId: swarm.id,
            targetStat: this._config.effect.targetStat
        });

        eventBus.emit('fx:butterfliesDrift', { active: false, swarmId: swarm.id });
    }

    /**
     * Registers the environmental slow modifier in ResolvedStatService and refreshes ball movement.
     */
    _applySwarmModifier(swarm) {
        if (swarm.modifierApplied) return;
        swarm.modifierApplied = true;

        const eff = this._config.effect;
        resolvedStatService.addModifier({
            id: `${eff.modifierId}_${swarm.id}`,
            statKey: eff.targetStat,
            operation: eff.operation, // 'MULTIPLY'
            value: eff.value,         // 0.50
            layer: 6,                 // Stage 6: Temporary Modifier
            priority: 50,
            sourceId: swarm.sourceKey,
            stackingGroup: eff.stackingGroup,
            stackingRule: eff.stackingRule
        });

        this._refreshBallSpeed();
    }

    /**
     * Removes the modifier associated with this swarm and refreshes ball movement.
     */
    _removeSwarmModifier(swarm) {
        if (!swarm.modifierApplied) return;
        swarm.modifierApplied = false;

        const eff = this._config.effect;
        resolvedStatService.removeModifier(`${eff.modifierId}_${swarm.id}`);
        resolvedStatService.removeModifiersBySource(swarm.sourceKey);

        this._refreshBallSpeed();
    }

    /**
     * Reapplies modifier (used on ball type or level changes while inside).
     */
    _reapplyModifier(swarm) {
        this._removeSwarmModifier(swarm);
        this._applySwarmModifier(swarm);
    }

    /**
     * Updates CollisionSystem baseSpeedScale to match the freshly resolved stat.
     */
    _refreshBallSpeed() {
        if (this._ballController && this._ballController._collisionSystem) {
            const resolvedSpeedScale = resolvedStatService.get('ball.speedScale');
            // Clamp within canonical safety bounds [0.05, 0.35]
            const clamped = Math.max(0.05, Math.min(0.35, resolvedSpeedScale));
            this._ballController._collisionSystem.setBaseSpeedScale(clamped);
        }
        eventBus.emit('stat:resolvedChanged', { statKey: 'ball.speedScale' });
    }

    /**
     * Sets debug visibility for all influence zone wireframe outlines.
     */
    setDebugVisibility(visible) {
        this._debugInfluenceVisible = Boolean(visible);
        for (const swarm of this._swarms) {
            if (swarm.debugMesh) {
                swarm.debugMesh.visible = this._debugInfluenceVisible;
            }
        }
    }

    /**
     * Debug action: moves the first active swarm directly to the ball's position.
     */
    moveActiveSwarmToBall() {
        if (this._swarms.length === 0) {
            this.spawnSwarm();
        }
        if (this._swarms.length === 0) return;

        const ballPos = this._getBallPosition();
        if (!ballPos) return;

        const swarm = this._swarms[0];
        swarm.worldAnchor.x = ballPos.x;
        swarm.worldAnchor.z = ballPos.z;

        const halfWidthWorld = (swarm.widthCells * this._tileWidth) / 2;
        const halfDepthWorld = (swarm.depthCells * this._tileHeight) / 2;

        swarm.bounds.minX = ballPos.x - halfWidthWorld;
        swarm.bounds.maxX = ballPos.x + halfWidthWorld;
        swarm.bounds.minZ = ballPos.z - halfDepthWorld;
        swarm.bounds.maxZ = ballPos.z + halfDepthWorld;

        if (swarm.zoneFillMesh) {
            swarm.zoneFillMesh.position.set(ballPos.x, 0.003, ballPos.z);
        }
        if (swarm.zoneBorderMesh) {
            const boxHeight = swarm.boxHeight || 0.045;
            swarm.zoneBorderMesh.position.set(ballPos.x, boxHeight / 2, ballPos.z);
        }
        if (swarm.particlePointsMesh) {
            swarm.particlePointsMesh.position.set(ballPos.x, 0, ballPos.z);
        }
        if (swarm.debugMesh) {
            swarm.debugMesh.position.set(ballPos.x, 0.05, ballPos.z);
        }
    }

    /**
     * Returns telemetry summary for DebugPanel.
     */
    getDebugInfo() {
        const activeSwarm = this._swarms[0] || null;
        const resolvedSpeed = resolvedStatService.get('ball.speedScale');
        const baseSpeed = resolvedStatService.getBaseValue('ball.speedScale');

        return {
            enabled: Boolean(this._config.enabled),
            activeSwarmCount: this._swarms.length,
            currentStage: this._currentStage,
            minimumStage: this._spawnRules.minimumStage,
            instanceId: activeSwarm ? activeSwarm.id : 'None',
            anchorCell: activeSwarm ? `${activeSwarm.anchorCell.gridX}, ${activeSwarm.anchorCell.gridY}` : 'N/A',
            anchorWorld: activeSwarm ? `${activeSwarm.worldAnchor.x.toFixed(3)}, ${activeSwarm.worldAnchor.z.toFixed(3)}` : 'N/A',
            influenceCells: activeSwarm ? `${activeSwarm.widthCells}x${activeSwarm.depthCells}` : '8x8',
            ballInside: activeSwarm ? activeSwarm.ballInside : false,
            modifierActive: activeSwarm ? activeSwarm.modifierApplied : false,
            modifierValue: this._config.effect.value,
            resolvedBallSpeed: resolvedSpeed.toFixed(3),
            baseBallSpeed: baseSpeed.toFixed(3),
            remainingActiveDuration: activeSwarm ? Math.max(0, activeSwarm.activeTimer).toFixed(1) + 's' : '0.0s',
            remainingRespawnTimer: Math.max(0, this._spawnRules.respawnDelaySeconds - this._respawnTimer).toFixed(1) + 's',
            totalWingInstances: this._swarms.length * (this._config.visual.butterflyCount * 2)
        };
    }

    /**
     * Cleans up all owned geometry, materials, listeners, and modifiers.
     */
    dispose() {
        this.despawnAllSwarms();

        if (this._wingGeometry) {
            this._wingGeometry.dispose();
            this._wingGeometry = null;
        }
        if (this._wingMaterial) {
            this._wingMaterial.dispose();
            this._wingMaterial = null;
        }
        if (this._zoneFillMaterial) {
            this._zoneFillMaterial.dispose();
            this._zoneFillMaterial = null;
        }
        if (this._zoneBorderMaterial) {
            this._zoneBorderMaterial.dispose();
            this._zoneBorderMaterial = null;
        }
        if (this._particleMaterial) {
            this._particleMaterial.dispose();
            this._particleMaterial = null;
        }
        if (this._debugMaterial) {
            this._debugMaterial.dispose();
            this._debugMaterial = null;
        }

        if (this._parentGroup && this.group) {
            this._parentGroup.remove(this.group);
        }

        for (const unsub of this._unsubs) {
            if (typeof unsub === 'function') unsub();
        }
        this._unsubs = [];
    }
}
