import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';

/**
 * DragonSystem
 * Spawns an ethereal Chinese serpentine dragon made of 5 articulated spline segments and a glowing gradient tail.
 * When summoned (lasts 6 seconds):
 * - Samples the player's ball position once at summon start to establish the stationary 9x9 zone.
 * - Identifies unrevealed, valid non-obstacle tiles within a 9x9 area centered on the sampled ball position.
 * - Slowly and majestically weaves through and conquers undiscovered tiles one by one.
 * - Uncovers visited playable tiles along its path via tileManager.conquerTile().
 * - Leaves behind a luminous gradient tail (cyan -> violet -> neon magenta -> ember gold).
 * - If all tiles in the 9x9 sector are conquered, orbits smoothly around the ball.
 */
export class DragonSystem {
    constructor() {
        this._parentGroup = null;
        this._tileManager = null;
        this._ballController = null;

        // Life state
        this._active = false;
        this._timer = 0;
        this._duration = 6.0; // 6 seconds flight time

        // Sampled player center & 9x9 search bounds (determined once at summon)
        this._sampledCenter = { gx: 9, gy: 18, wx: 0, wz: 0 };
        this._targetQueue = []; // Waypoints of world positions {x, z, gx, gy}
        this._currentWaypoint = null;
        this._waypointIndex = 0;

        // Motion physics
        this._headPos = new THREE.Vector3();
        this._headTargetPos = new THREE.Vector3();
        this._flightSpeed = 0.25; // Slower, majestic serpentine weaving
        this._flightAngle = 0;

        // Visual Meshes: Only the glowing serpentine tail is displayed
        this._dragonGroup = new THREE.Group();
        this._dragonGroup.name = 'DragonCompanionGroup';
        this._dragonGroup.visible = false;

        // Spline particle tail trail (instanced points following the dragon path)
        this._trailNodeCount = 44;
        const trailGeo = new THREE.OctahedronGeometry(0.0042, 0);
        const trailMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this._trailInstancedMesh = new THREE.InstancedMesh(trailGeo, trailMat, this._trailNodeCount);
        this._trailInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this._trailInstancedMesh.frustumCulled = false;
        this._trailInstancedMesh.visible = false;

        // Initialize instance colors for glowing gradient tail
        this._trailColorHead = new THREE.Color(0x00f0ff); // Electric cyan
        this._trailColorMid = new THREE.Color(0x7000ff);  // Vivid violet
        this._trailColorTail = new THREE.Color(0xff0066); // Hot neon magenta
        this._trailColorTip = new THREE.Color(0xff8800);  // Warm ember gold
        this._tempTrailColor = new THREE.Color();
        for (let t = 0; t < this._trailNodeCount; t++) {
            this._trailInstancedMesh.setColorAt(t, this._trailColorHead);
        }
        if (this._trailInstancedMesh.instanceColor) {
            this._trailInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            this._trailInstancedMesh.instanceColor.needsUpdate = true;
        }

        this._trailDummy = new THREE.Object3D();
        this._trailPositions = [];
        for (let t = 0; t < this._trailNodeCount; t++) {
            this._trailPositions.push(new THREE.Vector3(0, -999, 0));
            this._trailDummy.position.set(0, -999, 0);
            this._trailDummy.scale.set(0.0001, 0.0001, 0.0001);
            this._trailDummy.updateMatrix();
            this._trailInstancedMesh.setMatrixAt(t, this._trailDummy.matrix);
        }
        this._trailInstancedMesh.instanceMatrix.needsUpdate = true;
        this._dragonGroup.add(this._trailInstancedMesh);

        // Thin arcade blast shockwave geometry (horizontal ring lying flat on the board, 128 segments)
        this._blastGeo = new THREE.RingGeometry(0.975, 1.0, 128);
        this._blastGeo.rotateX(-Math.PI / 2);
        this._blastMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this._activeBlasts = [];

        // Orbit mode parameters (when no unrevealed tiles left)
        this._orbitAngle = 0;
        this._orbitRadius = 0.055;

        // Grid references
        this._tableWidth = GAME_CONFIG.table.width;
        this._tableHeight = GAME_CONFIG.table.height;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;

        this._unsubs = [];
    }

