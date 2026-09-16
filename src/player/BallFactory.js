import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { createBallMaterial, BALL_COLORS } from '../materials/ballMaterials.js';
import { createBrassGhostMaterial } from '../materials/brassGhostMaterial.js';
import { createMarbleGhostMaterial } from '../materials/marbleGhostMaterial.js';
import { createWoodGhostMaterial } from '../materials/woodGhostMaterial.js';

export class BallFactory {
    constructor() {
        this.geometry = new THREE.SphereGeometry(GAME_CONFIG.ball.radius, 32, 32);
        this.materials = new Map();
        this.ghostMaterials = new Map();
    }

    createBall(type) {
        const lowerType = (type || 'brass').toLowerCase();
        if (!this.materials.has(lowerType)) {
            this.materials.set(lowerType, createBallMaterial(lowerType));
        }
        const mesh = new THREE.Mesh(this.geometry, this.materials.get(lowerType));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    createGhostBall(type) {
        const lowerType = (type || 'brass').toLowerCase();
        if (!this.ghostMaterials.has(lowerType)) {
            let material;
            switch (lowerType) {
                case 'brass':
                    material = createBrassGhostMaterial();
                    break;
                case 'marble':
                    material = createMarbleGhostMaterial();
                    break;
                case 'wood':
                    material = createWoodGhostMaterial();
                    break;
                default:
                    material = createBrassGhostMaterial();
            }
            this.ghostMaterials.set(lowerType, material);
        }
        const mesh = new THREE.Mesh(this.geometry, this.ghostMaterials.get(lowerType));
        mesh.renderOrder = 999;
        return mesh;
    }

    dispose() {
        this.geometry.dispose();
        for (const material of this.materials.values()) {
            material.dispose();
        }
        for (const material of this.ghostMaterials.values()) {
            material.dispose();
        }
        this.materials.clear();
        this.ghostMaterials.clear();
    }
}
