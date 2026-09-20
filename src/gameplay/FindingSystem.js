import * as THREE from 'three';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import { eventBus } from '../core/EventBus.js';
import { timeManager } from '../core/TimeManager.js';
import { playSound } from '../soundfx.js';

export class FindingSystem {
  constructor() {
    this._findings = new Map();
    this._group = new THREE.Group();
    this._group.name = 'FindingSystemGroup';

    // Total number of all crystal types combined (hidden, active, and collected total): strictly 15
    this.TOTAL_CRYSTALS = 15;
    this._slots = [];
    this._nextId = 0;
    this._tilesDiscoveredCount = 0;
    this._uncoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._maxModifiersForBoard = 3;

    this._dummy = new THREE.Object3D();
    this.instancedMesh = null;
    this._octaGeometry = null;
    this._material = null;

    // Pre-allocated colors for instanced rendering
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

    // Diamond / gem octahedron geometry shared across all 15 crystal instances
    this._octaGeometry = new THREE.OctahedronGeometry(1, 0);

    // Glowing crystal material with specular shine for Bloom and vibrant lighting
    this._material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.20,
      transparent: false,
      emissive: 0x333333,
      emissiveIntensity: 0.8
    });

    // Single InstancedMesh for ALL crystals (draws all 15 crystals in a single draw call!)
    this.instancedMesh = new THREE.InstancedMesh(this._octaGeometry, this._material, this.TOTAL_CRYSTALS);
    this.instancedMesh.name = 'FindingSystemInstancedMesh';
    this.instancedMesh.castShadow = false; // Disabled for mobile performance
    this.instancedMesh.receiveShadow = false;
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }

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

      // Initially scale to 0 far below table
      this._dummy.position.set(0, -999, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
      this.instancedMesh.setColorAt(i, this._colorPoints);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this._group.add(this.instancedMesh);
    this._unsub = eventBus.on('tile:discovered', this._onTileDiscovered.bind(this));
  }

  setLabelSystem(labelSystem) {
    this._labelSystem = labelSystem;
    if (this._labelSystem) {
      for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
        const slot = this._slots[i];
        if (slot.active && slot.revealed && slot.labelId === null) {
          slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
            text: slot.labelText,
            className: slot.labelClass,
            worldOffset: { x: 0, y: 0.038, z: 0 }
          });
        }
      }
    }
  }

  /**
   * Prepares the secret pool of exactly 15 crystals for the board:
   * - 1 - 3 Card Crystals ('modifier', 🃏)
   * - 1 - 2 Life Crystals ('emerald_crystal', +1❤️)
   * - 10 - 13 Points Crystals ('points_crystal', +250💎)
   * Total pool = exactly 15!
   *
   * Crystals are NOT placed visibly on the board at stage start.
   * They are uncovered dynamically as the player rolls over and conquers tiles!
   */
  setupBoardCrystals(tileManager) {
    if (!this.instancedMesh) return;

    // Clean reset any existing findings before configuring new board crystals
    this.reset();

    // Exact proportions summing to exactly 15 instances:
    const countCards = Math.floor(Math.random() * 3) + 1; // 1 to 3
    const countLife = Math.floor(Math.random() * 2) + 1;   // 1 to 2
    const countPoints = this.TOTAL_CRYSTALS - countCards - countLife; // 10 to 13 (sum = 15)

    // Build randomized queue of crystal specifications for the 15 slots
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

    // Fisher-Yates shuffle the crystal sequence
    for (let i = crystalSpecs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = crystalSpecs[i];
      crystalSpecs[i] = crystalSpecs[j];
      crystalSpecs[j] = temp;
    }

    // Configure the 15 slots in the InstancedMesh
    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const spec = crystalSpecs[i];
      const slot = this._slots[i];

      slot.active = false;
      slot.revealed = false;
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

      // Keep hidden initially
      slot.anchorObject.position.set(0, -999, 0);
      slot.anchorObject.visible = false;

      this.instancedMesh.setColorAt(i, spec.color);

      this._dummy.position.set(0, -999, 0);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Alias for setupBoardCrystals for backwards compatibility
   */
  spawnBoardCrystals(tileManager) {
    this.setupBoardCrystals(tileManager);
  }

  /**
   * Triggered when a tile is conquered by the player.
   * Uncovers the next hidden crystal from the 15-pool with genuine organic discovery!
   */
  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    this._tilesDiscoveredCount = (this._tilesDiscoveredCount || 0) + 1;
    if (!this.instancedMesh || tileIndex === undefined) return;

    // Check if we still have unrevealed crystals in the pool of 15
    if (this._uncoveredCount >= this.TOTAL_CRYSTALS) return;

    // Organic discovery pacing:
    // First crystal reveals quickly (around 2nd or 3rd tile conquered),
    // subsequent crystals uncover roughly every 3-4 tiles conquered
    const shouldUncover = (this._uncoveredCount === 0 && this._tilesDiscoveredCount >= 2) ||
      (this._tilesDiscoveredCount % 4 === 0) ||
      (Math.random() < 0.28);

    if (!shouldUncover) return;

    // Find first unrevealed slot in the pool
    const slot = this._slots.find(s => !s.revealed);
    if (!slot) return;

    // UNCOVER / REVEAL THIS CRYSTAL AT CONQUERED TILE COORDINATES!
    this._uncoveredCount++;
    slot.revealed = true;
    slot.active = true;
    slot.animatingSpawn = true;
    slot.spawnProgress = 0;
    slot.tileIndex = tileIndex;
    slot.gridX = (gridX !== undefined) ? gridX : 0;
    slot.gridY = (gridY !== undefined) ? gridY : 0;
    slot.baseX = x;
    slot.baseZ = z;
    slot.currentScale = 0.001;

    // Position and show anchor object for CSS2D label
    slot.anchorObject.position.set(x, slot.baseY, z);
    slot.anchorObject.visible = true;

    if (this._labelSystem && slot.labelId === null) {
      slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
        text: slot.labelText,
        className: slot.labelClass,
        worldOffset: { x: 0, y: 0.038, z: 0 }
      });
    }

    // Update instance color & initial position
    this.instancedMesh.setColorAt(slot.index, slot.color);
    this._dummy.position.set(x, slot.baseY, z);
    this._dummy.rotation.set(0, slot.rotationY, 0);
    this._dummy.scale.set(0.001, 0.001, 0.001);
    this._dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(slot.index, this._dummy.matrix);

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    // Register finding entry
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
        userData: { state: 'ready', bloomReady: true }
      }
    };
    this._findings.set(slot.id, findingData);

    // Juicy audio cue for uncovering a hidden crystal
    if (slot.type === 'modifier') {
      playSound(1200, 0.28);
    } else if (slot.type === 'emerald_crystal') {
      playSound(1000, 0.22);
    } else {
      playSound(820, 0.18);
    }

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

  /**
   * Backwards-compatible single finding spawn (for debug settings panel)
   */
  _spawnFinding(worldX, worldZ, tileIndex, type, readyImmediately = true, expiresAt = Infinity) {
    if (!this.instancedMesh) return;
    const slotIdx = this._slots.findIndex(s => !s.revealed && !s.active);
    if (slotIdx === -1) return; // Pool full (all 15 instances used)

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
    slot.tileIndex = tileIndex;
    slot.baseX = worldX;
    slot.baseZ = worldZ;
    slot.baseY = 0.034;
    slot.currentY = 0.034;
    slot.targetScale = radius;
    slot.currentScale = 0.001;
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
    slot.anchorObject.visible = true;

    if (this._labelSystem) {
      slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
        text: labelText,
        className: labelClass,
        worldOffset: { x: 0, y: 0.038, z: 0 }
      });
    }

    this.instancedMesh.setColorAt(slotIdx, color);
    this._dummy.position.set(worldX, slot.baseY, worldZ);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.set(0.001, 0.001, 0.001);
    this._dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(slotIdx, this._dummy.matrix);

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

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
        userData: { state: 'ready', bloomReady: true }
      }
    };
    this._findings.set(slot.id, findingData);
    eventBus.emit(isModifier ? 'modifier:spawned' : 'finding:spawned', { id: slot.id, tileIndex, type });
  }

  update(gameplayDelta) {
    if (!this.instancedMesh) return;
    const elapsed = timeManager.elapsed;

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const slot = this._slots[i];
      if (!slot.active || !slot.revealed) {
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      // Smooth pop-up expansion animation on initial discovery
      if (slot.animatingSpawn) {
        slot.spawnProgress = Math.min(1.0, slot.spawnProgress + gameplayDelta * 4.5);
        // Elastic overshoot easing for juicy gem pop
        const p = slot.spawnProgress;
        const overshoot = 1.30;
        const eased = (p < 0.7)
          ? (p / 0.7) * overshoot
          : overshoot - ((p - 0.7) / 0.3) * (overshoot - 1.0);
        slot.currentScale = slot.targetScale * Math.max(0.01, eased);

        if (slot.spawnProgress >= 1.0) {
          slot.animatingSpawn = false;
          slot.currentScale = slot.targetScale;
        }
      } else {
        slot.currentScale = slot.targetScale;
      }

      // Continuous rotation
      slot.rotationY += slot.rotationSpeed * gameplayDelta;
      slot.rotationX += slot.rotationSpeed * 0.40 * gameplayDelta;

      // Floating & Bobbing
      slot.currentY = slot.baseY + Math.sin(elapsed * 2.2 + slot.timeOffset) * slot.amplitude;
      slot.anchorObject.position.y = slot.currentY;

      // Update transform in InstancedMesh
      this._dummy.position.set(slot.baseX, slot.currentY, slot.baseZ);
      this._dummy.rotation.set(slot.rotationX, slot.rotationY, 0);
      this._dummy.scale.set(slot.currentScale, slot.currentScale, slot.currentScale);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
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
      // Only revealed and active crystals can be collected!
      if (!slot.active || !slot.revealed) continue;

      const dx = slot.baseX - bx;
      const dz = slot.baseZ - bz;
      const distSq = dx * dx + dz * dz;
      const crystalRadius = (slot.type === 'modifier') ? 0.020 : 0.022;
      const collectRadius = ballRadius + crystalRadius;

      if (distSq < collectRadius * collectRadius) {
        slot.active = false;
        slot.revealed = true; // Mark as uncovered & collected
        slot.anchorObject.visible = false;

        if (slot.labelId !== null && this._labelSystem) {
          this._labelSystem.removeLabel(slot.labelId);
          slot.labelId = null;
        }

        // Instantly hide collected instance
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        if (slot.type === 'points_crystal') {
          eventBus.emit('finding:collected', {
            id: slot.id,
            value: slot.value,
            type: 'points_crystal'
          });
          playSound(1250, 0.2);
        } else if (slot.type === 'emerald_crystal') {
          eventBus.emit('finding:collected', {
            id: slot.id,
            value: slot.value,
            type: 'emerald_crystal',
            givesLife: true
          });
          playSound(1450, 0.25);
        } else {
          eventBus.emit('modifier:collected', {
            id: slot.id,
            value: slot.value,
            type: 'modifier'
          });
          playSound(1500, 0.3);
        }

        const finding = this._findings.get(slot.id);
        if (finding) {
          finding.active = false;
          this._findings.delete(slot.id);
        }
      }
    }
  }

  reset() {
    this._tilesDiscoveredCount = 0;
    this._uncoveredCount = 0;
    this._totalModifiersSpawned = 0;
    this._findings.clear();

    for (let i = 0; i < this.TOTAL_CRYSTALS; i++) {
      const slot = this._slots[i];
      if (slot) {
        slot.active = false;
        slot.revealed = false;
        slot.animatingSpawn = false;
        slot.spawnProgress = 0;
        slot.currentScale = 0;
        slot.anchorObject.visible = false;
        if (slot.labelId !== null && this._labelSystem) {
          this._labelSystem.removeLabel(slot.labelId);
          slot.labelId = null;
        }
      }
      if (this.instancedMesh) {
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
      }
    }

    if (this.instancedMesh) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }

    this.reset();

    if (this._octaGeometry) {
      this._octaGeometry.dispose();
      this._octaGeometry = null;
    }

    if (this._material) {
      this._material.dispose();
      this._material = null;
    }

    if (this.instancedMesh) {
      this._group.remove(this.instancedMesh);
      this.instancedMesh.geometry.dispose();
      if (this.instancedMesh.material && this.instancedMesh.material.dispose) {
        this.instancedMesh.material.dispose();
      }
      this.instancedMesh = null;
    }

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