    init(parentGroup, tileManager, ballController) {
        this._parentGroup = parentGroup;
        this._tileManager = tileManager;
        this._ballController = ballController;

        if (this._parentGroup) {
            this._parentGroup.add(this._dragonGroup);
        }

        this.reset();

        this._unsubs.push(
            eventBus.on('card:summonDragon', (data) => {
                const duration = (data && data.duration) || 6;
                this.summon(duration);
            }),
            eventBus.on('grid:rebuilt', () => {
                this._tilesX = GAME_CONFIG.grid.tilesX;
                this._tilesY = GAME_CONFIG.grid.tilesY;
                this._tileWidth = this._tableWidth / this._tilesX;
                this._tileHeight = this._tableHeight / this._tilesY;
            })
        );
    }

    summon(duration = 6.0) {
        this._duration = duration;
        this._timer = 0;
        this._active = true;

        // Make tail mesh visible now
        this._dragonGroup.visible = true;
        this._trailInstancedMesh.visible = true;

        // 1. Initial Player Sample: record position at start t=0
        this._samplePlayerPosition();

        // Spawn leader point slightly elevated above the table
        this._headPos.set(this._sampledCenter.wx, 0.024, this._sampledCenter.wz);

        for (let t = 0; t < this._trailNodeCount; t++) {
            this._trailPositions[t].copy(this._headPos);
        }

        // Plan flight route through unrevealed tiles in 9x9 zone
        this._planRoute();

        // Sound fanfare & sparkle burst
        playSound(900, 0.25);
        setTimeout(() => playSound(1350, 0.35), 100);
        setTimeout(() => playSound(1800, 0.45), 220);

        if (cellParticles) {
            cellParticles.trigger(this._headPos.x, this._headPos.z, false);
        }

        eventBus.emit('dragon:summoned', { duration: this._duration });
    }

    /**
     * Samples the player's ball position (invoked exactly 2 times: at t=0 and t=duration/2).
     */
    _samplePlayerPosition() {
        if (!this._ballController || !this._ballController.mesh) {
            this._sampledCenter = { gx: 9, gy: 18, wx: 0, wz: 0 };
            return;
        }

        const ballPos = this._ballController.mesh.position;
        const wx = ballPos.x;
        const wz = ballPos.z;

        // Map world coordinates to grid coordinates
        let gx = Math.floor((wx + this._tableWidth / 2) / this._tileWidth);
        let gy = Math.floor((wz + this._tableHeight / 2) / this._tileHeight);

        gx = Math.max(0, Math.min(this._tilesX - 1, gx));
        gy = Math.max(0, Math.min(this._tilesY - 1, gy));

        this._sampledCenter = { gx, gy, wx, wz };
    }

    /**
     * Finds unrevealed, non-obstacle tiles in a 9x9 zone around _sampledCenter,
     * and plans a continuous shortest-path route weaving through them.
     */
    _planRoute() {
        if (!this._tileManager) return;

        const { gx, gy } = this._sampledCenter;
        const halfSize = 4; // 9x9 window: [-4, +4] tiles
        const candidates = [];

        for (let dy = -halfSize; dy <= halfSize; dy++) {
            for (let dx = -halfSize; dx <= halfSize; dx++) {
                const tx = gx + dx;
                const ty = gy + dy;

                if (tx >= 0 && tx < this._tilesX && ty >= 0 && ty < this._tilesY) {
                    // Must be walkable (not obstacle) and NOT yet discovered
                    const isObs = this._tileManager.isObstacle(tx, ty);
                    const isDisc = this._tileManager.isDiscovered(tx, ty);

                    if (!isObs && !isDisc) {
                        const worldPos = this._tileManager.getTileWorldPos(tx, ty);
                        candidates.push({
                            gx: tx,
                            gy: ty,
                            x: worldPos.x,
                            z: worldPos.z,
                            dist: Math.hypot(worldPos.x - this._headPos.x, worldPos.z - this._headPos.z)
                        });
                    }
                }
            }
        }

        if (candidates.length === 0) {
            this._targetQueue = [];
            this._waypointIndex = 0;
            return;
        }

        // Greedy nearest-neighbor tour for smooth flight path across undiscovered tiles
        const sortedQueue = [];
        let currentPt = { x: this._headPos.x, z: this._headPos.z };
        const pool = [...candidates];

        while (pool.length > 0) {
            let bestIdx = 0;
            let bestDist = Infinity;

            for (let i = 0; i < pool.length; i++) {
                const d = Math.hypot(pool[i].x - currentPt.x, pool[i].z - currentPt.z);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }

            const chosen = pool.splice(bestIdx, 1)[0];
            sortedQueue.push(chosen);
            currentPt = chosen;
        }

        this._targetQueue = sortedQueue;
        this._waypointIndex = 0;
    }

