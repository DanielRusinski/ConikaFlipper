import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';

/**
 * CentipedeSystem
 * Retro-arcade Centipede enemy ("Stonoga"):
 * - 8 blood-red square segments ("wszystkie segmenty identyczne i mocno krwisto-czerwone").
 * - Graduated thickness: full solid square head ("pełny segment to głowa") tapering to
 *   an increasingly thin hollow square frame towards the tail ("coraz cieńsza ramka w stronę ogona").
 * - Travels across the full playable width from the very first tile (column 0) to the very last tile (tilesX - 1).
 * - Advanced clash prevention: centers squarely in tile column before turning, pre-checks vertical destination
 *   against black obstacle columns, laser emitter blocks, firing laser corridors, and patrolling cylinder enemies.
 * - Subdued, fast entrance animation (descent from low height, calm audio cue).
 * - Can ONLY be destroyed by bombs; touching player ball destroys the ball.
 * - Bomb blast shatters hit segments in radius; surviving segments continue moving.
 * - Fully eliminated when all 8 segments are destroyed (+1000 bonus score).
 */
export class CentipedeSystem {
    constructor() {
        this._parentGroup = null;
        this._tileManager = null;
        this._ballController = null;
        this._labelSystem = null;
        this._enemySystem = null;
        this._laserHazardSystem = null;

        this.group = new THREE.Group();
        this.group.name = 'CentipedeSystemGroup';

        // Table & grid metrics
        this._tableWidth = GAME_CONFIG.table.width;
        this._tableHeight = GAME_CONFIG.table.height;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;

        // Lifecycle & stage timing
        this.state = 'inactive'; // 'inactive' | 'spawning' | 'active' | 'dead'
        this._stageTimer = 0.0;
        this._spawnTargetTime = 90.0; // 1.5 minutes
        this._spawnDuration = 0.45;   // Subdued, fast entrance
        this._spawnTimer = 0.0;
        this._respawnDelay = 7.0;     // Continuous respawn delay after all 8 segments destroyed
        this._respawnTimer = 0.0;
        this._animTime = 0.0;
        this._scuttleTimer = 0.0;

        // Kinematics & movement
        this._speed = 0.088; // Constant speed (~3 tiles per second)
        this._segmentSpacing = this._tileWidth * 0.92;
        this._dirX = 1; // 1 (right) or -1 (left)
        this._verticalDir = 1; // 1 (stepping down towards player) or -1 (stepping up)
        this._isStepping = false;
        this._stepProgress = 0.0;
        this._stepStartZ = 0.0;
        this._stepTargetZ = 0.0;

        this._headX = 0.0;
        this._headZ = 0.0;
        this._headAngle = 0.0;
        this._totalTravelDistance = 0.0;

        // Breadcrumb path history
        this._trail = [];

        // 8 Segments data
        this._segmentsCount = 8;
        this._segments = [];

        // Graduated geometries & shared blood-red material
        this._segmentGeos = [];
        this._initGeometryAndMaterials();

        // Active dummy markers for label cleanup
        this._activeDummies = [];

        this._unsubs = [];
    }

