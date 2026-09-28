import * as THREE from 'three';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import { eventBus } from '../core/EventBus.js';
import { timeManager } from '../core/TimeManager.js';
import { playSound, playCrystalCollectSound } from '../soundfx.js';
import { CrystalParticleSystem } from '../effects/CrystalParticleSystem.js';
import {
  createCrystalGelShaderMaterial,
  updateCrystalGelTime,
  disposeCrystalGelMaterials
} from '../materials/crystalGelMaterial.js';
import {
  createCrystalGhostMaterial,
  updateCrystalGhostTime,
  disposeCrystalGhostMaterials
} from '../materials/crystalGhostMaterial.js';

export class FindingSystem {
  constructor() {
    this._findings = new Map();
    this._group = new THREE.Group();
    this._group.name = 'FindingSystemGroup';

    // Total number of all crystal types combined (hidden, active, and collected total): strictly 15
    this.TOTAL_CRYSTALS = 15;
    // Maximum simultaneous visible crystals on the board at any time: strictly 5
    this.MAX_SIMULTANEOUS_VISIBLE = 5;
    this._minuteRerollTimer = 0;
    this._discoveryInterval = 2.5; // Allows uncovering at least 5 crystals per 20 seconds during tile flipping
    this._discoveryCooldown = 0;   // Ready immediately at start
    this._slots = [];
    this._nextId = 0;
    this._tilesDiscoveredCount = 0;
    this._uncoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._maxModifiersForBoard = 3;

    this._dummy = new THREE.Object3D();

    // Typed instanced meshes for crystals: pairs of { solid, ghost } per type
    this._crystalMeshes = {
      points_crystal: { solid: null, ghost: null },
      emerald_crystal: { solid: null, ghost: null },
      modifier: { solid: null, ghost: null }
    };

    // Backwards compatibility aliases
    this.instancedMesh = null;
    this._ghostInstancedMesh = null;

    // Materials map
    this._crystalMaterials = {
      points_crystal: { solid: null, ghost: null },
      emerald_crystal: { solid: null, ghost: null },
      modifier: { solid: null, ghost: null }
    };

    this._octaGeometry = null;
    this._crystalParticleSystem = null;

    // Pre-allocated colors for instanced rendering / effects
    this._colorCard = new THREE.Color(0xff00cc);    // Neon Magenta
    this._colorLife = new THREE.Color(0x00ff66);    // Emerald Green
    this._colorPoints = new THREE.Color(0xffaa00);  // Amber Gold

    this._unsub = null;
    this._labelSystem = null;
  }

