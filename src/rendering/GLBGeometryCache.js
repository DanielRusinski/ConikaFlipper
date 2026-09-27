import * as THREE from 'three';
import { bufferGeometryFactory } from './BufferGeometryFactory.js';

let _gltfLoader = null;

/**
 * Lazily imports and instantiates GLTFLoader if available in the runtime environment.
 */
async function getGLTFLoader() {
    if (_gltfLoader) return _gltfLoader;
    try {
        const mod = await import('three/addons/loaders/GLTFLoader.js');
        if (mod && mod.GLTFLoader) {
            _gltfLoader = new mod.GLTFLoader();
            return _gltfLoader;
        }
    } catch (_) {}
    return null;
}

/**
 * GLBGeometryCache
 * 
 * Centralized caching, deduplication, and scene optimization system for GLB models.
 * Uses Map() for persistent asset lookup and WeakMap() for memory-safe geometry metadata.
 */
export class GLBGeometryCache {
    constructor() {
        /** @type {Map<string, Promise<any>>} In-flight load promises */
        this._loadPromises = new Map();

        /** @type {Map<string, any>} Raw loaded GLTF scene graphs */
        this._gltfCache = new Map();

        /** @type {Map<string, THREE.BufferGeometry>} Extracted and optimized BufferGeometries */
        this._geometryCache = new Map();

        /** @type {WeakMap<THREE.BufferGeometry, { source: string, vertexCount: number, triangleCount: number, box: THREE.Box3, sphere: THREE.Sphere }>} */
        this._metadata = new WeakMap();

        /** Pre-registered candidate paths for known game assets */
        this._knownPaths = {
            'cellColumn': [
                'cells/cellColumn.glb',
                'src/cells/cellColumn.glb',
                './cells/cellColumn.glb',
                './src/cells/cellColumn.glb'
            ],
            'cellColumn_low': [
                'src/cells/cellColumn.glb',
                './src/cells/cellColumn.glb'
            ],
            'cellPlainTile': [
                'cells/cellPlainTile.glb',
                'src/cells/cellPlainTile.glb',
                './cells/cellPlainTile.glb',
                './src/cells/cellPlainTile.glb'
            ],
            'cellPlainBlock': [
                'cells/cellPlainBlock.glb',
                'src/cells/cellPlainBlock.glb',
                './cells/cellPlainBlock.glb'
            ],
            'cellNotPlayableBlock': [
                'cells/cellNotPlayableBlock.glb',
                'src/cells/cellNotPlayableBlock.glb',
                './cells/cellNotPlayableBlock.glb'
            ]
        };
    }

    /**
     * Resolves candidate paths for an asset key or returns array if given directly.
     * @param {string|string[]} assetKeyOrPaths
     * @returns {string[]}
     */
    _resolvePaths(assetKeyOrPaths) {
        if (Array.isArray(assetKeyOrPaths)) return assetKeyOrPaths;
        if (this._knownPaths[assetKeyOrPaths]) return this._knownPaths[assetKeyOrPaths];
        return [assetKeyOrPaths];
    }

    /**
     * Loads a GLTF/GLB asset with candidate path fallback and in-flight promise deduplication.
     * @param {string|string[]} assetKeyOrPaths
     * @returns {Promise<any|null>}
     */
    async loadGLTF(assetKeyOrPaths) {
        const paths = this._resolvePaths(assetKeyOrPaths);
        const primaryKey = paths[0] || 'unknown';

        if (this._gltfCache.has(primaryKey)) {
            return this._gltfCache.get(primaryKey);
        }

        if (this._loadPromises.has(primaryKey)) {
            return this._loadPromises.get(primaryKey);
        }

        const loader = await getGLTFLoader();
        if (!loader) {
            return null;
        }

        const promise = (async () => {
            for (const path of paths) {
                try {
                    const gltf = await new Promise((resolve, reject) => {
                        loader.load(path, resolve, undefined, reject);
                    });

                    if (gltf && gltf.scene) {
                        this._cleanScene(gltf.scene);
                        this._gltfCache.set(primaryKey, gltf);
                        return gltf;
                    }
                } catch (_) {
                    // Try next candidate
                }
            }
            return null;
        })();

        this._loadPromises.set(primaryKey, promise);
        try {
            return await promise;
        } finally {
            this._loadPromises.delete(primaryKey);
        }
    }

