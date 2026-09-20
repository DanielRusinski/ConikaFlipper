import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { BallFactory } from './BallFactory.js';

export class BallController {
    constructor() {
        this.mesh = null;
        this.ghostMesh = null;
        this.type = GAME_CONFIG.ball.defaultType;
        this._collisionSystem = null;
        this._boardGroup = null;
        this._ghostEnabled = true;
        this._factory = new BallFactory();
        this._accumulator = 0;
        this._posObj = new THREE.Vector3();
        this.active = false;
    }

    init(boardGroup, collisionSystem, type = GAME_CONFIG.ball.defaultType) {
        this._boardGroup = boardGroup;
        this._collisionSystem = collisionSystem;
        this.type = type;
        this.active = false;
        
        this.mesh = this._factory.createBall(this.type);
        this.ghostMesh = this._factory.createGhostBall(this.type);
        this.ghostMesh.visible = false;
        
        this._boardGroup.add(this.mesh);
        this._boardGroup.add(this.ghostMesh);
    }

    update(tiltX, tiltY, dt, gameplayDt) {
        if (!this.active) return;
        this._collisionSystem.setTilt(tiltX, tiltY);
        
        const effectiveDt = (gameplayDt !== undefined) ? gameplayDt : dt;
        // Clamp accumulator to at most 0.04s to avoid spiral of death on frame stutters
        this._accumulator = Math.min(this._accumulator + effectiveDt, 0.04);
        const maxPhysicsDt = GAME_CONFIG.physics.physicsDt;
        
        let steps = 0;
        while (this._accumulator >= maxPhysicsDt && steps < 6) {
            this._collisionSystem.step(maxPhysicsDt);
            this._accumulator -= maxPhysicsDt;
            steps++;
        }

        // When in slow motion or remainder, step remaining accumulator smoothly
        if (this._accumulator > 0.00001) {
            this._collisionSystem.step(this._accumulator);
            this._accumulator = 0;
        }
        
        const pos = this._collisionSystem.getPosition();
        this.mesh.position.set(
            pos.x - GAME_CONFIG.table.width / 2,
            GAME_CONFIG.ball.radius,
            pos.y - GAME_CONFIG.table.height / 2
        );
        if (this.ghostMesh) {
            this.ghostMesh.position.copy(this.mesh.position);
            this.ghostMesh.visible = this._ghostEnabled && this.mesh.visible;
            if (this.ghostMesh.material && this.ghostMesh.material.uniforms && this.ghostMesh.material.uniforms.uTime) {
                this.ghostMesh.material.uniforms.uTime.value += effectiveDt;
            }
        }
    }

    setType(type) {
        this.type = (type || 'brass').toLowerCase();
        if (this.mesh && this._boardGroup) {
            const pos = this.mesh.position.clone();
            this._boardGroup.remove(this.mesh);
            if (this.ghostMesh) this._boardGroup.remove(this.ghostMesh);
            
            this.mesh = this._factory.createBall(this.type);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            this.ghostMesh = this._factory.createGhostBall(this.type);
            
            this.mesh.position.copy(pos);
            if (this.ghostMesh) {
                this.ghostMesh.position.copy(pos);
                this.ghostMesh.visible = this._ghostEnabled && this.mesh.visible;
                this._boardGroup.add(this.ghostMesh);
            }
            
            this._boardGroup.add(this.mesh);
        }
    }

    getWorldPosition() {
        this.mesh.getWorldPosition(this._posObj);
        return this._posObj;
    }

    getPhysicsPosition() {
        return this._collisionSystem.getPosition();
    }

    getVelocity() {
        return this._collisionSystem.getVelocity();
    }

    setVelocity(vx, vz) {
        if (this._collisionSystem) {
            this._collisionSystem.setVelocity(vx, vz);
        }
    }

    setPosition(worldX, worldZ) {
        if (this.mesh) {
            this.mesh.position.x = worldX;
            this.mesh.position.z = worldZ;
            if (this.ghostMesh) {
                this.ghostMesh.position.x = worldX;
                this.ghostMesh.position.z = worldZ;
            }
        }
        if (this._collisionSystem) {
            this._collisionSystem.setPosition(
                worldX + GAME_CONFIG.table.width / 2,
                worldZ + GAME_CONFIG.table.height / 2
            );
        }
    }

    deactivate() {
        this.active = false;
        if (this.mesh) this.mesh.visible = false;
        if (this.ghostMesh) this.ghostMesh.visible = false;
        if (this._collisionSystem) {
            this._collisionSystem.vx = 0;
            this._collisionSystem.vy = 0;
        }
        this._accumulator = 0;
    }

    reset(gridX, gridY, tileManager) {
        const { x, z } = tileManager.getTileWorldPos(gridX, gridY);
        const physX = x + GAME_CONFIG.table.width / 2;
        const physY = z + GAME_CONFIG.table.height / 2;
        
        this._collisionSystem.reset(physX, physY);
        this.mesh.position.set(x, GAME_CONFIG.ball.radius, z);
        this.mesh.visible = true;
        this.active = true;
        if (this.ghostMesh) {
            this.ghostMesh.position.copy(this.mesh.position);
            this.ghostMesh.visible = this._ghostEnabled && this.mesh.visible;
        }
        this._accumulator = 0;
    }

    setGhostEnabled(enabled) {
        this._ghostEnabled = enabled;
        if (this.ghostMesh && !enabled) {
            this.ghostMesh.visible = false;
        }
    }

    updateGhost(camera, scene) {
        if (!this._ghostEnabled || !this.mesh || !this.ghostMesh) return;
        
        // Simple heuristic: if ball is active, always keep ghost at ball pos and visible
        // More complex occlusion test could be added here if raycaster is available
        this.ghostMesh.position.copy(this.mesh.position);
        this.ghostMesh.visible = true;
    }

    isActive() {
        return Boolean(this.active);
    }

    dispose() {
        if (this.mesh) this._boardGroup.remove(this.mesh);
        if (this.ghostMesh) this._boardGroup.remove(this.ghostMesh);
        this._factory.dispose();
    }
}
