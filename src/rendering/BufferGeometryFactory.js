import * as THREE from 'three';

/**
 * BufferGeometryFactory
 * 
 * High-performance factory and cache for THREE.BufferGeometry.
 * Guarantees zero runtime allocations by providing canonical, shared geometries
 * constructed directly with typed arrays (Float32Array, Uint16Array, Uint32Array).
 */
export class BufferGeometryFactory {
    constructor() {
        /** @type {Map<string, THREE.BufferGeometry>} */
        this._cache = new Map();
    }

    /**
     * Retrieves an existing geometry from cache or creates, caches, and returns a new one.
     * @param {string} key - Unique canonical key for the geometry.
     * @param {Function} factoryFn - Factory function producing a THREE.BufferGeometry if key is absent.
     * @returns {THREE.BufferGeometry}
     */
    getOrCreate(key, factoryFn) {
        if (this._cache.has(key)) {
            return this._cache.get(key);
        }
        const geom = factoryFn();
        if (geom) {
            geom.name = geom.name || key;
            if (!geom.boundingBox) geom.computeBoundingBox();
            if (!geom.boundingSphere) geom.computeBoundingSphere();
            this._cache.set(key, geom);
        }
        return geom;
    }

    /**
     * Checks if a geometry key already exists in cache.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this._cache.has(key);
    }

    /**
     * Creates a horizontal plane quad lying strictly in the XZ plane (Y = 0) with normal (0, 1, 0).
     * Eliminates the need to rotate a standard XY PlaneGeometry by -PI/2 at runtime.
     * 
     * @param {number} width - Dimension along X axis
     * @param {number} depth - Dimension along Z axis
     * @param {Object} [options={}]
     * @returns {THREE.BufferGeometry}
     */
    createPlaneXZ(width, depth, options = {}) {
        const key = `plane_xz_${width.toFixed(5)}_${depth.toFixed(5)}`;
        return this.getOrCreate(key, () => {
            const hw = width * 0.5;
            const hd = depth * 0.5;

            // 4 vertices (XZ plane, Y=0)
            const positions = new Float32Array([
                -hw, 0, -hd, // 0: Top-Left
                 hw, 0, -hd, // 1: Top-Right
                 hw, 0,  hd, // 2: Bottom-Right
                -hw, 0,  hd  // 3: Bottom-Left
            ]);

            // Upward normals
            const normals = new Float32Array([
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,
                0, 1, 0
            ]);

            // Standard UV coordinates
            const uvs = new Float32Array([
                0, 1,
                1, 1,
                1, 0,
                0, 0
            ]);

            // Two CCW triangles: (0, 3, 2) and (0, 2, 1)
            const indices = new Uint16Array([
                0, 3, 2,
                0, 2, 1
            ]);

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geom.setIndex(new THREE.BufferAttribute(indices, 1));
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Creates an optimized box BufferGeometry with canonical Float32Array attributes.
     * @param {number} width
     * @param {number} height
     * @param {number} depth
     * @returns {THREE.BufferGeometry}
     */
    createBox(width, height, depth) {
        const key = `box_${width.toFixed(5)}_${height.toFixed(5)}_${depth.toFixed(5)}`;
        return this.getOrCreate(key, () => {
            const geom = new THREE.BoxGeometry(width, height, depth);
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Creates a horizontal ring geometry lying flat in the XZ plane (Y = 0) with normal (0, 1, 0).
     * @param {number} innerRadius
     * @param {number} outerRadius
     * @param {number} [segments=32]
     * @returns {THREE.BufferGeometry}
     */
    createRingXZ(innerRadius, outerRadius, segments = 32) {
        const key = `ring_xz_${innerRadius.toFixed(5)}_${outerRadius.toFixed(5)}_${segments}`;
        return this.getOrCreate(key, () => {
            const vertexCount = (segments + 1) * 2;
            const positions = new Float32Array(vertexCount * 3);
            const normals = new Float32Array(vertexCount * 3);
            const uvs = new Float32Array(vertexCount * 2);
            const indices = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(segments * 6);

            let vIdx = 0;
            let uvIdx = 0;

            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Inner vertex
                positions[vIdx * 3 + 0] = cos * innerRadius;
                positions[vIdx * 3 + 1] = 0;
                positions[vIdx * 3 + 2] = sin * innerRadius;
                normals[vIdx * 3 + 0] = 0;
                normals[vIdx * 3 + 1] = 1;
                normals[vIdx * 3 + 2] = 0;
                uvs[uvIdx * 2 + 0] = (cos + 1) * 0.5;
                uvs[uvIdx * 2 + 1] = (sin + 1) * 0.5;
                vIdx++;
                uvIdx++;

                // Outer vertex
                positions[vIdx * 3 + 0] = cos * outerRadius;
                positions[vIdx * 3 + 1] = 0;
                positions[vIdx * 3 + 2] = sin * outerRadius;
                normals[vIdx * 3 + 0] = 0;
                normals[vIdx * 3 + 1] = 1;
                normals[vIdx * 3 + 2] = 0;
                uvs[uvIdx * 2 + 0] = (cos + 1) * 0.5;
                uvs[uvIdx * 2 + 1] = (sin + 1) * 0.5;
                vIdx++;
                uvIdx++;
            }

            let idx = 0;
            for (let i = 0; i < segments; i++) {
                const a = i * 2;
                const b = i * 2 + 1;
                const c = i * 2 + 2;
                const d = i * 2 + 3;

                indices[idx++] = a;
                indices[idx++] = c;
                indices[idx++] = b;

                indices[idx++] = b;
                indices[idx++] = c;
                indices[idx++] = d;
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            geom.setIndex(new THREE.BufferAttribute(indices, 1));
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Creates or caches an OctahedronBufferGeometry.
     * @param {number} [radius=1]
     * @param {number} [detail=0]
     * @returns {THREE.BufferGeometry}
     */
    createOctahedron(radius = 1, detail = 0) {
        const key = `octa_${radius.toFixed(5)}_${detail}`;
        return this.getOrCreate(key, () => {
            const geom = new THREE.OctahedronGeometry(radius, detail);
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Creates or caches a SphereBufferGeometry.
     * @param {number} radius
     * @param {number} [widthSegments=24]
     * @param {number} [heightSegments=24]
     * @returns {THREE.BufferGeometry}
     */
    createSphere(radius, widthSegments = 24, heightSegments = 24) {
        const key = `sphere_${radius.toFixed(5)}_${widthSegments}_${heightSegments}`;
        return this.getOrCreate(key, () => {
            const geom = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Creates or caches a TorusBufferGeometry.
     * @param {number} radius
     * @param {number} tube
     * @param {number} [radialSegments=8]
     * @param {number} [tubularSegments=24]
     * @returns {THREE.BufferGeometry}
     */
    createTorus(radius, tube, radialSegments = 8, tubularSegments = 24) {
        const key = `torus_${radius.toFixed(5)}_${tube.toFixed(5)}_${radialSegments}_${tubularSegments}`;
        return this.getOrCreate(key, () => {
            const geom = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        });
    }

    /**
     * Merges multiple BufferGeometries with respective transformation matrices into a single non-indexed BufferGeometry.
     * Dramatically reduces draw calls for static decorative or compound objects.
     * 
     * @param {Array<{ geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4 }>} items
     * @returns {THREE.BufferGeometry}
     */
    createMergedBufferGeometry(items) {
        let totalVertices = 0;
        const validItems = [];

        for (const item of items) {
            const geom = item.geometry;
            if (!geom) continue;

            const posAttr = geom.getAttribute('position');
            if (!posAttr) continue;

            const index = geom.getIndex();
            const count = index ? index.count : posAttr.count;
            totalVertices += count;
            validItems.push({
                geom,
                matrix: item.matrix || new THREE.Matrix4(),
                count,
                hasIndex: !!index
            });
        }

        if (totalVertices === 0) {
            return new THREE.BufferGeometry();
        }

        const mergedPos = new Float32Array(totalVertices * 3);
        const mergedNorm = new Float32Array(totalVertices * 3);
        const mergedUV = new Float32Array(totalVertices * 2);

        let vertexOffset = 0;
        const tempVec = new THREE.Vector3();
        const normalMatrix = new THREE.Matrix3();

        for (const item of validItems) {
            const { geom, matrix, count, hasIndex } = item;
            const posAttr = geom.getAttribute('position');
            const normAttr = geom.getAttribute('normal');
            const uvAttr = geom.getAttribute('uv');
            const index = geom.getIndex();

            normalMatrix.getNormalMatrix(matrix);

            for (let i = 0; i < count; i++) {
                const vi = hasIndex ? index.getX(i) : i;

                // Position transformed by matrix
                tempVec.fromBufferAttribute(posAttr, vi);
                tempVec.applyMatrix4(matrix);
                mergedPos[(vertexOffset + i) * 3 + 0] = tempVec.x;
                mergedPos[(vertexOffset + i) * 3 + 1] = tempVec.y;
                mergedPos[(vertexOffset + i) * 3 + 2] = tempVec.z;

                // Normal transformed by normalMatrix
                if (normAttr) {
                    tempVec.fromBufferAttribute(normAttr, vi);
                    tempVec.applyMatrix3(normalMatrix).normalize();
                    mergedNorm[(vertexOffset + i) * 3 + 0] = tempVec.x;
                    mergedNorm[(vertexOffset + i) * 3 + 1] = tempVec.y;
                    mergedNorm[(vertexOffset + i) * 3 + 2] = tempVec.z;
                }

                // UV
                if (uvAttr) {
                    mergedUV[(vertexOffset + i) * 2 + 0] = uvAttr.getX(vi);
                    mergedUV[(vertexOffset + i) * 2 + 1] = uvAttr.getY(vi);
                }
            }

            vertexOffset += count;
        }

        const mergedGeom = new THREE.BufferGeometry();
        mergedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
        mergedGeom.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
        mergedGeom.setAttribute('uv', new THREE.BufferAttribute(mergedUV, 2));
        mergedGeom.computeBoundingBox();
        mergedGeom.computeBoundingSphere();
        return mergedGeom;
    }

    /**
     * Explicitly disposes a specific cached geometry.
     * @param {string} key
     */
    dispose(key) {
        if (this._cache.has(key)) {
            const geom = this._cache.get(key);
            if (geom && geom.dispose) geom.dispose();
            this._cache.delete(key);
        }
    }

    /**
     * Disposes all cached BufferGeometries and frees GPU memory.
     */
    disposeAll() {
        for (const [key, geom] of this._cache.entries()) {
            if (geom && geom.dispose) geom.dispose();
        }
        this._cache.clear();
    }
}

export const bufferGeometryFactory = new BufferGeometryFactory();