    _initGeometryAndMaterials() {
        const outerHalf = this._tileWidth * 0.42;

        const extrudeSettings = {
            depth: 0.0045,
            bevelEnabled: true,
            bevelThickness: 0.0008,
            bevelSize: 0.0006,
            bevelSegments: 2
        };

        // 1. Head segment (index 0): "pełny segment to głowa" -> Solid square, no hole cutout
        const headShape = new THREE.Shape();
        headShape.moveTo(-outerHalf, -outerHalf);
        headShape.lineTo(outerHalf, -outerHalf);
        headShape.lineTo(outerHalf, outerHalf);
        headShape.lineTo(-outerHalf, outerHalf);
        headShape.closePath();

        const headGeo = new THREE.ExtrudeGeometry(headShape, extrudeSettings);
        headGeo.rotateX(-Math.PI / 2);
        this._segmentGeos.push(headGeo);

        // 2. Trailing segments (index 1 to 7): "coraz cieńsza ramka w stronę końca ogona"
        // Inner hole expands progressively from 0.30 * outerHalf to 0.88 * outerHalf
        for (let i = 1; i < this._segmentsCount; i++) {
            const t = (i - 1) / (this._segmentsCount - 2); // 0.0 at i=1 to 1.0 at i=7
            const innerRatio = 0.30 + t * 0.58; // 0.30 (thick frame) -> 0.88 (very thin frame)
            const innerHalf = outerHalf * innerRatio;

            const segShape = new THREE.Shape();
            segShape.moveTo(-outerHalf, -outerHalf);
            segShape.lineTo(outerHalf, -outerHalf);
            segShape.lineTo(outerHalf, outerHalf);
            segShape.lineTo(-outerHalf, outerHalf);
            segShape.closePath();

            const hole = new THREE.Path();
            hole.moveTo(-innerHalf, -innerHalf);
            hole.lineTo(innerHalf, -innerHalf);
            hole.lineTo(innerHalf, innerHalf);
            hole.lineTo(-innerHalf, innerHalf);
            hole.closePath();
            segShape.holes.push(hole);

            const segGeo = new THREE.ExtrudeGeometry(segShape, extrudeSettings);
            segGeo.rotateX(-Math.PI / 2);
            this._segmentGeos.push(segGeo);
        }

        // Unified blood-red material for all segments ("mocno krwisto-czerwone z emission delikatnym")
        this._sharedMat = new THREE.MeshStandardMaterial({
            color: 0xcc0010,       // Deep, vivid blood red
            metalness: 0.35,
            roughness: 0.28,
            emissive: 0x550005,    // Delicate, subtle red ambient lift
            emissiveIntensity: 0.75,
            envMapIntensity: 1.1
        });
    }

    init(parentGroup, tileManager, ballController, labelSystem, enemySystem = null, laserHazardSystem = null) {
        this._parentGroup = parentGroup;
        this._tileManager = tileManager;
        this._ballController = ballController;
        this._labelSystem = labelSystem;
        this._enemySystem = enemySystem;
        this._laserHazardSystem = laserHazardSystem;

        if (this._parentGroup) {
            this._parentGroup.add(this.group);
        }

        this._unsubs.push(
            eventBus.on('bomb:detonated', (data) => this._onBombDetonated(data)),
            eventBus.on('grid:rebuilt', () => {
                this._tilesX = GAME_CONFIG.grid.tilesX;
                this._tilesY = GAME_CONFIG.grid.tilesY;
                this._tileWidth = this._tableWidth / this._tilesX;
                this._tileHeight = this._tableHeight / this._tilesY;
            })
        );
    }

    setExternalSystems(enemySystem, laserHazardSystem) {
        this._enemySystem = enemySystem;
        this._laserHazardSystem = laserHazardSystem;
    }

    /**
     * Checks if a grid cell (gx, gy) is blocked by black columns, laser blocks,
     * firing laser corridors, or patrolling cylinder enemies.
     */
    _isTileBlocked(gx, gy) {
        // 1. Grid boundaries
        if (gx < 0 || gx >= this._tilesX || gy < 0 || gy >= this._tilesY) {
            return true;
        }

        // 2. Black column obstacle
        if (this._tileManager && this._tileManager.isObstacle(gx, gy)) {
            return true;
        }

        // 3. Laser hazard system blocks & active firing corridor
        if (this._laserHazardSystem && this._laserHazardSystem._corridors) {
            for (const c of this._laserHazardSystem._corridors) {
                // Red emitter blocks on ends
                if ((gx === c.gx1 && gy === c.gy1) || (gx === c.gx2 && gy === c.gy2)) {
                    return true;
                }
                // If laser is currently active or charging, avoid beam line
                if (this._laserHazardSystem.state === 'FIRING' || this._laserHazardSystem.state === 'WARNING') {
                    if (c.orientation === 'h' && gy === c.gy1) {
                        const minX = Math.min(c.gx1, c.gx2);
                        const maxX = Math.max(c.gx1, c.gx2);
                        if (gx >= minX && gx <= maxX) return true;
                    }
                    if (c.orientation === 'v' && gx === c.gx1) {
                        const minY = Math.min(c.gy1, c.gy2);
                        const maxY = Math.max(c.gy1, c.gy2);
                        if (gy >= minY && gy <= maxY) return true;
                    }
                }
            }
        }

        // 4. Cylinder enemies (Walce)
        if (this._enemySystem && this._enemySystem._enemies && this._tileManager) {
            const tileWorld = this._tileManager.getTileWorldPos(gx, gy);
            for (const e of this._enemySystem._enemies) {
                if (e.isDead || e.state === 'waiting') continue;
                const dist = Math.hypot(e.x - tileWorld.x, e.z - tileWorld.z);
                if (dist < this._tileWidth * 1.05) {
                    return true;
                }
            }
        }

        return false;
    }