    update(dt) {
        // 1. Update any active exit blast wave animations regardless of whether dragon is active
        if (this._activeBlasts && this._activeBlasts.length > 0) {
            for (let j = this._activeBlasts.length - 1; j >= 0; j--) {
                const blast = this._activeBlasts[j];
                blast.elapsed += dt;
                const t = blast.elapsed / blast.duration;
                if (t >= 1.0) {
                    if (this._parentGroup) {
                        this._parentGroup.remove(blast.mesh);
                    }
                    blast.mesh.material.dispose();
                    this._activeBlasts.splice(j, 1);
                } else {
                    const curRadius = blast.maxRadius * Math.sin(t * Math.PI * 0.5);
                    blast.mesh.scale.set(curRadius, 1, curRadius);
                    blast.mesh.material.opacity = (1.0 - t) * 0.95;
                }
            }
        }

        if (!this._active) return;

        this._timer += dt;

        // Flight time expired -> dismiss dragon with explosive arcade exit
        if (this._timer >= this._duration) {
            this.dismiss();
            return;
        }

        // Wave motion frequency & undulation (slow and majestic)
        const waveTime = this._timer * 6.5;
        const waveUndulation = Math.sin(waveTime) * 0.004;
        const targetElevation = 0.024 + Math.sin(waveTime * 0.4) * 0.003;

        // Skip any waypoints that are already discovered
        if (this._tileManager && this._targetQueue.length > 0) {
            while (
                this._waypointIndex < this._targetQueue.length &&
                this._tileManager.isDiscovered(this._targetQueue[this._waypointIndex].gx, this._targetQueue[this._waypointIndex].gy)
            ) {
                this._waypointIndex++;
            }
        }

        // If current planned queue was exhausted, check once if any newly eligible unrevealed tiles remain in 9x9 zone
        if (this._waypointIndex >= this._targetQueue.length && this._targetQueue.length > 0) {
            this._planRoute();
        }

        // 1. Navigation: Target tile route OR Orbiting ball mode
        if (this._targetQueue.length > 0 && this._waypointIndex < this._targetQueue.length) {
            const wp = this._targetQueue[this._waypointIndex];
            const dx = wp.x - this._headPos.x;
            const dz = wp.z - this._headPos.z;
            const dist = Math.hypot(dx, dz);

            // Turn smoothly towards waypoint (faster turn if close to prevent overshooting orbit)
            const targetAngle = Math.atan2(dx, dz);
            let angleDiff = targetAngle - this._flightAngle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            const turnRate = dist < 0.05 ? 12.0 : 7.0;
            this._flightAngle += angleDiff * Math.min(1.0, dt * turnRate);

            // Serpentine lateral sway dampens when nearing the target to hit the waypoint cleanly
            const swayDampen = Math.min(1.0, dist / 0.04);
            const lateralSway = Math.cos(waveTime) * 0.003 * swayDampen;
            const perpX = Math.cos(this._flightAngle);
            const perpZ = -Math.sin(this._flightAngle);

            const moveStep = this._flightSpeed * dt;
            this._headPos.x += Math.sin(this._flightAngle) * moveStep + perpX * lateralSway * dt * 6.0;
            this._headPos.z += Math.cos(this._flightAngle) * moveStep + perpZ * lateralSway * dt * 6.0;
            this._headPos.y = targetElevation + waveUndulation;

            // Conquer any tile the head passes over immediately
            if (this._tileManager) {
                const gridPos = this._tileManager.getTileGridPosFromWorld(this._headPos.x, this._headPos.z);
                if (!this._tileManager.isObstacle(gridPos.gridX, gridPos.gridY)) {
                    this._tileManager.conquerTile(gridPos.gridX, gridPos.gridY);
                }
            }

            // Reached waypoint threshold (generous enough to never cause orbiting on a single tile)
            const reachThreshold = Math.max(0.028, this._flightSpeed * dt * 2.5);
            if (dist <= reachThreshold) {
                if (this._tileManager) {
                    const wasNew = this._tileManager.conquerTile(wp.gx, wp.gy);
                    if (wasNew) {
                        playSound(1350 + (this._waypointIndex % 5) * 90, 0.12);
                    }
                }
                this._waypointIndex++;
            }
        } else {
            // Orbiting mode around sampled center or ball
            let centerPos = this._sampledCenter;
            const ballActive = Boolean(this._ballController && this._ballController.active);
            if (ballActive && this._ballController.mesh) {
                centerPos = {
                    wx: this._ballController.mesh.position.x,
                    wz: this._ballController.mesh.position.z
                };
            }

            this._orbitAngle += dt * 2.2;
            const targetX = centerPos.wx + Math.cos(this._orbitAngle) * this._orbitRadius;
            const targetZ = centerPos.wz + Math.sin(this._orbitAngle) * this._orbitRadius;

            // Smooth approach to orbit path
            this._headPos.x += (targetX - this._headPos.x) * Math.min(1.0, dt * 4.0);
            this._headPos.z += (targetZ - this._headPos.z) * Math.min(1.0, dt * 4.0);
            this._headPos.y = targetElevation + waveUndulation * 1.2;

            // Orientation facing direction of orbit travel
            this._flightAngle = this._orbitAngle + Math.PI / 2;

            // Check if passing over any unrevealed tile during orbit
            if (this._tileManager) {
                const gridPos = this._tileManager.getTileGridPosFromWorld(this._headPos.x, this._headPos.z);
                if (!this._tileManager.isObstacle(gridPos.gridX, gridPos.gridY)) {
                    this._tileManager.conquerTile(gridPos.gridX, gridPos.gridY);
                }
            }
        }

        // Update Glowing Gradient Spline Tail Particle Trail
        // Shift trail history backwards
        for (let t = this._trailNodeCount - 1; t > 0; t--) {
            this._trailPositions[t].copy(this._trailPositions[t - 1]);
        }
        // Front of the tail leads directly from leader position
        this._trailPositions[0].copy(this._headPos);

        for (let t = 0; t < this._trailNodeCount; t++) {
            const pos = this._trailPositions[t];
            const ratio = t / (this._trailNodeCount - 1);
            // Elegant serpentine ribbon taper: front is slightly larger, tapering to a fine tail tip
            const taper = Math.max(0.06, Math.pow(1.0 - ratio, 0.70) * 1.35);

            // Compute luminous gradient color along tail:
            // 0.0 - 0.33: Cyan -> Violet
            // 0.33 - 0.66: Violet -> Magenta
            // 0.66 - 1.0: Magenta -> Ember Gold
            if (ratio < 0.33) {
                const subT = ratio / 0.33;
                this._tempTrailColor.copy(this._trailColorHead).lerp(this._trailColorMid, subT);
            } else if (ratio < 0.66) {
                const subT = (ratio - 0.33) / 0.33;
                this._tempTrailColor.copy(this._trailColorMid).lerp(this._trailColorTail, subT);
            } else {
                const subT = (ratio - 0.66) / 0.34;
                this._tempTrailColor.copy(this._trailColorTail).lerp(this._trailColorTip, subT);
            }

            this._trailInstancedMesh.setColorAt(t, this._tempTrailColor);

            this._trailDummy.position.copy(pos);
            this._trailDummy.scale.set(taper, taper, taper);
            this._trailDummy.rotation.set(waveTime + t * 0.15, t * 0.25, 0);
            this._trailDummy.updateMatrix();
            this._trailInstancedMesh.setMatrixAt(t, this._trailDummy.matrix);
        }
        this._trailInstancedMesh.instanceMatrix.needsUpdate = true;
        if (this._trailInstancedMesh.instanceColor) {
            this._trailInstancedMesh.instanceColor.needsUpdate = true;
        }
    }

