import * as THREE from 'three';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import { eventBus } from '../core/EventBus.js';
import { timeManager } from '../core/TimeManager.js';
import { createCrystalMaterial, createBrightBloomCrystalMaterial, createEmeraldCrystalMaterial } from '../materials/environmentMaterials.js';
import { createChargingCrystalMaterial } from '../materials/chargingCrystalMaterial.js';
import { CircularLoadingRingManager } from '../rendering/CircularLoadingRing.js';
import { playSound } from '../soundfx.js';

export class FindingSystem {
  constructor() {
    this._findings = new Map();
    this._group = new THREE.Group();
    this._group.name = 'FindingSystemGroup';
    
    // Pools for Tetrahedron (cards: 1-3), Amber Octahedron (points: 10-60), and Emerald Octahedron (life: 1-2)
    this._tetraPool = [];
    this._octaPool = [];
    this._emeraldPool = [];
    this._tetraPoolSize = 10;
    this._octaPoolSize = 65; // Supports up to 60 point crystals on the board
    this._emeraldPoolSize = 10;
    this._nextId = 0;
    this._tilesDiscoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._maxModifiersForBoard = 3;
    
    this._tetraGeometry = new THREE.TetrahedronGeometry(1, 0);
    this._octaGeometry = new THREE.OctahedronGeometry(1, 0);
    
    this._tetraMaterial = null;
    this._octaMaterial = null;
    this._emeraldMaterial = null;
    
    this._ringManager = new CircularLoadingRingManager();
    this._unsub = null;
    this._labelSystem = null;
  }

  init(parentGroup, labelSystem = null) {
    if (parentGroup) {
      parentGroup.add(this._group);
    }
    this._labelSystem = labelSystem;
    
    this._tetraMaterial = createBrightBloomCrystalMaterial(0xff00cc);
    this._octaMaterial = createBrightBloomCrystalMaterial(0xffaa00);
    this._emeraldMaterial = createBrightBloomCrystalMaterial(0x00ff66);

    // Pre-create Tetrahedron meshes (cards)
    for (let i = 0; i < this._tetraPoolSize; i++) {
      const mesh = new THREE.Mesh(this._tetraGeometry, this._tetraMaterial);
      mesh.visible = false;
      mesh.castShadow = false; // Emissive crystals don't need heavy shadow casting
      this._group.add(mesh);
      this._tetraPool.push(mesh);
    }

    // Pre-create Amber Octahedron meshes (points: up to 60)
    for (let i = 0; i < this._octaPoolSize; i++) {
      const mesh = new THREE.Mesh(this._octaGeometry, this._octaMaterial);
      mesh.visible = false;
      mesh.castShadow = false; // Disabled for mobile performance
      this._group.add(mesh);
      this._octaPool.push(mesh);
    }

    // Pre-create Emerald Green Octahedron meshes (life)
    for (let i = 0; i < this._emeraldPoolSize; i++) {
      const mesh = new THREE.Mesh(this._octaGeometry, this._emeraldMaterial);
      mesh.visible = false;
      mesh.castShadow = false;
      this._group.add(mesh);
      this._emeraldPool.push(mesh);
    }

    this._unsub = eventBus.on('tile:discovered', this._onTileDiscovered.bind(this));
  }

  setLabelSystem(labelSystem) {
    this._labelSystem = labelSystem;
    // Attach labels to any active ready crystals if labelSystem was attached after spawn
    if (this._labelSystem) {
      for (const finding of this._findings.values()) {
        if (finding.active && finding.mesh.userData.state === 'ready' && !finding.mesh.userData.labelId) {
          const type = finding.type;
          const text = (type === 'emerald_crystal') ? '+1❤️' : ((type === 'points_crystal') ? '+250💎' : '🃏');
          const className = (type === 'emerald_crystal') ? 'crystal-countdown emerald ready' : ((type === 'points_crystal') ? 'crystal-countdown points ready' : 'crystal-countdown ready');
          finding.mesh.userData.labelId = this._labelSystem.createLabel(finding.mesh, {
            text,
            className,
            worldOffset: { x: 0, y: 0.038, z: 0 }
          });
        }
      }
    }
  }

