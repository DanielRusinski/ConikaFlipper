export const BR_METAL = 0.0135;
export const BR_WATER = BR_METAL * 2;

const GRAV_CONST = 9.81;
const MAX_SPEED = 5.5;
const LIN_DAMP = 0.1;
const SKIN = 1e-4; 
const REST_THRESH = 0.22; 

const HIT = { t: 0, nx: 0, ny: 1, depen: 0, col: null };
let bestT;

function consider(t, nx, ny, depen, col) {
  if (depen > 0) {
    if (bestT > 0 || depen > HIT.depen) {
      bestT = 0; HIT.t = 0; HIT.nx = nx; HIT.ny = ny; HIT.depen = depen; HIT.col = col;
    }
  } else if (t < bestT) {
    bestT = t; HIT.t = t; HIT.nx = nx; HIT.ny = ny; HIT.depen = 0; HIT.col = col;
  }
}

export const world = {
  px: 0.25, py: 0.1, 
  vx: 0, vy: 0,      
  gx: 0, gy: 0,      
  active: true,
  ballType: 'metal',
  
  getRadius() { 
    return this.ballType === 'water' ? BR_WATER : BR_METAL; 
  },

  toggleBallType() {
    this.ballType = this.ballType === 'metal' ? 'water' : 'metal';
    const r = this.getRadius();
    const w = 0.514, h = 1.07;
    
    this.px = Math.max(r, Math.min(w - r, this.px));
    this.py = Math.max(r, Math.min(h - r, this.py));
    
    return this.ballType;
  },

  setTilt(angleX, angleY) {
    this.gx = GRAV_CONST * Math.sin(angleX);
    this.gy = GRAV_CONST * Math.sin(angleY);
  },

  queryFirstHit(tmax) {
    bestT = Infinity;
    HIT.col = null;
    HIT.depen = 0;

    const currentBR = this.getRadius();
    const bounds = { e: 0.4, mu: 0.1, kind: "wall" };
    const w = 0.514, h = 1.07;
    
    const nx = this.px + this.vx * tmax;
    const ny = this.py + this.vy * tmax;

    if (nx - currentBR < 0 && this.vx < 0) {
        const t = (currentBR - this.px) / this.vx;
        if (t <= tmax) consider(t, 1, 0, 0, bounds);
    }
    else if (nx + currentBR > w && this.vx > 0) {
        const t = (w - currentBR - this.px) / this.vx;
        if (t <= tmax) consider(t, -1, 0, 0, bounds);
    }
    
    if (ny - currentBR < 0 && this.vy < 0) {
        const t = (currentBR - this.py) / this.vy;
        if (t <= tmax) consider(t, 0, 1, 0, bounds);
    }
    else if (ny + currentBR > h && this.vy > 0) {
        const t = (h - currentBR - this.py) / this.vy;
        if (t <= tmax) consider(t, 0, -1, 0, bounds);
    }

    return HIT.col ? HIT : null;
  },

  resolve(hit) {
    const col = hit.col, nx = hit.nx, ny = hit.ny;
    const rvn = this.vx * nx + this.vy * ny;
    if (rvn < 0) {
      const e = -rvn < REST_THRESH ? 0 : col.e; 
      const j = -(1 + e) * rvn;
      this.vx += j * nx;
      this.vy += j * ny;
      const tx = -ny, ty = nx;
      const rvt = this.vx * tx + this.vy * ty;
      this.vx -= rvt * col.mu * tx;
      this.vy -= rvt * col.mu * ty;
    }
  },

  step(dt) {
    if (!this.active) return;
    this.vx += this.gx * dt;
    this.vy += this.gy * dt;
    const damp = 1 - LIN_DAMP * dt;
    this.vx *= damp;
    this.vy *= damp;
    
    const sp2 = this.vx * this.vx + this.vy * this.vy;
    if (sp2 > MAX_SPEED * MAX_SPEED) {
      const s = MAX_SPEED / Math.sqrt(sp2);
      this.vx *= s;
      this.vy *= s;
    }

    let t = dt;
    for (let iter = 0; iter < 5 && t > 1e-7; iter++) {
      const hit = this.queryFirstHit(t);
      if (!hit) {
        this.px += this.vx * t;
        this.py += this.vy * t;
        break;
      }
      this.px += this.vx * hit.t;
      this.py += this.vy * hit.t;
      if (hit.depen > 0) {
        this.px += hit.nx * hit.depen;
        this.py += hit.ny * hit.depen;
      }
      this.px += hit.nx * SKIN;
      this.py += hit.ny * SKIN;
      this.resolve(hit);
      t -= hit.t; 
    }
  }
};