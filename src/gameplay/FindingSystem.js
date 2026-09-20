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

    // Total number of all crystal types combined (hidden, active, and collected total): exactly 15
    this.TOTAL_CRYSTALS = 15;
    this._slots = [];
    this._nextId = 0;
    this._tilesDiscoveredCount = 0;
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

    // Glowing crystal material with vertexColors enabled so Three.js natively passes vColor
    this._material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.95,
      vertexColors: true
    });

    this._material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        #if defined( USE_COLOR )
          totalEmissiveRadiance += vColor.rgb * 2.5;
        #endif
        `
      );
    };

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
        baseY: 0.042,
        currentY: 0.042,
        targetScale: 0.016,
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
   * Secretly distributes exactly 15 hidden crystals across eligible tiles on the board.
   * Crystals are NOT placed visibly on the board at stage start.
   * They remain hidden until the player rolls over and conquers the tile (tile:discovered).
   *
   * Exact breakdown:
   * - 1 - 3 Card Crystals ('modifier', 🃏)
   * - 1 - 2 Life Crystals ('emerald_crystal', +1❤️)
   * - 10 - 13 Points Crystals ('points_crystal', +250💎)
   * Total pool = exactly 15!
   *
   * @param {Object} tileManager
   */
  setupBoardCrystals(tileManager) {
    if (!tileManager || !this.instancedMesh) return;

    // Clean reset any existing findings before configuring new board crystals
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

    // Fisher-Yates shuffle available tiles for fair random distribution
    for (let i = availableTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = availableTiles[i];
      availableTiles[i] = availableTiles[j];
      availableTiles[j] = temp;
    }

    // Exact proportions summing to exactly 15 instances:
    const countCards = Math.floor(Math.random() * 3) + 1; // 1 to 3
    const countLife = Math.floor(Math.random() * 2) + 1;   // 1 to 2
    const countPoints = this.TOTAL_CRYSTALS - countCards - countLife; // 10 to 13 (sum = 15)

    let slotIdx = 0;

    // Helper to configure a secret hidden slot in the InstancedMesh
    const configureSlot = (type, color, value, radius, labelText, labelClass, rotSpeed) => {
      if (slotIdx >= this.TOTAL_CRYSTALS || slotIdx >= availableTiles.length) return;
      const tile = availableTiles[slotIdx];
      const worldPos = tileManager.getTileWorldPos(tile.gridX, tile.gridY);
      const index = tileManager.getTileIndex(tile.gridX, tile.gridY);
      const slot = this._slots[slotIdx];

      // Secretly pre-assigned: NOT revealed and NOT active yet!
      slot.active = false;
      slot.revealed = false;
      slot.animatingSpawn = false;
      slot.spawnProgress = 0;
      slot.id = this._nextId++;
      slot.type = type;
      slot.tileIndex = index;
      slot.gridX = tile.gridX;
      slot.gridY = tile.gridY;
      slot.baseX = worldPos.x;
      slot.baseZ = worldPos.z;
      slot.baseY = 0.042;
      slot.currentY = 0.042;
      slot.targetScale = radius;
      slot.currentScale = 0;
      slot.rotationX = 0;
      slot.rotationY = Math.random() * Math.PI * 2;
      slot.rotationSpeed = rotSpeed;
      slot.timeOffset = Math.random() * Math.PI * 2;
      slot.amplitude = 0.008;
      slot.color = color;
      slot.value = value;
      slot.labelText = labelText;
      slot.labelClass = labelClass;
      slot.labelId = null;

      // Position anchor object at the tile, but keep it hidden until revealed
      slot.anchorObject.position.set(worldPos.x, slot.baseY, worldPos.z);
      slot.anchorObject.visible = false;

      // Pre-set instance color in InstancedMesh
      this.instancedMesh.setColorAt(slotIdx, color);

      // Hide instance transform far below table with zero scale
      this._dummy.position.set(0, -999, 0);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(slotIdx, this._dummy.matrix);

      slotIdx++;
    };

    // 1. Configure Card Crystals (1 - 3)
    for (let c = 0; c < countCards; c++) {
      configureSlot('modifier', this._colorCard, 100, 0.015, '🃏', 'crystal-countdown ready', 1.6);
    }

    // 2. Configure Life Crystals (1 - 2)
    for (let l = 0; l < countLife; l++) {
      configureSlot('emerald_crystal', this._colorLife, 200, 0.016, '+1❤️', 'crystal-countdown emerald ready', 2.0);
    }

    // 3. Configure Points Crystals (remaining slots, 10 - 13)
    for (let p = 0; p < countPoints; p++) {
      configureSlot('points_crystal', this._colorPoints, 250, 0.016, '+250💎', 'crystal-countdown points ready', 2.0);
    }

    // Hide any unused slots (if available tiles was somehow < 15)
    while (slotIdx < this.TOTAL_CRYSTALS) {
      const slot = this._slots[slotIdx];
      slot.active = false;
      slot.revealed = false;
      slot.anchorObject.visible = false;
      this._dummy.position.set(0, -999, 0);
      this._dummy.scale.set(0, 0, 0);
      this._dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(slotIdx, this._dummy.matrix);
      slotIdx++;
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
   * Triggered when a tile is rolled over and conquered by the player.
   * If this tile secretly hides one of our 15 crystals, it is revealed with an animation.
   */
  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    this._tilesDiscoveredCount = (this._tilesDiscoveredCount || 0) + 1;
    if (!this.instancedMesh || tileIndex === undefined) return;

    // Check if any of our 15 secret slots is hidden on this discovered tile
    const slot = this._slots.find(s => s.tileIndex === tileIndex && !s.revealed);
    if (!slot) return;

    // UNCOVER / REVEAL THE HIDDEN CRYSTAL!
    slot.revealed = true;
    slot.active = true;
    slot.animatingSpawn = true;
    slot.spawnProgress = 0;
    slot.currentScale = 0;

    // Position and show anchor object for CSS2D label
    slot.anchorObject.position.set(slot.baseX, slot.baseY, slot.baseZ);
    slot.anchorObject.visible = true;

    if (this._labelSystem && slot.labelId === null) {
      slot.labelId = this._labelSystem.createLabel(slot.anchorObject, {
        text: slot.labelText,
        className: slot.labelClass,
        worldOffset: { x: 0, y: 0.038, z: 0 }
      });
    }

    // Set instance color & initial position
    this.instancedMesh.setColorAt(slot.index, slot.color);
    this._dummy.position.set(slot.baseX, slot.baseY, slot.baseZ);
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

    // Audio cue for uncovering a hidden crystal
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
    const isModifier = (type === 'modifier');
    const color = isModifier ? this._colorCard : (type === 'emerald_crystal' ? this._colorLife : this._colorPoints);
    const radius = isModifier ? 0.015 : 0.016;
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
    slot.baseY = 0.042;
    slot.currentY = 0.042;
    slot.targetScale = radius;
    slot.currentScale = 0;
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
        const overshoot = 1.25;
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
      slot.rotationX += slot.rotationSpeed * 0.45 * gameplayDelta;

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
      const crystalRadius = (slot.type === 'modifier') ? 0.016 : 0.018;
      const collectRadius = ballRadius + crystalRadius;

      if (distSq < collectRadius * collectRadius) {
        slot.active = false;
        slot.revealed = false;
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