    /**
     * Cleans up raw GLTF scene graphs: removes empty groups, hidden objects,
     * and bakes transforms to optimize rendering.
     * @param {THREE.Object3D} root
     */
    _cleanScene(root) {
        if (!root) return;
        root.updateMatrixWorld(true);

        const toRemove = [];
        root.traverse(child => {
            if (child.isLight || child.isCamera) {
                toRemove.push(child);
            }
            if (child.isMesh && child.geometry) {
                // Ensure bounding volumes are computed upfront
                if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
            }
        });

        for (const obj of toRemove) {
            if (obj.parent) obj.parent.remove(obj);
        }
    }

    /**
     * Extracts, deduplicates, and caches the primary BufferGeometry from a GLB asset.
     * Automatically applies any authored local transforms (e.g. node scale or rotation).
     * 
     * @param {string|string[]} assetKeyOrPaths
     * @param {string} [cacheKey] - Custom cache key. Defaults to asset primary key.
     * @returns {Promise<THREE.BufferGeometry|null>}
     */
    async getGeometry(assetKeyOrPaths, cacheKey = null) {
        if (typeof assetKeyOrPaths === 'string' && this._geometryCache.has(assetKeyOrPaths)) {
            return this._geometryCache.get(assetKeyOrPaths);
        }
        if (cacheKey && this._geometryCache.has(cacheKey)) {
            return this._geometryCache.get(cacheKey);
        }

        const paths = this._resolvePaths(assetKeyOrPaths);
        const resolvedKey = cacheKey || paths[0] || 'default';

        if (this._geometryCache.has(resolvedKey)) {
            return this._geometryCache.get(resolvedKey);
        }

        const gltf = await this.loadGLTF(paths);
        if (!gltf || !gltf.scene) return null;

        let primaryMesh = null;
        gltf.scene.traverse(child => {
            if (child.isMesh && !primaryMesh) {
                primaryMesh = child;
            }
        });

        if (!primaryMesh || !primaryMesh.geometry) {
            return null;
        }

        // Clone base geometry to prevent mutations from external consumers
        const extractedGeo = primaryMesh.geometry.clone();

        // Bake mesh's local node transform if non-identity
        if (primaryMesh.scale.x !== 1 || primaryMesh.scale.y !== 1 || primaryMesh.scale.z !== 1 ||
            primaryMesh.rotation.x !== 0 || primaryMesh.rotation.y !== 0 || primaryMesh.rotation.z !== 0) {
            extractedGeo.applyMatrix4(primaryMesh.matrix);
        }

        extractedGeo.computeBoundingBox();
        extractedGeo.computeBoundingSphere();

        // Register metadata in WeakMap
        const posAttr = extractedGeo.getAttribute('position');
        const vCount = posAttr ? posAttr.count : 0;
        const index = extractedGeo.getIndex();
        const tCount = index ? index.count / 3 : vCount / 3;

        this._metadata.set(extractedGeo, {
            source: resolvedKey,
            vertexCount: vCount,
            triangleCount: Math.floor(tCount),
            box: extractedGeo.boundingBox.clone(),
            sphere: extractedGeo.boundingSphere.clone()
        });

        this._geometryCache.set(resolvedKey, extractedGeo);
        return extractedGeo;
    }

    /**
     * Registers an existing BufferGeometry into cache with WeakMap metadata.
     * @param {string} key
     * @param {THREE.BufferGeometry} geometry
     */
    registerGeometry(key, geometry) {
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();

        const posAttr = geometry.getAttribute('position');
        const vCount = posAttr ? posAttr.count : 0;
        const index = geometry.getIndex();
        const tCount = index ? index.count / 3 : vCount / 3;

        this._metadata.set(geometry, {
            source: key,
            vertexCount: vCount,
            triangleCount: Math.floor(tCount),
            boundingBox: geometry.boundingBox.clone(),
            boundingSphere: geometry.boundingSphere.clone(),
            box: geometry.boundingBox.clone(),
            sphere: geometry.boundingSphere.clone()
        });

        this._geometryCache.set(key, geometry);
        if (this._knownPaths[key]) {
            for (const p of this._knownPaths[key]) {
                this._geometryCache.set(p, geometry);
            }
        }
    }

