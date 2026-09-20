import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { createTileMaterial, TILE_COLORS } from '../materials/tileMaterials.js';

export class TileManager {
    constructor() {
        this.group = new THREE.Group();
        this.instancedMesh = null;
        this.tilesX = GAME_CONFIG.grid.tilesX;
        this.tilesY = GAME_CONFIG.grid.tilesY;
        this.tableWidth = GAME_CONFIG.table.width;
        this.tableHeight = GAME_CONFIG.table.height;
        this.tileWidth = this.tableWidth / this.tilesX;
        this.tileHeight = this.tableHeight / this.tilesY;
        this.visitedTiles = new Set();
        this.activeFlashes = new Map();
        
        this._conqueredColor = new THREE.Color(TILE_COLORS.conquered);
        this._flashColor = new THREE.Color(TILE_COLORS.flash);
        this._tempColor = new THREE.Color();
        this._dummy = new THREE.Object3D();
        this.obstacleTiles = new Set();
    }

    init(scene, textureLoader) {
        const material = createTileMaterial(textureLoader);
        const geometry = new THREE.PlaneGeometry(
            this.tileWidth * 0.94, 
            this.tileHeight * 0.94
        );
        geometry.rotateX(-Math.PI / 2); // Horizontal

        const totalTiles = this.tilesX * this.tilesY;
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, totalTiles);
        this.instancedMesh.receiveShadow = true;
        this.instancedMesh.castShadow = false; // Floor tiles do not cast shadows
        
        const defaultColor = new THREE.Color(TILE_COLORS.default);
        
        for (let y = 0; y < this.tilesY; y++) {
            for (let x = 0; x < this.tilesX; x++) {
                const i = this.getTileIndex(x, y);
                const pos = this.getTileWorldPos(x, y);
                this._dummy.position.set(pos.x, -0.001, pos.z);
                this._dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
                this.instancedMesh.setColorAt(i, defaultColor);
            }
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.instanceColor.needsUpdate = true;
        
        this.group.add(this.instancedMesh);
        return this.group;
    }

    conquerTile(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return false;
        const index = this.getTileIndex(gridX, gridY);
        if (this.isObstacle(gridX, gridY) || this.visitedTiles.has(index)) return false;

        this.visitedTiles.add(index);
        this.activeFlashes.set(index, 1.0);
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

    checkAndUpdate(ballPhysX, ballPhysZ, dt) {
        const { gridX, gridY } = this.getTileGridPosFromPhysics(ballPhysX, ballPhysZ);
        
        if (gridX >= 0 && gridX < this.tilesX && gridY >= 0 && gridY < this.tilesY) {
            const index = this.getTileIndex(gridX, gridY);
            
            if (!this.isObstacle(gridX, gridY) && !this.visitedTiles.has(index)) {
                this.visitedTiles.add(index);
                this.activeFlashes.set(index, 1.0); // 1.0 = full flash intensity
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
            }
        }
        
        // Update flashes
        if (this.activeFlashes.size > 0 && this.instancedMesh) {
            let updated = false;
            for (const [index, intensity] of this.activeFlashes.entries()) {
                const newIntensity = Math.max(0, intensity - dt * 2.0); // Fade out
                if (newIntensity === 0) {
                    this.activeFlashes.delete(index);
                    this.instancedMesh.setColorAt(index, this._conqueredColor);
                } else {
                    this.activeFlashes.set(index, newIntensity);
                    this._tempColor.copy(this._conqueredColor).lerp(this._flashColor, newIntensity);
                    this.instancedMesh.setColorAt(index, this._tempColor);
                }
                updated = true;
            }
            if (updated) {
                this.instancedMesh.instanceColor.needsUpdate = true;
            }
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
        const obstacleColor = new THREE.Color(TILE_COLORS.obstacle);
        for (const index of this.obstacleTiles) {
            this.instancedMesh.setColorAt(index, obstacleColor);
        }
        this.instancedMesh.instanceColor.needsUpdate = true;
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
        
        if (this.instancedMesh) {
            this.group.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.instancedMesh = null;
        }
        eventBus.emit('grid:rebuilt', { tilesX: this.tilesX, tilesY: this.tilesY });
        this.emitTilesChanged();
    }

    reset() {
        this.visitedTiles.clear();
        this.activeFlashes.clear();
        if (!this.instancedMesh) return;
        
        const defaultColor = new THREE.Color(TILE_COLORS.default);
        const obstacleColor = new THREE.Color(TILE_COLORS.obstacle);
        const total = this.tilesX * this.tilesY;
        
        for (let i = 0; i < total; i++) {
            if (this.obstacleTiles.has(i)) {
                this.instancedMesh.setColorAt(i, obstacleColor);
            } else {
                this.instancedMesh.setColorAt(i, defaultColor);
            }
        }
        this.instancedMesh.instanceColor.needsUpdate = true;
        this.emitTilesChanged();
    }

    highlightTile(gridX, gridY, color = TILE_COLORS.highlight) {
        if (!this.instancedMesh) return;
        const index = this.getTileIndex(gridX, gridY);
        if (index < 0 || index >= this.tilesX * this.tilesY) return;
        this._tempColor.set(color);
        this.instancedMesh.setColorAt(index, this._tempColor);
        this.instancedMesh.instanceColor.needsUpdate = true;
    }

    unhighlightTile(gridX, gridY) {
        if (!this.instancedMesh) return;
        const index = this.getTileIndex(gridX, gridY);
        if (index < 0 || index >= this.tilesX * this.tilesY) return;
        if (this.isObstacle(gridX, gridY)) {
            this.instancedMesh.setColorAt(index, new THREE.Color(TILE_COLORS.obstacle));
        } else if (this.visitedTiles.has(index)) {
            this.instancedMesh.setColorAt(index, this._conqueredColor);
        } else {
            this.instancedMesh.setColorAt(index, new THREE.Color(TILE_COLORS.default));
        }
        this.instancedMesh.instanceColor.needsUpdate = true;
    }

    isDiscovered(gridX, gridY) {
        if (gridX < 0 || gridX >= this.tilesX || gridY < 0 || gridY >= this.tilesY) return true;
        return this.visitedTiles.has(this.getTileIndex(gridX, gridY));
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
        if (this.instancedMesh) {
            this.group.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            if (this.instancedMesh.material.dispose) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh = null;
        }
    }
}
