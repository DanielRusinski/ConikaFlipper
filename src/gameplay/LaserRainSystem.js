import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { inputManager } from '../core/InputManager.js';
import { playLaserStrikeSound, playSound } from '../soundfx.js';
import { cellParticles } from '../fx_cells.js';
import { bufferGeometryFactory } from '../rendering/BufferGeometryFactory.js';

/**
 * ============================================================================
 * LASER RAIN SYSTEM (Deszcz Laserów)
 * ============================================================================
 * 
 * An orbital weapon system that calls down a cascade of intense vertical
 * laser beams striking from the sky onto random unrevealed tiles across the board.
 * 
 * Key Features:
 * - Automatically scans for non-obstacle tiles that have NOT yet been uncovered.
 * - Targets unrevealed tiles, preventing double-targeting while beams are in flight.
 * - Generates high-speed vertical laser bolts dropping from Y = 0.85 to Y = 0.002.
 * - Shows pre-impact targeting beacons on the ground surface.
 * - On impact: conquers the tile for the player (conquerTile), triggering HDR bloom
 *   tile discovery flashes, points, crystal reveals, and coin cascades.
 * - Spawns expanding neon ground shockwave rings and vertical flash energy pillars.
 * - Triggers spark debris via cellParticles and crisp sci-fi laser audio.
 * - Zero GC allocation in render loop via pre-warmed object pools.
 */
export class LaserRainSystem {
  constructor() {
    this._parentGroup = null;
    this._tileManager = null;
    this._camera = null;

    // Weapon execution state
    this._active = false;
    this._strikesRemaining = 0;
    this._strikesTotal = 20;
    this._strikeInterval = 0.20; // seconds between successive bolt launches
    this._strikeTimer = 0;
    this._duration = 4.5;
    this._beamFallSpeed = 4.8;   // m/s downward velocity

    // Board table dimensions
    this._tableWidth = GAME_CONFIG.table?.width || 0.514;
    this._tableHeight = GAME_CONFIG.table?.height || 1.07;
    this._tilesX = GAME_CONFIG.grid?.tilesX || 18;
    this._tilesY = GAME_CONFIG.grid?.tilesY || 36;
    this._tileWidth = this._tableWidth / this._tilesX;
    this._tileHeight = this._tableHeight / this._tilesY;

    // Visual group attached to board
    this._group = new THREE.Group();
    this._group.name = 'LaserRainSystemGroup';

    // Active visual arrays
    this._activeLasers = [];
    this._activeBeacons = [];
    this._activeShockwaves = [];
    this._activeFlashPillars = [];

    // Object Pools
    this._laserPool = [];
    this._beaconPool = [];
    this._shockwavePool = [];
    this._flashPool = [];
    this._poolCapacity = 16;

    // Event unsubscriptions
    this._unsubs = [];

    // Initialize shared geometries and materials
    this._initAssets();
  }

