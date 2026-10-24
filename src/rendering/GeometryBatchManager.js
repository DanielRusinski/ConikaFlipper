import * as THREE from 'three';
import { bufferGeometryFactory } from './BufferGeometryFactory.js';

/**
 * InstancedMeshBatch
 * 
 * Manages an individual THREE.InstancedMesh with a free-list slot allocator.
 * Guarantees zero buffer reallocations during gameplay by recycling slots.
 */
export class InstancedMeshBatch {
    /**
     * @param {string} id - Unique identifier for the batch
     * @param {THREE.BufferGeometry} geometry - Shared BufferGeometry
     * @param {THREE.Material} material - Shared Material
     * @param {number} maxCapacity - Maximum number of simultaneous instances
     */
    constructor(id, geometry, material, maxCapacity = 100) {
        this.id = id;
        this.maxCapacity = maxCapacity;
        this.geometry = geometry;
        this.material = material;

        this.instancedMesh = new THREE.InstancedMesh(geometry, material, maxCapacity);
        this.instancedMesh.name = `Batch_${id}`;
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        /** @type {number[]} Free slot stack */
        this._freeList = [];
        for (let i = maxCapacity - 1; i >= 0; i--) {
            this._freeList.push(i);
        }

        /** @type {Map<number, { index: number, active: boolean }>} */
        this._activeHandles = new Map();
        this._nextHandle = 1;

        this._matrixDirty = false;
        this._colorDirty = false;

        this._dummy = new THREE.Object3D();
        this._tempColor = new THREE.Color();

        // Initialize all slots to offscreen zero-scale
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        for (let i = 0; i < maxCapacity; i++) {
            this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
            if (this.instancedMesh.setColorAt) {
                this.instancedMesh.setColorAt(i, this._tempColor.setHex(0xffffff));
            }
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
    }

    /**
     * Allocates a slot and places an instance.
     * @param {THREE.Vector3|{x:number, y:number, z:number}} position
     * @param {THREE.Euler|{x:number, y:number, z:number}|null} rotation
     * @param {THREE.Vector3|{x:number, y:number, z:number}|number|null} scale
     * @param {THREE.Color|number|null} color
     * @returns {number} Handle ID (or -1 if capacity exceeded)
     */
    allocate(position, rotation = null, scale = null, color = null) {
        if (this._freeList.length === 0) {
            console.warn(`[InstancedMeshBatch:${this.id}] Capacity reached (${this.maxCapacity}).`);
            return -1;
        }

        const slotIndex = this._freeList.pop();
        const handle = this._nextHandle++;

        this._dummy.position.set(position.x || 0, position.y || 0, position.z || 0);

        if (rotation) {
            this._dummy.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        } else {
            this._dummy.rotation.set(0, 0, 0);
        }

        if (typeof scale === 'number') {
            this._dummy.scale.set(scale, scale, scale);
        } else if (scale) {
            this._dummy.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        } else {
            this._dummy.scale.set(1, 1, 1);
        }

        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(slotIndex, this._dummy.matrix);
        this._matrixDirty = true;

        if (color !== null && this.instancedMesh.setColorAt) {
            if (typeof color === 'number') this._tempColor.setHex(color);
            else if (color.isColor) this._tempColor.copy(color);
            this.instancedMesh.setColorAt(slotIndex, this._tempColor);
            this._colorDirty = true;
        }

        this._activeHandles.set(handle, { index: slotIndex, active: true });
        return handle;
    }

    /**
     * Updates an allocated instance's transform or color without reallocating buffers.
     * @param {number} handle
     * @param {THREE.Vector3|{x:number, y:number, z:number}} position
     * @param {THREE.Euler|{x:number, y:number, z:number}|null} rotation
     * @param {THREE.Vector3|{x:number, y:number, z:number}|number|null} scale
     * @param {THREE.Color|number|null} color
     * @returns {boolean}
     */
    update(handle, position, rotation = null, scale = null, color = null) {
        const entry = this._activeHandles.get(handle);
        if (!entry || !entry.active) return false;

        const slotIndex = entry.index;
        this._dummy.position.set(position.x || 0, position.y || 0, position.z || 0);

        if (rotation) {
            this._dummy.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
        }

        if (typeof scale === 'number') {
            this._dummy.scale.set(scale, scale, scale);
        } else if (scale) {
            this._dummy.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        }

        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(slotIndex, this._dummy.matrix);
        this._matrixDirty = true;

        if (color !== null && this.instancedMesh.setColorAt) {
            if (typeof color === 'number') this._tempColor.setHex(color);
            else if (color.isColor) this._tempColor.copy(color);
            this.instancedMesh.setColorAt(slotIndex, this._tempColor);
            this._colorDirty = true;
        }

        return true;
    }

    /**
     * Releases an instance back to the free list and hides it.
     * @param {number} handle
     */
    release(handle) {
        const entry = this._activeHandles.get(handle);
        if (!entry || !entry.active) return;

        const slotIndex = entry.index;
        entry.active = false;
        this._activeHandles.delete(handle);

        // Hide offscreen
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(slotIndex, this._dummy.matrix);
        this._matrixDirty = true;

        this._freeList.push(slotIndex);
    }

    /**
     * Commits pending matrix and color updates to the GPU.
     * Call once per frame at the end of the update phase.
     */
    commit() {
        if (this._matrixDirty) {
            this.instancedMesh.instanceMatrix.needsUpdate = true;
            this._matrixDirty = false;
        }
        if (this._colorDirty && this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
            this._colorDirty = false;
        }
    }

    /**
     * Number of currently active instances leased from the batch.
     */
    get activeCount() {
        return this._activeHandles.size;
    }

    /**
     * Clears all active instances.
     */
    reset() {
        for (const [handle] of this._activeHandles.entries()) {
            this.release(handle);
        }
        this._activeHandles.clear();
        this._freeList = [];
        for (let i = this.maxCapacity - 1; i >= 0; i--) {
            this._freeList.push(i);
        }
        this.commit();
    }

    dispose() {
        this.reset();
        if (this.geometry && this.geometry.dispose) this.geometry.dispose();
        if (this.material && this.material.dispose) this.material.dispose();
    }
}

/**
 * GeometryBatchManager
 * 
 * Central registry for dynamic instanced batches and static merged geometries.
 */
export class GeometryBatchManager {
    constructor() {
        /** @type {Map<string, InstancedMeshBatch>} */
        this._batches = new Map();

        /** @type {Map<string, THREE.Mesh>} Merged static meshes */
        this._staticMeshes = new Map();
    }

