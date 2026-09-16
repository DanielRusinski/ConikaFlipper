import { GAME_CONFIG } from '../config/gameConfig.js';

export class CollisionSystem {
    constructor() {
        this.px = 0;
        this.py = 0;
        this.vx = 0;
        this.vy = 0;
        this.gx = 0;
        this.gy = 0;
        this.active = false;
        this._radius = 0;
        this._tableWidth = 0;
        this._tableHeight = 0;
        this._obstacles = [];
    }

    init(tableWidth, tableHeight, ballRadius) {
        this._tableWidth = tableWidth;
        this._tableHeight = tableHeight;
        this._radius = ballRadius;
        this.active = true;
    }

    setTilt(angleX, angleY) {
        this.gx = GAME_CONFIG.physics.gravity * Math.sin(angleX);
        this.gy = GAME_CONFIG.physics.gravity * Math.sin(angleY);
    }

    setObstacles(obstacleAABBs) {
        this._obstacles = obstacleAABBs;
    }

    step(dt) {
        if (!this.active) return;
        
        this.vx += this.gx * dt;
        this.vy += this.gy * dt;
        
        const damp = 1 - GAME_CONFIG.physics.linearDamping * dt;
        this.vx *= damp;
        this.vy *= damp;
        
        const speedSq = this.vx * this.vx + this.vy * this.vy;
        const maxSpeedSq = GAME_CONFIG.physics.maxSpeed * GAME_CONFIG.physics.maxSpeed;
        if (speedSq > maxSpeedSq) {
            const speed = Math.sqrt(speedSq);
            this.vx = (this.vx / speed) * GAME_CONFIG.physics.maxSpeed;
            this.vy = (this.vy / speed) * GAME_CONFIG.physics.maxSpeed;
        }

        const substeps = GAME_CONFIG.physics.maxSubsteps;
        const subDt = dt / substeps;
        
        for (let i = 0; i < substeps; i++) {
            this.px += this.vx * subDt;
            this.py += this.vy * subDt;
            this._resolveCollisions();
        }
        
        if (Math.sqrt(this.vx * this.vx + this.vy * this.vy) < GAME_CONFIG.physics.restThreshold &&
            Math.sqrt(this.gx * this.gx + this.gy * this.gy) < 0.1) {
            this.vx = 0;
            this.vy = 0;
        }
    }
    
    _resolveCollisions() {
        const r = this._radius;
        const rest = GAME_CONFIG.physics.wallRestitution;
        const fric = 1 - GAME_CONFIG.physics.wallFriction;
        
        if (this.px - r < 0) {
            this.px = r;
            this.vx = -this.vx * rest;
            this.vy *= fric;
        } else if (this.px + r > this._tableWidth) {
            this.px = this._tableWidth - r;
            this.vx = -this.vx * rest;
            this.vy *= fric;
        }
        
        if (this.py - r < 0) {
            this.py = r;
            this.vy = -this.vy * rest;
            this.vx *= fric;
        } else if (this.py + r > this._tableHeight) {
            this.py = this._tableHeight - r;
            this.vy = -this.vy * rest;
            this.vx *= fric;
        }
        
        for (let i = 0; i < this._obstacles.length; i++) {
            const obs = this._obstacles[i];
            const testX = Math.max(obs.minX, Math.min(this.px, obs.maxX));
            const testY = Math.max(obs.minZ, Math.min(this.py, obs.maxZ));
            
            const dx = this.px - testX;
            const dy = this.py - testY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq > 0 && distSq < r * r) {
                const dist = Math.sqrt(distSq);
                const pen = r - dist;
                const nx = dx / dist;
                const ny = dy / dist;
                
                this.px += nx * pen;
                this.py += ny * pen;
                
                const dot = this.vx * nx + this.vy * ny;
                if (dot < 0) {
                    this.vx = (this.vx - (1 + rest) * dot * nx) * fric;
                    this.vy = (this.vy - (1 + rest) * dot * ny) * fric;
                }
            } else if (distSq === 0) {
                const cx = (obs.minX + obs.maxX) / 2;
                const cy = (obs.minZ + obs.maxZ) / 2;
                const dirX = this.px >= cx ? 1 : -1;
                const dirY = this.py >= cy ? 1 : -1;
                this.px += dirX * r;
                this.py += dirY * r;
            }
        }
    }

    reset(x, y) {
        this.px = x;
        this.py = y;
        this.vx = 0;
        this.vy = 0;
    }
    
    setPosition(x, y) {
        this.px = x;
        this.py = y;
    }

    setVelocity(vx, vy) {
        this.vx = vx;
        this.vy = vy;
    }

    getPosition() { return { x: this.px, y: this.py }; }
    getVelocity() { return { vx: this.vx, vy: this.vy }; }
    getSpeed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }
    
    dispose() {
        this._obstacles = [];
        this.active = false;
    }
}
