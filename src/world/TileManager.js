import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import {
    createCheckerboardTileMaterials,
    createTileMaterial,
    TILE_COLORS,
    MULTICOLOR_PALETTE,
    disposeTileMaterials
} from '../materials/tileMaterials.js';
import {
    createMultiColourTileMaterial,
    updateMultiColourMaterialTime,
    disposeMultiColourTileMaterial
} from '../materials/multiColourMaterial.js';
import {
    createGradientTileMaterial,
    updateGradientMaterialTime,
    disposeGradientTileMaterial
} from '../materials/gradientTileMaterial.js';
import { bufferGeometryFactory } from '../rendering/BufferGeometryFactory.js';
import { glbGeometryCache } from '../rendering/GLBGeometryCache.js';
import { ArcadeSlotCounter } from '../ui/ArcadeSlotCounter.js';
import { playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';
import {
    CELL_TYPES,
    COUNTDOWN_STATES,
    MULTICOLOUR_STATES,
    MULTICOLOUR_CONFIG,
    COUNTDOWN_CONFIG,
    GRADIENT_STATES,
    GRADIENT_CONFIG,
    GREEN_STATES,
    GREEN_CONFIG
} from '../cells/CellTypes.js';

/**
 * Attempts to load cellPlainTile.glb via centralized glbGeometryCache.
 * Returns null if the file cannot be loaded, triggering procedural placeholder fallback.
 */
export async function loadPlainTileGLB() {
    return glbGeometryCache.loadGLTF('cellPlainTile');
}

export class TileManager {
    constructor() {
        this.group = new THREE.Group();
        this.instancedMesh = null; // Primary mesh / alias
        this.instancedMeshPink = null;
        this.instancedMeshPurple = null;
        this.instancedMeshes = null; // { pink, purple }
        this.isUsingGLBTiles = false;
        this._tileGeometry = null;
        this._materials = null; // { pink, purple }
        this._tileMap = []; // Maps grid cell index to { index, gridX, gridY, isPink, mesh, localIndex, defaultColor, conqueredColor, pos }
        this._textureLoader = null;
        this._envMap = null;

        this.tilesX = GAME_CONFIG.grid.tilesX;
        this.tilesY = GAME_CONFIG.grid.tilesY;
        this.tableWidth = GAME_CONFIG.table.width;
        this.tableHeight = GAME_CONFIG.table.height;
        this.tileWidth = this.tableWidth / this.tilesX;
        this.tileHeight = this.tableHeight / this.tilesY;
        this.visitedTiles = new Set();
        this.activeFlashes = new Map();
        
        this._defaultPinkColor = new THREE.Color(TILE_COLORS.defaultPink);
        this._defaultPurpleColor = new THREE.Color(TILE_COLORS.defaultPurple);
        this._conqueredPinkColor = new THREE.Color(TILE_COLORS.conqueredPink);
        this._conqueredPurpleColor = new THREE.Color(TILE_COLORS.conqueredPurple);
        this._flashColor = new THREE.Color(TILE_COLORS.flash);
        this._obstacleColor = new THREE.Color(TILE_COLORS.obstacle);
        this._shopColor = new THREE.Color(TILE_COLORS.shop || 0xffb703);
        this._greenColor = new THREE.Color(TILE_COLORS.green || 0x00E676);
        this._tempColor = new THREE.Color();
        this._dummy = new THREE.Object3D();
        this.obstacleTiles = new Set();
        this.shopTileIndex = -1;
        this.shopTileGridX = -1;
        this.shopTileGridY = -1;
        this._pendingStageComplete = null;

        // Special Interactive Tile Systems
        // Countdown Tiles: player ball stands on tile for N seconds -> captures tile and 8 surrounding tiles
        this.countdownTiles = new Map(); // index -> { index, gridX, gridY, totalTime: 4, remainingTime: 4, isPlayerStanding: false, labelId, counter, pos }
        // MultiColour Tiles: player ball passes through N times swapping palette colors -> captures tile with red on final pass
        this.multicolourTiles = new Map(); // index -> { index, gridX, gridY, colorIndex: 0, palette: [...], remainingPasses: 5, wasBallInside: false, labelId, counter, pos }
        // Gradient Tiles: special animated multi-stop flowing gradient shader tiles
        this.gradientTiles = new Map(); // index -> { index, gridX, gridY, state, mesh, material, colors, pos }
        // Green Tiles: newly distributed green cells with radiant pulse and high-score capture
        this.greenTiles = new Map(); // index -> { index, gridX, gridY, state, color, pos }

        this.scene = null;
        this.labelSystem = null;

        // Batched highlight aura quads for glowing discovered tiles (1 single draw call!)
        this._highlightGroup = new THREE.Group();
        this._highlightGroup.name = 'TileHighlightAurasGroup';
        this.group.add(this._highlightGroup);
        this._highlightCapacity = 48;
        this._highlightInstancedMesh = null;
        this._highlightFreeList = [];
        this._activeHighlights = []; // { slotIndex, life, maxLife, posX, posZ }
        this._highlightGeom = null;
        this._highlightMat = null;
    }

    init(scene, textureLoader, envMap = null, labelSystem = null) {
        this.scene = scene;
        this.labelSystem = labelSystem;
        this._textureLoader = textureLoader;
        this._envMap = envMap;

        // 1. Initialize paired checkerboard materials (pink frosting & lavender-violet glaze with imperfections map)
        this._materials = createCheckerboardTileMaterials(textureLoader, envMap);

        // 2. Setup initial procedural tile geometry placeholder using BufferGeometryFactory
        this._tileGeometry = bufferGeometryFactory.createPlaneXZ(
            this.tileWidth * 0.95, 
            this.tileHeight * 0.95
        );

        // 3. Build checkerboard InstancedMeshes (pink and purple)
        this._buildCheckerboardMeshes();

        // 4. Setup batched highlight halo InstancedMesh (1 single draw call for all tile halos!)
        this._setupHighlightSystem();

        // 5. Asynchronously load cellPlainTile.glb and seamlessly swap geometry into InstancedMeshes
        this._initGLBTileModel();

        return this.group;
    }

    _setupHighlightSystem() {
        if (this._highlightInstancedMesh) {
            this._highlightGroup.remove(this._highlightInstancedMesh);
            this._highlightInstancedMesh.dispose();
            this._highlightInstancedMesh = null;
        }

        this._highlightGeom = bufferGeometryFactory.createPlaneXZ(
            this.tileWidth * 1.45, 
            this.tileHeight * 1.45
        );

        if (!this._highlightMat) {
            let highlightTexture = null;
            if (typeof document !== 'undefined' && document.createElement) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 64;
                    canvas.height = 64;
                    const ctx = canvas.getContext && canvas.getContext('2d');
                    if (ctx) {
                        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                        grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                        grad.addColorStop(0.35, 'rgba(255, 235, 175, 0.90)');
                        grad.addColorStop(0.7, 'rgba(255, 180, 75, 0.40)');
                        grad.addColorStop(1, 'rgba(255, 140, 0, 0.0)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(0, 0, 64, 64);
                        highlightTexture = new THREE.CanvasTexture(canvas);
                    }
                } catch (_) {}
            }

            this._highlightMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                map: highlightTexture,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
        }

        this._highlightInstancedMesh = new THREE.InstancedMesh(
            this._highlightGeom,
            this._highlightMat,
            this._highlightCapacity
        );
        this._highlightInstancedMesh.name = 'TileHighlights_Instanced';
        this._highlightInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this._highlightInstancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(this._highlightCapacity * 3), 3
        );
        this._highlightInstancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        this._highlightFreeList = [];
        this._activeHighlights = [];

        // Initialize all slots to zero scale offscreen
        const dummy = this._dummy;
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();

        const black = new THREE.Color(0x000000);
        for (let i = 0; i < this._highlightCapacity; i++) {
            this._highlightInstancedMesh.setMatrixAt(i, dummy.matrix);
            this._highlightInstancedMesh.setColorAt(i, black);
            this._highlightFreeList.push(i);
        }

        this._highlightInstancedMesh.instanceMatrix.needsUpdate = true;
        this._highlightInstancedMesh.instanceColor.needsUpdate = true;
        this._highlightGroup.add(this._highlightInstancedMesh);
    }

    /**
     * Builds or rebuilds the paired InstancedMeshes for the checkerboard pattern.
     * Counts pink and purple instances, constructs the meshes, and anchors them at Y = 0.0006
     * so that the ball touches the top surface of the tiles directly without any floating gap.
     */
    _buildCheckerboardMeshes() {
        const totalTiles = this.tilesX * this.tilesY;
        let countPink = 0;
        let countPurple = 0;

        for (let y = 0; y < this.tilesY; y++) {
            for (let x = 0; x < this.tilesX; x++) {
                if ((x + y) % 2 === 0) countPink++;
                else countPurple++;
            }
        }

        // Clean up previous meshes if present
        if (this.instancedMeshPink) {
            this.group.remove(this.instancedMeshPink);
            this.instancedMeshPink.geometry.dispose();
            this.instancedMeshPink = null;
        }
        if (this.instancedMeshPurple) {
            this.group.remove(this.instancedMeshPurple);
            this.instancedMeshPurple.geometry.dispose();
            this.instancedMeshPurple = null;
        }

        this.instancedMeshPink = new THREE.InstancedMesh(this._tileGeometry, this._materials.pink, countPink);
        this.instancedMeshPink.name = 'Tiles_Pink';
        this.instancedMeshPink.receiveShadow = true;
        this.instancedMeshPink.castShadow = false;

        this.instancedMeshPurple = new THREE.InstancedMesh(this._tileGeometry, this._materials.purple, countPurple);
        this.instancedMeshPurple.name = 'Tiles_Purple';
        this.instancedMeshPurple.receiveShadow = true;
        this.instancedMeshPurple.castShadow = false;

        this.instancedMesh = this.instancedMeshPink; // Alias for single-mesh consumers
        this.instancedMeshes = {
            pink: this.instancedMeshPink,
            purple: this.instancedMeshPurple
        };

        this._tileMap = new Array(totalTiles);
        let nextPink = 0;
        let nextPurple = 0;

        // Tile height offset: elevated to Y=0.0006 so the ball (bottom Y=0.0) rests directly on the tiles
        const posY = 0.0006;

        for (let y = 0; y < this.tilesY; y++) {
            for (let x = 0; x < this.tilesX; x++) {
                const i = this.getTileIndex(x, y);
                const pos = this.getTileWorldPos(x, y);
                const isPink = (x + y) % 2 === 0;

                const mesh = isPink ? this.instancedMeshPink : this.instancedMeshPurple;
                const localIndex = isPink ? nextPink++ : nextPurple++;
                const defaultColor = isPink ? this._defaultPinkColor : this._defaultPurpleColor;
                const conqueredColor = isPink ? this._conqueredPinkColor : this._conqueredPurpleColor;

                this._dummy.position.set(pos.x, posY, pos.z);
                this._dummy.rotation.set(0, 0, 0);
                this._dummy.scale.set(1, 1, 1);
                this._dummy.updateMatrix();

                mesh.setMatrixAt(localIndex, this._dummy.matrix);

                // Check if already obstacle, countdown, multicolour, shop, or conquered
                let initialColor = defaultColor;
                if (this.obstacleTiles.has(i)) {
                    initialColor = this._obstacleColor;
                } else if (this.countdownTiles.has(i)) {
                    initialColor = new THREE.Color(TILE_COLORS.countdown);
                } else if (this.multicolourTiles.has(i)) {
                    const multiData = this.multicolourTiles.get(i);
                    initialColor = new THREE.Color(multiData.palette[multiData.colorIndex] || MULTICOLOR_PALETTE[0]);
                } else if (this.greenTiles.has(i)) {
                    initialColor = this._greenColor;
                } else if (this.visitedTiles.has(i)) {
                    initialColor = conqueredColor;
                }
                mesh.setColorAt(localIndex, initialColor);

                this._tileMap[i] = {
                    index: i,
                    gridX: x,
                    gridY: y,
                    isPink,
                    mesh,
                    localIndex,
                    defaultColor,
                    conqueredColor,
                    pos
                };
            }
        }

        this.instancedMeshPink.instanceMatrix.needsUpdate = true;
        this.instancedMeshPink.instanceColor.needsUpdate = true;
        this.instancedMeshPurple.instanceMatrix.needsUpdate = true;
        this.instancedMeshPurple.instanceColor.needsUpdate = true;

        this.group.add(this.instancedMeshPink);
        this.group.add(this.instancedMeshPurple);
    }

    /**
     * Asynchronously loads cellPlainTile.glb, extracts mesh geometry, applies node authored scale,
     * and updates the InstancedMeshes seamlessly preserving all current tile states.
     */
    async _initGLBTileModel() {
        const extractedGeom = await glbGeometryCache.getGeometry('cellPlainTile');
        if (!extractedGeom) {
            console.warn('[TileManager] Could not load cellPlainTile.glb via glbGeometryCache.');
            return;
        }

        this._tileGeometry = extractedGeom;
        this.isUsingGLBTiles = true;
        this._buildCheckerboardMeshes();
    }

    _triggerTileFlash(gridX, gridY, index) {
        // Extended illumination: hold peak HDR glow for 0.35s, then softly decay over 1.40s (total ~1.75s)
        this.activeFlashes.set(index, {
            hold: 0.35,
            fade: 1.40,
            maxFade: 1.40
        });

        const info = this._tileMap[index];
        if (info && info.mesh) {
            info.mesh.setColorAt(info.localIndex, this._flashColor);
            info.mesh.instanceColor.needsUpdate = true;
        }
        this._spawnTileHighlight(gridX, gridY);
    }

    _spawnTileHighlight(gridX, gridY) {
        if (!this._highlightInstancedMesh) return;

        let slotIndex;
        if (this._highlightFreeList.length > 0) {
            slotIndex = this._highlightFreeList.pop();
        } else if (this._activeHighlights.length > 0) {
            // Reclaim oldest active highlight
            const oldest = this._activeHighlights.shift();
            slotIndex = oldest.slotIndex;
        } else {
            return;
        }

        const worldPos = this.getTileWorldPos(gridX, gridY);
        const dummy = this._dummy;
        dummy.position.set(worldPos.x, 0.0035, worldPos.z);
        dummy.scale.set(0.6, 1.0, 0.6);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();

        this._highlightInstancedMesh.setMatrixAt(slotIndex, dummy.matrix);
        this._tempColor.setRGB(1.0, 1.0, 1.0);
        this._highlightInstancedMesh.setColorAt(slotIndex, this._tempColor);

        this._highlightInstancedMesh.instanceMatrix.needsUpdate = true;
        if (this._highlightInstancedMesh.instanceColor) {
            this._highlightInstancedMesh.instanceColor.needsUpdate = true;
        }

        this._activeHighlights.push({
            slotIndex,
            life: 1.60,
            maxLife: 1.60,
            posX: worldPos.x,
            posZ: worldPos.z
        });
    }

    update(dt) {
        if (!dt || dt <= 0) return;

        // 1. Tile HDR emissive flash decay with extended hold plateau and soft exponential fade
        if (this.activeFlashes.size > 0) {
            let updatedPink = false;
            let updatedPurple = false;

            for (const [index, flash] of this.activeFlashes.entries()) {
                const info = this._tileMap[index];
                if (!info) continue;

                if (flash.hold > 0) {
                    if (dt >= flash.hold) {
                        const leftoverDt = dt - flash.hold;
                        flash.hold = 0;
                        flash.fade = Math.max(0, flash.fade - leftoverDt);
                    } else {
                        flash.hold -= dt;
                    }
                } else {
                    flash.fade -= dt;
                }

                if (flash.hold > 0) {
                    info.mesh.setColorAt(info.localIndex, this._flashColor);
                } else if (flash.fade <= 0) {
                    this.activeFlashes.delete(index);
                    const targetColor = (index === this.shopTileIndex) ? this._shopColor : info.conqueredColor;
                    info.mesh.setColorAt(info.localIndex, targetColor);
                } else {
                    const progress = flash.fade / flash.maxFade; // 1.0 -> 0.0
                    const curved = progress * progress; // Smooth lingering decay
                    const baseColor = (index === this.shopTileIndex) ? this._shopColor : info.conqueredColor;
                    this._tempColor.copy(baseColor).lerp(this._flashColor, curved);
                    info.mesh.setColorAt(info.localIndex, this._tempColor);
                }

                if (info.isPink) updatedPink = true;
                else updatedPurple = true;
            }

            if (updatedPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
                this.instancedMeshPink.instanceColor.needsUpdate = true;
            }
            if (updatedPurple && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
                this.instancedMeshPurple.instanceColor.needsUpdate = true;
            }
        }

        // 2. Additive tile highlight quads decay & expansion in 1 single draw call!
        if (this._activeHighlights.length > 0 && this._highlightInstancedMesh) {
            const dummy = this._dummy;
            let dirty = false;

            for (let i = this._activeHighlights.length - 1; i >= 0; i--) {
                const item = this._activeHighlights[i];
                item.life -= dt;
                if (item.life <= 0) {
                    dummy.position.set(0, -999, 0);
                    dummy.scale.set(0, 0, 0);
                    dummy.updateMatrix();
                    this._highlightInstancedMesh.setMatrixAt(item.slotIndex, dummy.matrix);
                    this._tempColor.setRGB(0, 0, 0);
                    this._highlightInstancedMesh.setColorAt(item.slotIndex, this._tempColor);
                    this._highlightFreeList.push(item.slotIndex);
                    this._activeHighlights.splice(i, 1);
                    dirty = true;
                } else {
                    const progress = 1.0 - (item.life / item.maxLife);
                    const scale = 0.6 + progress * 0.9;
                    const fade = progress < 0.25 ? 1.0 : Math.max(0, 1.0 - Math.pow((progress - 0.25) / 0.75, 1.5));

                    dummy.position.set(item.posX, 0.0035, item.posZ);
                    dummy.scale.set(scale, 1.0, scale);
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();

                    this._highlightInstancedMesh.setMatrixAt(item.slotIndex, dummy.matrix);
                    this._tempColor.setRGB(fade, fade, fade);
                    this._highlightInstancedMesh.setColorAt(item.slotIndex, this._tempColor);
                    dirty = true;
                }
            }

            if (dirty) {
                this._highlightInstancedMesh.instanceMatrix.needsUpdate = true;
                if (this._highlightInstancedMesh.instanceColor) {
                    this._highlightInstancedMesh.instanceColor.needsUpdate = true;
                }
            }
        }

        // 3. Update active Countdown Tiles standing timer
        if (this.countdownTiles.size > 0) {
            for (const [index, cd] of Array.from(this.countdownTiles.entries())) {
                if (cd.state === COUNTDOWN_STATES.COMPLETED || cd.state === COUNTDOWN_STATES.DISABLED) {
                    continue;
                }

                if (cd.isPlayerStanding) {
                    cd.state = COUNTDOWN_STATES.ACTIVE;
                    const prevSec = Math.ceil(cd.remainingTime);
                    cd.remainingTime = Math.max(0, cd.remainingTime - dt);
                    const newSec = Math.ceil(cd.remainingTime);

                    if (newSec !== prevSec && newSec >= 0) {
                        if (cd.counter) {
                            cd.counter.setValue(newSec);
                            if (newSec <= 1) {
                                cd.counter.setWarningState();
                            }
                        }
                        // Musical ticking pulse
                        playSound(1100 + (cd.totalTime - newSec) * 120, 0.08);
                        const pos = this.getTileWorldPos(cd.gridX, cd.gridY);
                        try {
                            cellParticles.trigger(pos.x, 0.005, pos.z, 5);
                        } catch (_) {}
                    }

                    if (cd.remainingTime <= 0) {
                        this._completeCountdownTile(index, cd);
                    }
                } else if (cd.state === COUNTDOWN_STATES.ACTIVE) {
                    cd.state = COUNTDOWN_STATES.INTERRUPTED;
                }
            }
        }

        // 4. Update animated wave gradient time on MultiColour tile materials
        if (this.multicolourTiles.size > 0) {
            for (const mc of this.multicolourTiles.values()) {
                if (mc.material) {
                    updateMultiColourMaterialTime(dt, mc.material);
                }
                // Update mesh vertical squish recovery animation
                if (mc.mesh && mc._squishAnim > 0) {
                    mc._squishAnim = Math.max(0, mc._squishAnim - dt * 6.0);
                    const scaleY = 1.0 - mc._squishAnim * 0.45;
                    const scaleXZ = 1.0 + mc._squishAnim * 0.12;
                    mc.mesh.scale.set(scaleXZ, scaleY, scaleXZ);
                }
            }
        }

        // 5. Update flowing time uniform on Gradient tile materials
        if (this.gradientTiles.size > 0) {
            for (const gt of this.gradientTiles.values()) {
                if (gt.material) {
                    updateGradientMaterialTime(dt, gt.material);
                }
            }
        }
    }

    conquerTile(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        this.visitedTiles.add(index);
        this._triggerTileFlash(gridX, gridY, index);
        const worldPos = this.getTileWorldPos(gridX, gridY);
        const totalPlayable = this.getTotalPlayableTiles();
        const totalDiscovered = this.visitedTiles.size;
        const remaining = Math.max(0, totalPlayable - totalDiscovered);

        eventBus.emit('tile:discovered', {
            gridX,
            gridY,
            index,
            tileIndex: index,
            x: worldPos.x,
            z: worldPos.z,
            totalDiscovered,
            total: totalPlayable,
            remaining
        });

        eventBus.emit('tiles:changed', {
            discovered: totalDiscovered,
            total: totalPlayable,
            remaining
        });

        if (remaining === 0 && totalPlayable > 0) {
            if (this.isShopTile(gridX, gridY)) {
                this._pendingStageComplete = {
                    discovered: totalDiscovered,
                    total: totalPlayable
                };
            } else {
                eventBus.emit('stage:completed', {
                    discovered: totalDiscovered,
                    total: totalPlayable
                });
            }
        }
        return true;
    }

    checkAndUpdate(ballPhysX, ballPhysZ, dt = null) {
        const { gridX, gridY } = this.getTileGridPosFromPhysics(ballPhysX, ballPhysZ);
        
        if (gridX >= 0 && gridX < this.tilesX && gridY >= 0 && gridY < this.tilesY) {
            const index = this.getTileIndex(gridX, gridY);
            
            if (!this.isObstacle(gridX, gridY) && !this.visitedTiles.has(index)) {
                // Check if this is a MultiColour cell
                if (this.multicolourTiles.has(index)) {
                    this._handleMultiColourTileContact(index, gridX, gridY);
                } 
                // Check if this is a Countdown cell
                else if (this.countdownTiles.has(index)) {
                    // Ball is currently on countdown tile; timer updates in update()
                    this._handleCountdownTileContact(index, true);
                }
                // Check if this is an interactive Gradient cell
                else if (this.gradientTiles.has(index)) {
                    this._handleGradientTileContact(index, gridX, gridY);
                }
                // Check if this is a Green cell
                else if (this.greenTiles.has(index)) {
                    this._handleGreenTileContact(index, gridX, gridY);
                }
                // Normal tile
                else {
                    this.conquerTile(gridX, gridY);
                }
            }
        } else {
            // Ball is off-grid; clear active countdown contact
            this._clearCountdownStanding();
        }

        // Check if ball left any countdown tile
        this._updateCountdownTileAbsence(gridX, gridY);
        // Check if ball left any multicolour tile (to reset pass-through trigger)
        this._updateMultiColourTileAbsence(gridX, gridY);
        
        if (dt) {
            this.update(dt);
        }
    }

    _handleCountdownTileContact(index, isContact) {
        const cd = this.countdownTiles.get(index);
        if (!cd) return;
        cd.isPlayerStanding = isContact;
    }

    _updateCountdownTileAbsence(currentGX, currentGY) {
        for (const [index, cd] of this.countdownTiles.entries()) {
            if (cd.gridX !== currentGX || cd.gridY !== currentGY) {
                if (cd.isPlayerStanding) {
                    cd.isPlayerStanding = false;
                    if (cd.interruptionMode === 'reset') {
                        cd.remainingTime = cd.totalTime;
                        if (cd.counter) {
                            cd.counter.setValue(Math.ceil(cd.totalTime));
                        }
                    }
                    if (cd.state === COUNTDOWN_STATES.ACTIVE) {
                        cd.state = COUNTDOWN_STATES.INTERRUPTED;
                    }
                }
            }
        }
    }

    _clearCountdownStanding() {
        for (const cd of this.countdownTiles.values()) {
            if (cd.isPlayerStanding) {
                cd.isPlayerStanding = false;
                if (cd.interruptionMode === 'reset') {
                    cd.remainingTime = cd.totalTime;
                    if (cd.counter) {
                        cd.counter.setValue(Math.ceil(cd.totalTime));
                    }
                }
                if (cd.state === COUNTDOWN_STATES.ACTIVE) {
                    cd.state = COUNTDOWN_STATES.INTERRUPTED;
                }
            }
        }
    }

    _handleMultiColourTileContact(index, gridX, gridY) {
        const mc = this.multicolourTiles.get(index);
        if (!mc) return;

        // Ball just entered the tile (prevent repeating on every frame while inside)
        if (!mc.wasBallInside) {
            mc.wasBallInside = true;
            this._advanceMultiColourTile(index, mc);
        }
    }

    _updateMultiColourTileAbsence(currentGX, currentGY) {
        for (const [index, mc] of this.multicolourTiles.entries()) {
            if (mc.gridX !== currentGX || mc.gridY !== currentGY) {
                mc.wasBallInside = false;
            }
        }
    }

    _advanceMultiColourTile(index, mc) {
        // If cell is already waiting for the final capture pass, this pass completes the capture!
        if (mc.state === MULTICOLOUR_STATES.READY_FOR_FINAL_CAPTURE || mc.remainingPasses <= 0) {
            this._captureMultiColourTile(index, mc);
            return;
        }

        mc.state = MULTICOLOUR_STATES.COLOUR_TRANSITION;
        mc.remainingPasses--;
        mc._squishAnim = 1.0; // Trigger vertical squish animation

        const isExhausted = mc.remainingPasses === 0;

        if (!isExhausted) {
            mc.colorIndex = (mc.colorIndex + 1) % mc.palette.length;
            const nextHex = mc.palette[mc.colorIndex];
            const hexStr = '#' + nextHex.toString(16).padStart(6, '0');

            // Play musical arcade color blip
            playSound(850 + (mc.palette.length - mc.remainingPasses) * 140, 0.12);

            // Update tile color in instanced mesh
            const info = this._tileMap[index];
            if (info && info.mesh) {
                this._tempColor.setHex(nextHex);
                info.mesh.setColorAt(info.localIndex, this._tempColor);
                if (info.isPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
                    this.instancedMeshPink.instanceColor.needsUpdate = true;
                } else if (!info.isPink && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
                    this.instancedMeshPurple.instanceColor.needsUpdate = true;
                }
            }

            // Update custom shader uniforms
            if (mc.material && mc.material.userData) {
                mc.material.userData.uActiveColorIndex.value = mc.colorIndex;
                mc.material.userData.uTouchProgress.value = 1.0;
                mc.material.userData.uTouchFlash.value = 1.0;
            }

            // Particle pop on color swap
            const pos = this.getTileWorldPos(mc.gridX, mc.gridY);
            try {
                cellParticles.trigger(pos.x, 0.005, pos.z, 8);
            } catch (_) {}

            // Update arcade slot counter
            if (mc.counter) {
                mc.counter.setValue(mc.remainingPasses);
                mc.counter.setColor(hexStr);
            }

            mc.state = MULTICOLOUR_STATES.WAITING_FOR_EXIT;
        } else {
            // All colour stages exhausted!
            // Cell enters 'readyForFinalCapture' state: edge rhythmic pulse, 0 displayed on counter,
            // subtle red hint without marking as owned, waiting for final pass
            mc.state = MULTICOLOUR_STATES.READY_FOR_FINAL_CAPTURE;

            playSound(1250, 0.2);

            if (mc.material && mc.material.userData) {
                mc.material.userData.uReadyPulse.value = 1.0;
                mc.material.userData.uTouchFlash.value = 1.2;
            }

            const pos = this.getTileWorldPos(mc.gridX, mc.gridY);
            try {
                cellParticles.trigger(pos.x, 0.005, pos.z, 14);
            } catch (_) {}

            if (mc.counter) {
                mc.counter.setValue(0);
                mc.counter.setWarningState();
                mc.counter.setPrefix('⚡');
            }
        }
    }

    _captureMultiColourTile(index, mc) {
        mc.state = MULTICOLOUR_STATES.CAPTURED;
        const pos = this.getTileWorldPos(mc.gridX, mc.gridY);

        if (mc.counter) {
            mc.counter.playExitAnimation(() => {
                if (this.labelSystem && mc.labelId !== null) {
                    this.labelSystem.removeLabel(mc.labelId);
                }
                if (mc.anchorObj && mc.anchorObj.parent) {
                    mc.anchorObj.parent.remove(mc.anchorObj);
                }
                mc.counter.dispose();
            });
        }

        if (mc.mesh) {
            this.group.remove(mc.mesh);
            if (mc.mesh.geometry && mc.mesh.geometry !== this._tileGeometry) {
                mc.mesh.geometry.dispose();
            }
            if (mc.material) {
                mc.material.dispose();
            }
            mc.mesh = null;
        }

        this.multicolourTiles.delete(index);

        // Pop big celebration particles and sound
        try {
            cellParticles.shatter(pos.x, 0.01, pos.z, 22);
        } catch (_) {}
        playSound(1350, 0.25);
        setTimeout(() => playSound(1800, 0.3), 70);

        // Turn into conquered red state
        this.conquerTile(mc.gridX, mc.gridY);
        eventBus.emit('tile:multicolour_conquered', {
            gridX: mc.gridX,
            gridY: mc.gridY,
            index,
            points: 300
        });
    }

    _handleGradientTileContact(index, gridX, gridY) {
        const gt = this.gradientTiles.get(index);
        if (!gt) return;

        // Flash and conquer on contact
        this._captureGradientTile(index, gt);
    }

    _captureGradientTile(index, gt) {
        gt.state = GRADIENT_STATES.CAPTURED;
        const pos = this.getTileWorldPos(gt.gridX, gt.gridY);

        // Flash pulse on material
        if (gt.material && gt.material.userData) {
            gt.material.userData.uTouchFlash.value = 1.5;
        }

        // Pop sparkling iridescent celebration particles and melodic chime
        try {
            cellParticles.shatter(pos.x, 0.012, pos.z, 24);
        } catch (_) {}
        playSound(1200, 0.2);
        setTimeout(() => playSound(1600, 0.25), 60);

        if (gt.mesh) {
            this.group.remove(gt.mesh);
            if (gt.mesh.geometry && gt.mesh.geometry !== this._tileGeometry) {
                gt.mesh.geometry.dispose();
            }
            if (gt.material) {
                gt.material.dispose();
            }
            gt.mesh = null;
        }

        this.gradientTiles.delete(index);

        // Turn into player-occupied conquered state
        this.conquerTile(gt.gridX, gt.gridY);
        eventBus.emit('tile:gradient_conquered', {
            gridX: gt.gridX,
            gridY: gt.gridY,
            index,
            points: GRADIENT_CONFIG.scorePoints || 200
        });
    }

    _handleGreenTileContact(index, gridX, gridY) {
        const greenData = this.greenTiles.get(index);
        if (!greenData) return;
        this._captureGreenTile(index, greenData);
    }

    _captureGreenTile(index, greenData) {
        greenData.state = GREEN_STATES.CAPTURED;
        const pos = this.getTileWorldPos(greenData.gridX, greenData.gridY);

        // Pop emerald burst particles and high-pitch victory chirp
        try {
            cellParticles.trigger(pos.x, 0.01, pos.z, 20);
        } catch (_) {}
        playSound(1400, 0.22);
        setTimeout(() => playSound(1900, 0.26), 55);

        this.greenTiles.delete(index);

        // Turn into player-occupied conquered state
        this.conquerTile(greenData.gridX, greenData.gridY);
        eventBus.emit('tile:green_conquered', {
            gridX: greenData.gridX,
            gridY: greenData.gridY,
            index,
            points: GREEN_CONFIG.scorePoints || 175
        });
    }

    _completeCountdownTile(index, cd) {
        cd.state = COUNTDOWN_STATES.COMPLETED;
        const centerGX = cd.gridX;
        const centerGY = cd.gridY;
        const centerPos = this.getTileWorldPos(centerGX, centerGY);
        const radius = cd.captureNeighbourRadius !== undefined ? cd.captureNeighbourRadius : 1;

        // Play glorious completion fanfare & shatter particles
        playSound(1400, 0.25);
        setTimeout(() => playSound(1750, 0.25), 80);
        setTimeout(() => playSound(2100, 0.35), 160);

        try {
            cellParticles.shatter(centerPos.x, 0.015, centerPos.z, 32);
        } catch (_) {}

        // Exit counter badge
        if (cd.counter) {
            cd.counter.playExitAnimation(() => {
                if (this.labelSystem && cd.labelId !== null) {
                    this.labelSystem.removeLabel(cd.labelId);
                }
                if (cd.anchorObj && cd.anchorObj.parent) {
                    cd.anchorObj.parent.remove(cd.anchorObj);
                }
                cd.counter.dispose();
            });
        }
        this.countdownTiles.delete(index);

        // Conquer the central countdown tile
        this.conquerTile(centerGX, centerGY);

        // Conquer surrounding cells according to configured radius
        let capturedAround = 0;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx === 0 && dy === 0) continue;
                const gx = centerGX + dx;
                const gy = centerGY + dy;
                if (gx >= 0 && gx < this.tilesX && gy >= 0 && gy < this.tilesY) {
                    const adjIdx = this.getTileIndex(gx, gy);
                    if (!this.isObstacle(gx, gy) && !this.visitedTiles.has(adjIdx)) {
                        // Stagger discovery slightly for awesome cascading arcade wave
                        const distDelay = (Math.abs(dx) + Math.abs(dy)) * 60;
                        setTimeout(() => {
                            this.conquerTile(gx, gy);
                            const adjPos = this.getTileWorldPos(gx, gy);
                            try {
                                cellParticles.trigger(adjPos.x, 0.005, adjPos.z, 6);
                            } catch (_) {}
                        }, distDelay);
                        capturedAround++;
                    }
                }
            }
        }

        eventBus.emit('tile:countdown_conquered', {
            gridX: centerGX,
            gridY: centerGY,
            index,
            capturedAround,
            points: 250
        });
    }

    getTileIndex(gridX, gridY) {
        return gridY * this.tilesX + gridX;
    }

    getTileGridPosFromPhysics(px, pz) {
        const gridX = Math.floor(px / this.tileWidth);
        const gridY = Math.floor(pz / this.tileHeight);
        return { gridX, gridY };
    }

    getTileGridPosFromWorld(wx, wz) {
        const gridX = Math.floor((wx + this.tableWidth / 2) / this.tileWidth);
        const gridY = Math.floor((wz + this.tableHeight / 2) / this.tileHeight);
        return { gridX, gridY };
    }

    getTileGridPos(x, z) {
        if (x > this.tableWidth / 2 || z > this.tableHeight / 2) {
            return this.getTileGridPosFromPhysics(x, z);
        }
        return this.getTileGridPosFromWorld(x, z);
    }

    getTileWorldPos(gridX, gridY) {
        const x = (gridX + 0.5) * this.tileWidth - this.tableWidth / 2;
        const z = (gridY + 0.5) * this.tileHeight - this.tableHeight / 2;
        return { x, z };
    }

    isObstacle(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return true;
        return this.obstacleTiles.has(this.getTileIndex(gridX, gridY));
    }

    setObstacles(obstacleSet) {
        this.obstacleTiles = obstacleSet;
        for (const index of this.obstacleTiles) {
            const info = this._tileMap[index];
            if (info && info.mesh) {
                info.mesh.setColorAt(info.localIndex, this._obstacleColor);
            }
        }
        if (this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        }
        if (this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }
        this.emitTilesChanged();
    }

    rebuild(newTilesX, newTilesY) {
        this.tilesX = newTilesX;
        this.tilesY = newTilesY;
        this.tileWidth = this.tableWidth / this.tilesX;
        this.tileHeight = this.tableHeight / this.tilesY;
        
        this.visitedTiles.clear();
        this.activeFlashes.clear();
        this.obstacleTiles.clear();
        this.shopTileIndex = -1;
        this.shopTileGridX = -1;
        this.shopTileGridY = -1;
        this._pendingStageComplete = null;

        // Rebuild highlight halo system
        this._setupHighlightSystem();

        if (!this.isUsingGLBTiles) {
            this._tileGeometry = bufferGeometryFactory.createPlaneXZ(
                this.tileWidth * 0.95, 
                this.tileHeight * 0.95
            );
        }

        this._buildCheckerboardMeshes();

        eventBus.emit('grid:rebuilt', { tilesX: this.tilesX, tilesY: this.tilesY });
        this.emitTilesChanged();
    }

    reset() {
        this.visitedTiles.clear();
        this.activeFlashes.clear();
        this.shopTileIndex = -1;
        this.shopTileGridX = -1;
        this.shopTileGridY = -1;
        this._pendingStageComplete = null;

        if (this._highlightInstancedMesh) {
            const dummy = this._dummy;
            dummy.position.set(0, -999, 0);
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
            const black = new THREE.Color(0x000000);
            for (let i = 0; i < this._highlightCapacity; i++) {
                this._highlightInstancedMesh.setMatrixAt(i, dummy.matrix);
                this._highlightInstancedMesh.setColorAt(i, black);
            }
            this._highlightInstancedMesh.instanceMatrix.needsUpdate = true;
            if (this._highlightInstancedMesh.instanceColor) {
                this._highlightInstancedMesh.instanceColor.needsUpdate = true;
            }
            this._highlightFreeList = [];
            for (let i = 0; i < this._highlightCapacity; i++) {
                this._highlightFreeList.push(i);
            }
        }
        this._activeHighlights = [];
        
        this._clearSpecialTiles();

        for (let i = 0; i < this._tileMap.length; i++) {
            const info = this._tileMap[i];
            if (!info || !info.mesh) continue;

            if (this.obstacleTiles.has(i)) {
                info.mesh.setColorAt(info.localIndex, this._obstacleColor);
            } else {
                info.mesh.setColorAt(info.localIndex, info.defaultColor);
            }
        }

        if (this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        }
        if (this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }
        this.emitTilesChanged();
    }

    highlightTile(gridX, gridY, color = TILE_COLORS.highlight) {
        const index = this.getTileIndex(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return;

        this._tempColor.set(color);
        info.mesh.setColorAt(info.localIndex, this._tempColor);
        info.mesh.instanceColor.needsUpdate = true;
    }

    unhighlightTile(gridX, gridY) {
        const index = this.getTileIndex(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return;

        let col = info.defaultColor;
        if (this.isShopTile(gridX, gridY)) {
            col = this._shopColor;
        } else if (this.isObstacle(gridX, gridY)) {
            col = this._obstacleColor;
        } else if (this.visitedTiles.has(index)) {
            col = info.conqueredColor;
        }

        info.mesh.setColorAt(info.localIndex, col);
        info.mesh.instanceColor.needsUpdate = true;
    }

    convertTileToShop(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        this.shopTileGridX = gridX;
        this.shopTileGridY = gridY;
        this.shopTileIndex = index;

        const info = this._tileMap[index];
        if (info && info.mesh) {
            info.isShopTile = true;
            info.mesh.setColorAt(info.localIndex, this._shopColor);
            if (info.mesh.instanceColor) {
                info.mesh.instanceColor.needsUpdate = true;
            }
        }
        return true;
    }

    isShopTile(gridX, gridY) {
        return this.shopTileGridX === gridX && this.shopTileGridY === gridY;
    }

    getShopTile() {
        if (this.shopTileIndex >= 0) {
            return {
                gridX: this.shopTileGridX,
                gridY: this.shopTileGridY,
                index: this.shopTileIndex
            };
        }
        return null;
    }

    /**
     * Reverts a tile from being a special Shop Tile back to normal.
     * Clears shop coordinates so that subsequent conquerTile calls treat it as a standard tile.
     */
    revertTileFromShop(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);

        if (this.shopTileIndex === index || (this.shopTileGridX === gridX && this.shopTileGridY === gridY)) {
            this.shopTileIndex = -1;
            this.shopTileGridX = -1;
            this.shopTileGridY = -1;
        }

        const info = this._tileMap[index];
        if (info) {
            info.isShopTile = false;
            if (info.mesh) {
                const targetColor = this.visitedTiles.has(index) ? info.conqueredColor : info.defaultColor;
                info.mesh.setColorAt(info.localIndex, targetColor);
                if (info.mesh.instanceColor) {
                    info.mesh.instanceColor.needsUpdate = true;
                }
            }
        }
        return true;
    }

    _clearSpecialTiles() {
        for (const cd of this.countdownTiles.values()) {
            if (this.labelSystem && cd.labelId !== null) {
                this.labelSystem.removeLabel(cd.labelId);
            }
            if (cd.anchorObj && cd.anchorObj.parent) {
                cd.anchorObj.parent.remove(cd.anchorObj);
            }
            if (cd.counter) {
                cd.counter.dispose();
            }
        }
        this.countdownTiles.clear();

        for (const mc of this.multicolourTiles.values()) {
            if (this.labelSystem && mc.labelId !== null) {
                this.labelSystem.removeLabel(mc.labelId);
            }
            if (mc.anchorObj && mc.anchorObj.parent) {
                mc.anchorObj.parent.remove(mc.anchorObj);
            }
            if (mc.counter) {
                mc.counter.dispose();
            }
            if (mc.mesh) {
                this.group.remove(mc.mesh);
                if (mc.mesh.geometry && mc.mesh.geometry !== this._tileGeometry) {
                    mc.mesh.geometry.dispose();
                }
                if (mc.material) {
                    mc.material.dispose();
                }
                mc.mesh = null;
            }
        }
        this.multicolourTiles.clear();

        for (const gt of this.gradientTiles.values()) {
            if (gt.mesh) {
                this.group.remove(gt.mesh);
                if (gt.mesh.geometry && gt.mesh.geometry !== this._tileGeometry) {
                    gt.mesh.geometry.dispose();
                }
                if (gt.material) {
                    gt.material.dispose();
                }
                gt.mesh = null;
            }
        }
        this.gradientTiles.clear();
        this.greenTiles.clear();
    }

    /**
     * Spawns a Countdown Tile at (gridX, gridY).
     * The player ball must stand on this tile for durationSeconds.
     * When completed, it captures the tile and all 8 surrounding tiles.
     */
    addCountdownTile(gridX, gridY, options = 4) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        const duration = (typeof options === 'number') ? options : (options.durationSeconds || COUNTDOWN_CONFIG.defaultDurationSeconds);
        const interruptionMode = (typeof options === 'object' && options.interruptionMode) ? options.interruptionMode : COUNTDOWN_CONFIG.interruptionMode;
        const captureNeighbourRadius = (typeof options === 'object' && options.captureNeighbourRadius !== undefined) ? options.captureNeighbourRadius : COUNTDOWN_CONFIG.captureNeighbourRadius;
        const reusable = (typeof options === 'object' && options.reusable !== undefined) ? options.reusable : COUNTDOWN_CONFIG.reusable;

        const pos = this.getTileWorldPos(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return false;

        // Visual tile color
        this._tempColor.setHex(TILE_COLORS.countdown);
        info.mesh.setColorAt(info.localIndex, this._tempColor);
        if (info.isPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        } else if (!info.isPink && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }

        const counter = new ArcadeSlotCounter({
            type: 'countdown',
            initialValue: Math.ceil(duration),
            prefix: '⏱️',
            color: '#ffd700',
            badgeBorder: 'rgba(255, 215, 0, 0.75)',
            badgeBg: 'linear-gradient(135deg, rgba(25, 18, 5, 0.94), rgba(45, 32, 10, 0.96))',
            glowColor: 'rgba(255, 215, 0, 0.55)'
        });

        let labelId = null;
        let anchorObj = null;
        if (this.labelSystem) {
            try {
                // Attach label to dummy at tile world coordinates
                anchorObj = new THREE.Object3D();
                anchorObj.position.set(pos.x, 0.008, pos.z);
                this.group.add(anchorObj);

                labelId = this.labelSystem.createLabel(anchorObj, {
                    element: counter.domElement,
                    worldOffset: { x: 0, y: 0.035, z: 0 },
                    category: 'tiles'
                });
            } catch (_) {}
        }

        this.countdownTiles.set(index, {
            index,
            gridX,
            gridY,
            state: COUNTDOWN_STATES.IDLE,
            totalTime: duration,
            remainingTime: duration,
            isPlayerStanding: false,
            interruptionMode,
            captureNeighbourRadius,
            reusable,
            anchorObj,
            labelId,
            counter,
            pos
        });

        return true;
    }

    /**
     * Spawns a MultiColour Tile at (gridX, gridY).
     * The player ball must pass through this tile multiple times (cycles through user palette).
     * On final pass, it is captured by the player and turns red.
     */
    addMultiColourTile(gridX, gridY, options = 5) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        const passCount = (typeof options === 'number') ? options : (options.passCount || (options.colours ? options.colours.length : MULTICOLOUR_CONFIG.totalPasses));
        const rawPalette = (typeof options === 'object' && options.colours) ? options.colours : MULTICOLOUR_CONFIG.defaultColours;
        const requiresFinalCapturePass = (typeof options === 'object' && options.requiresFinalCapturePass !== undefined) ? options.requiresFinalCapturePass : MULTICOLOUR_CONFIG.requiresFinalCapturePass;

        // Ensure palette items are numeric hex integers
        const palette = rawPalette.map(c => typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);

        const pos = this.getTileWorldPos(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return false;

        const initialHex = palette[0];
        const initialHexStr = '#' + initialHex.toString(16).padStart(6, '0');

        // Visual tile color
        this._tempColor.setHex(initialHex);
        info.mesh.setColorAt(info.localIndex, this._tempColor);
        if (info.isPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        } else if (!info.isPink && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }

        // Instantiate a dedicated Mesh using cellPlainTile geometry and custom MultiColour Shader Material
        const multiMaterial = createMultiColourTileMaterial(this._textureLoader, this._envMap, { palette });
        const multiMesh = new THREE.Mesh(this._tileGeometry, multiMaterial);
        multiMesh.name = `MultiColourTile_${index}`;
        multiMesh.position.set(pos.x, 0.00065, pos.z); // Slightly above floor to render smoothly
        multiMesh.receiveShadow = true;
        this.group.add(multiMesh);

        const counter = new ArcadeSlotCounter({
            type: 'multicolor',
            initialValue: passCount,
            prefix: '🎨',
            color: initialHexStr,
            badgeBorder: initialHexStr,
            badgeBg: 'linear-gradient(135deg, rgba(20, 5, 25, 0.94), rgba(35, 10, 40, 0.96))',
            glowColor: initialHexStr
        });

        let labelId = null;
        let anchorObj = null;
        if (this.labelSystem) {
            try {
                anchorObj = new THREE.Object3D();
                anchorObj.position.set(pos.x, 0.008, pos.z);
                this.group.add(anchorObj);

                labelId = this.labelSystem.createLabel(anchorObj, {
                    element: counter.domElement,
                    worldOffset: { x: 0, y: 0.035, z: 0 },
                    category: 'tiles'
                });
            } catch (_) {}
        }

        this.multicolourTiles.set(index, {
            index,
            gridX,
            gridY,
            state: MULTICOLOUR_STATES.IDLE,
            colorIndex: 0,
            palette,
            totalPasses: passCount,
            remainingPasses: passCount,
            requiresFinalCapturePass,
            wasBallInside: false,
            anchorObj,
            labelId,
            counter,
            mesh: multiMesh,
            material: multiMaterial,
            pos
        });

        return true;
    }

    /**
     * Spawns a Gradient Tile at (gridX, gridY).
     * Uses cellPlainTile.glb geometry and the specialized multi-stop flowing gradient shader.
     */
    addGradientTile(gridX, gridY, options = {}) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        const pos = this.getTileWorldPos(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return false;

        const colors = options.colors || GRADIENT_CONFIG.defaultColors;

        // Instantiate dedicated Mesh using cellPlainTile geometry and custom Gradient Shader Material
        const gradientMaterial = createGradientTileMaterial(this._textureLoader, this._envMap, {
            colors,
            flowSpeed: options.flowSpeed || GRADIENT_CONFIG.flowSpeed,
            angle: options.angle !== undefined ? options.angle : GRADIENT_CONFIG.angle,
            frequency: options.frequency || 3.5,
            radial: options.radial || false
        });

        const gradientMesh = new THREE.Mesh(this._tileGeometry, gradientMaterial);
        gradientMesh.name = `GradientTile_${index}`;
        gradientMesh.position.set(pos.x, 0.00065, pos.z);
        gradientMesh.receiveShadow = true;
        this.group.add(gradientMesh);

        this.gradientTiles.set(index, {
            index,
            gridX,
            gridY,
            state: GRADIENT_STATES.IDLE,
            colors,
            mesh: gradientMesh,
            material: gradientMaterial,
            pos
        });

        return true;
    }

    /**
     * Spawns a Green Tile at (gridX, gridY).
     * Renders in vivid emerald green on the tile, and captures upon contact with high-score reward and emerald particles.
     */
    addGreenTile(gridX, gridY, options = {}) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        const pos = this.getTileWorldPos(gridX, gridY);
        const info = this._tileMap[index];
        if (!info || !info.mesh) return false;

        const tileColor = options.color || GREEN_CONFIG.color;
        this._tempColor.setHex(tileColor);
        info.mesh.setColorAt(info.localIndex, this._tempColor);

        if (info.isPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        } else if (!info.isPink && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }

        this.greenTiles.set(index, {
            index,
            gridX,
            gridY,
            state: GREEN_STATES.IDLE,
            color: tileColor,
            pos
        });

        return true;
    }

    /**
     * Procedurally populates special Countdown, MultiColour, and Gradient tiles for the current stage.
     */
    setupStageSpecialTiles(stageNumber = 1) {
        this._clearSpecialTiles();

        // Calculate candidate locations away from spawn
        const spawnX = GAME_CONFIG.spawn.defaultGridX || 9;
        const spawnY = GAME_CONFIG.spawn.defaultGridY || 18;

        const validCandidates = [];
        for (let y = 3; y < this.tilesY - 3; y++) {
            for (let x = 2; x < this.tilesX - 2; x++) {
                const idx = this.getTileIndex(x, y);
                if (this.isObstacle(x, y) || this.isShopTile(x, y) || this.visitedTiles.has(idx)) continue;
                const distToSpawn = Math.hypot(x - spawnX, y - spawnY);
                if (distToSpawn >= 4) {
                    validCandidates.push({ x, y, idx });
                }
            }
        }

        // Shuffle candidates deterministically
        for (let i = validCandidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validCandidates[i], validCandidates[j]] = [validCandidates[j], validCandidates[i]];
        }

        // Spawn 1-2 Countdown Tiles based on stage
        const countdownCount = Math.min(2, Math.max(1, Math.floor(1 + (stageNumber - 1) * 0.3)));
        let spawnedCd = 0;
        for (const cand of validCandidates) {
            if (spawnedCd >= countdownCount) break;
            // Check that surrounding 8 tiles are mostly free
            let obstaclesNear = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (this.isObstacle(cand.x + dx, cand.y + dy)) obstaclesNear++;
                }
            }
            if (obstaclesNear <= 2) {
                this.addCountdownTile(cand.x, cand.y, 4);
                spawnedCd++;
            }
        }

        // Spawn 1-2 MultiColour Tiles based on stage
        const multiCount = Math.min(2, Math.max(1, Math.floor(1 + (stageNumber - 1) * 0.4)));
        let spawnedMc = 0;
        for (const cand of validCandidates) {
            if (spawnedMc >= multiCount) break;
            if (this.countdownTiles.has(cand.idx)) continue;
            this.addMultiColourTile(cand.x, cand.y, 5);
            spawnedMc++;
        }

        // Spawn 1-2 Gradient Tiles based on stage
        const gradientCount = Math.min(2, Math.max(1, Math.floor(1 + (stageNumber - 1) * 0.3)));
        let spawnedGt = 0;
        for (const cand of validCandidates) {
            if (spawnedGt >= gradientCount) break;
            if (this.countdownTiles.has(cand.idx) || this.multicolourTiles.has(cand.idx)) continue;
            this.addGradientTile(cand.x, cand.y, {
                flowSpeed: 1.8 + Math.random() * 0.6,
                angle: Math.random() * Math.PI * 2
            });
            spawnedGt++;
        }

        // Random distribution of Green Tiles across the board
        const minGreen = GREEN_CONFIG.randomMinCount || 2;
        const maxGreen = GREEN_CONFIG.randomMaxCount || 4;
        const greenTargetCount = Math.floor(minGreen + Math.random() * (maxGreen - minGreen + 1));
        let spawnedGreen = 0;
        for (const cand of validCandidates) {
            if (spawnedGreen >= greenTargetCount) break;
            if (this.countdownTiles.has(cand.idx) || 
                this.multicolourTiles.has(cand.idx) || 
                this.gradientTiles.has(cand.idx) ||
                this.greenTiles.has(cand.idx)) continue;
            
            this.addGreenTile(cand.x, cand.y, {
                color: GREEN_CONFIG.color
            });
            spawnedGreen++;
        }
    }

    checkPendingStageComplete() {
        if (this._pendingStageComplete) {
            const data = this._pendingStageComplete;
            this._pendingStageComplete = null;
            eventBus.emit('stage:completed', data);
        }
    }

    isDiscovered(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return true;
        return this.visitedTiles.has(this.getTileIndex(gridX, gridY));
    }

    /**
     * Conquers / uncovers all playable tiles within a blast radius.
     * Used by bombs on explosion to assist the player in uncovering tiles.
     */
    conquerTilesInRadius(centerWorldX, centerWorldZ, radiusWorld) {
        const newlyDiscovered = [];
        const radSq = radiusWorld * radiusWorld;

        const { gridX: centerGX, gridY: centerGY } = this.getTileGridPosFromWorld(centerWorldX, centerWorldZ);
        const cellRadiusX = Math.ceil(radiusWorld / this.tileWidth) + 1;
        const cellRadiusY = Math.ceil(radiusWorld / this.tileHeight) + 1;

        for (let gy = Math.max(0, centerGY - cellRadiusY); gy <= Math.min(this.tilesY - 1, centerGY + cellRadiusY); gy++) {
            for (let gx = Math.max(0, centerGX - cellRadiusX); gx <= Math.min(this.tilesX - 1, centerGX + cellRadiusX); gx++) {
                const index = this.getTileIndex(gx, gy);
                if (this.isObstacle(gx, gy)) continue;

                const pos = this.getTileWorldPos(gx, gy);
                const dx = pos.x - centerWorldX;
                const dz = pos.z - centerWorldZ;
                if (dx * dx + dz * dz <= radSq) {
                    if (!this.visitedTiles.has(index)) {
                        this.visitedTiles.add(index);
                        this._triggerTileFlash(gx, gy, index);
                        newlyDiscovered.push({ index, gridX: gx, gridY: gy, x: pos.x, z: pos.z });

                        eventBus.emit('tile:discovered', {
                            gridX: gx,
                            gridY: gy,
                            index,
                            tileIndex: index,
                            x: pos.x,
                            z: pos.z,
                            fromBomb: true
                        });
                    }
                }
            }
        }

        if (newlyDiscovered.length > 0) {
            this.emitTilesChanged();

            const totalPlayable = this.getTotalPlayableTiles();
            const totalDiscovered = this.visitedTiles.size;
            const remaining = Math.max(0, totalPlayable - totalDiscovered);

            if (remaining === 0 && totalPlayable > 0) {
                eventBus.emit('stage:completed', {
                    discovered: totalDiscovered,
                    total: totalPlayable
                });
            }
        }
        return newlyDiscovered;
    }

    /**
     * Un-conquers / un-marks tiles within a blast radius (reverting to default checkerboard color).
     */
    unconquerTilesInRadius(centerWorldX, centerWorldZ, radiusWorld) {
        const unvisited = [];
        const radSq = radiusWorld * radiusWorld;

        const { gridX: centerGX, gridY: centerGY } = this.getTileGridPosFromWorld(centerWorldX, centerWorldZ);
        const cellRadiusX = Math.ceil(radiusWorld / this.tileWidth) + 1;
        const cellRadiusY = Math.ceil(radiusWorld / this.tileHeight) + 1;

        let updatedPink = false;
        let updatedPurple = false;

        for (let gy = Math.max(0, centerGY - cellRadiusY); gy <= Math.min(this.tilesY - 1, centerGY + cellRadiusY); gy++) {
            for (let gx = Math.max(0, centerGX - cellRadiusX); gx <= Math.min(this.tilesX - 1, centerGX + cellRadiusX); gx++) {
                const index = this.getTileIndex(gx, gy);
                if (this.isObstacle(gx, gy)) continue;

                const pos = this.getTileWorldPos(gx, gy);
                const dx = pos.x - centerWorldX;
                const dz = pos.z - centerWorldZ;
                if (dx * dx + dz * dz <= radSq) {
                    if (this.visitedTiles.has(index)) {
                        this.visitedTiles.delete(index);
                        this.activeFlashes.delete(index);
                        const info = this._tileMap[index];
                        if (info && info.mesh) {
                            info.mesh.setColorAt(info.localIndex, info.defaultColor);
                            if (info.isPink) updatedPink = true;
                            else updatedPurple = true;
                        }
                        unvisited.push({ index, gridX: gx, gridY: gy, x: pos.x, z: pos.z });
                    }
                }
            }
        }

        if (updatedPink && this.instancedMeshPink && this.instancedMeshPink.instanceColor) {
            this.instancedMeshPink.instanceColor.needsUpdate = true;
        }
        if (updatedPurple && this.instancedMeshPurple && this.instancedMeshPurple.instanceColor) {
            this.instancedMeshPurple.instanceColor.needsUpdate = true;
        }

        if (unvisited.length > 0) {
            this.emitTilesChanged();
            eventBus.emit('tiles:unconquered', { tiles: unvisited, count: unvisited.length });
        }
        return unvisited;
    }

    getDiscoveredCount() {
        return this.visitedTiles.size;
    }

    getTotalPlayableTiles() {
        return (this.tilesX * this.tilesY) - this.obstacleTiles.size;
    }

    getRemainingTiles() {
        return Math.max(0, this.getTotalPlayableTiles() - this.getDiscoveredCount());
    }

    emitTilesChanged() {
        const total = this.getTotalPlayableTiles();
        const discovered = this.getDiscoveredCount();
        eventBus.emit('tiles:changed', {
            discovered,
            total,
            remaining: Math.max(0, total - discovered)
        });
    }

    dispose() {
        this._clearSpecialTiles();
        this.visitedTiles.clear();
        this.activeFlashes.clear();
        this.obstacleTiles.clear();
        this._activeHighlights = [];
        this._highlightFreeList = [];
        if (this._highlightInstancedMesh) {
            this._highlightGroup.remove(this._highlightInstancedMesh);
            this._highlightInstancedMesh.dispose();
            this._highlightInstancedMesh = null;
        }
        if (this._highlightMat) {
            if (this._highlightMat.map && this._highlightMat.map.dispose) {
                this._highlightMat.map.dispose();
            }
            this._highlightMat.dispose();
            this._highlightMat = null;
        }

        if (this.instancedMeshPink) {
            this.group.remove(this.instancedMeshPink);
            this.instancedMeshPink.geometry.dispose();
            this.instancedMeshPink = null;
        }
        if (this.instancedMeshPurple) {
            this.group.remove(this.instancedMeshPurple);
            this.instancedMeshPurple.geometry.dispose();
            this.instancedMeshPurple = null;
        }
        this.instancedMesh = null;
        this.instancedMeshes = null;

        disposeTileMaterials();
        disposeGradientTileMaterial();
    }
}