  init(parentGroup, labelSystem = null) {
    if (parentGroup) {
      parentGroup.add(this._group);
    }
    this._labelSystem = labelSystem;

    // Diamond / gem octahedron geometry shared across all crystal instances
    this._octaGeometry = new THREE.OctahedronGeometry(1, 0);

    // Create shader materials:
    // - Solid: CrystalGelMaterial (BoarderGelMaterialImpl with sparkles & 3-stop gradient)
    // - Ghost: CrystalGhostMaterial (Ghost silhouette identical to ball occluded silhouette)
    // 1. Points crystal (warm amber gold)
    this._crystalMaterials.points_crystal.solid = createCrystalGelShaderMaterial('points_crystal', { uOpacity: 1.0 });
    this._crystalMaterials.points_crystal.ghost = createCrystalGhostMaterial('points_crystal', { uOpacity: 0.95 });

    // 2. Emerald crystal (vibrant neon emerald green)
    this._crystalMaterials.emerald_crystal.solid = createCrystalGelShaderMaterial('emerald_crystal', { uOpacity: 1.0 });
    this._crystalMaterials.emerald_crystal.ghost = createCrystalGhostMaterial('emerald_crystal', { uOpacity: 0.95 });

    // 3. Modifier / card crystal (cyberpunk magenta & purple)
    this._crystalMaterials.modifier.solid = createCrystalGelShaderMaterial('modifier', { uOpacity: 1.0 });
    this._crystalMaterials.modifier.ghost = createCrystalGhostMaterial('modifier', { uOpacity: 0.95 });

    // InstancedMesh for each crystal type (solid & ghost)
    for (const type of ['points_crystal', 'emerald_crystal', 'modifier']) {
      const solidMat = this._crystalMaterials[type].solid;
      const ghostMat = this._crystalMaterials[type].ghost;

      const solidMesh = new THREE.InstancedMesh(this._octaGeometry, solidMat, this.TOTAL_CRYSTALS);
      solidMesh.name = `FindingSystemMesh_${type}_solid`;
      solidMesh.castShadow = false;
      solidMesh.receiveShadow = false;
      solidMesh.frustumCulled = false;
      solidMesh.renderOrder = 997;
      solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const ghostMesh = new THREE.InstancedMesh(this._octaGeometry, ghostMat, this.TOTAL_CRYSTALS);
      ghostMesh.name = `FindingSystemMesh_${type}_ghost`;
      ghostMesh.castShadow = false;
      ghostMesh.receiveShadow = false;
      ghostMesh.frustumCulled = false;
      ghostMesh.renderOrder = 998;
      ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      this._crystalMeshes[type] = { solid: solidMesh, ghost: ghostMesh };
      this._group.add(ghostMesh);
      this._group.add(solidMesh);
    }

    // Set backwards-compatible references to points_crystal meshes
    this.instancedMesh = this._crystalMeshes.points_crystal.solid;
    this._ghostInstancedMesh = this._crystalMeshes.points_crystal.ghost;

    // Pre-allocate 15 slots and anchor dummy objects for CSS2D labels
    this._slots = [];
    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const anchorObject = new THREE.Object3D();
      anchorObject.name = `CrystalAnchor_${i}`;
      anchorObject.visible = false;
      this._group.add(anchorObject);

      this._slots.push({
        index: i,
        active: false,
        revealed: false,
        state: 'hidden', // 'hidden' -> 'ghost_bouncing' -> 'solid_ready' -> 'collected'
        timer: 0,
        animatingSpawn: false,
        spawnProgress: 0,
        id: i,
        type: 'points_crystal',
        tileIndex: -1,
        gridX: 0,
        gridY: 0,
        baseX: 0,
        baseZ: 0,
        baseY: 0.034,
        currentY: 0.034,
        targetScale: 0.018,
        currentScale: 0,
        rotationX: 0,
        rotationY: 0,
        rotationSpeed: 2.0,
        timeOffset: Math.random() * Math.PI * 2,
        amplitude: 0.008,
        color: this._colorPoints,
        labelText: '+250💎',
        labelClass: 'crystal-countdown points ready',
        anchorObject,
        labelId: null,
        value: 250
      });

      this._hideSlotInAllMeshes(i);
    }

    this._markMeshesDirty();

    // Initialize 3D crystal particle effects & shockwaves system
    this._crystalParticleSystem = new CrystalParticleSystem();
    this._crystalParticleSystem.init(this._group);

