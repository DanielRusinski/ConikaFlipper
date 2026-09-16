import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createObstacleMaterial } from '../materials/environmentMaterials.js';

export class ObstacleManager {
    constructor() {
        this.tileManager = null;
        this.obstacles = new Set();
        this.obstacleGroup = new THREE.Group();
        this.instancedMesh = null;
    }

    init(tileManager) {
        this.tileManager = tileManager;
    }

    generate(tilesX, tilesY, density, safeGridX, safeGridY, safeRadius, seed) {
        let currentSeed = seed;
        const random = () => {
            currentSeed = (currentSeed * 1664525 + 1013904223) & 0xFFFFFFFF;
            return (currentSeed >>> 0) / 0xFFFFFFFF;
        };

        this.obstacles.clear();
        
        for (let y = 1; y < tilesY - 1; y++) {
            for (let x = 1; x < tilesX - 1; x++) {
                const dx = x - safeGridX;
                const dy = y - safeGridY;
                const distSq = dx * dx + dy * dy;
                
                if (distSq > safeRadius * safeRadius) {
                    if (random() < density) {
                        this.obstacles.add(this.tileManager.getTileIndex(x, y));
                    }
                }
            }
        }
        
        return this.obstacles;
    }

    getObstacles() {
        return this.obstacles;
    }

    createObstacleMeshes(scene, tileManager) {
        if (this.instancedMesh) {
            this.obstacleGroup.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.instancedMesh = null;
        }

        if (this.obstacles.size === 0) return this.obstacleGroup;

        const tileWidth = tileManager.tileWidth;
        const tileHeight = tileManager.tileHeight;
        const obstacleHeight = 0.06;
        
        const geometry = new THREE.BoxGeometry(
            tileWidth * 0.92,
            obstacleHeight,
            tileHeight * 0.92
        );
        const material = createObstacleMaterial();
        
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.obstacles.size);
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;
        
        const dummy = new THREE.Object3D();
        let i = 0;
        
        for (const index of this.obstacles) {
            const gridY = Math.floor(index / tileManager.tilesX);
            const gridX = index % tileManager.tilesX;
            const pos = tileManager.getTileWorldPos(gridX, gridY);
            
            dummy.position.set(pos.x, obstacleHeight / 2, pos.z);
            dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i++, dummy.matrix);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.obstacleGroup.add(this.instancedMesh);
        
        return this.obstacleGroup;
    }

    dispose() {
        if (this.instancedMesh) {
            this.obstacleGroup.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            if (this.instancedMesh.material.dispose) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh = null;
        }
        this.obstacles.clear();
    }
}
