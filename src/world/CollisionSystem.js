import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';

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
        this._speedMultiplier = 1.0;
        this._baseSpeedScale = 0.4; // Default ball speed scale set to 0.4 per user request
        this._speedBoostTimer = null;
        this._unsubSpeed = eventBus.on('modifier:speed', ({ value, duration }) => {
            this._speedMultiplier = value || 1.4;
            if (this._speedBoostTimer) clearTimeout(this._speedBoostTimer);
            this._speedBoostTimer = setTimeout(() => {
                this._speedMultiplier = 1.0;
            }, (duration || 15) * 1000);
        });
        this._unsubSettings = eventBus.on('settings:changed', ({ key, value }) => {
            if (key === 'ballSpeedMultiplier') {
                this.setBaseSpeedScale(value);
            }
        });
    }

    setBaseSpeedScale(scale) {
        this._baseSpeedScale = Math.max(0.05, Number(scale) || 0.4);
    }

    getBaseSpeedScale() {
        return this._baseSpeedScale;
    }

    init(tableWidth, tableHeight, ballRadius) {
        this._tableWidth = tableWidth;
        this._tableHeight = tableHeight;
        this._radius = ballRadius;
        this.active = true;
    }

    setTilt(angleX, angleY) {
        const mult = (this._speedMultiplier || 1.0) * (this._baseSpeedScale || 0.4);
        this.gx = GAME_CONFIG.physics.gravity * Math.sin(angleX) * mult;
        this.gy = GAME_CONFIG.physics.gravity * Math.sin(angleY) * mult;
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
        const currentMaxSpeed = GAME_CONFIG.physics.maxSpeed * (this._speedMultiplier || 1.0) * (this._baseSpeedScale || 0.4);
        const maxSpeedSq = currentMaxSpeed * currentMaxSpeed;
        if (speedSq > maxSpeedSq) {
            const speed = Math.sqrt(speedSq);
            this.vx = (this.vx / speed) * currentMaxSpeed;
            this.vy = (this.vy / speed) * currentMaxSpeed;
        }

        const substeps = GAME_CONFIG.physics.maxSubsteps;
        const subDt = dt / substeps;
        
        for (let i = 0; i < substeps; i++) {
            this.px += this.vx * subDt;
            this.py += this.vy * subDt;
            this._resolveCollisions(subDt);
        }
        
        if (Math.sqrt(this.vx * this.vx + this.vy * this.vy) < GAME_CONFIG.physics.restThreshold &&
            Math.sqrt(this.gx * this.gx + this.gy * this.gy) < 0.1) {
            this.vx = 0;
            this.vy = 0;
        }
    }
    
    _resolveCollisions(subDt = 0.0033) {
        const r = this._radius;
        const rest = GAME_CONFIG.physics.wallRestitution;
        // Tangential friction scaled smoothly with timestep so it never strangles sliding speed
        const tanDamp = Math.max(0, 1.0 - GAME_CONFIG.physics.wallFriction * subDt * 2.5);
        const bounceThreshold = 0.12;
        
        // 1. Table Borders / Cushions (left, right, top, bottom)
        // Left wall
        if (this.px - r < 0) {
            this.px = r;
            if (this.vx < 0) {
                this.vx = (this.vx < -bounceThreshold) ? -this.vx * rest : 0;
            }
            this.vy *= tanDamp;
        } else if (this.px + r > this._tableWidth) {
            // Right wall
            this.px = this._tableWidth - r;
            if (this.vx > 0) {
                this.vx = (this.vx > bounceThreshold) ? -this.vx * rest : 0;
            }
            this.vy *= tanDamp;
        }
        
        // Top wall
        if (this.py - r < 0) {
            this.py = r;
            if (this.vy < 0) {
                this.vy = (this.vy < -bounceThreshold) ? -this.vy * rest : 0;
            }
            this.vx *= tanDamp;
        } else if (this.py + r > this._tableHeight) {
            // Bottom wall
            this.py = this._tableHeight - r;
            if (this.vy > 0) {
                this.vy = (this.vy > bounceThreshold) ? -this.vy * rest : 0;
            }
            this.vx *= tanDamp;
        }
        
        // 2. Obstacles / Elevated Columns / Raised Tiles
        for (let i = 0; i < this._obstacles.length; i++) {
            const obs = this._obstacles[i];

            // Broadphase bounding box cull for high mobile performance
            if (this.px + r < obs.minX || this.px - r > obs.maxX ||
                this.py + r < obs.minZ || this.py - r > obs.maxZ) {
                continue;
            }

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
                
                // Position separation along contact normal
                this.px += nx * pen;
                this.py += ny * pen;
                
                // Velocity component along outward normal
                const vn = this.vx * nx + this.vy * ny;

                // Only resolve if ball is moving into the obstacle
                if (vn < 0) {
                    const normalImpulse = (vn < -bounceThreshold) ? -(1 + rest) * vn : -vn;
                    this.vx += normalImpulse * nx;
                    this.vy += normalImpulse * ny;

                    // Preserve tangential slide component past the column
                    const tx = -ny;
                    const ty = nx;
                    const vt = this.vx * tx + this.vy * ty;
                    const vtDamped = vt * tanDamp;

                    const vnAfter = this.vx * nx + this.vy * ny;
                    this.vx = vnAfter * nx + vtDamped * tx;
                    this.vy = vnAfter * ny + vtDamped * ty;
                }
            } else if (distSq === 0) {
                // Ball center inside obstacle: find minimum penetration direction out
                const left = this.px - obs.minX;
                const right = obs.maxX - this.px;
                const top = this.py - obs.minZ;
                const bottom = obs.maxZ - this.py;
                const min = Math.min(left, right, top, bottom);

                if (min === left) {
                    this.px = obs.minX - r;
                    if (this.vx > 0) this.vx = 0;
                } else if (min === right) {
                    this.px = obs.maxX + r;
                    if (this.vx < 0) this.vx = 0;
                } else if (min === top) {
                    this.py = obs.minZ - r;
                    if (this.vy > 0) this.vy = 0;
                } else {
                    this.py = obs.maxZ + r;
                    if (this.vy < 0) this.vy = 0;
                }
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
        if (this._speedBoostTimer) {
            clearTimeout(this._speedBoostTimer);
            this._speedBoostTimer = null;
        }
        if (this._unsubSpeed) {
            this._unsubSpeed();
            this._unsubSpeed = null;
        }
        if (this._unsubSettings) {
            this._unsubSettings();
            this._unsubSettings = null;
        }
        this._obstacles = [];
        this.active = false;
    }
}