    /**
     * Registers a new instanced batch.
     * @param {string} batchId
     * @param {THREE.BufferGeometry} geometry
     * @param {THREE.Material} material
     * @param {number} maxCapacity
     * @returns {InstancedMeshBatch}
     */
    createInstancedBatch(batchId, geometry, material, maxCapacity = 100) {
        if (this._batches.has(batchId)) {
            return this._batches.get(batchId);
        }
        const batch = new InstancedMeshBatch(batchId, geometry, material, maxCapacity);
        this._batches.set(batchId, batch);
        return batch;
    }

    /**
     * Retrieves an instanced batch by ID.
     * @param {string} batchId
     * @returns {InstancedMeshBatch|null}
     */
    getBatch(batchId) {
        return this._batches.get(batchId) || null;
    }

    /**
     * Creates and caches a single merged static mesh from multiple geometries.
     * @param {string} meshId
     * @param {Array<{ geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4 }>} items
     * @param {THREE.Material} material
     * @returns {THREE.Mesh}
     */
    createStaticMergedMesh(meshId, items, material) {
        if (this._staticMeshes.has(meshId)) {
            return this._staticMeshes.get(meshId);
        }
        const mergedGeo = bufferGeometryFactory.createMergedBufferGeometry(items);
        const mesh = new THREE.Mesh(mergedGeo, material);
        mesh.name = `StaticMerged_${meshId}`;
        this._staticMeshes.set(meshId, mesh);
        return mesh;
    }

    /**
     * Commits all active dynamic batches to GPU in a single call.
     */
    commitAll() {
        for (const batch of this._batches.values()) {
            batch.commit();
        }
    }

    /**
     * Resets all dynamic batches.
     */
    resetAll() {
        for (const batch of this._batches.values()) {
            batch.reset();
        }
    }

    /**
     * Disposes all batches and static meshes.
     */
    disposeAll() {
        for (const batch of this._batches.values()) {
            batch.dispose();
        }
        this._batches.clear();

        for (const mesh of this._staticMeshes.values()) {
            if (mesh.geometry && mesh.geometry.dispose) mesh.geometry.dispose();
            if (mesh.material && mesh.material.dispose) mesh.material.dispose();
        }
        this._staticMeshes.clear();
    }
}

export const geometryBatchManager = new GeometryBatchManager();
