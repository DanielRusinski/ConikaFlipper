import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createObstacleMaterial } from '../materials/environmentMaterials.js';
import {
    createJellyMaterialSet,
    updateJellyMaterialIntensity,
    loadJellyExrMap,
    setJellyEnvironmentMap
} from '../materials/jellyMaterials.js';
import { bufferGeometryFactory } from '../rendering/BufferGeometryFactory.js';
import { glbGeometryCache } from '../rendering/GLBGeometryCache.js';
import { lodManager } from '../rendering/LODManager.js';

/**
 * Attempts to load cellColumn.glb via glbGeometryCache.
 * Returns null if the file cannot be loaded, triggering procedural fallback.
 */
export async function loadColumnGLB() {
    return glbGeometryCache.loadGLTF('cellColumn');
}

export class ObstacleManager {
    constructor() {
        this.tileManager = null;
        this.obstacles = new Set();
        this.obstacleVariants = new Map(); // tileIndex -> 'cyan' | 'pink' | 'purple'
        this.obstacleGroup = new THREE.Group();
        this.instancedMesh = null; // Procedural fallback mesh
        this._glbGroup = null;     // GLB model instanced meshes container
        this.instancedMeshes = null; // { cyan, pink, purple } InstancedMesh instances
        this._columnInstances = []; // Metadata for every instance { instancedMesh, localIndex, tileIndex, gridX, gridY, posX, posZ, variant, phaseOffset }
        this._disposed = false;
        this.isUsingGLB = false;
        this._jellyMaterials = null;

        // Jelly spring-damper wobble physics state
        this._wobbleX = 0;
        this._wobbleZ = 0;
        this._wobbleVelX = 0;
        this._wobbleVelZ = 0;
        this._prevTiltX = 0;
        this._prevTiltY = 0;
        this._wobbleTime = 0;
        this._dummy = new THREE.Object3D();
    }

    init(tileManager, lightingSystem = null) {
        this.tileManager = tileManager;
        this._disposed = false;

        // Automatically connect EXR environment map from lightingSystem if available
        if (lightingSystem && lightingSystem.environmentTexture) {
            setJellyEnvironmentMap(lightingSystem.environmentTexture);
        } else {
            // Lazily ensure the EXR map is loaded for reflections
            loadJellyExrMap().catch(() => {});
        }
    }

    /**
     * Lazily creates or returns the cached set of Premium Candy Jelly materials (cyan, pink, purple).
     */
    _getJellyMaterials() {
        if (!this._jellyMaterials) {
            this._jellyMaterials = createJellyMaterialSet();
        }
        return this._jellyMaterials;
    }

    /**
     * Public getter to access the active jelly materials set for debugging or global effects.
     */
    getJellyMaterials() {
        return this._getJellyMaterials();
    }

    /**
     * Returns the assigned jelly variant ('cyan', 'pink', 'purple') for a given tile index.
     */
    getObstacleVariant(tileIndex) {
        return this.obstacleVariants.get(tileIndex) || null;
    }

    /**
     * Total number of column instances currently created across all variant InstancedMeshes.
     */
    getTotalInstanceCount() {
        if (!this.isUsingGLB || !this._glbGroup) {
            return this.instancedMesh ? this.instancedMesh.count : 0;
        }
        return this._columnInstances ? this._columnInstances.length : 0;
    }

    /**
     * Updates the glow / emissive intensity of all jelly materials across all obstacle columns.
     */
    updateJellyIntensity(intensity = 1.0) {
        if (!this._jellyMaterials) return;
        updateJellyMaterialIntensity(this._jellyMaterials.cyan, intensity);
        updateJellyMaterialIntensity(this._jellyMaterials.pink, intensity);
        updateJellyMaterialIntensity(this._jellyMaterials.purple, intensity);
    }

    /**
     * Kicks the jelly columns with an impulse (e.g. from nearby explosion or ball strike).
     */
    triggerJellyImpulse(impulseX = 0, impulseZ = 0) {
        this._wobbleVelX += impulseX;
        this._wobbleVelZ += impulseZ;
    }