    spawn() {
        if (this.state === 'active' || this.state === 'spawning') return;

        // Find starting position at top row (first column gx = 0 or 1 if unblocked)
        let startGX = 0;
        let startGY = 0;
        while (startGY < 3 && this._isTileBlocked(startGX, startGY)) {
            startGX++;
            if (startGX >= this._tilesX) {
                startGX = 0;
                startGY++;
            }
        }

        const startWorld = this._tileManager.getTileWorldPos(startGX, startGY);

        this._headX = startWorld.x;
        this._headZ = startWorld.z;
        this._headAngle = 0.0;
        this._dirX = 1;
        this._verticalDir = 1;
        this._isStepping = false;
        this._stepProgress = 0.0;
        this._totalTravelDistance = 0.0;
        this._animTime = 0.0;
        this._scuttleTimer = 0.0;

        // Clear existing segments and trail
        this._clearSegments();

        // Build 8 segments with graduated geometry and identical blood-red material
        for (let i = 0; i < this._segmentsCount; i++) {
            const isHead = (i === 0);
            const segGroup = new THREE.Group();

            const segMesh = new THREE.Mesh(
                this._segmentGeos[i],
                this._sharedMat
            );
            segGroup.add(segMesh);

            // Subdued, calm entrance: start just slightly above the board (Y = 0.08)
            const initX = this._headX - i * this._segmentSpacing;
            const initZ = this._headZ;
            const startY = 0.08 + i * 0.012;
            segGroup.position.set(initX, startY, initZ);
            this.group.add(segGroup);

            this._segments.push({
                index: i,
                group: segGroup,
                mesh: segMesh,
                isHead,
                x: initX,
                z: initZ,
                y: startY,
                angle: 0,
                alive: true
            });
        }

        // Initialize trail history linearly behind head
        this._trail = [];
        const numPreSamples = 60;
        const sampleStep = (this._segmentSpacing * 9) / numPreSamples;
        for (let s = numPreSamples; s >= 0; s--) {
            const dist = -s * sampleStep;
            this._trail.push({
                x: this._headX + dist,
                z: this._headZ,
                angle: 0.0,
                travelDist: dist
            });
        }
        this._totalTravelDistance = 0.0;

        // Activate subdued entrance animation
        this.state = 'spawning';
        this._spawnTimer = 0.0;

        // Subdued, non-intrusive arcade spawn sound (single pleasant retro cue)
        playSound(480, 0.16);

        // Subtle camera tremor & flash
        eventBus.emit('fx:chromaticAberration', { intensity: 0.008, duration: 0.25 });
        eventBus.emit('fx:shake', { trauma: 0.12 });
        eventBus.emit('centipede:spawned', { x: this._headX, z: this._headZ });
    }

    _onBombDetonated({ x, z, radius }) {
        if (this.state !== 'active' && this.state !== 'spawning') return;

        let hitCount = 0;
        let lastHitPos = null;

        for (const seg of this._segments) {
            if (!seg.alive) continue;

            const dist = Math.hypot(seg.x - x, seg.z - z);
            if (dist <= radius + this._tileWidth * 0.46) {
                seg.alive = false;
                seg.group.visible = false;
                hitCount++;
                lastHitPos = { x: seg.x, z: seg.z };

                // 3D particle shatter
                if (cellParticles && cellParticles.shatter) {
                    cellParticles.shatter(seg.x, 0.012, seg.z, 28);
                }

                // Segment destruction sound
                playSound(135, 0.4);
                setTimeout(() => playSound(290, 0.25), 50);

                // Floating score label +100
                this._createScoreLabel(seg.x, seg.z, '+100');

                // Award score
                eventBus.emit('score:add', { points: 100, reason: 'centipede_segment' });
            }
        }

        if (hitCount > 0) {
            eventBus.emit('fx:chromaticAberration', { intensity: 0.016, duration: 0.35 });
            eventBus.emit('fx:shake', { trauma: 0.35 });

            const remainingAlive = this._segments.filter(s => s.alive).length;
            if (remainingAlive === 0) {
                this._onAllSegmentsDestroyed(lastHitPos || { x, z });
            }
        }
    }