    dismiss() {
        if (!this._active) return;
        this._active = false;

        const exitX = (this._headPos && this._headPos.y > -100) ? this._headPos.x : 0;
        const exitY = (this._headPos && this._headPos.y > -100) ? this._headPos.y : 0.02;
        const exitZ = (this._headPos && this._headPos.y > -100) ? this._headPos.z : 0;

        // 1. Heavy arcade boom and blast fanfare
        playSound(85, 0.85); // Deep bass explosion boom
        setTimeout(() => playSound(140, 0.65), 50);
        setTimeout(() => playSound(420, 0.45), 110);
        setTimeout(() => playSound(780, 0.35), 180);

        // 2. High-energy particle shatter along the glowing tail
        if (cellParticles) {
            cellParticles.shatter(exitX, exitY, exitZ, 40);
            for (let t = 4; t < this._trailNodeCount; t += 6) {
                const pos = this._trailPositions[t];
                if (pos && pos.y > -100) {
                    const delay = (t / 6) * 35;
                    setTimeout(() => {
                        if (cellParticles) cellParticles.shatter(pos.x, pos.y, pos.z, 20);
                    }, delay);
                }
            }
        }

        // 3. Expanding thin circular shockwave ring blast
        if (this._parentGroup && this._blastGeo && this._blastMat) {
            const blastRadius = this._tileWidth * 3.8;
            const blastMesh = new THREE.Mesh(this._blastGeo, this._blastMat.clone());
            blastMesh.position.set(exitX, 0.006, exitZ);
            blastMesh.scale.set(0.001, 1, 0.001);
            this._parentGroup.add(blastMesh);
            this._activeBlasts.push({
                mesh: blastMesh,
                elapsed: 0,
                duration: 0.45,
                maxRadius: blastRadius
            });
        }

        // 4. Conceal tail visuals immediately
        this._dragonGroup.visible = false;
        if (this._trailInstancedMesh) {
            this._trailInstancedMesh.visible = false;
        }
        for (let t = 0; t < this._trailNodeCount; t++) {
            this._trailPositions[t].set(0, -999, 0);
            this._trailDummy.position.set(0, -999, 0);
            this._trailDummy.scale.set(0.0001, 0.0001, 0.0001);
            this._trailDummy.updateMatrix();
            this._trailInstancedMesh.setMatrixAt(t, this._trailDummy.matrix);
        }
        if (this._trailInstancedMesh.instanceMatrix) {
            this._trailInstancedMesh.instanceMatrix.needsUpdate = true;
        }

        this._headPos.set(0, -999, 0);
        eventBus.emit('dragon:dismissed');
    }