    /**
     * Updates jelly spring & wobble animation when the player tilts the board.
     * Simulates elastic inertia, harmonic spring-damper resonance and volume squash/stretch.
     * 
     * @param {number} delta - Frame delta time in seconds
     * @param {number} [tiltX=0] - Board tilt angle along X axis (radians)
     * @param {number} [tiltY=0] - Board tilt angle along Y/Z axis (radians)
     */
    update(delta, tiltX = 0, tiltY = 0) {
        if (this._disposed) return;

        const dt = Math.min(delta, 0.05);
        if (dt <= 0.0001) return;

        this._wobbleTime += dt;

        // Target lean from gravity and tilt angle (enhanced amplitude)
        const targetLeanX = -tiltX * 0.44;
        const targetLeanZ = -tiltY * 0.44;

        // Angular acceleration impulse from tilt change (increased responsiveness)
        const tiltVelX = (tiltX - this._prevTiltX) / dt;
        const tiltVelZ = (tiltY - this._prevTiltY) / dt;
        this._prevTiltX = tiltX;
        this._prevTiltY = tiltY;

        // Bouncy, long-lasting harmonic oscillator parameters:
        // k = 460.0: resonant spring frequency (~3.4 Hz)
        // c = 5.4: significantly reduced damping ratio allowing 6-8 luscious springy oscillations
        const k = 460.0;
        const c = 5.4;

        const ax = -k * (this._wobbleX - targetLeanX) - c * this._wobbleVelX - tiltVelX * 0.22;
        const az = -k * (this._wobbleZ - targetLeanZ) - c * this._wobbleVelZ - tiltVelZ * 0.22;

        this._wobbleVelX += ax * dt;
        this._wobbleVelZ += az * dt;
        this._wobbleX += this._wobbleVelX * dt;
        this._wobbleZ += this._wobbleVelZ * dt;

        // Kinetic energy metric for sleep optimization (low threshold so long tail is preserved)
        const energy = Math.abs(this._wobbleX - targetLeanX) + Math.abs(this._wobbleZ - targetLeanZ) +
                       Math.abs(this._wobbleVelX) + Math.abs(this._wobbleVelZ);

        if (energy < 0.00003 && Math.abs(this._wobbleX) < 0.00003 && Math.abs(this._wobbleZ) < 0.00003) {
            return;
        }

        const dummy = this._dummy;

        if (this.isUsingGLB && this._columnInstances.length > 0) {
            for (let i = 0; i < this._columnInstances.length; i++) {
                const inst = this._columnInstances[i];
                const phase = inst.phaseOffset + this._wobbleTime * 4.8;
                const ripple = Math.sin(phase) * 0.048 * Math.min(1.0, energy * 2.0);

                const colWobbleX = this._wobbleX + ripple;
                const colWobbleZ = this._wobbleZ + ripple;

                // Jelly volume conservation: springy squash & stretch
                const deflectionSq = colWobbleX * colWobbleX + colWobbleZ * colWobbleZ;
                const squashY = Math.max(0.62, 1.0 - Math.min(0.38, deflectionSq * 2.4));
                const stretchXZ = 1.0 + (1.0 - squashY) * 0.58;

                dummy.position.set(inst.posX, 0, inst.posZ);
                dummy.rotation.set(colWobbleZ, 0, -colWobbleX);
                dummy.scale.set(stretchXZ, squashY, stretchXZ);
                dummy.updateMatrix();

                inst.instancedMesh.setMatrixAt(inst.localIndex, dummy.matrix);
            }

            if (this.instancedMeshes) {
                if (this.instancedMeshes.cyan) this.instancedMeshes.cyan.instanceMatrix.needsUpdate = true;
                if (this.instancedMeshes.pink) this.instancedMeshes.pink.instanceMatrix.needsUpdate = true;
                if (this.instancedMeshes.purple) this.instancedMeshes.purple.instanceMatrix.needsUpdate = true;
            }
        } else if (this.instancedMesh && this.tileManager) {
            // Procedural fallback wobble
            const obstacleHeight = 0.06;
            let i = 0;
            for (const index of this.obstacles) {
                const gridY = Math.floor(index / this.tileManager.tilesX);
                const gridX = index % this.tileManager.tilesX;
                const pos = this.tileManager.getTileWorldPos(gridX, gridY);

                const phase = (gridX * 0.45 + gridY * 0.35) + this._wobbleTime * 4.8;
                const ripple = Math.sin(phase) * 0.048 * Math.min(1.0, energy * 2.0);

                const colWobbleX = this._wobbleX + ripple;
                const colWobbleZ = this._wobbleZ + ripple;

                const deflectionSq = colWobbleX * colWobbleX + colWobbleZ * colWobbleZ;
                const squashY = Math.max(0.62, 1.0 - Math.min(0.38, deflectionSq * 2.4));
                const stretchXZ = 1.0 + (1.0 - squashY) * 0.58;

                dummy.position.set(pos.x, obstacleHeight / 2, pos.z);
                dummy.rotation.set(colWobbleZ, 0, -colWobbleX);
                dummy.scale.set(stretchXZ, squashY, stretchXZ);
                dummy.updateMatrix();

                this.instancedMesh.setMatrixAt(i++, dummy.matrix);
            }
            this.instancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    /**
     * Kicks the jelly columns with an external impulse (e.g. from ball impact, bomb explosion, or shake).
     * @param {number} [impulseX=0] - Velocity impulse along X
     * @param {number} [impulseZ=0] - Velocity impulse along Z
     */
    triggerJellyImpulse(impulseX = 0, impulseZ = 0) {
        this._wobbleVelX += impulseX;
        this._wobbleVelZ += impulseZ;
    }

    generate(tilesX, tilesY, density, safeGridX, safeGridY, safeRadius, seed) {
        let currentSeed = seed;
        const random = () => {
            currentSeed = (currentSeed * 1664525 + 1013904223) & 0xFFFFFFFF;
            return (currentSeed >>> 0) / 0xFFFFFFFF;
        };

        this.obstacles.clear();
        this.obstacleVariants.clear();
        const variantKeys = ['cyan', 'pink', 'purple'];
        
        for (let y = 1; y < tilesY - 1; y++) {
            for (let x = 1; x < tilesX - 1; x++) {
                const dx = x - safeGridX;
                const dy = y - safeGridY;
                const distSq = dx * dx + dy * dy;
                
                if (distSq > safeRadius * safeRadius) {
                    if (random() < density) {
                        const tileIndex = this.tileManager.getTileIndex(x, y);
                        this.obstacles.add(tileIndex);
                        // Randomly distribute one of the 3 jelly variants (cyan, pink, purple)
                        const variant = variantKeys[Math.floor(random() * variantKeys.length)];
                        this.obstacleVariants.set(tileIndex, variant);
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
        this._disposed = false;

        // Clean up any existing meshes
        this._cleanupMeshes();

        if (this.obstacles.size === 0) return this.obstacleGroup;

        // 1. Immediately create fallback procedural geometry using BufferGeometryFactory
        this._createFallbackMeshes(tileManager);

        // 2. Asynchronously load/apply cellColumn.glb via glbGeometryCache
        loadColumnGLB().then(gltf => {
            if (gltf && !this._disposed && this.obstacles.size > 0) {
                this._applyGLBMeshes(gltf, tileManager);
            }
        }).catch(() => {
            // Procedural fallback remains in place
        });

        return this.obstacleGroup;
    }

    _createFallbackMeshes(tileManager) {
        const tileWidth = tileManager.tileWidth;
        const tileHeight = tileManager.tileHeight;
        const obstacleHeight = 0.06;
        
        const geometry = bufferGeometryFactory.createBox(
            tileWidth * 0.92,
            obstacleHeight,
            tileHeight * 0.92
        );
        const material = createObstacleMaterial();
        
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.obstacles.size);
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;
        
        const dummy = this._dummy;
        let i = 0;
        const variantKeys = ['cyan', 'pink', 'purple'];
        const fallbackColors = {
            cyan: new THREE.Color('#00DFF2'),
            pink: new THREE.Color('#F018D5'),
            purple: new THREE.Color('#7B32E8')
        };
        
        for (const index of this.obstacles) {
            const gridY = Math.floor(index / tileManager.tilesX);
            const gridX = index % tileManager.tilesX;
            const pos = tileManager.getTileWorldPos(gridX, gridY);
            
            dummy.position.set(pos.x, obstacleHeight / 2, pos.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, dummy.matrix);

            let variant = this.obstacleVariants.get(index);
            if (!variant) {
                const hash = ((gridX * 374761393 + gridY * 668265263) ^ index) >>> 0;
                variant = variantKeys[hash % variantKeys.length];
                this.obstacleVariants.set(index, variant);
            }

            if (this.instancedMesh.setColorAt) {
                this.instancedMesh.setColorAt(i, fallbackColors[variant] || fallbackColors.cyan);
            }
            i++;
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        this.obstacleGroup.add(this.instancedMesh);
        this.isUsingGLB = false;
    }

    _applyGLBMeshes(gltf, tileManager) {
        if (this._disposed || !gltf || !gltf.scene) return;
        if (this.obstacles.size === 0) return;

        // Remove the procedural fallback mesh
        if (this.instancedMesh) {
            this.obstacleGroup.remove(this.instancedMesh);
            if (this.instancedMesh.geometry) this.instancedMesh.geometry.dispose();
            if (this.instancedMesh.material && this.instancedMesh.material.dispose) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh = null;
        }

        // Remove any previous GLB group
        if (this._glbGroup) {
            this.obstacleGroup.remove(this._glbGroup);
            this._glbGroup = null;
        }

        this._glbGroup = new THREE.Group();
        this._glbGroup.name = 'GLB_CellColumns_Instanced';

        // Extract column geometry from GLB scene
        let columnGeometry = null;
        gltf.scene.traverse(child => {
            if (child.isMesh && !columnGeometry) {
                columnGeometry = child.geometry;
            }
        });

        if (!columnGeometry) {
            console.warn('[ObstacleManager] No mesh geometry found in cellColumn.glb');
            return;
        }

        const variantKeys = ['cyan', 'pink', 'purple'];
        const jellyMaterials = this._getJellyMaterials();

        // Partition obstacles by their randomly assigned jelly variant
        const groups = { cyan: [], pink: [], purple: [] };
        for (const index of this.obstacles) {
            let variant = this.obstacleVariants.get(index);
            if (!variant) {
                const gridY = Math.floor(index / tileManager.tilesX);
                const gridX = index % tileManager.tilesX;
                const hash = ((gridX * 374761393 + gridY * 668265263) ^ index) >>> 0;
                variant = variantKeys[hash % variantKeys.length];
                this.obstacleVariants.set(index, variant);
            }
            groups[variant].push(index);
        }

        this.instancedMeshes = {};
        this._columnInstances = [];
        const dummy = this._dummy;

        for (const variant of variantKeys) {
            const indices = groups[variant];
            if (!indices || indices.length === 0) continue;

            const material = jellyMaterials[variant] || jellyMaterials.cyan;
            const instancedMesh = new THREE.InstancedMesh(columnGeometry, material, indices.length);
            instancedMesh.name = `GLB_CellColumn_${variant}`;
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;

            for (let i = 0; i < indices.length; i++) {
                const index = indices[i];
                const gridY = Math.floor(index / tileManager.tilesX);
                const gridX = index % tileManager.tilesX;
                const pos = tileManager.getTileWorldPos(gridX, gridY);

                dummy.position.set(pos.x, 0, pos.z);
                dummy.rotation.set(0, 0, 0);
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();

                instancedMesh.setMatrixAt(i, dummy.matrix);

                this._columnInstances.push({
                    instancedMesh,
                    localIndex: i,
                    tileIndex: index,
                    gridX,
                    gridY,
                    posX: pos.x,
                    posZ: pos.z,
                    variant,
                    phaseOffset: (gridX * 0.45 + gridY * 0.35)
                });
            }

            instancedMesh.instanceMatrix.needsUpdate = true;
            this.instancedMeshes[variant] = instancedMesh;
            this._glbGroup.add(instancedMesh);
        }

        this.obstacleGroup.add(this._glbGroup);
        this.isUsingGLB = true;
    }

    _cleanupMeshes() {
        if (this.instancedMesh) {
            this.obstacleGroup.remove(this.instancedMesh);
            if (this.instancedMesh.geometry) this.instancedMesh.geometry.dispose();
            if (this.instancedMesh.material && this.instancedMesh.material.dispose) {
                this.instancedMesh.material.dispose();
            }
            this.instancedMesh = null;
        }
        if (this._glbGroup) {
            this.obstacleGroup.remove(this._glbGroup);
            this._glbGroup = null;
        }
        this.instancedMeshes = null;
        this._columnInstances = [];
        this.isUsingGLB = false;
    }

    dispose() {
        this._disposed = true;
        this._cleanupMeshes();
        this.obstacles.clear();
        this.obstacleVariants.clear();
        if (this._jellyMaterials) {
            if (this._jellyMaterials.cyan && this._jellyMaterials.cyan.dispose) {
                this._jellyMaterials.cyan.dispose();
            }
            if (this._jellyMaterials.pink && this._jellyMaterials.pink.dispose) {
                this._jellyMaterials.pink.dispose();
            }
            if (this._jellyMaterials.purple && this._jellyMaterials.purple.dispose) {
                this._jellyMaterials.purple.dispose();
            }
            this._jellyMaterials = null;
        }
    }
}
