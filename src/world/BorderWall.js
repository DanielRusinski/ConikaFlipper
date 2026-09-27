import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getJellyEnvironmentMap } from '../materials/jellyMaterials.js';

/**
 * Creates a rounded rectangular path in the XY plane centered at (0, 0).
 * 
 * @param {number} width - Total width along X
 * @param {number} height - Total height along Y
 * @param {number} radius - Corner rounding radius
 * @param {boolean} [clockwise=false] - Path direction (false for outer shape, true for holes)
 * @returns {THREE.Path}
 */
function createRoundedRectPath(width, height, radius, clockwise = false) {
    const path = new THREE.Path();
    const hw = width * 0.5;
    const hh = height * 0.5;
    const r = Math.min(radius, hw * 0.95, hh * 0.95);

    if (!clockwise) {
        // Counter-clockwise (Outer contour)
        path.moveTo(-hw + r, -hh);
        path.lineTo(hw - r, -hh);
        path.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
        path.lineTo(hw, hh - r);
        path.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
        path.lineTo(-hw + r, hh);
        path.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
        path.lineTo(-hw, -hh + r);
        path.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
        path.closePath();
    } else {
        // Clockwise (Hole contour)
        path.moveTo(-hw + r, -hh);
        path.lineTo(-hw, -hh + r);
        path.absarc(-hw + r, -hh + r, r, Math.PI * 1.5, Math.PI, true);
        path.lineTo(-hw, hh - r);
        path.absarc(-hw + r, hh - r, r, Math.PI, Math.PI / 2, true);
        path.lineTo(hw - r, hh);
        path.absarc(hw - r, hh - r, r, Math.PI / 2, 0, true);
        path.lineTo(hw, -hh + r);
        path.absarc(hw - r, -hh + r, r, 0, -Math.PI / 2, true);
        path.closePath();
    }

    return path;
}

export class BorderWall {
    /**
     * @param {Object} [options]
     * @param {number} [options.tableWidth] - Board width (default: GAME_CONFIG.table.width)
     * @param {number} [options.tableHeight] - Board height (default: GAME_CONFIG.table.height)
     * @param {number} [options.wallHeight=0.030] - Wall height (half of column height 0.060)
     * @param {number} [options.wallThickness=0.015] - Wall thickness
     * @param {number} [options.cornerRadius=0.020] - Inner corner fillet radius
     */
    constructor(options = {}) {
        this.tableWidth = options.tableWidth || GAME_CONFIG.table.width;
        this.tableHeight = options.tableHeight || GAME_CONFIG.table.height;
        this.wallHeight = options.wallHeight || 0.030; // Half of obstacle columns (~0.060)
        this.wallThickness = options.wallThickness || 0.015;
        this.cornerRadius = options.cornerRadius || 0.020;

        this.mesh = null;
        this.geometry = null;
        this.material = null;
        this._parentGroup = null;
    }

    /**
     * Builds and adds the perimeter wall to the parent board group.
     * 
     * @param {THREE.Group} parentGroup - The boardGroup that tilts in 3D
     * @param {THREE.Texture} [envMap=null] - EXR environment reflection map
     * @returns {THREE.Mesh}
     */
    init(parentGroup, envMap = null) {
        this._parentGroup = parentGroup;

        // 1. Build 2D shape with outer rounded border and inner playfield hole
        const outerW = this.tableWidth + this.wallThickness * 2;
        const outerH = this.tableHeight + this.wallThickness * 2;
        const outerR = this.cornerRadius + this.wallThickness;

        const shape = new THREE.Shape();
        const outerPath = createRoundedRectPath(outerW, outerH, outerR, false);
        shape.curves = outerPath.curves;

        const innerHole = createRoundedRectPath(this.tableWidth, this.tableHeight, this.cornerRadius, true);
        shape.holes.push(innerHole);

        // 2. Extrude along Z with a gentle bevel for smooth glazed candy rim
        const extrudeSettings = {
            depth: this.wallHeight,
            bevelEnabled: true,
            bevelThickness: 0.0025,
            bevelSize: 0.002,
            bevelOffset: 0,
            bevelSegments: 4,
            curveSegments: 20
        };

        this.geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Rotate so extrusion (+Z) points vertically upward (+Y)
        this.geometry.rotateX(-Math.PI / 2);

        // Position slightly embedded into floor to avoid any Z-gap
        this.geometry.translate(0, 0, 0);
        this.geometry.computeVertexNormals();

        // 3. Premium physical candy glazed border material
        const effectiveEnvMap = envMap || getJellyEnvironmentMap();
        this.material = new THREE.MeshPhysicalMaterial({
            color: 0x241238, // Deep luscious berry-plum glaze
            roughness: 0.16,
            metalness: 0.04,
            clearcoat: 1.0,
            clearcoatRoughness: 0.08,
            sheen: 0.45,
            sheenColor: new THREE.Color(0xc48fff),
            envMap: effectiveEnvMap,
            envMapIntensity: 1.45,
            reflectivity: 0.65
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Board_BorderWall';
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(0, 0, 0);

        if (this._parentGroup) {
            this._parentGroup.add(this.mesh);
        }

        return this.mesh;
    }

    /**
     * Updates the environment reflection map if loaded asynchronously.
     */
    setEnvironmentMap(envMap) {
        if (this.material && envMap) {
            this.material.envMap = envMap;
            this.material.needsUpdate = true;
        }
    }

    dispose() {
        if (this.mesh && this._parentGroup) {
            this._parentGroup.remove(this.mesh);
        }
        if (this.geometry) {
            this.geometry.dispose();
            this.geometry = null;
        }
        if (this.material) {
            this.material.dispose();
            this.material = null;
        }
        this.mesh = null;
        this._parentGroup = null;
    }
}