    _onAllSegmentsDestroyed(pos) {
        this.state = 'dead';
        // Immediately trigger the respawn cooldown so the next centipede appears after destruction
        this._respawnTimer = this._respawnDelay;

        // Triumphant fanfare
        playSound(1300, 0.3);
        setTimeout(() => playSound(1650, 0.35), 90);
        setTimeout(() => playSound(1980, 0.40), 200);
        setTimeout(() => playSound(2600, 0.45), 330);

        // Big floating score label +1000 BONUS
        this._createScoreLabel(pos.x, pos.z, '+1000 BONUS');

        // Award grand elimination bonus
        eventBus.emit('score:add', { points: 1000, reason: 'centipede_defeated' });
        eventBus.emit('centipede:defeated', { stageTimer: this._stageTimer });

        eventBus.emit('fx:chromaticAberration', { intensity: 0.024, duration: 0.50 });
        eventBus.emit('fx:shake', { trauma: 0.50 });
    }

    _createScoreLabel(x, z, text) {
        if (!this._labelSystem) return;

        const dummy = new THREE.Object3D();
        dummy.position.set(x, 0.035, z);
        this.group.add(dummy);
        this._activeDummies.push(dummy);

        const labelId = this._labelSystem.createLabel(dummy, {
            text,
            className: 'crystal-countdown points ready',
            worldOffset: { x: 0, y: 0.035, z: 0 },
            autoRemoveTime: 1200
        });

        setTimeout(() => {
            if (this._labelSystem) {
                this._labelSystem.removeLabel(labelId);
            }
            const idx = this._activeDummies.indexOf(dummy);
            if (idx !== -1) {
                this._activeDummies.splice(idx, 1);
            }
            this.group.remove(dummy);
        }, 1250);
    }

    update(dt) {
        if (this.state === 'inactive') {
            this._stageTimer += dt;
            if (this._stageTimer >= this._spawnTargetTime) {
                this.spawn();
            }
            return;
        }

        this._animTime += dt;

        // --- 1. Subdued Entrance Spawning Animation ---
        if (this.state === 'spawning') {
            this._spawnTimer += dt;
            const progress = Math.min(1.0, this._spawnTimer / this._spawnDuration);

            for (let i = 0; i < this._segments.length; i++) {
                const seg = this._segments[i];
                const segDelay = (i / this._segments.length) * 0.15;
                const segProgress = Math.max(0, Math.min(1, (this._spawnTimer - segDelay) / (this._spawnDuration - segDelay)));

                // Smooth landing to Y = 0.007
                const easeOut = 1.0 - Math.pow(1.0 - segProgress, 2.5);
                seg.y = THREE.MathUtils.lerp(0.08 + i * 0.012, 0.007, easeOut);
                seg.group.position.y = seg.y;
            }

            if (progress >= 1.0) {
                this.state = 'active';
            }
            return;
        }

        if (this.state === 'dead') {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this.spawn();
            }
            return;
        }

