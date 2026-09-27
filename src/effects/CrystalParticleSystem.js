import * as THREE from 'three';

/**
 * CrystalParticleSystem
 * 
 * High-performance 3D particle and visual effects system for crystal pickups:
 * 1. 3D Cut-Diamond Shards: Fast radial burst of tumbling faceted crystal fragments.
 * 2. 3D Ground Shockwave Rings: Expanding circular light waves rippling across the table.
 * 3. 3D Vertical Energy Beams: Upward surging light pillars as crystal power is absorbed.
 * 
 * Uses zero-allocation InstancedMeshes with DynamicDrawUsage and AdditiveBlending,
 * optimized for 60-120 FPS on all devices with intense UnrealBloomPass glow.
 */
export class CrystalParticleSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CrystalParticleSystemGroup';

    // Particle pools configuration
    this.MAX_SHARDS = 160;
    this.MAX_RINGS = 16;
    this.MAX_BEAMS = 12;

    this.shards = [];
    this.rings = [];
    this.beams = [];

    this._shardMesh = null;
    this._ringMesh = null;
    this._beamMesh = null;

    this._dummy = new THREE.Object3D();
    this._tempColor = new THREE.Color();
    this._whiteColor = new THREE.Color(0xffffff);

    // Color palettes for crystal bursts
    this._palettePoints = [
      new THREE.Color(0xffaa00), // Amber Gold
      new THREE.Color(0xffd700), // Rich Gold
      new THREE.Color(0xfff3b0), // Soft Lemon Diamond
      new THREE.Color(0xffffff)  // Pure White Sparkle
    ];

    this._paletteEmerald = [
      new THREE.Color(0x00ff66), // Mint Emerald
      new THREE.Color(0x00e676), // Vivid Green
      new THREE.Color(0x80ffb8), // Seafoam Diamond
      new THREE.Color(0xffffff)  // Pure White Sparkle
    ];

    this._paletteModifier = [
      new THREE.Color(0xff00cc), // Neon Magenta
      new THREE.Color(0xcc00ff), // Vivid Violet
      new THREE.Color(0xff66e5), // Electric Pink
      new THREE.Color(0xffffff)  // Pure White Sparkle
    ];
  }

  init(parentGroup) {
    if (this._shardMesh) return;

    // 1. Shard Geometry: 3D faceted diamond octahedron
    const shardGeom = new THREE.OctahedronGeometry(0.0055, 0);
    const shardMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    this._shardMesh = new THREE.InstancedMesh(shardGeom, shardMat, this.MAX_SHARDS);
    this._shardMesh.name = 'CrystalShardsInstancedMesh';
    this._shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._shardMesh.frustumCulled = false;

    // 2. Shockwave Ring Geometry: Flat circular ring lying on table surface (Y=0.004)
    const ringGeom = new THREE.RingGeometry(0.004, 0.010, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    this._ringMesh = new THREE.InstancedMesh(ringGeom, ringMat, this.MAX_RINGS);
    this._ringMesh.name = 'CrystalRingsInstancedMesh';
    this._ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._ringMesh.frustumCulled = false;

    // 3. Vertical Energy Beam Geometry: Tapered cylinder rising upward
    const beamGeom = new THREE.CylinderGeometry(0.002, 0.006, 0.045, 12);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    this._beamMesh = new THREE.InstancedMesh(beamGeom, beamMat, this.MAX_BEAMS);
    this._beamMesh.name = 'CrystalBeamsInstancedMesh';
    this._beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._beamMesh.frustumCulled = false;

    // Initialize Shard Pool
    this.shards = [];
    for (let i = 0; i < this.MAX_SHARDS; i++) {
      this.shards.push({
        active: false,
        x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0,
        rotX: 0, rotY: 0, rotZ: 0,
        vRotX: 0, vRotY: 0, vRotZ: 0,
        baseScale: 1.0,
        life: 0, maxLife: 0.65,
        color: new THREE.Color()
      });
      this._hideInstance(this._shardMesh, i);
    }

    // Initialize Ring Pool
    this.rings = [];
    for (let i = 0; i < this.MAX_RINGS; i++) {
      this.rings.push({
        active: false,
        x: 0, y: 0.004, z: 0,
        scale: 0.2, maxScale: 3.4,
        life: 0, maxLife: 0.38,
        color: new THREE.Color()
      });
      this._hideInstance(this._ringMesh, i);
    }

    // Initialize Beam Pool
    this.beams = [];
    for (let i = 0; i < this.MAX_BEAMS; i++) {
      this.beams.push({
        active: false,
        x: 0, y: 0, z: 0,
        scaleX: 1, scaleY: 1,
        life: 0, maxLife: 0.28,
        color: new THREE.Color()
      });
      this._hideInstance(this._beamMesh, i);
    }

    this._shardMesh.instanceMatrix.needsUpdate = true;
    if (this._shardMesh.instanceColor) this._shardMesh.instanceColor.needsUpdate = true;
    this._ringMesh.instanceMatrix.needsUpdate = true;
    if (this._ringMesh.instanceColor) this._ringMesh.instanceColor.needsUpdate = true;
    this._beamMesh.instanceMatrix.needsUpdate = true;
    if (this._beamMesh.instanceColor) this._beamMesh.instanceColor.needsUpdate = true;

    this.group.add(this._shardMesh);
    this.group.add(this._ringMesh);
    this.group.add(this._beamMesh);

    if (parentGroup) {
      parentGroup.add(this.group);
    }
  }

  _hideInstance(instMesh, index) {
    this._dummy.position.set(0, -999, 0);
    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    instMesh.setMatrixAt(index, this._dummy.matrix);
  }

  /**
   * Spawns a dazzling collection burst when the ball rolls into a crystal:
   * - 30 3D tumbling diamond shards radiating outward and upward
   * - Ground expanding shockwave ring
   * - Vertical rising energy streak
   */
  spawnCollectBurst(originX, originY, originZ, crystalType, baseColor = null) {
    if (!this._shardMesh) return;

    // Pick matching vibrant color palette
    let palette = this._palettePoints;
    if (crystalType === 'emerald_crystal') {
      palette = this._paletteEmerald;
    } else if (crystalType === 'modifier') {
      palette = this._paletteModifier;
    }

    const primaryColor = baseColor || palette[0];

    // 1. Spawn 32 Shards in a hemispherical explosive fountain
    const shardsToSpawn = 32;
    let spawnedShards = 0;

    for (let i = 0; i < this.MAX_SHARDS && spawnedShards < shardsToSpawn; i++) {
      const shard = this.shards[i];
      if (shard.active) continue;

      shard.active = true;
      shard.x = originX + (Math.random() - 0.5) * 0.006;
      shard.y = originY + (Math.random() - 0.5) * 0.006;
      shard.z = originZ + (Math.random() - 0.5) * 0.006;

      // Hemispherical distribution: horizontal angle 0..2pi, pitch upward 0.15..pi/2
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * (Math.PI * 0.42) + 0.12;
      const speed = 0.32 + Math.random() * 0.48; // m/s

      shard.vx = Math.cos(theta) * Math.sin(phi) * speed;
      shard.vy = Math.cos(phi) * speed * 1.35 + 0.18; // strong upward impulse
      shard.vz = Math.sin(theta) * Math.sin(phi) * speed;

      // Wild 3D tumble rotations (rad/sec)
      shard.rotX = Math.random() * Math.PI * 2;
      shard.rotY = Math.random() * Math.PI * 2;
      shard.rotZ = Math.random() * Math.PI * 2;
      shard.vRotX = (Math.random() - 0.5) * 22;
      shard.vRotY = (Math.random() - 0.5) * 26;
      shard.vRotZ = (Math.random() - 0.5) * 22;

      shard.baseScale = 0.75 + Math.random() * 0.65;
      shard.life = 0.55 + Math.random() * 0.28;
      shard.maxLife = shard.life;

      // Color variation from palette
      const col = palette[Math.floor(Math.random() * palette.length)];
      shard.color.copy(col);

      spawnedShards++;
    }

    // 2. Spawn Expanding Ground Shockwave Ring
    for (let i = 0; i < this.MAX_RINGS; i++) {
      const ring = this.rings[i];
      if (!ring.active) {
        ring.active = true;
        ring.x = originX;
        ring.y = 0.004; // Just above table floor
        ring.z = originZ;
        ring.scale = 0.2;
        ring.maxScale = 3.6;
        ring.life = 0.38;
        ring.maxLife = ring.life;
        ring.color.copy(primaryColor);
        break;
      }
    }

    // 3. Spawn Vertical Energy Beam
    for (let i = 0; i < this.MAX_BEAMS; i++) {
      const beam = this.beams[i];
      if (!beam.active) {
        beam.active = true;
        beam.x = originX;
        beam.y = originY + 0.015;
        beam.z = originZ;
        beam.scaleX = 1.0;
        beam.scaleY = 1.0;
        beam.life = 0.26;
        beam.maxLife = beam.life;
        beam.color.copy(palette[1] || primaryColor);
        break;
      }
    }
  }

  update(dt) {
    if (!this._shardMesh || !dt || dt <= 0) return;

    let shardMatrixUpdated = false;
    let ringMatrixUpdated = false;
    let beamMatrixUpdated = false;

    // 1. Update Shards
    for (let i = 0; i < this.MAX_SHARDS; i++) {
      const s = this.shards[i];
      if (!s.active) continue;

      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        this._hideInstance(this._shardMesh, i);
        shardMatrixUpdated = true;
        continue;
      }

      // Physics integration
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      // Gravity pulling downward
      s.vy -= 0.85 * dt;

      // Aerodynamic drag
      const drag = Math.pow(0.86, dt * 60);
      s.vx *= drag;
      s.vz *= drag;

      // 3D Tumbling rotations
      s.rotX += s.vRotX * dt;
      s.rotY += s.vRotY * dt;
      s.rotZ += s.vRotZ * dt;

      // Scale envelope: quick pop on birth, smooth shrinking to 0
      const progress = s.life / s.maxLife; // 1 -> 0
      const currentScale = s.baseScale * Math.sin(progress * Math.PI * 0.95);

      this._dummy.position.set(s.x, s.y, s.z);
      this._dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
      this._dummy.scale.set(currentScale, currentScale, currentScale);
      this._dummy.updateMatrix();

      this._shardMesh.setMatrixAt(i, this._dummy.matrix);

      // HDR Emissive radiance: multiplier > 1.8 triggers Bloom glow
      const intensity = Math.min(2.5, progress * 2.8);
      this._tempColor.copy(s.color).multiplyScalar(intensity);
      this._shardMesh.setColorAt(i, this._tempColor);

      shardMatrixUpdated = true;
    }

    // 2. Update Shockwave Rings
    for (let i = 0; i < this.MAX_RINGS; i++) {
      const r = this.rings[i];
      if (!r.active) continue;

      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        this._hideInstance(this._ringMesh, i);
        ringMatrixUpdated = true;
        continue;
      }

      const p = 1.0 - (r.life / r.maxLife); // 0 -> 1
      const currentScale = 0.2 + p * (r.maxScale - 0.2);
      r.scale = currentScale;

      this._dummy.position.set(r.x, r.y, r.z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(currentScale, 1.0, currentScale);
      this._dummy.updateMatrix();

      this._ringMesh.setMatrixAt(i, this._dummy.matrix);

      // Fade intensity to 0 as ring expands outward
      const alpha = Math.pow(1.0 - p, 1.5) * 2.2;
      this._tempColor.copy(r.color).multiplyScalar(alpha);
      this._ringMesh.setColorAt(i, this._tempColor);

      ringMatrixUpdated = true;
    }

    // 3. Update Energy Beams
    for (let i = 0; i < this.MAX_BEAMS; i++) {
      const b = this.beams[i];
      if (!b.active) continue;

      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        this._hideInstance(this._beamMesh, i);
        beamMatrixUpdated = true;
        continue;
      }

      const p = 1.0 - (b.life / b.maxLife); // 0 -> 1
      const scaleX = (1.0 - p * 0.7) * 1.5;
      const scaleY = (1.0 + p * 1.8) * 1.2;
      const posY = b.y + p * 0.035;
      b.scaleX = scaleX;
      b.scaleY = scaleY;

      this._dummy.position.set(b.x, posY, b.z);
      this._dummy.rotation.set(0, p * 4.0, 0);
      this._dummy.scale.set(scaleX, scaleY, scaleX);
      this._dummy.updateMatrix();

      this._beamMesh.setMatrixAt(i, this._dummy.matrix);

      const alpha = Math.pow(1.0 - p, 1.2) * 2.5;
      this._tempColor.copy(b.color).multiplyScalar(alpha);
      this._beamMesh.setColorAt(i, this._tempColor);

      beamMatrixUpdated = true;
    }

    if (shardMatrixUpdated) {
      this._shardMesh.instanceMatrix.needsUpdate = true;
      if (this._shardMesh.instanceColor) this._shardMesh.instanceColor.needsUpdate = true;
    }
    if (ringMatrixUpdated) {
      this._ringMesh.instanceMatrix.needsUpdate = true;
      if (this._ringMesh.instanceColor) this._ringMesh.instanceColor.needsUpdate = true;
    }
    if (beamMatrixUpdated) {
      this._beamMesh.instanceMatrix.needsUpdate = true;
      if (this._beamMesh.instanceColor) this._beamMesh.instanceColor.needsUpdate = true;
    }
  }

  reset() {
    for (let i = 0; i < this.MAX_SHARDS; i++) {
      if (this.shards[i]) {
        this.shards[i].active = false;
        if (this._shardMesh) this._hideInstance(this._shardMesh, i);
      }
    }
    for (let i = 0; i < this.MAX_RINGS; i++) {
      if (this.rings[i]) {
        this.rings[i].active = false;
        if (this._ringMesh) this._hideInstance(this._ringMesh, i);
      }
    }
    for (let i = 0; i < this.MAX_BEAMS; i++) {
      if (this.beams[i]) {
        this.beams[i].active = false;
        if (this._beamMesh) this._hideInstance(this._beamMesh, i);
      }
    }
    if (this._shardMesh) this._shardMesh.instanceMatrix.needsUpdate = true;
    if (this._ringMesh) this._ringMesh.instanceMatrix.needsUpdate = true;
    if (this._beamMesh) this._beamMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.reset();
    if (this._shardMesh) {
      this.group.remove(this._shardMesh);
      if (this._shardMesh.geometry) this._shardMesh.geometry.dispose();
      if (this._shardMesh.material) this._shardMesh.material.dispose();
      this._shardMesh = null;
    }
    if (this._ringMesh) {
      this.group.remove(this._ringMesh);
      if (this._ringMesh.geometry) this._ringMesh.geometry.dispose();
      if (this._ringMesh.material) this._ringMesh.material.dispose();
      this._ringMesh = null;
    }
    if (this._beamMesh) {
      this.group.remove(this._beamMesh);
      if (this._beamMesh.geometry) this._beamMesh.geometry.dispose();
      if (this._beamMesh.material) this._beamMesh.material.dispose();
      this._beamMesh = null;
    }
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
