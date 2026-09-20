import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';
import { CircularLoadingRingManager } from '../rendering/CircularLoadingRing.js';

export class BombSystem {
    constructor() {
        this._parentGroup = null;
        this._tileManager = null;
        this._camera = null;
        this._domElement = null;
        this._ballController = null;

        // Inventory / state
        this._bombCount = 0;
        this._targetingActive = false;

        // Table / grid metrics
        this._tableWidth = GAME_CONFIG.table.width;
        this._tableHeight = GAME_CONFIG.table.height;
        this._tilesX = GAME_CONFIG.grid.tilesX;
        this._tilesY = GAME_CONFIG.grid.tilesY;
        this._tileWidth = this._tableWidth / this._tilesX;
        this._tileHeight = this._tableHeight / this._tilesY;

        // Raycasting for targeting
        this._raycaster = new THREE.Raycaster();
        this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._mouse = new THREE.Vector2();
        this._planeIntersect = new THREE.Vector3();

        // Targeting reticle mesh
        this._reticleMesh = null;
        this._lastReticleGrid = null;

        // Loading ring manager for bomb fuse countdown
        this._ringManager = new CircularLoadingRingManager();

        // Active bombs in world
        this._activeBombs = [];

        // Geometries and materials cache
        this._bombGeo = new THREE.SphereGeometry(this._tileWidth * 0.46, 24, 24);
        this._bombCapGeo = new THREE.CylinderGeometry(this._tileWidth * 0.12, this._tileWidth * 0.16, 0.007, 16);
        this._bombCapGeo.translate(0, this._tileWidth * 0.46, 0);

        this._bombMat = new THREE.MeshStandardMaterial({
            color: 0x181822,
            metalness: 0.85,
            roughness: 0.25,
            emissive: 0xff3b30,
            emissiveIntensity: 0.25
        });

        this._bombCapMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.9,
            roughness: 0.2
        });

        // Flash expansion geometry for blast wave: perfectly circular thin ring lying flat on table (horizontal in XZ plane)
        // Thin ring from 0.975 to 1.0 (128 segments for smooth circular curvature)
        this._blastGeo = new THREE.RingGeometry(0.975, 1.0, 128);
        this._blastGeo.rotateX(-Math.PI / 2); // Rotate to lie flat in XZ plane parallel to table
        this._blastMat = new THREE.MeshBasicMaterial({
            color: 0xff7700,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Active blast wave animations
        this._activeBlasts = [];

        // Bindings
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._unsubs = [];
    }

    init(parentGroup, tileManager, camera, domElement, ballController) {
        this._parentGroup = parentGroup;
        this._tileManager = tileManager;
        this._camera = camera;
        this._domElement = domElement;
        this._ballController = ballController;

        this._createReticle();

        this._unsubs.push(
            eventBus.on('card:grantBombs', (data) => {
                const count = (data && data.count) || 3;
                this.addBombs(count);
            }),
            eventBus.on('ui:toggleBombTargeting', () => {
                this.toggleTargeting();
            }),
            eventBus.on('grid:rebuilt', () => {
                this._tilesX = GAME_CONFIG.grid.tilesX;
                this._tilesY = GAME_CONFIG.grid.tilesY;
                this._tileWidth = this._tableWidth / this._tilesX;
                this._tileHeight = this._tableHeight / this._tilesY;
            })
        );
    }

    _createReticle() {
        const radius = this._tileWidth * 0.48;
        const ringGeo = new THREE.RingGeometry(radius * 0.72, radius, 32);
        ringGeo.rotateX(-Math.PI / 2);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff3b30,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this._reticleMesh = new THREE.Mesh(ringGeo, ringMat);
        this._reticleMesh.position.y = 0.004;
        this._reticleMesh.visible = false;
        this._reticleMesh.renderOrder = 4;
        this._parentGroup.add(this._reticleMesh);
    }

    addBombs(count = 3) {
        this._bombCount += count;
        playSound(850, 0.25);
        setTimeout(() => playSound(1150, 0.3), 120);
        eventBus.emit('bomb:countChanged', { count: this._bombCount });
        // Automatically activate targeting mode when bombs are awarded
        if (this._bombCount > 0 && !this._targetingActive) {
            this.setTargeting(true);
        }
    }

    getBombCount() {
        return this._bombCount;
    }

    toggleTargeting() {
        if (this._bombCount <= 0) return;
        this.setTargeting(!this._targetingActive);
    }

    setTargeting(active) {
        if (active && this._bombCount <= 0) return;
        this._targetingActive = active;

        if (this._reticleMesh) {
            this._reticleMesh.visible = active;
        }

        if (active) {
            if (this._domElement) {
                this._domElement.addEventListener('pointermove', this._onPointerMove, { passive: true });
                this._domElement.addEventListener('pointerdown', this._onPointerDown);
            }
            window.addEventListener('keydown', this._onKeyDown);
            playSound(700, 0.15);
        } else {
            if (this._domElement) {
                this._domElement.removeEventListener('pointermove', this._onPointerMove);
                this._domElement.removeEventListener('pointerdown', this._onPointerDown);
            }
            window.removeEventListener('keydown', this._onKeyDown);
        }

        eventBus.emit('bomb:targetingChanged', { active: this._targetingActive, count: this._bombCount });
    }

    _onKeyDown(e) {
        if (e.key === 'Escape') {
            this.setTargeting(false);
        }
    }

    _onPointerMove(e) {
        if (!this._targetingActive || !this._camera || !this._domElement) return;

        const rect = this._domElement.getBoundingClientRect();
        this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, this._camera);
        if (this._raycaster.ray.intersectPlane(this._plane, this._planeIntersect)) {
            const gx = Math.floor((this._planeIntersect.x + this._tableWidth / 2) / this._tileWidth);
            const gy = Math.floor((this._planeIntersect.z + this._tableHeight / 2) / this._tileHeight);

            if (gx >= 0 && gx < this._tilesX && gy >= 0 && gy < this._tilesY) {
                const isObs = this._tileManager ? this._tileManager.isObstacle(gx, gy) : false;
                const wx = (gx + 0.5) * this._tileWidth - this._tableWidth / 2;
                const wz = (gy + 0.5) * this._tileHeight - this._tableHeight / 2;

                this._reticleMesh.position.set(wx, 0.004, wz);
                this._reticleMesh.visible = true;

                if (isObs) {
                    this._reticleMesh.material.color.setHex(0x555555);
                    this._reticleMesh.material.opacity = 0.35;
                } else {
                    this._reticleMesh.material.color.setHex(0xff3b30);
                    this._reticleMesh.material.opacity = 0.9;
                }

                if (!this._lastReticleGrid || this._lastReticleGrid.gx !== gx || this._lastReticleGrid.gy !== gy) {
                    this._lastReticleGrid = { gx, gy };
                    if (!isObs) playSound(600, 0.03);
                }
            }
        }
    }

    _onPointerDown(e) {
        if (!this._targetingActive || this._bombCount <= 0) return;
        // Ignore clicks on HUD buttons
        if (e.target && e.target.closest && (e.target.closest('#hud') || e.target.closest('#screens') || e.target.closest('#panels'))) return;

        this.pointerType = e.pointerType; // 'mouse' | 'touch' | 'pen'

        const rect = this._domElement.getBoundingClientRect();
        this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, this._camera);
        if (this._raycaster.ray.intersectPlane(this._plane, this._planeIntersect)) {
            const gx = Math.floor((this._planeIntersect.x + this._tableWidth / 2) / this._tileWidth);
            const gy = Math.floor((this._planeIntersect.z + this._tableHeight / 2) / this._tileHeight);

            if (gx >= 0 && gx < this._tilesX && gy >= 0 && gy < this._tilesY) {
                // Must be playable tile (not obstacle)
                if (this._tileManager && this._tileManager.isObstacle(gx, gy)) {
                    playSound(180, 0.25); // Error sound
                    return;
                }

                // Valid drop!
                this.deployBomb(gx, gy);
            }
        }
    }

    deployBomb(gridX, gridY) {
        if (this._bombCount <= 0) return;

        this._bombCount--;
        eventBus.emit('bomb:countChanged', { count: this._bombCount });

        // World coordinates of target tile
        const targetX = (gridX + 0.5) * this._tileWidth - this._tableWidth / 2;
        const targetZ = (gridY + 0.5) * this._tileHeight - this._tableHeight / 2;
        const targetY = 0.016; // Sits on table

        // Create 3D bomb composite mesh
        const bombGroup = new THREE.Group();
        bombGroup.name = `Bomb_${gridX}_${gridY}`;

        const sphere = new THREE.Mesh(this._bombGeo, this._bombMat.clone());
        sphere.castShadow = true;
        const cap = new THREE.Mesh(this._bombCapGeo, this._bombCapMat);
        bombGroup.add(sphere);
        bombGroup.add(cap);

        // Circular countdown fuse loading ring (fast 3-second red-orange neon orbit)
        const ringMesh = this._ringManager.createRingMesh(0xff3b30);
        ringMesh.position.set(0, 0.003, 0);
        bombGroup.add(ringMesh);

        // Drop animation state: falls from arcade sky Y = 0.35 with squash and bounce
        const startY = targetY + 0.38;
        bombGroup.position.set(targetX, startY, targetZ);
        bombGroup.scale.set(0.2, 2.0, 0.2); // Elongated arcade drop-streak

        this._parentGroup.add(bombGroup);
        playSound(950, 0.3); // High drop whistle / whoosh

        const bombData = {
            group: bombGroup,
            sphereMesh: sphere,
            ringMesh: ringMesh,
            gridX,
            gridY,
            targetX,
            targetY,
            targetZ,
            // Fall animation
            isFalling: true,
            fallProgress: 0,
            fallDuration: 0.32, // Quick arcade drop ~0.32s
            startY,
            // Countdown fuse
            timer: 0,
            fuseDuration: 3.0, // Exactly 3 seconds countdown
            isExploded: false
        };

        this._activeBombs.push(bombData);

        // If no more bombs, exit targeting mode automatically
        if (this._bombCount <= 0) {
            this.setTargeting(false);
        }
    }

    update(dt) {
        // 1. Update reticle gentle pulsing rotation (around vertical Y axis)
        if (this._reticleMesh && this._reticleMesh.visible) {
            this._reticleMesh.rotation.y += dt * 3.5;
        }

        // 2. Update active bombs
        for (let i = this._activeBombs.length - 1; i >= 0; i--) {
            const b = this._activeBombs[i];
            if (b.isExploded) continue;

            if (b.isFalling) {
                b.fallProgress += dt / b.fallDuration;
                if (b.fallProgress >= 1.0) {
                    b.fallProgress = 1.0;
                    b.isFalling = false;
                    b.group.position.y = b.targetY;
                    b.group.scale.set(1, 1, 1);
                    // Arcade ground impact slam sound & particle dust
                    playSound(220, 0.35);
                    if (cellParticles) {
                        cellParticles.trigger(b.targetX, b.targetZ, false);
                    }
                } else {
                    const p = b.fallProgress;
                    // Ease-in quad drop
                    const curY = b.startY - (b.startY - b.targetY) * (p * p);
                    b.group.position.y = curY;
                    // Squash and stretch back to normal sphere
                    const sx = 0.2 + 0.8 * p;
                    const sy = 2.0 - 1.0 * p;
                    b.group.scale.set(sx, sy, sx);
                }
            } else {
                // Grounded countdown (3 seconds)
                b.timer += dt;
                const progress = Math.min(1.0, b.timer / b.fuseDuration);

                // Update circular progress ring
                if (b.ringMesh && b.ringMesh.material && b.ringMesh.material.uniforms) {
                    b.ringMesh.material.uniforms.uProgress.value = progress;
                    b.ringMesh.material.uniforms.uTime.value = performance.now() * 0.001;
                }

                // Bomb body fast warning pulse (accelerates as countdown completes)
                const pulseFreq = 4.0 + progress * 16.0;
                const pulse = 0.5 + 0.5 * Math.sin(b.timer * pulseFreq * Math.PI * 2);
                if (b.sphereMesh && b.sphereMesh.material) {
                    b.sphereMesh.material.emissiveIntensity = 0.3 + pulse * 1.8;
                    // Gentle scale heartbeat
                    const scalePulse = 1.0 + pulse * 0.12;
                    b.group.scale.set(scalePulse, scalePulse, scalePulse);
                }

                // Periodic beeping sound speeding up
                if (!b._lastBeepTime || b.timer - b._lastBeepTime > Math.max(0.12, 0.6 - progress * 0.48)) {
                    b._lastBeepTime = b.timer;
                    playSound(700 + progress * 800, 0.08);
                }

                // Fuse complete -> DETONATE!
                if (b.timer >= b.fuseDuration) {
                    this._detonate(b);
                    this._activeBombs.splice(i, 1);
                }
            }
        }

        // 3. Update expanding shockwave blasts
        for (let j = this._activeBlasts.length - 1; j >= 0; j--) {
            const blast = this._activeBlasts[j];
            blast.elapsed += dt;
            const t = blast.elapsed / blast.duration;
            if (t >= 1.0) {
                this._parentGroup.remove(blast.mesh);
                blast.mesh.material.dispose();
                this._activeBlasts.splice(j, 1);
            } else {
                const curRadius = blast.maxRadius * Math.sin(t * Math.PI * 0.5);
                blast.mesh.scale.set(curRadius, 1, curRadius);
                blast.mesh.material.opacity = (1.0 - t) * 0.95;
            }
        }
    }

    _detonate(bomb) {
        bomb.isExploded = true;
        const { gridX, gridY, targetX, targetY, targetZ } = bomb;

        // 1. Play massive explosion sound
        playSound(85, 0.85); // Heavy bass boom
        setTimeout(() => playSound(140, 0.6), 60);

        // 2. High-energy explosive particle shatter (radial 48 pieces)
        if (cellParticles) {
            cellParticles.shatter(targetX, targetY, targetZ, 48);
            setTimeout(() => cellParticles.shatter(targetX, targetY + 0.02, targetZ, 32), 40);
        }

        // 3. Expanding shockwave ring mesh (radius ~3 tiles = ~0.085 units)
        const blastRadius = this._tileWidth * 3.4;
        const blastMesh = new THREE.Mesh(this._blastGeo, this._blastMat.clone());
        blastMesh.position.set(targetX, 0.005, targetZ);
        blastMesh.scale.set(0.001, 1, 0.001);
        this._parentGroup.add(blastMesh);
        this._activeBlasts.push({
            mesh: blastMesh,
            elapsed: 0,
            duration: 0.45, // Crisp 450ms blast wave
            maxRadius: blastRadius
        });

        // Notify systems (e.g., enemies) of detonation blast
        eventBus.emit('bomb:detonated', { x: targetX, z: targetZ, radius: blastRadius });

        // 4. Remove bomb mesh from scene
        this._parentGroup.remove(bomb.group);
        if (bomb.ringMesh && bomb.ringMesh.material) bomb.ringMesh.material.dispose();
        if (bomb.sphereMesh && bomb.sphereMesh.material) bomb.sphereMesh.material.dispose();

        // 5. UN-MARK / UN-CONQUER all tiles within explosion blast radius!
        // "upewnij sie ze bomby po wybuchu odznaczaja kafelki"
        if (this._tileManager) {
            this._tileManager.unconquerTilesInRadius(targetX, targetZ, blastRadius);
        }

        // 6. Check player ball proximity! If ball is within explosion radius -> instant destruction
        if (this._ballController && this._ballController.mesh && this._ballController.isActive()) {
            const ballPos = this._ballController.mesh.position;
            const distToBall = Math.hypot(ballPos.x - targetX, ballPos.z - targetZ);
            const blastDangerRadius = blastRadius * 0.95;

            if (distToBall <= blastDangerRadius) {
                // Ball caught in explosion! Shatter ball and lose life
                eventBus.emit('laser:hit', {
                    x: ballPos.x,
                    z: ballPos.z,
                    reason: 'bomb_blast'
                });
            }
        }
    }

    reset() {
        this.setTargeting(false);
        this._bombCount = 0;
        eventBus.emit('bomb:countChanged', { count: 0 });

        for (const b of this._activeBombs) {
            this._parentGroup.remove(b.group);
            if (b.ringMesh && b.ringMesh.material) b.ringMesh.material.dispose();
            if (b.sphereMesh && b.sphereMesh.material) b.sphereMesh.material.dispose();
        }
        this._activeBombs = [];

        for (const blast of this._activeBlasts) {
            this._parentGroup.remove(blast.mesh);
            blast.mesh.material.dispose();
        }
        this._activeBlasts = [];
    }

    dispose() {
        this.reset();
        if (this._reticleMesh) {
            this._parentGroup.remove(this._reticleMesh);
            this._reticleMesh.geometry.dispose();
            this._reticleMesh.material.dispose();
            this._reticleMesh = null;
        }
        if (this._bombGeo) this._bombGeo.dispose();
        if (this._bombCapGeo) this._bombCapGeo.dispose();
        if (this._bombMat) this._bombMat.dispose();
        if (this._bombCapMat) this._bombCapMat.dispose();
        if (this._blastGeo) this._blastGeo.dispose();
        if (this._blastMat) this._blastMat.dispose();

        this._unsubs.forEach(u => u());
        this._unsubs = [];
    }
}