    this._findingBoostTimer = null;
    this._unsubs = [
      eventBus.on('tile:discovered', this._onTileDiscovered.bind(this)),
      eventBus.on('modifier:finding', (data) => {
        const duration = (data && data.duration) ? data.duration : 20;
        this._discoveryInterval = 1.2;
        if (this._findingBoostTimer) clearTimeout(this._findingBoostTimer);
        this._findingBoostTimer = setTimeout(() => {
          this._discoveryInterval = 2.5;
        }, duration * 1000);
      })
    ];
  }

  _setSlotTransform(slotIndex, activeType, activeMeshType, x, y, z, rotX, rotY, scale) {
    for (const type of ['points_crystal', 'emerald_crystal', 'modifier']) {
      const pair = this._crystalMeshes[type];
      if (!pair) continue;

      if (type === activeType && activeMeshType === 'solid') {
        this._dummy.position.set(x, y, z);
        this._dummy.rotation.set(rotX, rotY, 0);
        this._dummy.scale.set(scale, scale, scale);
        this._dummy.updateMatrix();
        pair.solid.setMatrixAt(slotIndex, this._dummy.matrix);
      } else {
        this._dummy.position.set(0, -999, 0);
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        pair.solid.setMatrixAt(slotIndex, this._dummy.matrix);
      }

      if (type === activeType && activeMeshType === 'ghost') {
        this._dummy.position.set(x, y, z);
        this._dummy.rotation.set(rotX, rotY, 0);
        this._dummy.scale.set(scale, scale, scale);
        this._dummy.updateMatrix();
        pair.ghost.setMatrixAt(slotIndex, this._dummy.matrix);
      } else {
        this._dummy.position.set(0, -999, 0);
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        pair.ghost.setMatrixAt(slotIndex, this._dummy.matrix);
      }
    }
  }

  _hideSlotInAllMeshes(slotIndex) {
    this._dummy.position.set(0, -999, 0);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    for (const type of ['points_crystal', 'emerald_crystal', 'modifier']) {
      const pair = this._crystalMeshes[type];
      if (!pair) continue;
      pair.solid.setMatrixAt(slotIndex, this._dummy.matrix);
      pair.ghost.setMatrixAt(slotIndex, this._dummy.matrix);
    }
  }

  _markMeshesDirty() {
    for (const type of ['points_crystal', 'emerald_crystal', 'modifier']) {
      const pair = this._crystalMeshes[type];
      if (!pair) continue;
      if (pair.solid) pair.solid.instanceMatrix.needsUpdate = true;
      if (pair.ghost) pair.ghost.instanceMatrix.needsUpdate = true;
    }
  }

  setLabelSystem(labelSystem) {
    this._labelSystem = labelSystem;
    if (this._labelSystem) {
      for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
        const slot = this._slots[i];
        if (slot.active && slot.revealed && slot.labelId === null && slot.state === 'solid_ready') {
          slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
            text: slot.labelText,
            className: slot.labelClass,
            worldOffset: { x: 0, y: 0.046, z: 0 }
          });
        }
      }
    }
  }

  setupBoardCrystals(tileManager) {
    if (!this.instancedMesh) return;

    this.reset();

    const countCards = Math.floor(Math.random() * 3) + 1; // 1 to 3
    const countLife = Math.floor(Math.random() * 2) + 1;   // 1 to 2
    const countPoints = this.TOTAL_CRYSTALS - countCards - countLife; // 10 to 13 (sum = 15)

    const crystalSpecs = [];
    for (let c = 0; c < countCards; c++) {
      crystalSpecs.push({
        type: 'modifier',
        color: this._colorCard,
        value: 100,
        radius: 0.017,
        labelText: '🃏',
        labelClass: 'crystal-countdown ready',
        rotSpeed: 1.6
      });
    }
    for (let l = 0; l < countLife; l++) {
      crystalSpecs.push({
        type: 'emerald_crystal',
        color: this._colorLife,
        value: 200,
        radius: 0.018,
        labelText: '+1❤️',
        labelClass: 'crystal-countdown emerald ready',
        rotSpeed: 2.0
      });
    }
    for (let p = 0; p < countPoints; p++) {
      crystalSpecs.push({
        type: 'points_crystal',
        color: this._colorPoints,
        value: 250,
        radius: 0.018,
        labelText: '+250💎',
        labelClass: 'crystal-countdown points ready',
        rotSpeed: 2.0
      });
    }

    for (let i = crystalSpecs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = crystalSpecs[i];
      crystalSpecs[i] = crystalSpecs[j];
      crystalSpecs[j] = temp;
    }

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const spec = crystalSpecs[i];
      const slot = this._slots[i];

      slot.active = false;
      slot.revealed = false;
      slot.state = 'hidden';
      slot.timer = 0;
      slot.animatingSpawn = false;
      slot.spawnProgress = 0;
      slot.id = this._nextId++;
      slot.type = spec.type;
      slot.tileIndex = -1;
      slot.gridX = 0;
      slot.gridY = 0;
      slot.baseX = 0;
      slot.baseZ = 0;
      slot.baseY = 0.034;
      slot.currentY = 0.034;
      slot.targetScale = spec.radius;
      slot.currentScale = 0;
      slot.rotationX = 0;
      slot.rotationY = Math.random() * Math.PI * 2;
      slot.rotationSpeed = spec.rotSpeed;
      slot.timeOffset = Math.random() * Math.PI * 2;
      slot.amplitude = 0.008;
      slot.color = spec.color;
      slot.value = spec.value;
      slot.labelText = spec.labelText;
      slot.labelClass = spec.labelClass;
      slot.labelId = null;

      slot.anchorObject.position.set(0, -999, 0);
      slot.anchorObject.visible = false;

      this._hideSlotInAllMeshes(i);
    }

    this._markMeshesDirty();
  }

  spawnBoardCrystals(tileManager) {
    this.setupBoardCrystals(tileManager);
  }

  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    this._tilesDiscoveredCount = (this._tilesDiscoveredCount || 0) + 1;
    if (!this.instancedMesh || tileIndex === undefined) return;

    const visibleCount = this._slots.filter(s => s.revealed && s.state !== 'collected').length;
    if (visibleCount >= this.MAX_SIMULTANEOUS_VISIBLE) return;

    if (this._discoveryCooldown > 0) return;

    const shouldUncover = (this._uncoveredCount === 0 && this._tilesDiscoveredCount >= 1) ||
      (this._tilesDiscoveredCount % 2 === 0) ||
      (Math.random() < 0.75);

    if (!shouldUncover) return;

    const slot = this._slots.find(s => !s.revealed && s.state === 'hidden');
    if (!slot) return;

    this._uncoveredCount++;
    this._discoveryCooldown = this._discoveryInterval;
    slot.revealed = true;
    slot.active = true;
    slot.state = 'ghost_bouncing';
    slot.timer = 0;
    slot.tileIndex = tileIndex;
    slot.gridX = (gridX !== undefined) ? gridX : 0;
    slot.gridY = (gridY !== undefined) ? gridY : 0;
    slot.baseX = x;
    slot.baseZ = z;
    slot.currentScale = 0.001;

    slot.anchorObject.position.set(x, slot.baseY, z);
    slot.anchorObject.visible = false;
    slot.labelId = null;

    this._setSlotTransform(slot.index, slot.type, 'ghost', x, slot.baseY, z, 0, slot.rotationY, 0.001);
    this._markMeshesDirty();

    const findingData = {
      id: slot.id,
      slotIndex: slot.index,
      type: slot.type,
      value: slot.value,
      tileIndex: slot.tileIndex,
      active: true,
      expiresAt: Infinity,
      mesh: {
        position: slot.anchorObject.position,
        visible: true,
        userData: { state: 'ghost_bouncing', bloomReady: true }
      }
    };
    this._findings.set(slot.id, findingData);

    playSound(720, 0.16);

    eventBus.emit('crystal:revealed', {
      slotIndex: slot.index,
      id: slot.id,
      type: slot.type,
      tileIndex: slot.tileIndex,
      x: slot.baseX,
      z: slot.baseZ
    });

    eventBus.emit(slot.type === 'modifier' ? 'modifier:spawned' : 'finding:spawned', {
      id: slot.id,
      tileIndex: slot.tileIndex,
      type: slot.type
    });
  }

  _spawnFinding(worldX, worldZ, tileIndex, type, readyImmediately = true, expiresAt = Infinity) {
    if (!this.instancedMesh) return;
    const slotIdx = this._slots.findIndex(s => !s.revealed && !s.active);
    if (slotIdx === -1) return;

    const slot = this._slots[slotIdx];
    this._uncoveredCount++;
    const isModifier = (type === 'modifier');
    const color = isModifier ? this._colorCard : (type === 'emerald_crystal' ? this._colorLife : this._colorPoints);
    const radius = isModifier ? 0.017 : 0.018;
    const labelText = isModifier ? '🃏' : (type === 'emerald_crystal' ? '+1❤️' : '+250💎');
    const labelClass = isModifier ? 'crystal-countdown ready' : (type === 'emerald_crystal' ? 'crystal-countdown emerald ready' : 'crystal-countdown points ready');
    const value = isModifier ? 100 : (type === 'emerald_crystal' ? 200 : 250);

    slot.active = true;
    slot.revealed = true;
    slot.animatingSpawn = true;
    slot.spawnProgress = 0;
    slot.id = this._nextId++;
    slot.type = type;
    slot.state = readyImmediately ? 'solid_ready' : 'ghost_bouncing';
    slot.tileIndex = tileIndex;
    slot.baseX = worldX;
    slot.baseZ = worldZ;
    slot.baseY = 0.034;
    slot.currentY = 0.034;
    slot.targetScale = radius;
    slot.currentScale = readyImmediately ? radius : 0.001;
    slot.rotationX = 0;
    slot.rotationY = 0;
    slot.rotationSpeed = isModifier ? 1.6 : 2.0;
    slot.timeOffset = Math.random() * Math.PI * 2;
    slot.amplitude = 0.008;
    slot.color = color;
    slot.value = value;
    slot.labelText = labelText;
    slot.labelClass = labelClass;

    slot.anchorObject.position.set(worldX, slot.baseY, worldZ);
    slot.anchorObject.visible = readyImmediately;

    if (this._labelSystem && readyImmediately) {
      slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
        text: labelText,
        className: labelClass,
        worldOffset: { x: 0, y: 0.046, z: 0 }
      });
    }

    if (readyImmediately) {
      this._setSlotTransform(slotIdx, type, 'solid', worldX, slot.baseY, worldZ, 0, 0, radius);
    } else {
      this._setSlotTransform(slotIdx, type, 'ghost', worldX, slot.baseY, worldZ, 0, 0, 0.001);
    }
    this._markMeshesDirty();

    const findingData = {
      id: slot.id,
      slotIndex: slotIdx,
      type,
      value,
      tileIndex,
      active: true,
      expiresAt: (expiresAt !== undefined && expiresAt !== null) ? expiresAt : Infinity,
      mesh: {
        position: slot.anchorObject.position,
        visible: true,
        userData: { state: readyImmediately ? 'ready' : 'ghost_bouncing', bloomReady: true }
      }
    };
    this._findings.set(slot.id, findingData);
    eventBus.emit(isModifier ? 'modifier:spawned' : 'finding:spawned', { id: slot.id, tileIndex, type });
  }

  update(gameplayDelta) {
    if (!this.instancedMesh) return;
    const elapsed = timeManager.elapsed;

    // Continuous crystal gel shader animation (sparkles, noise glitter, wave oscillation)
    updateCrystalGelTime(elapsed);
    // Continuous crystal ghost silhouette animation (Fresnel pulse & neon edge rim)
    updateCrystalGhostTime(elapsed);

    // Decrement discovery cooldown
    if (this._discoveryCooldown > 0) {
      this._discoveryCooldown -= gameplayDelta;
      if (this._discoveryCooldown < 0) this._discoveryCooldown = 0;
    }

    // Periodic 20-second lottery re-roll for undiscovered crystals
    this._minuteRerollTimer += gameplayDelta;
    if (this._minuteRerollTimer >= 20.0) {
      this._minuteRerollTimer = 0;
      this._rerollHiddenCrystals();
    }

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const slot = this._slots[i];
      if (!slot.active || !slot.revealed || slot.state === 'collected' || slot.state === 'hidden') {
        this._hideSlotInAllMeshes(i);
        continue;
      }

      // Continuous axial rotation
      slot.rotationY += slot.rotationSpeed * gameplayDelta;
      slot.rotationX += slot.rotationSpeed * 0.40 * gameplayDelta;

      if (slot.state === 'ghost_bouncing') {
        slot.timer += gameplayDelta;
        const totalBounceDuration = 1.45;
        const totalActivationDuration = 6.0;

        if (slot.timer < totalBounceDuration) {
          // Phase 1: Bouncing transparent crystal
          const p = slot.timer / totalBounceDuration;
          const bounceH = 0.028 * Math.abs(Math.sin(p * Math.PI * 5.5)) * Math.pow(1.0 - p, 0.85);
          slot.currentY = slot.baseY + bounceH;
          slot.currentScale = slot.targetScale * Math.min(1.0, p * 2.5);

          this._setSlotTransform(i, slot.type, 'ghost', slot.baseX, slot.currentY, slot.baseZ, slot.rotationX, slot.rotationY, slot.currentScale);

        } else if (slot.timer < totalActivationDuration) {
          // Phase 2: Rests transparent and bobs gently until 6.0 seconds elapse
          slot.currentY = slot.baseY + Math.sin(elapsed * 2.2 + slot.timeOffset) * slot.amplitude;
          slot.currentScale = slot.targetScale;

          this._setSlotTransform(i, slot.type, 'ghost', slot.baseX, slot.currentY, slot.baseZ, slot.rotationX, slot.rotationY, slot.currentScale);

        } else {
          // Phase 3: Fills with full solid glowing color after 6.0s!
          slot.state = 'solid_ready';
          slot.currentScale = slot.targetScale;
          slot.anchorObject.visible = true;

          if (this._labelSystem && slot.labelId === null) {
            slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
              text: slot.labelText,
              className: slot.labelClass,
              worldOffset: { x: 0, y: 0.046, z: 0 }
            });
          }

          if (slot.type === 'modifier') {
            playSound(1250, 0.25);
          } else if (slot.type === 'emerald_crystal') {
            playSound(1100, 0.22);
          } else {
            playSound(960, 0.20);
          }

          const f = this._findings.get(slot.id);
          if (f && f.mesh && f.mesh.userData) {
            f.mesh.userData.state = 'ready';
          }

          this._setSlotTransform(i, slot.type, 'solid', slot.baseX, slot.currentY, slot.baseZ, slot.rotationX, slot.rotationY, slot.targetScale);
        }
      } else if (slot.state === 'solid_ready') {
        // Floating & Bobbing in full solid color
        slot.currentY = slot.baseY + Math.sin(elapsed * 2.2 + slot.timeOffset) * slot.amplitude;
        slot.anchorObject.position.y = slot.currentY;

        this._setSlotTransform(i, slot.type, 'solid', slot.baseX, slot.currentY, slot.baseZ, slot.rotationX, slot.rotationY, slot.targetScale);
      }
    }

    this._markMeshesDirty();

    if (this._crystalParticleSystem) {
      this._crystalParticleSystem.update(gameplayDelta);
    }
  }

  checkCollection(ballX, ballZ, ballRadius) {
    if (!this.instancedMesh) return;

    let bx = ballX;
    let bz = ballZ;
    if (bx > 0.3 || bz > 0.6) {
      bx -= 0.514 / 2;
      bz -= 1.07 / 2;
    }

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const slot = this._slots[i];
      if (!slot.active || !slot.revealed || slot.state !== 'solid_ready') continue;

      const dx = slot.baseX - bx;
      const dz = slot.baseZ - bz;
      const distSq = dx * dx + dz * dz;
      const crystalRadius = (slot.type === 'modifier') ? 0.020 : 0.022;
      const collectRadius = ballRadius + crystalRadius;

      if (distSq < collectRadius * collectRadius) {
        const pickupX = slot.baseX;
        const pickupY = slot.currentY;
        const pickupZ = slot.baseZ;
        const pickupColor = slot.color;

        slot.active = false;
        slot.state = 'hidden';
        slot.revealed = false;
        slot.anchorObject.visible = false;
        slot.timer = 0;

        if (slot.labelId !== null && this._labelSystem) {
          this._labelSystem.removeLabel(slot.labelId);
          slot.labelId = null;
        }

        this._hideSlotInAllMeshes(i);
        this._markMeshesDirty();

        const collectedType = slot.type;
        const collectedValue = slot.value;
        const collectedId = slot.id;

        if (this._crystalParticleSystem) {
          this._crystalParticleSystem.spawnCollectBurst(
            pickupX,
            pickupY,
            pickupZ,
            collectedType,
            pickupColor
          );
        }

        playCrystalCollectSound(collectedType);

        // Re-roll fresh spec for this recycled slot respecting board limits
        const currentCards = this._slots.filter(s => s.revealed && s.type === 'modifier').length;
        const currentLife = this._slots.filter(s => s.revealed && s.type === 'emerald_crystal').length;

        let nextType = 'points_crystal';
        if (currentCards < 2 && Math.random() < 0.20) {
          nextType = 'modifier';
        } else if (currentLife < 1 && Math.random() < 0.20) {
          nextType = 'emerald_crystal';
        }

        const isModifier = (nextType === 'modifier');
        const color = isModifier ? this._colorCard : (nextType === 'emerald_crystal' ? this._colorLife : this._colorPoints);
        const radius = isModifier ? 0.017 : 0.018;
        const labelText = isModifier ? '🃏' : (nextType === 'emerald_crystal' ? '+1❤️' : '+250💎');
        const labelClass = isModifier ? 'crystal-countdown ready' : (nextType === 'emerald_crystal' ? 'crystal-countdown emerald ready' : 'crystal-countdown points ready');
        const value = isModifier ? 100 : (nextType === 'emerald_crystal' ? 200 : 250);

        slot.type = nextType;
        slot.color = color;
        slot.value = value;
        slot.targetScale = radius;
        slot.rotationSpeed = isModifier ? 1.6 : 2.0;
        slot.labelText = labelText;
        slot.labelClass = labelClass;

        if (collectedType === 'points_crystal') {
          eventBus.emit('finding:collected', {
            id: collectedId,
            value: collectedValue,
            type: 'points_crystal',
            x: pickupX,
            y: pickupY,
            z: pickupZ
          });
        } else if (collectedType === 'emerald_crystal') {
          eventBus.emit('finding:collected', {
            id: collectedId,
            value: collectedValue,
            type: 'emerald_crystal',
            givesLife: true,
            x: pickupX,
            y: pickupY,
            z: pickupZ
          });
        } else {
          eventBus.emit('modifier:collected', {
            id: collectedId,
            value: collectedValue,
            type: 'modifier',
            x: pickupX,
            y: pickupY,
            z: pickupZ
          });
        }

        const finding = this._findings.get(collectedId);
        if (finding) {
          finding.active = false;
          this._findings.delete(collectedId);
        }
      }
    }
  }

  _rerollHiddenCrystals() {
    const hiddenSlots = this._slots.filter(s => !s.revealed && s.state === 'hidden');
    if (hiddenSlots.length === 0) return;

    const existingCards = this._slots.filter(s => s.revealed && s.type === 'modifier').length;
    const existingLife = this._slots.filter(s => s.revealed && s.type === 'emerald_crystal').length;

    const targetCards = Math.floor(Math.random() * 3) + 1;
    const targetLife = Math.floor(Math.random() * 2) + 1;

    const neededCards = Math.max(0, Math.min(hiddenSlots.length, targetCards - existingCards));
    const neededLife = Math.max(0, Math.min(hiddenSlots.length - neededCards, targetLife - existingLife));
    const neededPoints = Math.max(0, hiddenSlots.length - neededCards - neededLife);

    const specs = [];
    for (let c = 0; c < neededCards; c++) {
      specs.push({
        type: 'modifier',
        color: this._colorCard,
        value: 100,
        radius: 0.017,
        labelText: '🃏',
        labelClass: 'crystal-countdown ready',
        rotSpeed: 1.6
      });
    }
    for (let l = 0; l < neededLife; l++) {
      specs.push({
        type: 'emerald_crystal',
        color: this._colorLife,
        value: 200,
        radius: 0.018,
        labelText: '+1❤️',
        labelClass: 'crystal-countdown emerald ready',
        rotSpeed: 2.0
      });
    }
    for (let p = 0; p < neededPoints; p++) {
      specs.push({
        type: 'points_crystal',
        color: this._colorPoints,
        value: 250,
        radius: 0.018,
        labelText: '+250💎',
        labelClass: 'crystal-countdown points ready',
        rotSpeed: 2.0
      });
    }

    for (let i = specs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = specs[i];
      specs[i] = specs[j];
      specs[j] = temp;
    }

    for (let i = 0; i < hiddenSlots.length; i++) {
      const slot = hiddenSlots[i];
      const spec = specs[i];
      slot.type = spec.type;
      slot.color = spec.color;
      slot.value = spec.value;
      slot.targetScale = spec.radius;
      slot.rotationSpeed = spec.rotSpeed;
      slot.labelText = spec.labelText;
      slot.labelClass = spec.labelClass;
      this._hideSlotInAllMeshes(slot.index);
    }
    this._markMeshesDirty();
  }

  reset() {
    this._tilesDiscoveredCount = 0;
    this._uncoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._minuteRerollTimer = 0;
    this._discoveryCooldown = 0;
    this._findings.clear();

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const slot = this._slots[i];
      if (slot) {
        slot.active = false;
        slot.revealed = false;
        slot.state = 'hidden';
        slot.timer = 0;
        slot.animatingSpawn = false;
        slot.spawnProgress = 0;
        slot.currentScale = 0;
        slot.anchorObject.visible = false;
        if (slot.labelId !== null && this._labelSystem) {
          this._labelSystem.removeLabel(slot.labelId);
          slot.labelId = null;
        }
      }
      this._hideSlotInAllMeshes(i);
    }
    this._markMeshesDirty();

    if (this._crystalParticleSystem) {
      this._crystalParticleSystem.reset();
    }
  }

  dispose() {
    if (this._findingBoostTimer) {
      clearTimeout(this._findingBoostTimer);
      this._findingBoostTimer = null;
    }
    if (this._unsubs) {
      this._unsubs.forEach(u => u());
      this._unsubs = [];
    }
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }

    if (this._crystalParticleSystem) {
      this._crystalParticleSystem.dispose();
      this._crystalParticleSystem = null;
    }

    this.reset();

    if (this._octaGeometry) {
      this._octaGeometry.dispose();
      this._octaGeometry = null;
    }

    for (const type of ['points_crystal', 'emerald_crystal', 'modifier']) {
      const pair = this._crystalMeshes[type];
      if (pair) {
        if (pair.solid) {
          this._group.remove(pair.solid);
          if (pair.solid.geometry) pair.solid.geometry.dispose();
          if (pair.solid.material && pair.solid.material.dispose) pair.solid.material.dispose();
        }
        if (pair.ghost) {
          this._group.remove(pair.ghost);
          if (pair.ghost.geometry) pair.ghost.geometry.dispose();
          if (pair.ghost.material && pair.ghost.material.dispose) pair.ghost.material.dispose();
        }
      }
    }
    this._crystalMeshes = {
      points_crystal: { solid: null, ghost: null },
      emerald_crystal: { solid: null, ghost: null },
      modifier: { solid: null, ghost: null }
    };
    this.instancedMesh = null;
    this._ghostInstancedMesh = null;

    disposeCrystalGelMaterials();
    disposeCrystalGhostMaterials();

    for (const slot of this._slots) {
      if (slot.anchorObject && slot.anchorObject.parent) {
        slot.anchorObject.parent.remove(slot.anchorObject);
      }
    }
    this._slots = [];

    if (this._group.parent) {
      this._group.parent.remove(this._group);
    }
  }
}
