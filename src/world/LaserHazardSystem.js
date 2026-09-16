import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { playSound } from '../soundfx.js';

/**
 * LaserHazardSystem
 * Generates permanent pairs of 3D red laser blocks ("czerwone klocki") on the board.
 * The blocks are continuously visible on the board.
 * Unobstructed corridors with zero obstacles between the red blocks are automatically located.
 * Periodically (every ~20s), the laser beam powers up, fires for 3-15 seconds, and fades away.
 */
export class LaserHazardSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LaserHazardGroup';

    // State machine: 'IDLE', 'WARNING', 'FIRING', 'FADING'
    this.state = 'IDLE';

    // Timing
    this._timer = 0;
    this._cooldownDuration = this._getRandomCooldown(); // ~20 seconds
    this._warningDuration = 2.0; // 2 seconds charging/warning
    this._activeDuration = 5.0;  // 3-15 seconds random duration
    this._fadeDuration = 0.8;    // 0.8s dissipation
    this._hitTriggered = false;

    // Board reference & dimensions
    this._tableWidth = GAME_CONFIG.table.width;
    this._tableHeight = GAME_CONFIG.table.height;
    this._tilesX = GAME_CONFIG.grid.tilesX;
    this._tilesY = GAME_CONFIG.grid.tilesY;
    this._tileWidth = this._tableWidth / this._tilesX;
    this._tileHeight = this._tableHeight / this._tilesY;
    this._tileManager = null;

    // Corridors & Permanent Red Blocks Pairs
    this._corridors = [];
    this._activeCorridorIndex = 0;

    // Shared reusable beam meshes
    this._beamGroup = new THREE.Group();
    this._beamGroup.name = 'ActiveLaserBeamGroup';
    this._beamRadius = 0.0036;

    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    beamGeo.rotateX(Math.PI / 2); // Align with Z-axis

    // White-hot inner core - ultra-concentrated razor-sharp line
    this._coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this._coreMesh = new THREE.Mesh(beamGeo, this._coreMaterial);

    // Dense, concentrated ruby-red neon sheath
    this._glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0044,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this._glowMesh = new THREE.Mesh(beamGeo, this._glowMaterial);

    // Razor-thin warning guide beam
    this._guideMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0033,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this._guideMesh = new THREE.Mesh(beamGeo, this._guideMaterial);

    this._beamGroup.add(this._coreMesh);
    this._beamGroup.add(this._glowMesh);
    this._beamGroup.add(this._guideMesh);

    // Spark / plasma particle ring
    this._particles = this._createSparks();
    this._beamGroup.add(this._particles);

    this.group.add(this._beamGroup);

    // The laser beam itself is hidden during IDLE
    this._beamGroup.visible = false;
    this._coreMesh.visible = false;
    this._glowMesh.visible = false;
    this._guideMesh.visible = false;
    this._particles.visible = false;

    // The group container (holding the red blocks) is ALWAYS visible
    this.group.visible = true;
  }

  _getRandomCooldown() {
    // Approx 20 seconds with random jitter (16 to 24s)
    return 16.0 + Math.random() * 8.0;
  }

  _getRandomActiveDuration() {
    // Burns between 3 and 15 seconds randomly
    return 3.0 + Math.random() * 12.0;
  }

  _createSparks() {
    const count = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = 0;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xff4477,
      size: 0.003,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.visible = false;
    return points;
  }

  /**
   * Constructs a 3D non-flat red laser block ("czerwony klocek")
   * Continuously visible on the board.
   */
  _createRedLaserBlock() {
    const block = new THREE.Group();
    block.name = 'RedLaserBlock';

    // 1. Stepped red metallic block base (czerwony klocek)
    const baseGeo = new THREE.BoxGeometry(0.024, 0.020, 0.024);
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xbb1122,
      emissive: 0x440508,
      emissiveIntensity: 0.4,
      metalness: 0.75,
      roughness: 0.25
    });
    const baseMesh = new THREE.Mesh(baseGeo, redMat);
    baseMesh.position.y = 0.010;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    block.add(baseMesh);

    // 2. Dark metallic collar / reinforcement band
    const collarGeo = new THREE.BoxGeometry(0.025, 0.005, 0.025);
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x242832,
      metalness: 0.9,
      roughness: 0.2
    });
    const collarMesh = new THREE.Mesh(collarGeo, collarMat);
    collarMesh.position.y = 0.018;
    collarMesh.castShadow = true;
    block.add(collarMesh);

    // 3. Glowing red crystalline emitter cap / lens exactly at beamElevation (0.024)
    const capGeo = new THREE.SphereGeometry(0.008, 16, 16);
    const emitterMat = new THREE.MeshStandardMaterial({
      color: 0xff0033,
      emissive: new THREE.Color(0xff0033),
      emissiveIntensity: 1.0,
      roughness: 0.1,
      metalness: 0.2
    });
    const capMesh = new THREE.Mesh(capGeo, emitterMat);
    capMesh.position.y = 0.024;
    capMesh.name = 'BlockEmitter';
    block.add(capMesh);

    // 4. Point light for dynamic local casting on the table
    const light = new THREE.PointLight(0xff0033, 0.35, 0.30);
    light.position.y = 0.024;
    light.name = 'BlockLight';
    block.add(light);

    // Always visible
    block.visible = true;
    return block;
  }

  init(parentGroup, tileManager = null) {
    if (parentGroup) {
      parentGroup.add(this.group);
    }
    if (tileManager) {
      this.setupBoard(tileManager);
    }
  }

  /**
   * Scans the board for straight corridors that have ZERO obstacles between the ends,
   * places permanent red laser blocks at the ends of those corridors, and prepares them.
   */
  setupBoard(tileManager) {
    this._tileManager = tileManager;
    this._findAndCreateCorridors();
  }

  _findAndCreateCorridors() {
    // Clear any previous blocks
    for (const corr of this._corridors) {
      if (corr.blockA && corr.blockA.parent) corr.blockA.parent.remove(corr.blockA);
      if (corr.blockB && corr.blockB.parent) corr.blockB.parent.remove(corr.blockB);
    }
    this._corridors = [];

    if (!this._tileManager) {
      // Fallback default coordinates if tileManager is not yet ready
      this._createDefaultCorridors();
      return;
    }

    const horizontalCandidates = [];
    const verticalCandidates = [];

    // Scan horizontal rows for contiguous non-obstacle segments
    for (let gy = 3; gy < this._tilesY - 3; gy++) {
      let runStart = -1;
      for (let gx = 1; gx < this._tilesX - 1; gx++) {
        const isObs = this._tileManager.isObstacle(gx, gy);
        if (!isObs) {
          if (runStart === -1) runStart = gx;
        } else {
          if (runStart !== -1) {
            const length = gx - runStart;
            if (length >= 8) {
              horizontalCandidates.push({ gx1: runStart, gx2: gx - 1, gy1: gy, gy2: gy, length, orientation: 'h' });
            }
            runStart = -1;
          }
        }
      }
      if (runStart !== -1) {
        const length = (this._tilesX - 1) - runStart;
        if (length >= 8) {
          horizontalCandidates.push({ gx1: runStart, gx2: this._tilesX - 2, gy1: gy, gy2: gy, length, orientation: 'h' });
        }
      }
    }

    // Scan vertical columns for contiguous non-obstacle segments
    for (let gx = 2; gx < this._tilesX - 2; gx++) {
      let runStart = -1;
      for (let gy = 3; gy < this._tilesY - 3; gy++) {
        const isObs = this._tileManager.isObstacle(gx, gy);
        if (!isObs) {
          if (runStart === -1) runStart = gy;
        } else {
          if (runStart !== -1) {
            const length = gy - runStart;
            if (length >= 10) {
              verticalCandidates.push({ gx1: gx, gx2: gx, gy1: runStart, gy2: gy - 1, length, orientation: 'v' });
            }
            runStart = -1;
          }
        }
      }
      if (runStart !== -1) {
        const length = (this._tilesY - 3) - runStart;
        if (length >= 10) {
          verticalCandidates.push({ gx1: gx, gx2: gx, gy1: runStart, gy2: this._tilesY - 4, length, orientation: 'v' });
        }
      }
    }

    // Pick 2 best separated corridors (one horizontal, one vertical)
    horizontalCandidates.sort((a, b) => b.length - a.length);
    verticalCandidates.sort((a, b) => b.length - a.length);

    const chosen = [];
    if (horizontalCandidates.length > 0) {
      chosen.push(horizontalCandidates[0]);
    }
    if (verticalCandidates.length > 0) {
      chosen.push(verticalCandidates[0]);
    } else if (horizontalCandidates.length > 1) {
      chosen.push(horizontalCandidates[1]);
    }

    if (chosen.length === 0) {
      this._createDefaultCorridors();
      return;
    }

    // Build permanent red blocks for each chosen corridor
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      const p1World = this._tileManager.getTileWorldPos(c.gx1, c.gy1);
      const p2World = this._tileManager.getTileWorldPos(c.gx2, c.gy2);

      const blockA = this._createRedLaserBlock();
      blockA.position.set(p1World.x, 0, p1World.z);
      this.group.add(blockA);

      const blockB = this._createRedLaserBlock();
      blockB.position.set(p2World.x, 0, p2World.z);
      this.group.add(blockB);

      const beamElevation = 0.024;
      const p1 = new THREE.Vector3(p1World.x, beamElevation, p1World.z);
      const p2 = new THREE.Vector3(p2World.x, beamElevation, p2World.z);
      const midpoint = new THREE.Vector3().copy(p1).add(p2).multiplyScalar(0.5);
      const length = p1.distanceTo(p2);
      // Angle strictly in horizontal X-Z plane parallel to table ground
      const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);

      this._corridors.push({
        id: i,
        blockA,
        blockB,
        p1,
        p2,
        midpoint,
        length,
        angle,
        orientation: c.orientation
      });
    }

    this._activeCorridorIndex = 0;
  }

  _createDefaultCorridors() {
    // Default safe fallback corridor across width
    const gy = 18;
    const x1 = -this._tableWidth / 2 + this._tileWidth * 1.5;
    const z1 = 0;
    const x2 = this._tableWidth / 2 - this._tileWidth * 1.5;
    const z2 = 0;

    const blockA = this._createRedLaserBlock();
    blockA.position.set(x1, 0, z1);
    this.group.add(blockA);

    const blockB = this._createRedLaserBlock();
    blockB.position.set(x2, 0, z2);
    this.group.add(blockB);

    const beamElevation = 0.024;
    const p1 = new THREE.Vector3(x1, beamElevation, z1);
    const p2 = new THREE.Vector3(x2, beamElevation, z2);
    const midpoint = new THREE.Vector3().copy(p1).add(p2).multiplyScalar(0.5);
    const length = p1.distanceTo(p2);
    const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);

    this._corridors.push({
      id: 0,
      blockA,
      blockB,
      p1,
      p2,
      midpoint,
      length,
      angle,
      orientation: 'h'
    });
  }

  /**
   * Triggers a laser strike on one of the permanent corridors
   */
  _activateLaser(ballPos) {
    if (this._corridors.length === 0) return;

    // Pick next corridor, preferring one not directly on the ball
    let idx = this._activeCorridorIndex;
    if (this._corridors.length > 1) {
      if (ballPos) {
        const c0 = this._corridors[0];
        const dist0 = this._distanceToSegment(ballPos, c0.p1, c0.p2);
        idx = dist0 < 0.05 ? 1 : (this._activeCorridorIndex + 1) % this._corridors.length;
      } else {
        idx = (this._activeCorridorIndex + 1) % this._corridors.length;
      }
    }
    this._activeCorridorIndex = idx;
    const corridor = this._corridors[idx];

    // Orient and position beam strictly parallel to the board ground:
    // Elevation is constant along entire beam, pitch (X) and roll (Z) are strictly locked to 0
    this._beamGroup.position.set(corridor.midpoint.x, corridor.p1.y, corridor.midpoint.z);
    this._beamGroup.rotation.set(0, corridor.angle, 0);

    this._coreMesh.scale.set(0.0025, 0.0025, corridor.length);
    this._glowMesh.scale.set(0.008, 0.008, corridor.length);
    this._guideMesh.scale.set(0.0012, 0.0012, corridor.length);

    this._beamGroup.visible = true;
    this._coreMesh.visible = false;
    this._glowMesh.visible = false;
    this._guideMesh.visible = true;
    this._particles.visible = false;

    this.state = 'WARNING';
    this._timer = 0;
    this._hitTriggered = false;

    playSound(700, 0.15); // Charging warning sound
  }

  /**
   * Allows manual triggering for testing and debug
   */
  triggerManual(ballPos) {
    if (this.state === 'IDLE') {
      this._activateLaser(ballPos);
    }
  }

  update(gameplayDelta, ballPos) {
    if (gameplayDelta <= 0) return;

    this._timer += gameplayDelta;

    const corridor = this._corridors[this._activeCorridorIndex];

    switch (this.state) {
      case 'IDLE': {
        // Red blocks remain visible with soft steady idle glow
        this._setAllBlocksEmitterIntensity(1.0);

        if (this._timer >= this._cooldownDuration) {
          this._activateLaser(ballPos);
        }
        break;
      }

      case 'WARNING': {
        if (!corridor) break;

        const progress = this._timer / this._warningDuration;

        // Rapid blinking warning beacons on the active red blocks (10 Hz)
        const blink = Math.sin(this._timer * 25) > 0 ? 1 : 0.2;
        this._setCorridorBlocksEmitterIntensity(corridor, 1.5 * blink + progress * 2.5);

        // Guide beam flickers with needle-thin radius
        const guideRadius = 0.0008;
        this._guideMesh.scale.set(guideRadius, guideRadius, corridor.length);
        this._guideMaterial.opacity = 0.2 + 0.4 * Math.sin(this._timer * 22);

        if (this._timer >= this._warningDuration) {
          // Transition to FIRING
          this.state = 'FIRING';
          this._timer = 0;
          this._activeDuration = this._getRandomActiveDuration();

          this._coreMesh.visible = true;
          this._glowMesh.visible = true;
          this._guideMesh.visible = false;
          this._particles.visible = true;

          this._setCorridorBlocksEmitterIntensity(corridor, 5.0);
          playSound(220, 0.45); // Heavy laser activation pulse
        }
        break;
      }

      case 'FIRING': {
        if (!corridor) break;

        const t = this._timer;

        // Dynamic laser pulsation: tight, high-energy, concentrated beam
        const pulse = 1.0 + Math.sin(t * 40.0) * 0.06;
        const radiusCore = 0.0013 * pulse; // Razor-thin searing white core
        const radiusGlow = 0.0036 * pulse; // Tight, dense ruby-red neon sheath

        this._coreMesh.scale.set(radiusCore, radiusCore, corridor.length);
        this._glowMesh.scale.set(radiusGlow, radiusGlow, corridor.length);

        this._coreMaterial.opacity = 1.0;
        this._glowMaterial.opacity = 0.88 + Math.sin(t * 24.0) * 0.12;
        this._setCorridorBlocksEmitterIntensity(corridor, 4.0 + Math.sin(t * 18.0) * 1.5);

        // Animate sparks fluttering along the beam
        this._updateSparks(t, corridor.length);

        // Check collision with the ball ONLY (Walce / cylinders are immune to lasers: "walec jest odporny na lasery")
        if (ballPos && !this._hitTriggered) {
          this._checkBallCollision(ballPos, corridor);
        }

        if (this._timer >= this._activeDuration) {
          // Transition to FADING
          this.state = 'FADING';
          this._timer = 0;
        }
        break;
      }

      case 'FADING': {
        if (!corridor) break;

        const progress = this._timer / this._fadeDuration;
        const fade = Math.max(0, 1.0 - progress);

        const rCore = 0.0013 * fade;
        const rGlow = 0.0036 * fade;
        this._coreMesh.scale.set(rCore, rCore, corridor.length);
        this._glowMesh.scale.set(rGlow, rGlow, corridor.length);

        this._coreMaterial.opacity = fade;
        this._glowMaterial.opacity = 0.88 * fade;
        this._setCorridorBlocksEmitterIntensity(corridor, 1.0 + fade * 2.5);

        if (this._timer >= this._fadeDuration) {
          // Return to IDLE
          this.state = 'IDLE';
          this._timer = 0;
          this._cooldownDuration = this._getRandomCooldown();
          this._beamGroup.visible = false;
          this._coreMesh.visible = false;
          this._glowMesh.visible = false;
          this._particles.visible = false;
          this._hitTriggered = false; // Always clear hit state when returning to idle
          this._setAllBlocksEmitterIntensity(1.0);
        }
        break;
      }
    }
  }

  _setAllBlocksEmitterIntensity(intensity) {
    for (const corr of this._corridors) {
      this._setCorridorBlocksEmitterIntensity(corr, intensity);
    }
  }

  _setCorridorBlocksEmitterIntensity(corridor, intensity) {
    if (!corridor) return;
    this._setBlockIntensity(corridor.blockA, intensity);
    this._setBlockIntensity(corridor.blockB, intensity);
  }

  _setBlockIntensity(block, intensity) {
    if (!block) return;
    const emitter = block.getObjectByName('BlockEmitter');
    const light = block.getObjectByName('BlockLight');
    if (emitter && emitter.material) {
      emitter.material.emissiveIntensity = intensity;
    }
    if (light) {
      light.intensity = intensity * 0.35;
    }
  }

  _updateSparks(time, length) {
    if (!this._particles.visible) return;
    const positions = this._particles.geometry.attributes.position.array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const zFrac = ((time * 2.0 + i / count) % 1.0) - 0.5;
      // Sparks hug the laser beam tightly within 0.0022 units
      positions[idx] = (Math.random() - 0.5) * 0.0022;
      positions[idx + 1] = (Math.random() - 0.5) * 0.0022;
      positions[idx + 2] = zFrac * length;
    }
    this._particles.geometry.attributes.position.needsUpdate = true;
  }

  _distanceToSegment(ballPos, p1, p2) {
    const bx = ballPos.x;
    const bz = ballPos.z;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 0.00001) return 999;
    let t = ((bx - p1.x) * dx + (bz - p1.z) * dz) / lenSq;
    t = Math.max(0.0, Math.min(1.0, t));
    const projX = p1.x + t * dx;
    const projZ = p1.z + t * dz;
    return Math.hypot(bx - projX, bz - projZ);
  }

  /**
   * Collision check between the active laser line segment and the ball
   */
  _checkBallCollision(ballPos, corridor) {
    const dist = this._distanceToSegment(ballPos, corridor.p1, corridor.p2);
    const hitRadius = GAME_CONFIG.ball.radius + this._beamRadius;

    if (dist < hitRadius) {
      this._hitTriggered = true;
      playSound(120, 0.45); // Sharp electrical zap / destruction sound

      eventBus.emit('laser:hit', {
        x: ballPos.x,
        z: ballPos.z,
        corridorId: corridor.id
      });
    }
  }

  clearHit() {
    this._hitTriggered = false;
  }

  onBallRespawn() {
    this._hitTriggered = false;
    // Reset hazard cycle to IDLE so the player gets a fresh start and laser will hit every time
    this.reset();
  }

  reset() {
    this.state = 'IDLE';
    this._timer = 0;
    this._cooldownDuration = this._getRandomCooldown();
    this._beamGroup.visible = false;
    this._coreMesh.visible = false;
    this._glowMesh.visible = false;
    this._particles.visible = false;
    this._hitTriggered = false;
    this._setAllBlocksEmitterIntensity(1.0);
  }

  dispose() {
    this.reset();
    for (const corr of this._corridors) {
      if (corr.blockA && corr.blockA.parent) corr.blockA.parent.remove(corr.blockA);
      if (corr.blockB && corr.blockB.parent) corr.blockB.parent.remove(corr.blockB);
    }
    this._corridors = [];
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