        // --- 2. Active Movement Kinematics ---
        if (this.state === 'active') {
            this._scuttleTimer += dt;
            if (this._scuttleTimer >= 0.32) {
                this._scuttleTimer = 0.0;
                playSound(240, 0.02);
            }

            const prevHeadX = this._headX;
            const prevHeadZ = this._headZ;

            // Compute exact world bounds for column 0 and column tilesX - 1
            const firstTileWorldX = this._tileManager.getTileWorldPos(0, 0).x;
            const lastTileWorldX = this._tileManager.getTileWorldPos(this._tilesX - 1, 0).x;

            if (!this._isStepping) {
                // Moving horizontally along X
                const dx = this._dirX * this._speed * dt;
                const nextHeadX = this._headX + dx;

                // Check edge bounds (column 0 on left, column tilesX-1 on right)
                let hitEdge = false;
                if (this._dirX > 0 && nextHeadX >= lastTileWorldX) {
                    hitEdge = true;
                } else if (this._dirX < 0 && nextHeadX <= firstTileWorldX) {
                    hitEdge = true;
                }

                // Check obstacle directly ahead in the row
                const curGrid = this._tileManager.getTileGridPosFromWorld(this._headX, this._headZ);
                const checkGX = curGrid.gridX + this._dirX;
                const hitObstacle = !hitEdge && this._isTileBlocked(checkGX, curGrid.gridY);

                if (hitEdge || hitObstacle) {
                    // Snap head X exactly to the center of the current clear column
                    // This prevents any corner-clipping into obstacles to the side!
                    const clearWorld = this._tileManager.getTileWorldPos(curGrid.gridX, curGrid.gridY);
                    this._headX = clearWorld.x;

                    // Evaluate vertical step direction
                    let nextVerticalDir = this._verticalDir;

                    // Bound checks at table bottom and top edges
                    if (curGrid.gridY >= this._tilesY - 1 && nextVerticalDir > 0) {
                        nextVerticalDir = -1; // Reverse to climb up
                    } else if (curGrid.gridY <= 0 && nextVerticalDir < 0) {
                        nextVerticalDir = 1;  // Reverse to step down
                    }

                    let targetGY = curGrid.gridY + nextVerticalDir;

                    // Clash check: is the vertical destination tile clear?
                    if (this._isTileBlocked(curGrid.gridX, targetGY)) {
                        // Desired vertical tile is blocked; try opposite vertical direction
                        const altVerticalDir = -nextVerticalDir;
                        const altTargetGY = curGrid.gridY + altVerticalDir;
                        if (!this._isTileBlocked(curGrid.gridX, altTargetGY)) {
                            nextVerticalDir = altVerticalDir;
                            targetGY = altTargetGY;
                        } else {
                            // Both vertical directions blocked! Reverse horizontal in-place safely
                            this._dirX = -this._dirX;
                            this._headAngle = (this._dirX > 0) ? 0.0 : Math.PI;
                            return;
                        }
                    }

                    this._verticalDir = nextVerticalDir;
                    this._stepStartZ = this._headZ;
                    this._stepTargetZ = this._tileManager.getTileWorldPos(curGrid.gridX, targetGY).z;
                    this._isStepping = true;
                    this._stepProgress = 0.0;
                    this._dirX = -this._dirX;
                    this._headAngle = (this._verticalDir > 0) ? Math.PI * 0.5 : -Math.PI * 0.5;
                } else {
                    this._headX = nextHeadX;
                    this._headAngle = (this._dirX > 0) ? 0.0 : Math.PI;
                }
            } else {
                // Smooth vertical row stepping centered squarely in current column
                const stepDuration = Math.max(0.18, this._tileHeight / this._speed);
                this._stepProgress += dt / stepDuration;

                if (this._stepProgress >= 1.0) {
                    this._stepProgress = 1.0;
                    this._headZ = this._stepTargetZ;
                    this._isStepping = false;
                    this._headAngle = (this._dirX > 0) ? 0.0 : Math.PI;
                } else {
                    const p = this._stepProgress;
                    const smoothP = p * p * (3 - 2 * p);
                    this._headZ = THREE.MathUtils.lerp(this._stepStartZ, this._stepTargetZ, smoothP);
                    this._headAngle = (this._verticalDir > 0) ? Math.PI * 0.5 : -Math.PI * 0.5;
                }
            }

            // Accumulate traveled distance and append to trail
            const deltaDist = Math.hypot(this._headX - prevHeadX, this._headZ - prevHeadZ);
            if (deltaDist > 0.0001) {
                this._totalTravelDistance += deltaDist;
                this._trail.push({
                    x: this._headX,
                    z: this._headZ,
                    angle: this._headAngle,
                    travelDist: this._totalTravelDistance
                });

                const maxHistoryDist = this._segmentSpacing * (this._segmentsCount + 2);
                while (this._trail.length > 2 && (this._totalTravelDistance - this._trail[1].travelDist) > maxHistoryDist) {
                    this._trail.shift();
                }
            }

            // --- 3. Update Segment Positions Along Trail ---
            for (let i = 0; i < this._segments.length; i++) {
                const seg = this._segments[i];
                if (!seg.alive) continue;

                if (i === 0) {
                    seg.x = this._headX;
                    seg.z = this._headZ;
                    seg.angle = this._headAngle;
                } else {
                    const targetDist = this._totalTravelDistance - i * this._segmentSpacing;
                    const sample = this._sampleTrailAtDistance(targetDist);
                    seg.x = sample.x;
                    seg.z = sample.z;
                    seg.angle = sample.angle;
                }

                // Subtle organic vertical undulating wave & orientation
                const bob = Math.sin(this._animTime * 10.0 + i * 0.8) * 0.0016;
                seg.group.position.set(seg.x, 0.007 + bob, seg.z);
                seg.group.rotation.y = -seg.angle;
            }

            // --- 4. Ball Collision Detection ---
            this._checkBallCollision();
        }
    }

    _sampleTrailAtDistance(targetDist) {
        if (this._trail.length === 0) {
            return { x: this._headX, z: this._headZ, angle: this._headAngle };
        }

        if (targetDist >= this._totalTravelDistance) {
            const last = this._trail[this._trail.length - 1];
            return { x: last.x, z: last.z, angle: last.angle };
        }

        if (targetDist <= this._trail[0].travelDist) {
            const first = this._trail[0];
            return { x: first.x, z: first.z, angle: first.angle };
        }

        let low = 0;
        let high = this._trail.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this._trail[mid].travelDist < targetDist) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const idx1 = Math.max(1, Math.min(this._trail.length - 1, low));
        const idx0 = idx1 - 1;
        const p0 = this._trail[idx0];
        const p1 = this._trail[idx1];

        const segLength = p1.travelDist - p0.travelDist;
        const t = (segLength > 0.00001) ? (targetDist - p0.travelDist) / segLength : 0.0;

        return {
            x: THREE.MathUtils.lerp(p0.x, p1.x, t),
            z: THREE.MathUtils.lerp(p0.z, p1.z, t),
            angle: p1.angle
        };
    }

    _checkBallCollision() {
        if (!this._ballController || !this._ballController.mesh || !this._ballController.isActive()) {
            return;
        }

        const ballPos = this._ballController.mesh.position;
        const ballRadius = GAME_CONFIG.ball.radius || 0.0135;
        const hitRadius = ballRadius + this._tileWidth * 0.38;

        for (const seg of this._segments) {
            if (!seg.alive) continue;

            const dist = Math.hypot(ballPos.x - seg.x, ballPos.z - seg.z);
            if (dist < hitRadius) {
                eventBus.emit('laser:hit', {
                    x: ballPos.x,
                    z: ballPos.z,
                    reason: 'centipede_touch'
                });
                break;
            }
        }
    }

    _clearSegments() {
        for (const seg of this._segments) {
            if (seg.group) {
                this.group.remove(seg.group);
            }
        }
        this._segments = [];
    }

    reset() {
        this.state = 'inactive';
        this._stageTimer = 0.0;
        this._spawnTimer = 0.0;
        this._respawnTimer = 0.0;
        this._isStepping = false;
        this._dirX = 1;
        this._verticalDir = 1;
        this._trail = [];

        for (const d of this._activeDummies) {
            this.group.remove(d);
        }
        this._activeDummies = [];

        this._clearSegments();
    }

    dispose() {
        this.reset();

        if (this._unsubs) {
            this._unsubs.forEach(u => u && u());
            this._unsubs = [];
        }

        for (const geo of this._segmentGeos) {
            geo.dispose();
        }
        this._segmentGeos = [];

        if (this._sharedMat) this._sharedMat.dispose();

        if (this._parentGroup && this.group) {
            this._parentGroup.remove(this.group);
        }
    }
}
