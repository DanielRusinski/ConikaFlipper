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
    
    // Pools for Tetrahedron (cards), Amber Octahedron (points), and Emerald Octahedron (life & points)
    this._tetraPool = [];
    this._octaPool = [];
    this._emeraldPool = [];
    this._poolSize = 15;
    this._nextId = 0;
    this._tilesDiscoveredCount = 0;
    this._totalModifiersSpawned = 0;
    // Guaranteed between 1 and 5 total card modifiers across a single board run (default 2-5)
    this._maxModifiersForBoard = Math.min(5, Math.max(2, Math.floor(Math.random() * 4) + 2));
    
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
    
    this._tetraMaterial = createCrystalMaterial(REWARD_CONFIG.modifiers?.crystalColor || 0x00e5ff);
    this._octaMaterial = createCrystalMaterial(0xffaa00); // Warm luminous amber-gold
    this._emeraldMaterial = createEmeraldCrystalMaterial(); // Vibrant glowing green with bloom

    // Pre-create Tetrahedron meshes
    for (let i = 0; i < this._poolSize; i++) {
      const mesh = new THREE.Mesh(this._tetraGeometry, this._tetraMaterial);
      mesh.visible = false;
      mesh.castShadow = true;
      this._group.add(mesh);
      this._tetraPool.push(mesh);
    }

    // Pre-create Amber Octahedron meshes
    for (let i = 0; i < this._poolSize; i++) {
      const mesh = new THREE.Mesh(this._octaGeometry, this._octaMaterial);
      mesh.visible = false;
      mesh.castShadow = true;
      this._group.add(mesh);
      this._octaPool.push(mesh);
    }

    // Pre-create Emerald Green Octahedron meshes
    for (let i = 0; i < this._poolSize; i++) {
      const mesh = new THREE.Mesh(this._octaGeometry, this._emeraldMaterial);
      mesh.visible = false;
      mesh.castShadow = true;
      this._group.add(mesh);
      this._emeraldPool.push(mesh);
    }

    this._unsub = eventBus.on('tile:discovered', this._onTileDiscovered.bind(this));
  }

  setLabelSystem(labelSystem) {
    this._labelSystem = labelSystem;
  }

  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    this._tilesDiscoveredCount = (this._tilesDiscoveredCount || 0) + 1;

    // Guaranteed early spawns:
    // Tile 2: Emerald Green (+1❤️)
    // Tile 3: Card Modifier Crystal (🃏) - guaranteed to appear early in every run!
    // Tile 4: Emerald Green (+1❤️)
    if (this._tilesDiscoveredCount === 2 || this._tilesDiscoveredCount === 4) {
      this._spawnFinding(x, z, tileIndex, 'emerald_crystal');
      return;
    }

    if (this._tilesDiscoveredCount === 3 && this._totalModifiersSpawned < this._maxModifiersForBoard) {
      this._spawnFinding(x, z, tileIndex, 'modifier');
      return;
    }

    // Milestone guaranteed card spawns if player hasn't reached the board limit yet
    if ((this._tilesDiscoveredCount === 12 || this._tilesDiscoveredCount === 24) &&
        this._totalModifiersSpawned < this._maxModifiersForBoard) {
      this._spawnFinding(x, z, tileIndex, 'modifier');
      return;
    }

    if (Math.random() < (REWARD_CONFIG.findings?.probability || 0.40)) {
      const canSpawnModifier = this._totalModifiersSpawned < this._maxModifiersForBoard;
      const roll = Math.random();

      if (canSpawnModifier && roll < 0.40) {
        // High priority to card modifier when under the 1-5 limit
        this._spawnFinding(x, z, tileIndex, 'modifier');
      } else if (roll < (canSpawnModifier ? 0.72 : 0.55)) {
        // Emerald crystal (life + points)
        this._spawnFinding(x, z, tileIndex, 'emerald_crystal');
      } else {
        // Amber crystal (points)
        this._spawnFinding(x, z, tileIndex, 'points_crystal');
      }
    }
  }

  _spawnFinding(worldX, worldZ, tileIndex, type) {
    const isModifier = (type === 'modifier');
    if (isModifier) {
      this._totalModifiersSpawned++;
    }
    let pool;
    if (type === 'modifier') pool = this._tetraPool;
    else if (type === 'points_crystal') pool = this._octaPool;
    else pool = this._emeraldPool;

    if (pool.length === 0) return;

    const mesh = pool.pop();
    const radius = isModifier ? 0.015 : 0.016;
    
    mesh.position.set(worldX, 0.005, worldZ);
    mesh.scale.set(0.005, 0.005, 0.005);
    mesh.visible = true;

    // Set initial charging material: crystal is barely visible during the 10s countdown
    const chargingColor = (type === 'emerald_crystal') ? 0x00ff66 : (type === 'points_crystal' ? 0xffaa00 : 0xff00cc);
    mesh.material = createChargingCrystalMaterial(chargingColor);

    // Animation & lifecycle state
    mesh.userData.baseY = 0.042;
    mesh.userData.targetScale = radius;
    mesh.userData.amplitude = 0.008;
    mesh.userData.rotationSpeed = isModifier ? 1.6 : 2.0;
    mesh.userData.timeOffset = Math.random() * Math.PI * 2;
    mesh.userData.popping = true;
    mesh.userData.popProgress = 0;
    mesh.userData.bloomReady = false;
    mesh.userData.crystalType = type;

    const id = this._nextId++;
    const lifetime = 45.0; // 10s charging countdown + 35s ready window
    mesh.userData.timer = 10.0;
    mesh.userData.lastSeconds = 10;
    mesh.userData.state = 'charging'; // ALL crystals have the 10s charging phase

    // Create delicate horizontal circular loading bar parallel to table surface around crystal
    const ringMesh = this._ringManager.createRingMesh(chargingColor);
    ringMesh.position.set(worldX, 0.003, worldZ);
    this._group.add(ringMesh);
    mesh.userData.loadingRingMesh = ringMesh;

    // No digital countdown label during charging phase
    mesh.userData.labelId = null;
    playSound(isModifier ? 900 : (type === 'emerald_crystal' ? 1200 : 1100), 0.10);

    const findingData = {
      id,
      type,
      value: isModifier ? 100 : (type === 'emerald_crystal' ? 200 : 250),
      createdAt: timeManager.elapsed,
      expiresAt: timeManager.elapsed + lifetime,
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
    // Guaranteed between 1 and 5 total card modifiers across a single board run (default 2-5)
    this._maxModifiersForBoard = Math.min(5, Math.max(2, Math.floor(Math.random() * 4) + 2));
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