    reset() {
        this._active = false;
        this._dragonGroup.visible = false;
        if (this._trailInstancedMesh) {
            this._trailInstancedMesh.visible = false;
        }
        for (let t = 0; t < this._trailNodeCount; t++) {
            this._trailPositions[t].set(0, -999, 0);
            this._trailDummy.position.set(0, -999, 0);
            this._trailDummy.scale.set(0.0001, 0.0001, 0.0001);
            this._trailDummy.updateMatrix();
            this._trailInstancedMesh.setMatrixAt(t, this._trailDummy.matrix);
        }
        if (this._trailInstancedMesh.instanceMatrix) {
            this._trailInstancedMesh.instanceMatrix.needsUpdate = true;
        }

        // Clean up any remaining blasts
        if (this._activeBlasts && this._parentGroup) {
            for (const blast of this._activeBlasts) {
                this._parentGroup.remove(blast.mesh);
                blast.mesh.material.dispose();
            }
            this._activeBlasts = [];
        }

        this._headPos.set(0, -999, 0);
        this._targetQueue = [];
        this._waypointIndex = 0;
    }

    isActive() {
        return this._active;
    }

    getHitPositions() {
        if (!this._active) return [];
        const positions = [];
        if (this._headPos && this._headPos.y > -100) {
            positions.push(this._headPos);
        }
        if (this._trailPositions) {
            for (let i = 0; i < this._trailPositions.length; i++) {
                const p = this._trailPositions[i];
                if (p && p.y > -100) {
                    positions.push(p);
                }
            }
        }
        return positions;
    }

    dispose() {
        this.reset();
        if (this._parentGroup) {
            this._parentGroup.remove(this._dragonGroup);
        }
        if (this._trailInstancedMesh) {
            this._trailInstancedMesh.geometry.dispose();
            this._trailInstancedMesh.material.dispose();
        }
        if (this._blastGeo) {
            this._blastGeo.dispose();
        }
        if (this._blastMat) {
            this._blastMat.dispose();
        }
        this._unsubs.forEach(u => u());
        this._unsubs = [];
    }
}