  _initAssets() {
    // 1. Vertical laser beam cylinder geometry (Length ~0.50m)
    this._beamLength = 0.50;
    this._beamGeo = bufferGeometryFactory.getOrCreate('laser_rain_beam_cylinder', () => {
      const g = new THREE.CylinderGeometry(1, 1, this._beamLength, 12, 1, false);
      // Center geometry so origin is at bottom tip for intuitive placement on ground
      g.translate(0, this._beamLength * 0.5, 0);
      return g;
    });

    // White-hot inner core
    this._coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // Radiant electric cyan outer sheath
    this._sheathMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // 2. Ground target beacon ring geometry
    this._beaconGeo = bufferGeometryFactory.createRingXZ(0.003, 0.012, 32);
    this._beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // 3. Ground impact shockwave ring geometry
    this._shockwaveGeo = bufferGeometryFactory.createRingXZ(0.975, 1.0, 48);
    this._shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // 4. Ground impact flash pillar geometry
    this._flashGeo = bufferGeometryFactory.getOrCreate('laser_rain_flash_pillar', () => {
      const g = new THREE.CylinderGeometry(1, 1, 0.14, 12, 1, false);
      g.translate(0, 0.07, 0);
      return g;
    });
    this._flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaffff,
      transparent: true,
      opacity: 0.90,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  init(parentGroup, tileManager, camera = null) {
    this._parentGroup = parentGroup;
    this._tileManager = tileManager;
    this._camera = camera;

    if (this._parentGroup) {
      this._parentGroup.add(this._group);
    }

    // Pre-warm object pools to eliminate runtime pauses
    this._warmupPools();

    // Hotkey listener for Key 5 (Digit5 / Numpad5)
    this._keyHandler = (e) => {
      if ((e.code === 'Digit5' || e.code === 'Numpad5' || e.key === '5') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (inputManager && inputManager.isEditableTarget(document.activeElement)) return;
        this.trigger({ strikes: 22, duration: 4.5 });
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Event subscriptions for weapon triggers
    this._unsubs.push(
      eventBus.on('card:triggerLaserRain', (data) => this.trigger(data)),
      eventBus.on('weapon:laserRain', (data) => this.trigger(data))
    );
  }

  _warmupPools() {
    for (let i = 0; i < this._poolCapacity; i++) {
      // 1. Laser Beam Composite
      const beamGroup = new THREE.Group();
      beamGroup.name = `LaserRainBeam_${i}`;

      const coreMesh = new THREE.Mesh(this._beamGeo, this._coreMaterial);
      coreMesh.scale.set(0.0028, 1, 0.0028);
      coreMesh.renderOrder = 1100;
      beamGroup.add(coreMesh);

      const sheathMesh = new THREE.Mesh(this._beamGeo, this._sheathMaterial);
      sheathMesh.scale.set(0.0075, 1, 0.0075);
      sheathMesh.renderOrder = 1099;
      beamGroup.add(sheathMesh);

      beamGroup.visible = false;
      this._group.add(beamGroup);
      this._laserPool.push(beamGroup);

      // 2. Ground Beacon Mesh
      const beaconMesh = new THREE.Mesh(this._beaconGeo, this._beaconMaterial.clone());
      beaconMesh.renderOrder = 1050;
      beaconMesh.visible = false;
      this._group.add(beaconMesh);
      this._beaconPool.push(beaconMesh);

      // 3. Ground Impact Shockwave Mesh
      const shockwaveMesh = new THREE.Mesh(this._shockwaveGeo, this._shockwaveMaterial.clone());
      shockwaveMesh.renderOrder = 1060;
      shockwaveMesh.visible = false;
      this._group.add(shockwaveMesh);
      this._shockwavePool.push(shockwaveMesh);

      // 4. Ground Flash Pillar Mesh
      const flashMesh = new THREE.Mesh(this._flashGeo, this._flashMaterial.clone());
      flashMesh.renderOrder = 1080;
      flashMesh.visible = false;
      this._group.add(flashMesh);
      this._flashPool.push(flashMesh);
    }
  }

  setTileManager(tileManager) {
    this._tileManager = tileManager;
    if (tileManager) {
      this._tilesX = tileManager.tilesX || this._tilesX;
      this._tilesY = tileManager.tilesY || this._tilesY;
      this._tableWidth = tileManager.tableWidth || this._tableWidth;
      this._tableHeight = tileManager.tableHeight || this._tableHeight;
      this._tileWidth = this._tableWidth / this._tilesX;
      this._tileHeight = this._tableHeight / this._tilesY;
    }
  }

  /**
   * Triggers the orbital Laser Rain weapon
   * @param {Object} [options={}]
   * @param {number} [options.strikes=20] Total laser strikes during barrage
   * @param {number} [options.duration=4.5] Duration in seconds
   */
  trigger(options = {}) {
    const strikes = (options && options.strikes) ? Number(options.strikes) : 20;
    const duration = (options && options.duration) ? Number(options.duration) : 4.5;

    this._strikesTotal = Math.max(1, strikes);
    this._strikesRemaining = this._strikesTotal;
    this._duration = Math.max(0.1, duration);
    this._strikeInterval = this._duration / this._strikesTotal;
    this._strikeTimer = this._strikeInterval; // Launch first strike immediately
    this._active = true;

    // Atmospheric weapon activation audio
    playSound(1420, 0.35);

    eventBus.emit('laserRain:started', {
      strikes: this._strikesTotal,
      duration: this._duration
    });
  }

  /**
   * Scans the grid for unrevealed, non-obstacle playable tiles.
   * Avoids tiles that are already targeted by another in-flight beam.
   * @returns {{ gx: number, gy: number, x: number, z: number, index: number }|null}
   */
  _findTargetTile() {
    if (!this._tileManager) return null;

    // Collect targeted indices
    const pendingIndices = new Set();
    for (const l of this._activeLasers) {
      if (l.targetIndex !== undefined) pendingIndices.add(l.targetIndex);
    }
    for (const b of this._activeBeacons) {
      if (b.targetIndex !== undefined) pendingIndices.add(b.targetIndex);
    }

    const unrevealedAvailable = [];
    const unrevealedAny = [];

    const tilesX = this._tileManager.tilesX;
    const tilesY = this._tileManager.tilesY;

    for (let gy = 0; gy < tilesY; gy++) {
      for (let gx = 0; gx < tilesX; gx++) {
        const index = this._tileManager.getTileIndex(gx, gy);

        // Must not be an obstacle and must not be conquered yet
        if (!this._tileManager.isObstacle(gx, gy) && !this._tileManager.visitedTiles.has(index)) {
          const worldPos = this._tileManager.getTileWorldPos(gx, gy);
          const item = { gx, gy, index, x: worldPos.x, z: worldPos.z };
          unrevealedAny.push(item);
          if (!pendingIndices.has(index)) {
            unrevealedAvailable.push(item);
          }
        }
      }
    }

    // 1. Prefer unrevealed tile that is not currently being targeted
    if (unrevealedAvailable.length > 0) {
      const idx = Math.floor(Math.random() * unrevealedAvailable.length);
      return unrevealedAvailable[idx];
    }

    // 2. Otherwise pick any unrevealed tile
    if (unrevealedAny.length > 0) {
      const idx = Math.floor(Math.random() * unrevealedAny.length);
      return unrevealedAny[idx];
    }

    // 3. Fallback: if board is 100% uncovered, pick any random playable tile for visual spectacle
    const anyPlayable = [];
    for (let gy = 0; gy < tilesY; gy++) {
      for (let gx = 0; gx < tilesX; gx++) {
        if (!this._tileManager.isObstacle(gx, gy)) {
          const index = this._tileManager.getTileIndex(gx, gy);
          const worldPos = this._tileManager.getTileWorldPos(gx, gy);
          anyPlayable.push({ gx, gy, index, x: worldPos.x, z: worldPos.z });
        }
      }
    }
    if (anyPlayable.length > 0) {
      return anyPlayable[Math.floor(Math.random() * anyPlayable.length)];
    }

    return null;
  }

  /**
   * Spawns a single laser strike targeted at an unrevealed tile
   */
  _spawnStrike() {
    const target = this._findTargetTile();
    if (!target) return;

    // Acquire beacon
    let beacon = this._beaconPool.pop();
    if (!beacon) {
      beacon = new THREE.Mesh(this._beaconGeo, this._beaconMaterial.clone());
      beacon.renderOrder = 1050;
      this._group.add(beacon);
    }
    beacon.position.set(target.x, 0.003, target.z);
    beacon.scale.set(1.4, 1, 1.4);
    beacon.visible = true;
    beacon.material.opacity = 0.85;

    const beaconData = {
      mesh: beacon,
      targetX: target.x,
      targetZ: target.z,
      targetIndex: target.index,
      life: 0.16,
      maxLife: 0.16
    };
    this._activeBeacons.push(beaconData);

    // Acquire laser beam
    let beamGroup = this._laserPool.pop();
    if (!beamGroup) {
      beamGroup = new THREE.Group();
      const core = new THREE.Mesh(this._beamGeo, this._coreMaterial);
      core.scale.set(0.0028, 1, 0.0028);
      core.renderOrder = 1100;
      beamGroup.add(core);

      const sheath = new THREE.Mesh(this._beamGeo, this._sheathMaterial);
      sheath.scale.set(0.0075, 1, 0.0075);
      sheath.renderOrder = 1099;
      beamGroup.add(sheath);

      this._group.add(beamGroup);
    }

    // Position beam high up: starts descending vertically from sky
    const startY = 0.85;
    beamGroup.position.set(target.x, startY, target.z);
    beamGroup.visible = true;

    const laserData = {
      group: beamGroup,
      gx: target.gx,
      gy: target.gy,
      targetX: target.x,
      targetZ: target.z,
      targetIndex: target.index,
      currentY: startY,
      targetY: 0.002,
      speed: this._beamFallSpeed + (Math.random() - 0.5) * 0.8
    };
    this._activeLasers.push(laserData);
  }

  /**
   * Executes impact effects and uncovers the tile when a beam strikes ground
   */
  _onLaserImpact(laser) {
    const x = laser.targetX;
    const z = laser.targetZ;
    const gx = laser.gx;
    const gy = laser.gy;

    // 1. Uncover tile for player
    if (this._tileManager) {
      this._tileManager.conquerTile(gx, gy);
    }

    // 2. Play sci-fi laser strike sound
    playLaserStrikeSound();

    // 3. Spawn spark debris via cellParticles
    cellParticles.trigger(x, z, false);

    // 4. Ground shockwave ring
    let ring = this._shockwavePool.pop();
    if (!ring) {
      ring = new THREE.Mesh(this._shockwaveGeo, this._shockwaveMaterial.clone());
      ring.renderOrder = 1060;
      this._group.add(ring);
    }
    ring.position.set(x, 0.0035, z);
    ring.scale.set(0.005, 1, 0.005);
    ring.visible = true;
    ring.material.opacity = 0.95;

    this._activeShockwaves.push({
      mesh: ring,
      currentScale: 0.005,
      maxScale: 0.038,
      life: 0.28,
      maxLife: 0.28
    });

    // 5. Vertical impact flash pillar
    let flash = this._flashPool.pop();
    if (!flash) {
      flash = new THREE.Mesh(this._flashGeo, this._flashMaterial.clone());
      flash.renderOrder = 1080;
      this._group.add(flash);
    }
    flash.position.set(x, 0.002, z);
    flash.scale.set(0.018, 1, 0.018);
    flash.visible = true;
    flash.material.opacity = 0.92;

    this._activeFlashPillars.push({
      mesh: flash,
      life: 0.16,
      maxLife: 0.16
    });

    // 6. Subtle screen trauma / flash impulse
    eventBus.emit('fx:chromaticAberration', {
      intensity: 0.014,
      duration: 0.14,
      flash: 0.22
    });

    // Return beam to pool
    laser.group.visible = false;
    laser.group.position.set(0, -999, 0);
    this._laserPool.push(laser.group);
  }

  update(gameplayDelta) {
    const dt = Math.min(gameplayDelta, 0.05);

    // 1. Weapon barrage scheduling
    if (this._active) {
      this._strikeTimer += dt;
      if (this._strikeTimer >= this._strikeInterval && this._strikesRemaining > 0) {
        this._strikeTimer = 0;
        this._spawnStrike();
        this._strikesRemaining--;

        if (this._strikesRemaining <= 0) {
          this._active = false;
        }
      }
    }

    // 2. Update falling laser bolts
    for (let i = this._activeLasers.length - 1; i >= 0; i--) {
      const laser = this._activeLasers[i];
      laser.currentY -= laser.speed * dt;
      laser.group.position.y = laser.currentY;

      // Check impact at surface
      if (laser.currentY <= laser.targetY) {
        this._onLaserImpact(laser);
        this._activeLasers.splice(i, 1);
      }
    }

    // 3. Update ground beacons
    for (let i = this._activeBeacons.length - 1; i >= 0; i--) {
      const b = this._activeBeacons[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        b.mesh.position.set(0, -999, 0);
        this._beaconPool.push(b.mesh);
        this._activeBeacons.splice(i, 1);
      } else {
        const progress = b.life / b.maxLife;
        // Contracting ring towards center
        const scale = 0.4 + progress * 0.9;
        b.mesh.scale.set(scale, 1, scale);
        b.mesh.material.opacity = (1.0 - progress * 0.3) * 0.9;
      }
    }

    // 4. Update expanding shockwaves
    for (let i = this._activeShockwaves.length - 1; i >= 0; i--) {
      const s = this._activeShockwaves[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        s.mesh.position.set(0, -999, 0);
        this._shockwavePool.push(s.mesh);
        this._activeShockwaves.splice(i, 1);
      } else {
        const progress = 1.0 - (s.life / s.maxLife);
        // Ease-out expansion
        const scale = s.currentScale + (s.maxScale - s.currentScale) * Math.pow(progress, 0.7);
        s.mesh.scale.set(scale, 1, scale);
        s.mesh.material.opacity = Math.pow(1.0 - progress, 1.4) * 0.95;
      }
    }

    // 5. Update flash pillars
    for (let i = this._activeFlashPillars.length - 1; i >= 0; i--) {
      const f = this._activeFlashPillars[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        f.mesh.position.set(0, -999, 0);
        this._flashPool.push(f.mesh);
        this._activeFlashPillars.splice(i, 1);
      } else {
        const progress = 1.0 - (f.life / f.maxLife);
        f.mesh.material.opacity = (1.0 - progress) * 0.92;
      }
    }
  }

  reset() {
    this._active = false;
    this._strikesRemaining = 0;
    this._strikeTimer = 0;

    // Return all active lasers to pool
    for (const l of this._activeLasers) {
      l.group.visible = false;
      l.group.position.set(0, -999, 0);
      this._laserPool.push(l.group);
    }
    this._activeLasers.length = 0;

    // Return beacons
    for (const b of this._activeBeacons) {
      b.mesh.visible = false;
      b.mesh.position.set(0, -999, 0);
      this._beaconPool.push(b.mesh);
    }
    this._activeBeacons.length = 0;

    // Return shockwaves
    for (const s of this._activeShockwaves) {
      s.mesh.visible = false;
      s.mesh.position.set(0, -999, 0);
      this._shockwavePool.push(s.mesh);
    }
    this._activeShockwaves.length = 0;

    // Return flash pillars
    for (const f of this._activeFlashPillars) {
      f.mesh.visible = false;
      f.mesh.position.set(0, -999, 0);
      this._flashPool.push(f.mesh);
    }
    this._activeFlashPillars.length = 0;
  }

  dispose() {
    this.reset();

    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs.length = 0;

    if (this._parentGroup && this._group) {
      this._parentGroup.remove(this._group);
    }

    // Dispose pool materials
    for (const b of this._beaconPool) {
      if (b.material) b.material.dispose();
    }
    for (const s of this._shockwavePool) {
      if (s.material) s.material.dispose();
    }
    for (const f of this._flashPool) {
      if (f.material) f.material.dispose();
    }

    if (this._coreMaterial) this._coreMaterial.dispose();
    if (this._sheathMaterial) this._sheathMaterial.dispose();
    if (this._beaconMaterial) this._beaconMaterial.dispose();
    if (this._shockwaveMaterial) this._shockwaveMaterial.dispose();
    if (this._flashMaterial) this._flashMaterial.dispose();
  }
}
