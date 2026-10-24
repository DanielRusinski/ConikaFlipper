import * as THREE from 'three';

/**
 * LODManager
 * 
 * Level-of-Detail coordinator and distance-based culling controller.
 * Implements hysteresis thresholds to prevent rapid LOD flipping at distance boundaries,
 * integrates bounding-sphere early rejection, and adapts to active graphics quality tiers.
 */
export class LODManager {
    constructor() {
        /**
         * Standard distance thresholds in meters:
         * Near:   [0, nearDistance]
         * Mid:    [nearDistance, midDistance]
         * Far:    [midDistance, farDistance]
         * Culled: > farDistance
         */
        this.nearDistance = 0.85;
        this.midDistance = 1.70;
        this.farDistance = 3.50;

        /** Hysteresis band margin (meters) to avoid boundary jitter */
        this.hysteresis = 0.08;

        /** Quality tier override multiplier (e.g. 0.6 on mobile/low brings LODs closer) */
        this._qualityScale = 1.0;
        this._forcedLOD = null; // null | 0 | 1 | 2

        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._cameraPos = new THREE.Vector3();
    }

    /**
     * Sets the quality tier scale factor.
     * @param {'low'|'medium'|'high'} tier
     * @param {boolean} isMobile
     */
    setQualityTier(tier = 'high', isMobile = false) {
        if (tier === 'low' || isMobile) {
            this._qualityScale = 0.65; // Transition to simpler LODs sooner
        } else if (tier === 'medium') {
            this._qualityScale = 0.85;
        } else {
            this._qualityScale = 1.0;
        }
    }

    /**
     * Forces a specific LOD level (e.g. for debugging or lowest-tier devices).
     * @param {number|null} level - 0 (Near), 1 (Mid), 2 (Far), or null for automatic
     */
    forceLOD(level = null) {
        this._forcedLOD = level;
    }

    /**
     * Updates the active camera frustum and position once per frame.
     * @param {THREE.Camera} camera
     */
    updateCamera(camera) {
        if (!camera) return;
        camera.getWorldPosition(this._cameraPos);
        this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
    }

    /**
     * Determines whether a bounding sphere is within the camera frustum.
     * @param {THREE.Sphere} sphere
     * @returns {boolean}
     */
    isSphereInFrustum(sphere) {
        return this._frustum.intersectsSphere(sphere);
    }

    /**
     * Calculates the appropriate LOD level for an object given its world position and current level.
     * Uses hysteresis to prevent flickering at threshold boundaries.
     * 
     * @param {THREE.Vector3|{x:number, y:number, z:number}} worldPos
     * @param {number} [currentLevel=0] - Current LOD level (0: Near, 1: Mid, 2: Far)
     * @returns {number} Selected LOD level: 0 (Near), 1 (Mid), 2 (Far), or 3 (Culled)
     */
    getLODLevel(worldPos, currentLevel = 0) {
        if (this._forcedLOD !== null) {
            return this._forcedLOD;
        }

        const dx = worldPos.x - this._cameraPos.x;
        const dy = worldPos.y - this._cameraPos.y;
        const dz = worldPos.z - this._cameraPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const nearThreshold = this.nearDistance * this._qualityScale;
        const midThreshold = this.midDistance * this._qualityScale;
        const farThreshold = this.farDistance * this._qualityScale;
        const h = this.hysteresis;

        // Beyond far distance -> Culled
        if (dist > farThreshold + h) {
            return 3;
        }

        if (currentLevel === 0) {
            // In Near: only step up to Mid if distance exceeds nearThreshold + h
            if (dist > nearThreshold + h) {
                return dist > midThreshold + h ? 2 : 1;
            }
            return 0;
        } else if (currentLevel === 1) {
            // In Mid: step down to Near if < nearThreshold - h, or step up to Far if > midThreshold + h
            if (dist < nearThreshold - h) return 0;
            if (dist > midThreshold + h) return 2;
            return 1;
        } else {
            // In Far: step down to Mid if < midThreshold - h
            if (dist < midThreshold - h) {
                return dist < nearThreshold - h ? 0 : 1;
            }
            return 2;
        }
    }
}

export const lodManager = new LODManager();
