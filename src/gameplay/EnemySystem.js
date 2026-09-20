import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';

/**
 * EnemySystem
 * Manages basic cylinder enemies ("walce"):
 * - Sized identically to the ball (radius 0.0135, height 0.024).
 * - Patrols continuously along the perimeter of a 3x3 tile block.
 * - Samples player position ONCE per loop when nearly completing Edge 3.
 * - Steps 1 tile towards the player position after closing the loop.
 * - Fluid modernist arcade animation: continuous axial rotation, gentle bobbing, subtle movement lean.
 * - Responsive to combat: can be destroyed by Bomb blast or Dragon body/tail.
 * - Destroys the player's ball on contact (loses life, ball shatters).
 * - Scales from 1 to 4 enemies based on current stage.
 */
export class EnemySystem {
    constructor() {
        this._parentGroup = null;
        this._tileManager = null;
        this._ballController = null;
        this._dragonSystem = null;
        this._labelSystem = null;

        this._enemyGroup = new THREE.Group();
        this._enemyGroup.name = 'EnemySystemGroup';

        this._enemies = [];
        this._activeBlasts = [];
        this._spawnRings = [];

        // Grid dimensions
        this._tableWidth = GAME_CONFIG.table.width;
        this._tableHeight = GAME_CONFIG.table.height;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;

        // Enemy scaling & stage state
        this._currentStage = 1;
        this._targetCount = 1;
        this._respawnTimer = 0;
        this._respawnCooldown = 9.0; // Seconds between respawns if below target count

        // Movement & Levitation configuration
        this._moveSpeed = 0.032; // Calmer, slower, deliberate arcade movement (requested by user)
        this._enemyRadius = GAME_CONFIG.ball.radius; // 0.0135
        this._enemyHeight = 0.024;
        this._baseFloatHeight = 0.028; // Levitates clearly above the table (surface Y=0, ball center Y=0.0135)
        this._eccentricity = 0.0028; // Calibrated eccentric offset from rotation axis

        // Shared geometries & materials for peak performance
        this._bodyGeo = new THREE.CylinderGeometry(this._enemyRadius, this._enemyRadius, this._enemyHeight, 24);
        this._ringGeo = new THREE.TorusGeometry(this._enemyRadius + 0.0006, 0.0015, 8, 24);
        this._capGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 16);

        // Polished bright silver metallic chassis (matching brass-ball PBR specular & envMap intensity)
        this._bodyMat = new THREE.MeshStandardMaterial({
            color: 0xebf0f8,        // Bright, pure polished platinum-silver hue
            metalness: 0.88,        // Genuine metallic reflection
            roughness: 0.18,        // Polished smooth sheen
            envMapIntensity: 1.5,   // Reflections from scene EXR lighting (matching brass ball)
            emissive: 0x141a24,     // Subtle cool silver ambient lift
            emissiveIntensity: 0.5
        });

        // Silver metallic core caps
        this._capMat = new THREE.MeshStandardMaterial({
            color: 0xd8e0ec,
            metalness: 0.90,
            roughness: 0.16,
            envMapIntensity: 1.5
        });

