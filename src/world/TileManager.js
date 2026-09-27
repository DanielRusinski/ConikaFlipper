import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import {
    createCheckerboardTileMaterials,
    createTileMaterial,
    TILE_COLORS,
    disposeTileMaterials
} from '../materials/tileMaterials.js';
import { bufferGeometryFactory } from '../rendering/BufferGeometryFactory.js';
import { glbGeometryCache } from '../rendering/GLBGeometryCache.js';

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
        this._tempColor = new THREE.Color();
        this._dummy = new THREE.Object3D();
        this.obstacleTiles = new Set();

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

    init(scene, textureLoader, envMap = null) {
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

                // Check if already obstacle or conquered
                let initialColor = defaultColor;
                if (this.obstacleTiles.has(i)) {
                    initialColor = this._obstacleColor;
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
                    info.mesh.setColorAt(info.localIndex, info.conqueredColor);
                } else {
                    const progress = flash.fade / flash.maxFade; // 1.0 -> 0.0
                    const curved = progress * progress; // Smooth lingering decay
                    this._tempColor.copy(info.conqueredColor).lerp(this._flashColor, curved);
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
            eventBus.emit('stage:completed', {
                discovered: totalDiscovered,
                total: totalPlayable
            });
        }
        return true;
    }

    checkAndUpdate(ballPhysX, ballPhysZ, dt = null) {
        const { gridX, gridY } = this.getTileGridPosFromPhysics(ballPhysX, ballPhysZ);
        
        if (gridX >= 0 && gridX < this.tilesX && gridY >= 0 && gridY < this.tilesY) {
            const index = this.getTileIndex(gridX, gridY);
            
            if (!this.isObstacle(gridX, gridY) && !this.visitedTiles.has(index)) {
                this.conquerTile(gridX, gridY);
            }
        }
        
        if (dt) {
            this.update(dt);
        }
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
        if (this.isObstacle(gridX, gridY)) {
            col = this._obstacleColor;
        } else if (this.visitedTiles.has(index)) {
            col = info.conqueredColor;
        }

        info.mesh.setColorAt(info.localIndex, col);
        info.mesh.instanceColor.needsUpdate = true;
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
    }
}
