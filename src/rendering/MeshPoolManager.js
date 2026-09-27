import * as THREE from 'three';

/**
 * MeshPool
 * 
 * Individual pool managing inactive and active instances of a specific mesh or composite Object3D.
 */
export class MeshPool {
    /**
     * @param {string} key - Unique pool identifier
     * @param {Function} factoryFn - Function returning a new THREE.Object3D/Mesh
     * @param {number} [initialCapacity=8] - Pre-warmed initial instances
     * @param {number} [maxCapacity=64] - Upper bound on pool size
     */
    constructor(key, factoryFn, initialCapacity = 8, maxCapacity = 64) {
        this.key = key;
        this.factoryFn = factoryFn;
        this.maxCapacity = maxCapacity;

        /** @type {THREE.Object3D[]} Inactive, available objects */
        this._inactive = [];

        /** @type {Set<THREE.Object3D>} Currently active, leased objects */
        this._active = new Set();

        this.warmup(initialCapacity);
    }

    /**
     * Pre-allocates objects upfront to prevent runtime allocation pauses.
     * @param {number} count
     */
    warmup(count) {
        const toCreate = Math.min(count, this.maxCapacity - (this._inactive.length + this._active.size));
        for (let i = 0; i < toCreate; i++) {
            const obj = this.factoryFn();
            if (obj) {
                obj.visible = false;
                this._inactive.push(obj);
            }
        }
    }

    /**
     * Leases an object from the pool, making it visible.
     * @returns {THREE.Object3D|null}
     */
    acquire() {
        let obj = null;
        if (this._inactive.length > 0) {
            obj = this._inactive.pop();
        } else if (this._active.size < this.maxCapacity) {
            obj = this.factoryFn();
        }

        if (obj) {
            obj.visible = true;
            this._active.add(obj);
        }
        return obj;
    }

    /**
     * Returns an object to the pool, resetting its state.
     * @param {THREE.Object3D} obj
     */
    release(obj) {
        if (!obj) return;
        if (this._active.has(obj)) {
            this._active.delete(obj);
            obj.visible = false;

            // Reset standard transforms
            obj.position.set(0, -999, 0);
            obj.rotation.set(0, 0, 0);
            obj.scale.set(1, 1, 1);

            this._inactive.push(obj);
        }
    }

    /**
     * Releases all currently leased active objects back into the inactive pool.
     */
    releaseAll() {
        for (const obj of this._active) {
            obj.visible = false;
            obj.position.set(0, -999, 0);
            obj.rotation.set(0, 0, 0);
            obj.scale.set(1, 1, 1);
            this._inactive.push(obj);
        }
        this._active.clear();
    }

    /**
     * Number of objects currently leased and active.
     */
    getActiveCount() {
        return this._active.size;
    }

    /**
     * Number of ready-to-use inactive objects.
     */
    getInactiveCount() {
        return this._inactive.length;
    }

    /**
     * Disposes all objects, their geometries, and materials.
     */
    dispose() {
        this.releaseAll();
        const allObjects = [...this._inactive];
        this._inactive = [];
        this._active.clear();

        for (const obj of allObjects) {
            if (obj.parent) obj.parent.remove(obj);
            obj.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry && child.geometry.dispose) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose && m.dispose());
                        } else if (child.material.dispose) {
                            child.material.dispose();
                        }
                    }
                }
            });
        }
    }
}

/**
 * MeshPoolManager
 * 
 * Central registry for managing reusable mesh and object pools.
 */
export class MeshPoolManager {
    constructor() {
        /** @type {Map<string, MeshPool>} */
        this._pools = new Map();
    }

    /**
     * Registers a new pool or returns existing one.
     * @param {string} poolKey
     * @param {Function} factoryFn
     * @param {number} [initialCapacity=8]
     * @param {number} [maxCapacity=64]
     * @returns {MeshPool}
     */
    registerPool(poolKey, factoryFn, initialCapacity = 8, maxCapacity = 64) {
        if (this._pools.has(poolKey)) {
            return this._pools.get(poolKey);
        }
        const pool = new MeshPool(poolKey, factoryFn, initialCapacity, maxCapacity);
        this._pools.set(poolKey, pool);
        return pool;
    }

    /**
     * Leases an object from the specified pool.
     * @param {string} poolKey
     * @param {Function} [fallbackFactory=null]
     * @returns {THREE.Object3D|null}
     */
    acquire(poolKey, fallbackFactory = null) {
        let pool = this._pools.get(poolKey);
        if (!pool && fallbackFactory) {
            pool = this.registerPool(poolKey, fallbackFactory);
        }
        return pool ? pool.acquire() : null;
    }

    /**
     * Releases an object back to its designated pool.
     * @param {string} poolKey
     * @param {THREE.Object3D} obj
     */
    release(poolKey, obj) {
        const pool = this._pools.get(poolKey);
        if (pool) {
            pool.release(obj);
        }
    }

    /**
     * Releases all leased objects across all pools.
     */
    releaseAll() {
        for (const pool of this._pools.values()) {
            pool.releaseAll();
        }
    }

    /**
     * Disposes a specific pool.
     * @param {string} poolKey
     */
    disposePool(poolKey) {
        if (this._pools.has(poolKey)) {
            this._pools.get(poolKey).dispose();
            this._pools.delete(poolKey);
        }
    }

    /**
     * Disposes all registered pools.
     */
    disposeAll() {
        for (const pool of this._pools.values()) {
            pool.dispose();
        }
        this._pools.clear();
    }
}

export const meshPoolManager = new MeshPoolManager();