        // Glowing neon equator ring accent
        this._neonMat = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            emissive: 0x00d4ff,
            emissiveIntensity: 2.2,
            roughness: 0.15,
            metalness: 0.1,
            envMapIntensity: 0.5
        });

        // Soft ground shadow disc following on the floor beneath the floating cylinder
        this._shadowGeo = new THREE.CircleGeometry(this._enemyRadius * 1.25, 24);
        this._shadowGeo.rotateX(-Math.PI / 2);
        this._shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.35,
            depthWrite: false
        });

        // Ground spawn hologram beacon
        this._spawnRingGeo = new THREE.RingGeometry(0.011, 0.015, 32);
        this._spawnRingGeo.rotateX(-Math.PI / 2);
        this._spawnRingMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Thin arcade shockwave ring for enemy death
        this._blastGeo = new THREE.RingGeometry(0.975, 1.0, 64);
        this._blastGeo.rotateX(-Math.PI / 2);
        this._blastMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Preset candidate quadrant centers for 3x3 patrol (cx, cy)
        this._spawnQuadrants = [
            { cx: 4, cy: 7 },   // Sector 1: Top-Left
            { cx: 13, cy: 28 }, // Sector 2: Bottom-Right
            { cx: 13, cy: 7 },  // Sector 3: Top-Right
            { cx: 4, cy: 28 }   // Sector 4: Bottom-Left
        ];

        this._unsubs = [];
    }

    init(parentGroup, tileManager, ballController, dragonSystem, labelSystem = null) {
        this._parentGroup = parentGroup;
        this._tileManager = tileManager;
        this._ballController = ballController;
        this._dragonSystem = dragonSystem;
        this._labelSystem = labelSystem;

        if (this._parentGroup) {
            this._parentGroup.add(this._enemyGroup);
        }

        this.reset();

        this._unsubs.push(
            // Listen to bomb detonations to destroy nearby enemies
            eventBus.on('bomb:detonated', ({ x, z, radius }) => {
                this._onBombDetonated(x, z, radius);
            }),
            // Update grid dimensions if resized or rebuilt
            eventBus.on('grid:rebuilt', () => {
                this.onGridRebuilt(this._tileManager);
            })
        );
    }

    onGridRebuilt(tileManager) {
        this._tileManager = tileManager;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;
    }

    /**
     * Spawns stage-appropriate enemies (from 1 to 4 max).
     */
    spawnStageEnemies(stage = 1) {
        this._currentStage = stage;
        this._targetCount = Math.min(4, Math.max(1, stage));
        this._respawnTimer = 0;

        // Clear any previous active enemies
        this._clearAllEnemies();

        // Spawn initial batch
        for (let i = 0; i < this._targetCount; i++) {
            const quad = this._spawnQuadrants[i % this._spawnQuadrants.length];
            const delay = i * 0.20; // Staggered arcade entrance
            this._createEnemy(quad.cx, quad.cy, delay);
        }
    }

    /**
     * Calculates closed-loop waypoints for a 3x3 perimeter centered at (cx, cy).
     * Automatically inserts detour waypoints around obstacle midpoints and offsets obstacle corners
     * so that the patrol route smoothly avoids barriers without cutting through them.
     */
    _calcWaypoints(cx, cy) {
        const halfW = (this._tileWidth * 0.92) * 0.5;
        const halfH = (this._tileHeight * 0.92) * 0.5;
        const safeMargin = this._enemyRadius + 0.004;

        // 4 corners of 3x3 perimeter
        const cornerTiles = [
            { gx: cx - 1, gy: cy - 1, dirX: -1, dirZ: -1 }, // 0: Top-Left
            { gx: cx + 1, gy: cy - 1, dirX: 1,  dirZ: -1 }, // 1: Top-Right
            { gx: cx + 1, gy: cy + 1, dirX: 1,  dirZ: 1 },  // 2: Bottom-Right
            { gx: cx - 1, gy: cy + 1, dirX: -1, dirZ: 1 }   // 3: Bottom-Left
        ];

        // 4 intermediate edge midpoints between corners
        const midTiles = [
            { gx: cx,     gy: cy - 1, dirX: 0,  dirZ: -1 }, // Mid 0: Top (between C0 and C1)
            { gx: cx + 1, gy: cy,     dirX: 1,  dirZ: 0 },  // Mid 1: Right (between C1 and C2)
            { gx: cx,     gy: cy + 1, dirX: 0,  dirZ: 1 },  // Mid 2: Bottom (between C2 and C3)
            { gx: cx - 1, gy: cy,     dirX: -1, dirZ: 0 }   // Mid 3: Left (between C3 and C0)
        ];

        const waypoints = [];

        for (let i = 0; i < 4; i++) {
            const c = cornerTiles[i];
            const cPos = this._tileManager.getTileWorldPos(c.gx, c.gy);
            let wx = cPos.x;
            let wz = cPos.z;

            // If corner is an obstacle, offset waypoint outward into clear space
            if (this._tileManager.isObstacle(c.gx, c.gy)) {
                wx += c.dirX * (halfW + safeMargin);
                wz += c.dirZ * (halfH + safeMargin);
            }
            waypoints.push(new THREE.Vector3(wx, 0.012, wz));

            // Check if intermediate edge tile is an obstacle: insert smooth detour waypoint
            const m = midTiles[i];
            if (this._tileManager.isObstacle(m.gx, m.gy)) {
                const mPos = this._tileManager.getTileWorldPos(m.gx, m.gy);
                const detourX = mPos.x + m.dirX * (halfW + safeMargin);
                const detourZ = mPos.z + m.dirZ * (halfH + safeMargin);
                waypoints.push(new THREE.Vector3(detourX, 0.012, detourZ));
            }
        }

        return waypoints;
    }

    _calcCorners(cx, cy) {
        return this._calcWaypoints(cx, cy);
    }

    /**
     * Finds the nearest non-obstacle tile if candidate center (cx, cy) falls on an obstacle.
     */
    _findNearestWalkableCenter(cx, cy) {
        let bestCx = Math.max(1, Math.min(this._tilesX - 2, cx));
        let bestCy = Math.max(1, Math.min(this._tilesY - 2, cy));

        if (!this._tileManager || !this._tileManager.isObstacle(bestCx, bestCy)) {
            return { cx: bestCx, cy: bestCy };
        }

        // Search outward in concentric rings for the closest non-obstacle tile
        for (let r = 1; r <= 6; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const testCx = cx + dx;
                    const testCy = cy + dy;
                    if (testCx >= 1 && testCx <= this._tilesX - 2 && testCy >= 1 && testCy <= this._tilesY - 2) {
                        if (!this._tileManager.isObstacle(testCx, testCy)) {
                            return { cx: testCx, cy: testCy };
                        }
                    }
                }
            }
        }
        return { cx: bestCx, cy: bestCy };
    }

    /**
     * Resolves continuous obstacle barrier collisions for an enemy cylinder.
     * Prevents penetration and smoothly glides the cylinder along the barrier's exterior.
     * Considers both pivot position and eccentric visual mesh radius.
     */
    _resolveObstacleCollisions(enemy) {
        if (!this._tileManager) return;

        // Visual group has eccentricity offset along spin angle
        const eccX = Math.cos(enemy.spinAngle || 0) * (enemy.eccentricity || this._eccentricity);
        const eccZ = -Math.sin(enemy.spinAngle || 0) * (enemy.eccentricity || this._eccentricity);

        // Effective bounding radius covers the physical cylinder mesh plus eccentricity plus safe clearance
        const effectiveRadius = this._enemyRadius + (enemy.eccentricity || this._eccentricity) + 0.0035; // ~0.020m
        const halfW = (this._tileWidth * 0.92) * 0.5;
        const halfH = (this._tileHeight * 0.92) * 0.5;

        // Check 5x5 window around current grid position to catch all neighboring obstacle columns
        const gridPos = this._tileManager.getTileGridPosFromWorld(enemy.x, enemy.z);

        for (let iter = 0; iter < 2; iter++) { // 2 passes for rock-solid corner resolution
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const gx = gridPos.gridX + dx;
                    const gy = gridPos.gridY + dy;

                    if (this._tileManager.isObstacle(gx, gy)) {
                        const obsPos = this._tileManager.getTileWorldPos(gx, gy);
                        const minX = obsPos.x - halfW;
                        const maxX = obsPos.x + halfW;
                        const minZ = obsPos.z - halfH;
                        const maxZ = obsPos.z + halfH;

                        // Test against both the pivot position and the actual eccentric mesh center
                        const actualX = enemy.x + eccX;
                        const actualZ = enemy.z + eccZ;

                        const clampX = Math.max(minX, Math.min(actualX, maxX));
                        const clampZ = Math.max(minZ, Math.min(actualZ, maxZ));

                        const diffX = actualX - clampX;
                        const diffZ = actualZ - clampZ;
                        const distSq = diffX * diffX + diffZ * diffZ;

                        if (distSq < effectiveRadius * effectiveRadius) {
                            if (distSq > 1e-7) {
                                const dist = Math.sqrt(distSq);
                                const pen = effectiveRadius - dist;
                                const pushX = (diffX / dist) * pen;
                                const pushZ = (diffZ / dist) * pen;
                                enemy.x += pushX;
                                enemy.z += pushZ;
                            } else {
                                // Cylinder center is completely inside obstacle box: push out to closest face
                                const dLeft = Math.abs(actualX - minX);
                                const dRight = Math.abs(maxX - actualX);
                                const dTop = Math.abs(actualZ - minZ);
                                const dBot = Math.abs(maxZ - actualZ);
                                const minD = Math.min(dLeft, dRight, dTop, dBot);

                                if (minD === dLeft) enemy.x = minX - eccX - effectiveRadius;
                                else if (minD === dRight) enemy.x = maxX - eccX + effectiveRadius;
                                else if (minD === dTop) enemy.z = minZ - eccZ - effectiveRadius;
                                else enemy.z = maxZ - eccZ + effectiveRadius;
                            }
                        }
                    }
                }
            }
        }
    }

    _createEnemy(cx, cy, delaySeconds = 0) {
        // Guarantee center is a valid walkable non-obstacle tile
        const safeCenter = this._findNearestWalkableCenter(cx, cy);
        const clampedCx = safeCenter.cx;
        const clampedCy = safeCenter.cy;

        const waypoints = this._calcWaypoints(clampedCx, clampedCy);
        const centerPos = this._tileManager.getTileWorldPos(clampedCx, clampedCy);
        const orbitRadius = this._tileWidth * 1.15;

        // Try 16 angles to pick the safest initial spawn location furthest away from obstacle columns
        let bestAngle = Math.random() * Math.PI * 2;
        let maxObstacleDist = -1;

        if (this._tileManager) {
            const halfW = (this._tileWidth * 0.92) * 0.5;
            const halfH = (this._tileHeight * 0.92) * 0.5;

            for (let a = 0; a < 16; a++) {
                const angle = (a / 16) * Math.PI * 2;
                const testX = centerPos.x + Math.cos(angle) * orbitRadius;
                const testZ = centerPos.z + Math.sin(angle) * orbitRadius;
                
                let minDist = 999;
                const gridPos = this._tileManager.getTileGridPosFromWorld(testX, testZ);

                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const gx = gridPos.gridX + dx;
                        const gy = gridPos.gridY + dy;
                        if (this._tileManager.isObstacle(gx, gy)) {
                            const obsPos = this._tileManager.getTileWorldPos(gx, gy);
                            const cX = Math.max(obsPos.x - halfW, Math.min(testX, obsPos.x + halfW));
                            const cZ = Math.max(obsPos.z - halfH, Math.min(testZ, obsPos.z + halfH));
                            const d = Math.hypot(testX - cX, testZ - cZ);
                            if (d < minDist) minDist = d;
                        }
                    }
                }

                if (minDist > maxObstacleDist) {
                    maxObstacleDist = minDist;
                    bestAngle = angle;
                }
            }
        }

        const initialAngle = bestAngle;
        const spawnX = centerPos.x + Math.cos(initialAngle) * orbitRadius;
        const spawnZ = centerPos.z + Math.sin(initialAngle) * orbitRadius;

        // Composite enemy group
        const group = new THREE.Group();
        group.name = `Enemy_Cylinder_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        // Eccentric rotation pivot (rotates around vertical Y axis)
        const pivotGroup = new THREE.Group();
        pivotGroup.name = 'EccentricPivot';
        group.add(pivotGroup);

        // Visual group offset from rotation axis by eccentricity
        const visualGroup = new THREE.Group();
        visualGroup.name = 'VisualGroup';
        visualGroup.position.set(this._eccentricity, 0, 0);
        pivotGroup.add(visualGroup);

        // Main cylindrical silver metallic hull
        const bodyMesh = new THREE.Mesh(this._bodyGeo, this._bodyMat.clone());
        bodyMesh.castShadow = true;
        visualGroup.add(bodyMesh);

        // Glowing neon equator belt
        const ringMesh = new THREE.Mesh(this._ringGeo, this._neonMat.clone());
        ringMesh.rotation.x = Math.PI / 2;
        visualGroup.add(ringMesh);

        // Silver metallic top & bottom core caps
        const topCap = new THREE.Mesh(this._capGeo, this._capMat);
        topCap.position.y = this._enemyHeight / 2 + 0.0006;
        visualGroup.add(topCap);

        const botCap = new THREE.Mesh(this._capGeo, this._capMat);
        botCap.position.y = -this._enemyHeight / 2 - 0.0006;
        visualGroup.add(botCap);

        // Soft ground shadow disc beneath the levitating cylinder
        const shadowMesh = new THREE.Mesh(this._shadowGeo, this._shadowMat);
        shadowMesh.position.set(0, -this._baseFloatHeight + 0.0015, 0);
        group.add(shadowMesh);

        // Position on board: levitating height
        group.position.set(spawnX, this._baseFloatHeight, spawnZ);

        const isDelayed = delaySeconds > 0;
        if (isDelayed) {
            group.visible = false;
            group.scale.set(0.001, 0.001, 0.001);
        } else {
            group.visible = true;
            group.scale.set(0.001, 0.001, 0.001);
        }
        this._enemyGroup.add(group);

        const enemyData = {
            group,
            pivotGroup,
            visualGroup,
            bodyMesh,
            ringMesh,
            shadowMesh,
            cx: clampedCx,
            cy: clampedCy,
            // Circular orbit around 3x3 block center ("zatacza kręgi")
            centerWorld: { x: centerPos.x, z: centerPos.z },
            targetCenterWorld: { x: centerPos.x, z: centerPos.z },
            orbitRadius,
            orbitAngle: initialAngle,
            orbitDirection: 1, // Counter-clockwise circular orbit
            loopProgress: 0,
            // Backwards compatibility for waypoint references
            waypoints,
            corners: waypoints,
            waypointIndex: 0,
            x: spawnX,
            z: spawnZ,
            // Smooth kinematic perimeter shifting (NO TELEPORT/JUMP)
            isShifting: false,
            shiftTarget: { x: 0, z: 0 },
            nextCenter: null,
            // Player tracking: sampled ONLY ONCE per 3x3 loop
            playerSampledThisLoop: false,
            pendingStep: { stepX: 0, stepY: 0 },
            // Laser immunity ("walec jest odporny na lasery")
            isLaserImmune: true,
            isImmuneToLasers: true,
            // Visual oscillation & energetic self-rotation ("wiekszy samoobrot")
            eccentricity: this._eccentricity,
            spinAngle: Math.random() * Math.PI * 2,
            rotSpeed: 3.5 + Math.random() * 0.6, // Fast, pronounced self-rotation (~3.8 rad/s)
            elapsed: Math.random() * 10,
            phase: Math.random() * Math.PI * 2,
            currentTiltX: 0,
            currentTiltZ: 0,
            // Pinball Bumper interaction & animation
            bumperAnimTime: 0,
            bumperDuration: 0.22,
            bumperCooldown: 0,
            // Lifecycle
            spawnDelay: delaySeconds,
            state: isDelayed ? 'waiting' : 'spawning', // 'waiting' -> 'spawning' -> 'active' -> 'dead'
            spawnProgress: 0.0,
            spawnDuration: 0.48,
            isDead: false
        };

        if (!isDelayed) {
            this._triggerSpawnEffects(enemyData);
        }

        this._enemies.push(enemyData);
        return enemyData;
    }

    _triggerSpawnEffects(enemy) {
        // Ground hologram spawn ring
        const spawnRing = new THREE.Mesh(this._spawnRingGeo, this._spawnRingMat.clone());
        spawnRing.position.set(enemy.x, 0.002, enemy.z);
        spawnRing.scale.set(0.1, 1, 0.1);
        this._enemyGroup.add(spawnRing);

        this._spawnRings.push({
            mesh: spawnRing,
            elapsed: 0,
            duration: 0.55
        });

        // Modern arcade spawn sound and particle burst
        playSound(560, 0.12);
        if (cellParticles) {
            cellParticles.trigger(enemy.x, enemy.z, false);
        }

        // Chromatic aberration flash and camera tremor on enemy entrance
        eventBus.emit('fx:chromaticAberration', { intensity: 0.009, duration: 0.25 });
        eventBus.emit('fx:shake', { trauma: 0.18 });
    }

    update(dt) {
        // 1. Update ground hologram spawn rings
        for (let s = this._spawnRings.length - 1; s >= 0; s--) {
            const ring = this._spawnRings[s];
            ring.elapsed += dt;
            const progress = ring.elapsed / ring.duration;
            if (progress >= 1.0) {
                this._enemyGroup.remove(ring.mesh);
                ring.mesh.material.dispose();
                this._spawnRings.splice(s, 1);
            } else {
                const sRadius = 0.2 + 1.2 * Math.sin(progress * Math.PI * 0.5);
                ring.mesh.scale.set(sRadius, 1, sRadius);
                ring.mesh.material.opacity = (1.0 - progress) * 0.95;
            }
        }

        // 2. Update expanding death shockwave rings
        for (let b = this._activeBlasts.length - 1; b >= 0; b--) {
            const blast = this._activeBlasts[b];
            blast.elapsed += dt;
            const t = blast.elapsed / blast.duration;
            if (t >= 1.0) {
                this._enemyGroup.remove(blast.mesh);
                blast.mesh.material.dispose();
                this._activeBlasts.splice(b, 1);
            } else {
                const curRadius = blast.maxRadius * Math.sin(t * Math.PI * 0.5);
                blast.mesh.scale.set(curRadius, 1, curRadius);
                blast.mesh.material.opacity = (1.0 - t) * 0.95;
            }
        }

        // 3. Update enemies
        for (let i = this._enemies.length - 1; i >= 0; i--) {
            const enemy = this._enemies[i];
            if (enemy.isDead) continue;

            // Delayed spawn countdown
            if (enemy.state === 'waiting') {
                enemy.spawnDelay -= dt;
                if (enemy.spawnDelay <= 0) {
                    enemy.state = 'spawning';
                    enemy.group.visible = true;
                    this._triggerSpawnEffects(enemy);
                }
                continue;
            }

            enemy.elapsed += dt;

            // --- Spawning Entrance Animation ---
            if (enemy.state === 'spawning') {
                enemy.spawnProgress += dt / enemy.spawnDuration;
                if (enemy.spawnProgress >= 1.0) {
                    enemy.spawnProgress = 1.0;
                    enemy.state = 'active';
                    enemy.group.scale.set(1, 1, 1);
                } else {
                    const p = enemy.spawnProgress;
                    // Elastic overshoot curve: scale 0 -> 1.15 -> 1.0
                    const scale = Math.sin(p * Math.PI * 0.5) * (1.0 + 0.2 * (1.0 - p));
                    enemy.group.scale.set(scale, scale, scale);
                }
            }

            // --- Movement & Navigation: Circular Patrol ("zatacza kręgi") & Barrier Bypass ("powoli wymija bariery") ---
            if (!enemy.centerWorld) {
                const cPos = this._tileManager.getTileWorldPos(enemy.cx, enemy.cy);
                enemy.centerWorld = { x: cPos.x, z: cPos.z };
                enemy.targetCenterWorld = { x: cPos.x, z: cPos.z };
            }
            if (enemy.orbitRadius === undefined) enemy.orbitRadius = this._tileWidth * 1.15;
            if (enemy.orbitDirection === undefined) enemy.orbitDirection = 1;
            if (enemy.loopProgress === undefined) enemy.loopProgress = 0;

            // 1. Smooth kinematic shifting of orbit center when stepping towards the player
            if (enemy.isShifting && enemy.targetCenterWorld) {
                const shiftDx = enemy.targetCenterWorld.x - enemy.centerWorld.x;
                const shiftDz = enemy.targetCenterWorld.z - enemy.centerWorld.z;
                const shiftDist = Math.hypot(shiftDx, shiftDz);
                const shiftStep = this._moveSpeed * 0.65 * dt;

                if (shiftDist <= shiftStep) {
                    enemy.centerWorld.x = enemy.targetCenterWorld.x;
                    enemy.centerWorld.z = enemy.targetCenterWorld.z;
                    enemy.isShifting = false;
                    if (enemy.nextCenter) {
                        enemy.cx = enemy.nextCenter.cx;
                        enemy.cy = enemy.nextCenter.cy;
                        enemy.nextCenter = null;
                    }
                    enemy.loopProgress = 0;
                    enemy.playerSampledThisLoop = false;
                    enemy.pendingStep = { stepX: 0, stepY: 0 };
                } else {
                    enemy.centerWorld.x += (shiftDx / shiftDist) * shiftStep;
                    enemy.centerWorld.z += (shiftDz / shiftDist) * shiftStep;
                }
            }

            // 2. Continuous circular orbit kinematics ("zatacza kręgi")
            const relX = enemy.x - enemy.centerWorld.x;
            const relZ = enemy.z - enemy.centerWorld.z;
            let curDist = Math.hypot(relX, relZ);
            if (curDist < 1e-4) curDist = 1e-4;

            const curAngle = Math.atan2(relZ, relX);

            // Angular velocity for continuous circular motion
            const angularSpeed = this._moveSpeed / enemy.orbitRadius;
            const deltaAngle = angularSpeed * dt;
            enemy.loopProgress += deltaAngle;

            // Circular tangent unit vector (counter-clockwise)
            const tanX = -Math.sin(curAngle) * enemy.orbitDirection;
            const tanZ =  Math.cos(curAngle) * enemy.orbitDirection;

            // Radial restorative force to keep enemy precisely on circular orbit radius
            const radDelta = enemy.orbitRadius - curDist;
            const radX = (relX / curDist) * radDelta * 2.8;
            const radZ = (relZ / curDist) * radDelta * 2.8;

            let vx = tanX * this._moveSpeed + radX;
            let vz = tanZ * this._moveSpeed + radZ;

            // 3. Sample player position ONCE when nearly closing the circle (~80% through loop: > 1.6 * PI)
            if (enemy.loopProgress >= Math.PI * 1.6 && !enemy.playerSampledThisLoop) {
                this._samplePlayerStep(enemy);
            }

            // 4. Closed loop: step 1 tile towards player smoothly
            if (enemy.loopProgress >= Math.PI * 2.0) {
                enemy.loopProgress -= Math.PI * 2.0;

                const { stepX, stepY } = enemy.pendingStep;
                if ((stepX !== 0 || stepY !== 0) && !enemy.isShifting) {
                    const targetCx = Math.max(1, Math.min(this._tilesX - 2, enemy.cx + stepX));
                    const targetCy = Math.max(1, Math.min(this._tilesY - 2, enemy.cy + stepY));

                    if (!this._tileManager.isObstacle(targetCx, targetCy) && (targetCx !== enemy.cx || targetCy !== enemy.cy)) {
                        const nextCenterPos = this._tileManager.getTileWorldPos(targetCx, targetCy);
                        enemy.isShifting = true;
                        enemy.targetCenterWorld = { x: nextCenterPos.x, z: nextCenterPos.z };
                        enemy.nextCenter = { cx: targetCx, cy: targetCy };
                    } else {
                        enemy.playerSampledThisLoop = false;
                        enemy.pendingStep = { stepX: 0, stepY: 0 };
                    }
                } else {
                    enemy.playerSampledThisLoop = false;
                    enemy.pendingStep = { stepX: 0, stepY: 0 };
                }
            }

            // 5. Dynamic tangential obstacle avoidance ("powoli wymija bariery")
            // Senses nearby obstacle barriers and deflects velocity along obstacle face
            if (this._tileManager) {
                const gridPos = this._tileManager.getTileGridPosFromWorld(enemy.x, enemy.z);
                const halfW = (this._tileWidth * 0.92) * 0.5;
                const halfH = (this._tileHeight * 0.92) * 0.5;
                const minColDist = this._enemyRadius + (enemy.eccentricity || this._eccentricity) + 0.0035; // ~0.020m
                const avoidDist  = minColDist + 0.018;

                let steerX = 0;
                let steerZ = 0;
                let maxPen = 0;

                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const gx = gridPos.gridX + dx;
                        const gy = gridPos.gridY + dy;

                        if (this._tileManager.isObstacle(gx, gy)) {
                            const obsPos = this._tileManager.getTileWorldPos(gx, gy);
                            const minX = obsPos.x - halfW;
                            const maxX = obsPos.x + halfW;
                            const minZ = obsPos.z - halfH;
                            const maxZ = obsPos.z + halfH;

                            const clampX = Math.max(minX, Math.min(enemy.x, maxX));
                            const clampZ = Math.max(minZ, Math.min(enemy.z, maxZ));

                            const diffX = enemy.x - clampX;
                            const diffZ = enemy.z - clampZ;
                            const dist = Math.hypot(diffX, diffZ);

                            if (dist < avoidDist) {
                                let nx, nz;
                                if (dist > 1e-5) {
                                    nx = diffX / dist;
                                    nz = diffZ / dist;
                                } else {
                                    const dLeft = Math.abs(enemy.x - minX);
                                    const dRight = Math.abs(maxX - enemy.x);
                                    const dTop = Math.abs(enemy.z - minZ);
                                    const dBot = Math.abs(maxZ - enemy.z);
                                    const minD = Math.min(dLeft, dRight, dTop, dBot);
                                    if (minD === dLeft) { nx = -1; nz = 0; }
                                    else if (minD === dRight) { nx = 1; nz = 0; }
                                    else if (minD === dTop) { nx = 0; nz = -1; }
                                    else { nx = 0; nz = 1; }
                                }

                                const pen = Math.max(0, Math.min(1.0, (avoidDist - dist) / (avoidDist - minColDist)));
                                if (pen > maxPen) maxPen = pen;

                                // Tangent vector along wall face
                                const dot1 = vx * (-nz) + vz * nx;
                                const tx = dot1 >= 0 ? -nz : nz;
                                const tz = dot1 >= 0 ? nx : -nx;

                                // Eliminate velocity component moving directly into obstacle
                                const intoWall = vx * (-nx) + vz * (-nz);
                                if (intoWall > 0) {
                                    vx += nx * intoWall;
                                    vz += nz * intoWall;
                                }

                                // Steer tangentially along wall face and firmly repel outwards
                                steerX += (nx * 1.8 + tx * 1.6) * (this._moveSpeed * pen);
                                steerZ += (nz * 1.8 + tz * 1.6) * (this._moveSpeed * pen);
                            }
                        }
                    }
                }

                vx += steerX;
                vz += steerZ;

                // Speed regulation
                const curSpeed = Math.hypot(vx, vz);
                if (curSpeed > this._moveSpeed) {
                    vx = (vx / curSpeed) * this._moveSpeed;
                    vz = (vz / curSpeed) * this._moveSpeed;
                } else if (curSpeed < this._moveSpeed * 0.4 && maxPen > 0.2) {
                    const sMag = Math.hypot(steerX, steerZ);
                    if (sMag > 1e-4) {
                        vx = (steerX / sMag) * this._moveSpeed * 0.7;
                        vz = (steerZ / sMag) * this._moveSpeed * 0.7;
                    }
                }
            }

            // 6. Kinematic movement step (ZERO TELEPORTATION)
            enemy.x += vx * dt;
            enemy.z += vz * dt;

            // Table bounds safety clamping
            const boundMargin = this._enemyRadius + 0.005;
            const minTableX = -this._tableWidth / 2 + boundMargin;
            const maxTableX =  this._tableWidth / 2 - boundMargin;
            const minTableZ = -this._tableHeight / 2 + boundMargin;
            const maxTableZ =  this._tableHeight / 2 - boundMargin;
            enemy.x = Math.max(minTableX, Math.min(maxTableX, enemy.x));
            enemy.z = Math.max(minTableZ, Math.min(maxTableZ, enemy.z));

            // Hard barrier collision resolution
            this._resolveObstacleCollisions(enemy);

            // Dynamic movement lean in movement direction
            const dirX = Math.sign(vx);
            const dirZ = Math.sign(vz);
            const targetTiltZ = -dirX * 0.06;
            const targetTiltX = dirZ * 0.06;
            enemy.currentTiltZ += (targetTiltZ - enemy.currentTiltZ) * Math.min(1.0, dt * 6.0);
            enemy.currentTiltX += (targetTiltX - enemy.currentTiltX) * Math.min(1.0, dt * 6.0);

            // --- Modern Arcade Visuals: Energetic Self-Rotation & Fluid 3D Space Waving ---
            // 1. Fast, pronounced self-rotation around vertical axis ("wiekszy samoobrot")
            enemy.spinAngle += dt * enemy.rotSpeed;
            enemy.pivotGroup.rotation.y = enemy.spinAngle;
            enemy.bodyMesh.rotation.y = enemy.spinAngle * 1.5;

            // 2. Fluid 3D space waving & zero-gravity gyroscopic precession
            const wavePitch = Math.sin(enemy.elapsed * 1.6 + enemy.phase) * 0.18 + Math.sin(enemy.elapsed * 3.4) * 0.04;
            const waveRoll  = Math.cos(enemy.elapsed * 1.3 + enemy.phase * 1.4) * 0.16 + Math.cos(enemy.elapsed * 2.7) * 0.03;
            const waveTwist = Math.sin(enemy.elapsed * 0.85 + enemy.phase * 0.7) * 0.20;

            enemy.visualGroup.rotation.x = wavePitch;
            enemy.visualGroup.rotation.z = waveRoll;
            enemy.visualGroup.rotation.y = waveTwist;

            // 3. Levitating spatial float with dual-harmonic zero-g undulation
            const floatUndulation = Math.sin(enemy.elapsed * 2.1 + enemy.phase) * 0.0038
                                  + Math.sin(enemy.elapsed * 4.2 + enemy.phase * 2.0) * 0.0012;
            const curFloatY = this._baseFloatHeight + floatUndulation;

            // 4. Subtle spatial breathing pulse + Dynamic Pinball Bumper Pop & Flash Animation
            if (enemy.bumperCooldown > 0) {
                enemy.bumperCooldown -= dt;
            }

            let popScale = 1.0;
            if (enemy.bumperAnimTime > 0) {
                enemy.bumperAnimTime -= dt;
                const t = Math.max(0, Math.min(1.0, 1.0 - enemy.bumperAnimTime / enemy.bumperDuration));
                // Elastic punchy pop curve: 1.0 -> 1.35 -> 0.92 -> 1.0
                popScale = 1.0 + Math.sin(t * Math.PI) * 0.38 * Math.exp(-t * 2.8);

                // High-energy emissive flash
                const flash = Math.max(0, 1.0 - t);
                if (enemy.ringMesh && enemy.ringMesh.material) {
                    enemy.ringMesh.material.emissiveIntensity = 2.2 + flash * 5.8;
                }
                if (enemy.bodyMesh && enemy.bodyMesh.material) {
                    enemy.bodyMesh.material.emissiveIntensity = 0.5 + flash * 3.5;
                }
            } else {
                if (enemy.ringMesh && enemy.ringMesh.material && enemy.ringMesh.material.emissiveIntensity !== 2.2) {
                    enemy.ringMesh.material.emissiveIntensity = 2.2;
                }
                if (enemy.bodyMesh && enemy.bodyMesh.material && enemy.bodyMesh.material.emissiveIntensity !== 0.5) {
                    enemy.bodyMesh.material.emissiveIntensity = 0.5;
                }
            }

            const breathScale = (1.0 + Math.sin(enemy.elapsed * 2.4 + enemy.phase) * 0.022) * popScale;
            enemy.visualGroup.scale.set(
                breathScale,
                (1.0 + Math.cos(enemy.elapsed * 2.4 + enemy.phase) * 0.015) * (popScale > 1.0 ? 0.95 : 1.0),
                breathScale
            );

            // 5. Update group position in 3D space
            enemy.group.position.set(enemy.x, curFloatY, enemy.z);

            // 6. Ground shadow disc pinned to table surface, scaling dynamically with float height
            if (enemy.shadowMesh) {
                enemy.shadowMesh.position.y = -curFloatY + 0.0015;
                const floatDelta = (curFloatY - this._baseFloatHeight) / 0.005;
                const shadowScale = (0.95 - floatDelta * 0.12) * popScale;
                enemy.shadowMesh.scale.set(shadowScale, 1, shadowScale);
                enemy.shadowMesh.material.opacity = Math.max(0.15, Math.min(0.42, 0.32 - floatDelta * 0.10));
            }

            // 5. Directional lean tilt applied to outer composite group
            enemy.group.rotation.z = enemy.currentTiltZ;
            enemy.group.rotation.x = enemy.currentTiltX;

            // Effective world position of the cylinder including the eccentric offset
            const actualX = enemy.x + Math.cos(enemy.spinAngle) * enemy.eccentricity;
            const actualZ = enemy.z - Math.sin(enemy.spinAngle) * enemy.eccentricity;

            // --- Combat & Bumper Collisions ---
            if (enemy.state === 'active') {
                // 1. Check Dragon collision (Dragon body or glowing spline tail)
                if (this._dragonSystem && this._dragonSystem.isActive()) {
                    const hitPositions = this._dragonSystem.getHitPositions();
                    for (let h = 0; h < hitPositions.length; h++) {
                        const hp = hitPositions[h];
                        if (Math.hypot(actualX - hp.x, actualZ - hp.z) <= 0.026) {
                            this.destroyEnemy(enemy, 'dragon');
                            break;
                        }
                    }
                    if (enemy.isDead) continue;
                }

                // 2. Check Player Ball collision (Pinball Bumper interaction: dynamic kick, bounce & points)
                if (this._ballController && this._ballController.active && this._ballController.mesh) {
                    const ballPos = this._ballController.mesh.position;
                    const distToBall = Math.hypot(actualX - ballPos.x, actualZ - ballPos.z);
                    const collisionDist = this._enemyRadius + GAME_CONFIG.ball.radius; // ~0.0270

                    if (distToBall <= collisionDist && (!enemy.bumperCooldown || enemy.bumperCooldown <= 0)) {
                        // Pinball Bumper Bounce!
                        this._onBumperHit(enemy, actualX, actualZ, ballPos);
                    }
                }
            }
        }

        // 4. Respawn replenishment logic (if enemies destroyed and count < target)
        if (this._enemies.length < this._targetCount) {
            this._respawnTimer += dt;
            if (this._respawnTimer >= this._respawnCooldown) {
                this._respawnTimer = 0;
                // Choose safe quadrant furthest from player
                this._spawnReplenishmentEnemy();
            }
        }
    }

    /**
     * Handles pinball bumper collision:
     * - Energetically kicks the ball away in the normal direction (high velocity).
     * - Immediately separates the ball to prevent sticking.
     * - Triggers elastic bumper pop-scale and neon flash animation.
     * - Spawns expanding arcade shockwave ring and contact sparks.
     * - Plays dual-tone arcade pinball bumper sound.
     * - Awards points (+50) and creates floating 3D score label.
     */
    _onBumperHit(enemy, actualX, actualZ, ballPos) {
        // 1. Calculate bounce normal vector
        const bdx = ballPos.x - actualX;
        const bdz = ballPos.z - actualZ;
        const d = Math.hypot(bdx, bdz);
        let nx = 0;
        let nz = 1;
        if (d > 1e-4) {
            nx = bdx / d;
            nz = bdz / d;
        }

        // 2. Immediate separation beyond collision boundary
        const totalRadius = this._enemyRadius + GAME_CONFIG.ball.radius;
        const safeDist = totalRadius + 0.003;
        const newBallX = actualX + nx * safeDist;
        const newBallZ = actualZ + nz * safeDist;

        if (this._ballController.setPosition) {
            this._ballController.setPosition(newBallX, newBallZ);
        } else {
            this._ballController.mesh.position.x = newBallX;
            this._ballController.mesh.position.z = newBallZ;
            if (this._ballController._collisionSystem) {
                this._ballController._collisionSystem.px = newBallX + this._tableWidth / 2;
                this._ballController._collisionSystem.py = newBallZ + this._tableHeight / 2;
            }
        }

        // 3. Dynamic pinball bounce velocity (powerful impulse kick)
        const curVel = this._ballController.getVelocity
            ? this._ballController.getVelocity()
            : (this._ballController._collisionSystem ? { vx: this._ballController._collisionSystem.vx, vy: this._ballController._collisionSystem.vy } : { vx: 0, vy: 0 });
        const incomingSpeed = Math.hypot(curVel.vx, curVel.vy);

        // Dynamic pinball solenoid kick speed (fast, punchy, arcade feel: 2.8 - 4.2 m/s)
        const kickSpeed = Math.min(4.2, Math.max(2.8, incomingSpeed * 1.45));
        const kickVx = nx * kickSpeed;
        const kickVz = nz * kickSpeed;

        if (this._ballController.setVelocity) {
            this._ballController.setVelocity(kickVx, kickVz);
        } else if (this._ballController._collisionSystem) {
            this._ballController._collisionSystem.setVelocity(kickVx, kickVz);
        }

        // 4. Trigger bumper pop-scale and flash animation
        enemy.bumperAnimTime = enemy.bumperDuration;
        enemy.bumperCooldown = 0.12;

        // 5. Spawn expanding neon shockwave ring on table surface
        const bumpRing = new THREE.Mesh(this._blastGeo, this._blastMat.clone());
        bumpRing.position.set(actualX, 0.003, actualZ);
        bumpRing.scale.set(0.001, 1, 0.001);
        this._enemyGroup.add(bumpRing);
        this._activeBlasts.push({
            mesh: bumpRing,
            elapsed: 0,
            duration: 0.22,
            maxRadius: this._tileWidth * 1.6
        });

        // 6. Impact sparks at the contact point
        if (cellParticles && cellParticles.trigger) {
            cellParticles.trigger(newBallX, newBallZ, false);
        }

        // 7. Crisp electronic arcade pinball bumper chimes
        playSound(880, 0.12);
        setTimeout(() => playSound(1320, 0.14), 40);

        // 8. Award points and notify event bus (+50 pts)
        eventBus.emit('bumper:hit', {
            points: 50,
            x: actualX,
            z: actualZ,
            enemy
        });

        // 9. Floating 3D score label (+50)
        if (this._labelSystem) {
            const dummy = new THREE.Object3D();
            dummy.position.set(actualX, 0.038, actualZ);
            this._enemyGroup.add(dummy);
            const labelId = this._labelSystem.createLabel(dummy, {
                text: '+50',
                className: 'crystal-countdown points ready',
                worldOffset: { x: 0, y: 0.032, z: 0 },
                autoRemoveTime: 800
            });
            setTimeout(() => {
                if (this._labelSystem) {
                    this._labelSystem.removeLabel(labelId);
                }
                this._enemyGroup.remove(dummy);
            }, 850);
        }
    }

    /**
     * Samples the player's ball position once to calculate the 1-tile step towards player.
     * Checks obstacle barriers to avoid stepping into blocked areas.
     */
    _samplePlayerStep(enemy) {
        enemy.playerSampledThisLoop = true;

        let playerGx = 9;
        let playerGy = 18;

        if (this._ballController && this._ballController.mesh && this._ballController.active) {
            const ballPos = this._ballController.mesh.position;
            const gridPos = this._tileManager.getTileGridPosFromWorld(ballPos.x, ballPos.z);
            playerGx = gridPos.gridX;
            playerGy = gridPos.gridY;
        }

        const dx = playerGx - enemy.cx;
        const dy = playerGy - enemy.cy;

        // Obstacle cost function for candidate center: STRICT IMPASSABLE FOR OBSTACLES!
        const getObstacleCost = (cx, cy) => {
            if (cx < 1 || cx > this._tilesX - 2 || cy < 1 || cy > this._tilesY - 2) return 99999;
            if (this._tileManager.isObstacle(cx, cy)) return 99999; // NEVER step into an obstacle column!
            let cost = 0;
            // Count obstacles in 3x3 perimeter surrounding the center
            for (let ox = -1; ox <= 1; ox++) {
                for (let oy = -1; oy <= 1; oy++) {
                    if (this._tileManager.isObstacle(cx + ox, cy + oy)) {
                        cost += 2;
                    }
                }
            }
            return cost;
        };

        const primAxisX = Math.abs(dx) >= Math.abs(dy);
        const primX = dx !== 0 ? Math.sign(dx) : 0;
        const primY = dy !== 0 ? Math.sign(dy) : 0;

        const cand1 = { stepX: primAxisX ? primX : 0, stepY: primAxisX ? 0 : primY };
        const cand2 = { stepX: primAxisX ? 0 : primX, stepY: primAxisX ? primY : 0 };

        const cost1 = (cand1.stepX !== 0 || cand1.stepY !== 0) 
            ? getObstacleCost(enemy.cx + cand1.stepX, enemy.cy + cand1.stepY) 
            : 99999;
        const cost2 = (cand2.stepX !== 0 || cand2.stepY !== 0) 
            ? getObstacleCost(enemy.cx + cand2.stepX, enemy.cy + cand2.stepY) 
            : 99999;

        let stepX = 0;
        let stepY = 0;

        // Choose the path that strictly avoids obstacles
        if (cost1 < 1000 && cost1 <= cost2) {
            stepX = cand1.stepX;
            stepY = cand1.stepY;
        } else if (cost2 < 1000) {
            stepX = cand2.stepX;
            stepY = cand2.stepY;
        } else {
            // Both primary candidates blocked by obstacles: try all 4 cardinal steps
            const allCandidates = [
                { stepX: 1, stepY: 0 },
                { stepX: -1, stepY: 0 },
                { stepX: 0, stepY: 1 },
                { stepX: 0, stepY: -1 }
            ];
            let bestAltDist = 99999;
            for (const cand of allCandidates) {
                const nCx = enemy.cx + cand.stepX;
                const nCy = enemy.cy + cand.stepY;
                const c = getObstacleCost(nCx, nCy);
                if (c < 1000) {
                    const distToPlayer = Math.hypot(playerGx - nCx, playerGy - nCy);
                    if (distToPlayer < bestAltDist) {
                        bestAltDist = distToPlayer;
                        stepX = cand.stepX;
                        stepY = cand.stepY;
                    }
                }
            }
        }

        // Safeguard: never accept a step that lands on an obstacle!
        if (this._tileManager.isObstacle(enemy.cx + stepX, enemy.cy + stepY)) {
            stepX = 0;
            stepY = 0;
        }

        enemy.pendingStep = { stepX, stepY };
    }

    _spawnReplenishmentEnemy() {
        // Pick an unoccupied quadrant
        let bestQuad = this._spawnQuadrants[0];
        let maxDist = -1;

        const playerPos = (this._ballController && this._ballController.mesh)
            ? this._ballController.mesh.position
            : { x: 0, z: 0 };

        for (const quad of this._spawnQuadrants) {
            const safeQuad = this._findNearestWalkableCenter(quad.cx, quad.cy);
            const worldPos = this._tileManager.getTileWorldPos(safeQuad.cx, safeQuad.cy);
            const dist = Math.hypot(worldPos.x - playerPos.x, worldPos.z - playerPos.z);

            // Avoid spawning on top of existing active enemies
            const occupied = this._enemies.some(e => Math.hypot(e.cx - safeQuad.cx, e.cy - safeQuad.cy) < 3);
            if (!occupied && dist > maxDist) {
                maxDist = dist;
                bestQuad = safeQuad;
            }
        }

        const chosenCenter = this._findNearestWalkableCenter(bestQuad.cx, bestQuad.cy);
        this._createEnemy(chosenCenter.cx, chosenCenter.cy);
    }

    _onBombDetonated(bombX, bombZ, radius) {
        // Check all alive enemies within blast radius using actual eccentric position
        for (let i = this._enemies.length - 1; i >= 0; i--) {
            const enemy = this._enemies[i];
            if (enemy.isDead) continue;

            const actualX = enemy.x + Math.cos(enemy.spinAngle) * enemy.eccentricity;
            const actualZ = enemy.z - Math.sin(enemy.spinAngle) * enemy.eccentricity;
            const dist = Math.hypot(actualX - bombX, actualZ - bombZ);
            if (dist <= radius * 0.98) {
                this.destroyEnemy(enemy, 'bomb');
            }
        }
    }

    /**
     * Triggers arcade death effects and destroys an enemy.
     * Cylinders are completely immune to lasers ("walec jest odporny na lasery").
     */
    destroyEnemy(enemy, reason = 'unknown') {
        if (enemy.isDead) return;
        if (reason === 'laser') return; // Walec jest całkowicie odporny na lasery
        enemy.isDead = true;

        const actualX = enemy.x + Math.cos(enemy.spinAngle) * enemy.eccentricity;
        const actualZ = enemy.z - Math.sin(enemy.spinAngle) * enemy.eccentricity;
        const ey = enemy.group.position.y;

        // 1. Arcade blast and shatter sound
        playSound(115, 0.45);
        setTimeout(() => playSound(260, 0.25), 60);

        // 2. Play rewarding celebratory score chime
        setTimeout(() => playSound(1400, 0.26), 70);
        setTimeout(() => playSound(1750, 0.20), 160);

        // 3. High-energy 3D particle shatter explosion
        if (cellParticles) {
            cellParticles.shatter(actualX, ey, actualZ, 36);
        }

        // 4. Expanding thin circular shockwave ring blast
        const blastMesh = new THREE.Mesh(this._blastGeo, this._blastMat.clone());
        blastMesh.position.set(actualX, 0.005, actualZ);
        blastMesh.scale.set(0.001, 1, 0.001);
        this._enemyGroup.add(blastMesh);

        this._activeBlasts.push({
            mesh: blastMesh,
            elapsed: 0,
            duration: 0.38,
            maxRadius: this._tileWidth * 2.2
        });

        // 5. Display floating score label in 3D (+150)
        if (this._labelSystem) {
            const dummy = new THREE.Object3D();
            dummy.position.set(actualX, 0.038, actualZ);
            this._enemyGroup.add(dummy);
            const labelId = this._labelSystem.createLabel(dummy, {
                text: '+150',
                className: 'crystal-countdown points ready',
                worldOffset: { x: 0, y: 0.035, z: 0 },
                autoRemoveTime: 1200
            });
            setTimeout(() => {
                if (this._labelSystem) {
                    this._labelSystem.removeLabel(labelId);
                }
                this._enemyGroup.remove(dummy);
            }, 1250);
        }

        // 6. Dispose cloned materials and remove composite group from scene
        if (enemy.bodyMesh && enemy.bodyMesh.material) enemy.bodyMesh.material.dispose();
        if (enemy.ringMesh && enemy.ringMesh.material) enemy.ringMesh.material.dispose();
        this._enemyGroup.remove(enemy.group);

        // 7. Award score & notify event bus
        eventBus.emit('enemy:destroyed', {
            enemy,
            points: 150,
            reason,
            x: actualX,
            z: actualZ
        });

        // Chromatic aberration and camera shake on enemy destruction
        eventBus.emit('fx:chromaticAberration', { intensity: 0.015, duration: 0.35 });
        eventBus.emit('fx:shake', { trauma: 0.35 });

        // 8. Remove from enemies array
        const idx = this._enemies.indexOf(enemy);
        if (idx !== -1) {
            this._enemies.splice(idx, 1);
        }
    }

    _clearAllEnemies() {
        for (const enemy of this._enemies) {
            if (enemy.bodyMesh && enemy.bodyMesh.material) enemy.bodyMesh.material.dispose();
            if (enemy.ringMesh && enemy.ringMesh.material) enemy.ringMesh.material.dispose();
            this._enemyGroup.remove(enemy.group);
        }
        this._enemies = [];

        for (const ring of this._spawnRings) {
            this._enemyGroup.remove(ring.mesh);
            ring.mesh.material.dispose();
        }
        this._spawnRings = [];

        for (const blast of this._activeBlasts) {
            this._enemyGroup.remove(blast.mesh);
            blast.mesh.material.dispose();
        }
        this._activeBlasts = [];
    }

    getEnemyCount() {
        return this._enemies.filter(e => !e.isDead).length;
    }

    reset() {
        this._clearAllEnemies();
        this._respawnTimer = 0;
    }

    dispose() {
        this.reset();

        if (this._parentGroup) {
            this._parentGroup.remove(this._enemyGroup);
        }

        if (this._bodyGeo) this._bodyGeo.dispose();
        if (this._ringGeo) this._ringGeo.dispose();
        if (this._capGeo) this._capGeo.dispose();
        if (this._spawnRingGeo) this._spawnRingGeo.dispose();
        if (this._blastGeo) this._blastGeo.dispose();
        if (this._shadowGeo) this._shadowGeo.dispose();

        if (this._bodyMat) this._bodyMat.dispose();
        if (this._capMat) this._capMat.dispose();
        if (this._neonMat) this._neonMat.dispose();
        if (this._shadowMat) this._shadowMat.dispose();
        if (this._spawnRingMat) this._spawnRingMat.dispose();
        if (this._blastMat) this._blastMat.dispose();

        this._unsubs.forEach(u => u());
        this._unsubs = [];
    }
}