    /**
     * Checks if a geometry key is already cached.
     * @param {string} key
     * @returns {boolean}
     */
    hasGeometry(key) {
        if (this._geometryCache.has(key)) return true;
        const paths = this._resolvePaths(key);
        return paths.some(p => this._geometryCache.has(p));
    }

    /**
     * Retrieves the metadata/stats for a geometry using WeakMap.
     * @param {THREE.BufferGeometry} geom
     * @returns {Object|null}
     */
    getGeometryStats(geom) {
        if (!geom) return null;
        let meta = this._metadata.get(geom);
        if (!meta) {
            if (!geom.boundingBox) geom.computeBoundingBox();
            if (!geom.boundingSphere) geom.computeBoundingSphere();
            const posAttr = geom.getAttribute('position');
            const vCount = posAttr ? posAttr.count : 0;
            const index = geom.getIndex();
            const tCount = index ? index.count / 3 : vCount / 3;
            meta = {
                source: 'runtime',
                vertexCount: vCount,
                triangleCount: Math.floor(tCount),
                boundingBox: geom.boundingBox.clone(),
                boundingSphere: geom.boundingSphere.clone(),
                box: geom.boundingBox.clone(),
                sphere: geom.boundingSphere.clone()
            };
            this._metadata.set(geom, meta);
        }
        return meta;
    }

    /**
     * Retrieves the metadata for a cached geometry using WeakMap.
     * @param {THREE.BufferGeometry} geom
     * @returns {Object|null}
     */
    getMetadata(geom) {
        return this.getGeometryStats(geom);
    }

    /**
     * Registers a custom LOD geometry set for an asset.
     * @param {string} assetKey
     * @param {{ near: THREE.BufferGeometry, mid: THREE.BufferGeometry, far: THREE.BufferGeometry }} lodSet
     */
    registerLODSet(assetKey, lodSet) {
        if (!this._lodSets) this._lodSets = new Map();
        this._lodSets.set(assetKey, lodSet);
    }

    /**
     * Asynchronously loads and returns high/medium/low LOD geometries for an asset.
     * @param {string} assetKey - e.g. 'cellColumn'
     * @returns {Promise<{ near: THREE.BufferGeometry, mid: THREE.BufferGeometry, far: THREE.BufferGeometry }>}
     */
    async getLODSet(assetKey) {
        if (this._lodSets && this._lodSets.has(assetKey)) {
            return this._lodSets.get(assetKey);
        }
        if (assetKey === 'cellColumn') {
            const [near, mid] = await Promise.all([
                this.getGeometry('cellColumn', 'cellColumn_near'),
                this.getGeometry('cellColumn_low', 'cellColumn_mid')
            ]);
            // Low-poly procedural box fallback for far distance (12 triangles)
            const far = bufferGeometryFactory.createBox(0.028, 0.06, 0.028);
            return {
                near: near || mid || far,
                mid: mid || far,
                far: far
            };
        } else if (assetKey === 'cellPlainTile') {
            const near = await this.getGeometry('cellPlainTile', 'cellPlainTile_near');
            const far = bufferGeometryFactory.createPlaneXZ(0.028, 0.028);
            return {
                near: near || far,
                mid: near || far,
                far: far
            };
        }

        // Generic fallback
        const base = await this.getGeometry(assetKey);
        return { near: base, mid: base, far: base };
    }

    /**
     * Disposes a specific asset geometry from cache.
     * @param {string} key
     */
    dispose(key) {
        if (this._geometryCache.has(key)) {
            const geo = this._geometryCache.get(key);
            if (geo && geo.dispose) geo.dispose();
            this._geometryCache.delete(key);
        }
        if (this._gltfCache.has(key)) {
            this._gltfCache.delete(key);
        }
    }

    /**
     * Disposes all cached geometries and clear references to loaded GLTF scenes.
     */
    disposeAll() {
        for (const [key, geo] of this._geometryCache.entries()) {
            if (geo && geo.dispose) geo.dispose();
        }
        this._geometryCache.clear();
        this._gltfCache.clear();
        this._loadPromises.clear();
    }
}

export const glbGeometryCache = new GLBGeometryCache();