  /**
   * Randomly scatters crystals across all playable/occupiable tiles on the board.
   * Specific quantities:
   * - 1 - 3 Card Crystals ('modifier')
   * - 1 - 2 Life Crystals ('emerald_crystal')
   * - 10 - 60 Points Crystals ('points_crystal')
   *
   * @param {Object} tileManager
   */
  spawnBoardCrystals(tileManager) {
    if (!tileManager) return;

    // Clean reset any existing findings before spawning new board crystals
    this.reset();

    const availableTiles = [];
    const tilesX = tileManager.tilesX || 18;
    const tilesY = tileManager.tilesY || 36;

    for (let y = 0; y < tilesY; y++) {
      for (let x = 0; x < tilesX; x++) {
        if (!tileManager.isObstacle(x, y)) {
          // Exclude default player spawn location
          if (x === 9 && y === 18) {
            continue;
          }
          availableTiles.push({ gridX: x, gridY: y });
        }
      }
    }

    if (availableTiles.length === 0) return;

    // Fisher-Yates shuffle
    for (let i = availableTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = availableTiles[i];
      availableTiles[i] = availableTiles[j];
      availableTiles[j] = temp;
    }

    // Exact quantities requested:
    // 1 - 3 card crystals
    const countCards = Math.floor(Math.random() * 3) + 1;
    // 1 - 2 life crystals
    const countLife = Math.floor(Math.random() * 2) + 1;
    // 10 - 60 points crystals
    const countPoints = Math.floor(Math.random() * 51) + 10;

    let tileIdx = 0;

    // 1. Spawn Card Crystals (1 - 3)
    for (let c = 0; c < countCards && tileIdx < availableTiles.length; c++, tileIdx++) {
      const tile = availableTiles[tileIdx];
      const worldPos = tileManager.getTileWorldPos(tile.gridX, tile.gridY);
      const index = tileManager.getTileIndex(tile.gridX, tile.gridY);
      this._spawnFinding(worldPos.x, worldPos.z, index, 'modifier', true, Infinity);
    }

    // 2. Spawn Life Crystals (1 - 2)
    for (let l = 0; l < countLife && tileIdx < availableTiles.length; l++, tileIdx++) {
      const tile = availableTiles[tileIdx];
      const worldPos = tileManager.getTileWorldPos(tile.gridX, tile.gridY);
      const index = tileManager.getTileIndex(tile.gridX, tile.gridY);
      this._spawnFinding(worldPos.x, worldPos.z, index, 'emerald_crystal', true, Infinity);
    }

    // 3. Spawn Points Crystals (10 - 60)
    for (let p = 0; p < countPoints && tileIdx < availableTiles.length; p++, tileIdx++) {
      const tile = availableTiles[tileIdx];
      const worldPos = tileManager.getTileWorldPos(tile.gridX, tile.gridY);
      const index = tileManager.getTileIndex(tile.gridX, tile.gridY);
      this._spawnFinding(worldPos.x, worldPos.z, index, 'points_crystal', true, Infinity);
    }
  }

  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    this._tilesDiscoveredCount = (this._tilesDiscoveredCount || 0) + 1;
    // Discovery spawning disabled: crystals are pre-populated on the board at stage start
    // in exact counts (1-3 cards, 1-2 life, 10-60 points) to prevent excessive crystal clutter.
  }

  _spawnFinding(worldX, worldZ, tileIndex, type, readyImmediately = false, expiresAt = Infinity) {
    const isModifier = (type === 'modifier');
    if (isModifier) {
      this._totalModifiersSpawned++;
    }
    let pool;
    if (type === 'modifier') pool = this._tetraPool;
    else if (type === 'points_crystal') pool = this._octaPool;
    else pool = this._emeraldPool;

    if (!pool || pool.length === 0) return;

    const mesh = pool.pop();
    const radius = isModifier ? 0.015 : 0.016;
    
    // Animation & lifecycle state
    mesh.userData.baseY = 0.042;
    mesh.userData.targetScale = radius;
    mesh.userData.amplitude = 0.008;
    mesh.userData.rotationSpeed = isModifier ? 1.6 : 2.0;
    mesh.userData.timeOffset = Math.random() * Math.PI * 2;
    mesh.userData.crystalType = type;

    const id = this._nextId++;

    if (readyImmediately) {
      mesh.position.set(worldX, mesh.userData.baseY, worldZ);
      mesh.scale.set(radius, radius, radius);
      mesh.visible = true;
      mesh.userData.popping = false;
      mesh.userData.popProgress = 1.0;
      mesh.userData.state = 'ready';
      mesh.userData.bloomReady = true;
      mesh.userData.timer = 0;
      mesh.userData.loadingRingMesh = null;

      if (type === 'emerald_crystal') {
        mesh.material = createBrightBloomCrystalMaterial(0x00ff66);
        if (this._labelSystem) {
          mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
            text: '+1❤️',
            className: 'crystal-countdown emerald ready',
            worldOffset: { x: 0, y: 0.038, z: 0 }
          });
        }
      } else if (type === 'points_crystal') {
        mesh.material = createBrightBloomCrystalMaterial(0xffaa00);
        if (this._labelSystem) {
          mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
            text: '+250💎',
            className: 'crystal-countdown points ready',
            worldOffset: { x: 0, y: 0.038, z: 0 }
          });
        }
      } else {
        mesh.material = createBrightBloomCrystalMaterial(0xff00cc);
        if (this._labelSystem) {
          mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
            text: '🃏',
            className: 'crystal-countdown ready',
            worldOffset: { x: 0, y: 0.038, z: 0 }
          });
        }
      }
    } else {
      mesh.position.set(worldX, 0.005, worldZ);
      mesh.scale.set(0.005, 0.005, 0.005);
      mesh.visible = true;
      mesh.userData.popping = true;
      mesh.userData.popProgress = 0;
      mesh.userData.bloomReady = false;
      mesh.userData.timer = 10.0;
      mesh.userData.lastSeconds = 10;
      mesh.userData.state = 'charging';

      const chargingColor = (type === 'emerald_crystal') ? 0x00ff66 : (type === 'points_crystal' ? 0xffaa00 : 0xff00cc);
      mesh.material = createChargingCrystalMaterial(chargingColor);

      const ringMesh = this._ringManager.createRingMesh(chargingColor);
      ringMesh.position.set(worldX, 0.003, worldZ);
      this._group.add(ringMesh);
      mesh.userData.loadingRingMesh = ringMesh;
      mesh.userData.labelId = null;
      playSound(isModifier ? 900 : (type === 'emerald_crystal' ? 1200 : 1100), 0.10);
    }

    const findingData = {
      id,
      type,
      value: isModifier ? 100 : (type === 'emerald_crystal' ? 200 : 250),
      createdAt: timeManager.elapsed,
      expiresAt: (expiresAt !== undefined && expiresAt !== null) ? expiresAt : (timeManager.elapsed + 45.0),
      tileIndex,
      mesh,
      active: true
    };

    this._findings.set(id, findingData);
    eventBus.emit(isModifier ? 'modifier:spawned' : 'finding:spawned', { id, tileIndex, type });
  }

  update(gameplayDelta) {
    const elapsed = timeManager.elapsed;

    for (const [id, finding] of this._findings.entries()) {
      if (!finding.active) continue;

      const mesh = finding.mesh;
      const t = elapsed;

      // Pop-out spawn scale & bounce animation
      if (mesh.userData.popping) {
        mesh.userData.popProgress += gameplayDelta * 3.2;
        if (mesh.userData.popProgress < 1.0) {
          const p = mesh.userData.popProgress;
          mesh.position.y = mesh.userData.baseY + Math.sin(p * Math.PI) * 0.04;
          const s = Math.min(1.25 * mesh.userData.targetScale, p * mesh.userData.targetScale * 1.25);
          mesh.scale.set(s, s, s);
        } else {
          mesh.userData.popping = false;
          mesh.scale.set(mesh.userData.targetScale, mesh.userData.targetScale, mesh.userData.targetScale);
        }
      } else {
        // Floating & Bobbing
        mesh.position.y = mesh.userData.baseY + Math.sin(t * 2.2 + mesh.userData.timeOffset) * mesh.userData.amplitude;
      }

      // Continuous rotation
      mesh.rotation.y += mesh.userData.rotationSpeed * gameplayDelta;
      mesh.rotation.x += mesh.userData.rotationSpeed * 0.45 * gameplayDelta;

      // Countdown lifecycle handling
      mesh.userData.timer -= gameplayDelta;
      const progress = Math.min(1.0, Math.max(0.0, 1.0 - (mesh.userData.timer / 10.0)));

      if (mesh.userData.state === 'charging') {
        // Update delicate circular loading bar
        if (mesh.userData.loadingRingMesh) {
          this._ringManager.updateRing(mesh.userData.loadingRingMesh, progress, t, 1.0);
        }
        // Update charging crystal shader uniforms
        if (mesh.material && mesh.material.uniforms) {
          if (mesh.material.uniforms.uTime) mesh.material.uniforms.uTime.value = t;
          if (mesh.material.uniforms.uChargeProgress) mesh.material.uniforms.uChargeProgress.value = progress;
        }
      }

      // Transition to bloom and ready state when 10s countdown finishes
      if (mesh.userData.state === 'charging' && mesh.userData.timer <= 0) {
        mesh.userData.state = 'ready';
        mesh.userData.bloomReady = true;

        // Complete & remove circular loading bar
        if (mesh.userData.loadingRingMesh) {
          mesh.userData.loadingRingMesh.visible = false;
          if (mesh.userData.loadingRingMesh.parent) {
            mesh.userData.loadingRingMesh.parent.remove(mesh.userData.loadingRingMesh);
          }
          mesh.userData.loadingRingMesh = null;
        }

        if (finding.type === 'emerald_crystal') {
          mesh.material = createBrightBloomCrystalMaterial(0x00ff66);
          if (this._labelSystem) {
            mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
              text: '+1❤️',
              className: 'crystal-countdown emerald ready',
              worldOffset: { x: 0, y: 0.038, z: 0 }
            });
          }
          playSound(1450, 0.25);
        } else if (finding.type === 'points_crystal') {
          mesh.material = createBrightBloomCrystalMaterial(0xffaa00);
          if (this._labelSystem) {
            mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
              text: '+250💎',
              className: 'crystal-countdown points ready',
              worldOffset: { x: 0, y: 0.038, z: 0 }
            });
          }
          playSound(1250, 0.25);
        } else {
          // Card modifier
          mesh.material = createBrightBloomCrystalMaterial(0xff00cc);
          if (this._labelSystem) {
            mesh.userData.labelId = this._labelSystem.createLabel(mesh, {
              text: '🃏',
              className: 'crystal-countdown ready',
              worldOffset: { x: 0, y: 0.038, z: 0 }
            });
          }
          playSound(1400, 0.25);
        }

        finding.expiresAt = timeManager.elapsed + 35.0; // 35s window to collect
      }

      // Emissive pulsation when ready
      if (mesh.userData.bloomReady && mesh.material) {
        mesh.material.emissiveIntensity = 3.0 + Math.sin(t * 6.0) * 1.2;
      }

      // Expiry check
      if (elapsed > finding.expiresAt) {
        this._returnToPool(finding);
      }
    }
  }

  checkCollection(ballX, ballZ, ballRadius) {
    let bx = ballX;
    let bz = ballZ;
    if (bx > 0.3 || bz > 0.6) {
      bx -= 0.514 / 2;
      bz -= 1.07 / 2;
    }

    for (const [id, finding] of this._findings.entries()) {
      if (!finding.active) continue;

      // Crystals cannot be collected while still charging during the 10s countdown!
      if (finding.mesh.userData.state !== 'ready') {
        continue;
      }

      const dx = finding.mesh.position.x - bx;
      const dz = finding.mesh.position.z - bz;
      const distSq = dx * dx + dz * dz;
      const crystalRadius = (finding.type === 'modifier') ? 0.016 : 0.018;
      const collectRadius = ballRadius + crystalRadius;

      if (distSq < collectRadius * collectRadius) {
        if (finding.type === 'points_crystal') {
          // Points crystal gives +250 points immediately, NO card modal
          eventBus.emit('finding:collected', {
            id: finding.id,
            value: finding.value,
            type: 'points_crystal'
          });
          playSound(1250, 0.2);
        } else if (finding.type === 'emerald_crystal') {
          // Emerald crystal gives points + extra life!
          eventBus.emit('finding:collected', {
            id: finding.id,
            value: finding.value,
            type: 'emerald_crystal',
            givesLife: true
          });
          playSound(1450, 0.25);
        } else {
          // Card modifier crystal opens card selection
          eventBus.emit('modifier:collected', {
            id: finding.id,
            value: finding.value,
            type: 'modifier'
          });
          playSound(1500, 0.3);
        }

        this._returnToPool(finding);
      }
    }
  }

  _returnToPool(finding) {
    finding.active = false;
    finding.mesh.visible = false;

    if (finding.mesh.userData.loadingRingMesh) {
      finding.mesh.userData.loadingRingMesh.visible = false;
      if (finding.mesh.userData.loadingRingMesh.parent) {
        finding.mesh.userData.loadingRingMesh.parent.remove(finding.mesh.userData.loadingRingMesh);
      }
      finding.mesh.userData.loadingRingMesh = null;
    }

    if (finding.mesh.userData.labelId !== null && this._labelSystem) {
      this._labelSystem.removeLabel(finding.mesh.userData.labelId);
      finding.mesh.userData.labelId = null;
    }

    // Return to respective pool
    if (finding.type === 'modifier') {
      finding.mesh.material = this._tetraMaterial;
      this._tetraPool.push(finding.mesh);
    } else if (finding.type === 'points_crystal') {
      finding.mesh.material = this._octaMaterial;
      this._octaPool.push(finding.mesh);
    } else {
      finding.mesh.material = this._emeraldMaterial;
      this._emeraldPool.push(finding.mesh);
    }

    this._findings.delete(finding.id);
  }

  reset() {
    this._tilesDiscoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._maxModifiersForBoard = 3;
    // Clear and return all active findings
    for (const finding of Array.from(this._findings.values())) {
      this._returnToPool(finding);
    }
    this._findings.clear();
  }

  dispose() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }

    this.reset();
    this._ringManager.dispose();

    this._tetraGeometry.dispose();
    this._octaGeometry.dispose();

    if (this._tetraMaterial) this._tetraMaterial.dispose();
    if (this._octaMaterial) this._octaMaterial.dispose();
    if (this._emeraldMaterial) this._emeraldMaterial.dispose();

    for (const mesh of this._tetraPool) this._group.remove(mesh);
    for (const mesh of this._octaPool) this._group.remove(mesh);
    for (const mesh of this._emeraldPool) this._group.remove(mesh);

    this._tetraPool = [];
    this._octaPool = [];
    this._emeraldPool = [];

    if (this._group.parent) {
      this._group.parent.remove(this._group);
    }
  }
}
