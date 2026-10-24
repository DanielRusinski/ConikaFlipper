import * as THREE from 'three';
import anime from 'animejs';
import { eventBus } from '../core/EventBus.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import { playSound } from '../soundfx.js';
import { SHOP_CONFIG } from './ShopConfig.js';
import { bufferGeometryFactory } from '../rendering/BufferGeometryFactory.js';
import { glbGeometryCache } from '../rendering/GLBGeometryCache.js';
import { createGlassCrystalMaterial } from '../materials/glassCrystalMaterial.js';

export const SHOP_TILE_LIFECYCLE_STATES = {
  UNSPAWNED: 'UNSPAWNED',
  SPAWNED: 'SPAWNED',
  ACTIVATING: 'ACTIVATING',
  SHOP_OPEN: 'SHOP_OPEN',
  COMPLETING: 'COMPLETING',
  CONSUMED: 'CONSUMED'
};

export class ShopTileSystem {
  constructor() {
    this.scene = null;
    this.boardGroup = null;
    this.tileManager = null;
    this.labelSystem = null;

    // State flags
    this.state = SHOP_TILE_LIFECYCLE_STATES.UNSPAWNED;
    this.shopTileSpawned = false;
    this.shopTileConsumed = false;
    this.shopTileData = null; // { gridX, gridY, index, worldX, worldZ }
    this._failedAttempt = false;
    this._interactionCooldown = 0;
    this._isBallOnTile = false;
    this._isInteractionLocked = false;

    // 3D Visual objects
    this._visualGroup = new THREE.Group();
    this._visualGroup.name = 'ShopTileVisualGroup';
    this._beaconMesh = null;
    this._ringMesh = null;
    this._beaconGeom = null;
    this._beaconMat = null;
    this._ringGeom = null;
    this._ringMat = null;
    this._labelId = null;

    // Animation time & active tweens
    this._animTime = 0;
    this._activeTweens = [];

    // Seeded pseudo-random generator
    this._currentSeed = 12345;
    this._rng = () => Math.random();

    this._unsubs = [];
  }

  init(scene, boardGroup, tileManager, labelSystem = null) {
    this.scene = scene;
    this.boardGroup = boardGroup;
    this.tileManager = tileManager;
    this.labelSystem = labelSystem;

    if (this.boardGroup && !this.boardGroup.children.includes(this._visualGroup)) {
      this.boardGroup.add(this._visualGroup);
    }

    this._unsubs.push(
      eventBus.on('tiles:changed', () => this._onTileProgressChanged()),
      eventBus.on('tile:discovered', () => this._onTileProgressChanged())
    );
  }

  setSeed(seed) {
    if (Number.isFinite(seed)) {
      this._currentSeed = seed;
      this._rng = () => {
        this._currentSeed = (this._currentSeed * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (this._currentSeed >>> 0) / 0xFFFFFFFF;
      };
    } else {
      this._rng = () => Math.random();
    }
  }

  resetForNewStage(tileManager, seed = null) {
    this.tileManager = tileManager;
    this.state = SHOP_TILE_LIFECYCLE_STATES.UNSPAWNED;
    this.shopTileSpawned = false;
    this.shopTileConsumed = false;
    this.shopTileData = null;
    this._failedAttempt = false;
    this._interactionCooldown = 0;
    this._isBallOnTile = false;
    this._isInteractionLocked = false;

    this.setSeed(seed !== null ? seed : (Date.now() % 100000));
    this._cleanupVisuals();
  }

  _onTileProgressChanged() {
    if (this.shopTileSpawned || this.shopTileConsumed || !this.tileManager) return;

    const totalCapturable = this.tileManager.getTotalPlayableTiles();
    const captured = this.tileManager.getDiscoveredCount();

    if (totalCapturable <= 0) return;

    const ratio = captured / totalCapturable;
    const threshold = SHOP_CONFIG.tileSpawnThreshold || 0.40;

    if (ratio > threshold) {
      this.trySpawnShopTile();
    }
  }

  /**
   * Evaluates valid candidates and randomly spawns the Shop Tile.
   */
  trySpawnShopTile(playerCurrentGrid = null) {
    if (this.shopTileSpawned || this.shopTileConsumed || !this.tileManager) return false;

    const tilesX = this.tileManager.tilesX;
    const tilesY = this.tileManager.tilesY;

    // Collect valid candidate tiles:
    // 1. Exists on active board
    // 2. Not blocked / obstacle
    // 3. Not current player position (at least 2 cells away)
    // 4. Reachable by player
    // 5. Not the starting spawn cell
    const candidates = [];

    for (let y = 1; y < tilesY - 1; y++) {
      for (let x = 1; x < tilesX - 1; x++) {
        if (this.tileManager.isObstacle(x, y)) continue;
        if (x === 9 && y === 18) continue;

        if (playerCurrentGrid) {
          const dist = Math.hypot(x - playerCurrentGrid.gx, y - playerCurrentGrid.gy);
          if (dist < 2.5) continue;
        }

        const index = this.tileManager.getTileIndex(x, y);
        const isDiscovered = this.tileManager.visitedTiles.has(index);

        candidates.push({
          gridX: x,
          gridY: y,
          index,
          isDiscovered
        });
      }
    }

    if (candidates.length === 0) {
      this._failedAttempt = true;
      return false;
    }

    // Prefer unvisited normal tiles to give the player an objective to roll towards
    const unvisited = candidates.filter(c => !c.isDiscovered);
    const pool = unvisited.length > 0 ? unvisited : candidates;

    // Select randomly using deterministic seeded RNG if provided
    const selected = pool[Math.floor(this._rng() * pool.length)];

    // Convert tile in TileManager
    this.tileManager.convertTileToShop(selected.gridX, selected.gridY);

    const worldPos = this.tileManager.getTileWorldPos(selected.gridX, selected.gridY);
    this.state = SHOP_TILE_LIFECYCLE_STATES.SPAWNED;
    this.shopTileSpawned = true;
    this.shopTileConsumed = false;
    this.shopTileData = {
      gridX: selected.gridX,
      gridY: selected.gridY,
      index: selected.index,
      worldX: worldPos.x,
      worldZ: worldPos.z
    };
    this._failedAttempt = false;

    // Build 3D visual beacon with arcade-style spawn animation
    this._createVisualBeacon(worldPos.x, worldPos.z, true);

    // Audio cue
    playSound(880, 0.25);
    setTimeout(() => playSound(1100, 0.2), 70);

    eventBus.emit('shopTile:spawned', { ...this.shopTileData });

    return true;
  }

  _createVisualBeacon(worldX, worldZ, playSpawnAnimation = false) {
    this._cleanupVisuals();

    const tileW = this.tileManager ? this.tileManager.tileWidth : 0.028;
    const tileH = this.tileManager ? this.tileManager.tileHeight : 0.028;
    const radius = Math.min(tileW, tileH) * 0.42;

    // 1. Glowing ground ring
    this._ringGeom = new THREE.RingGeometry(radius * 0.35, radius * 0.95, 24);
    this._ringGeom.rotateX(-Math.PI / 2);
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    this._ringMesh = new THREE.Mesh(this._ringGeom, this._ringMat);
    this._ringMesh.position.set(worldX, 0.0018, worldZ);
    this._visualGroup.add(this._ringMesh);

    // 2. Shop crystal using custom glass shader with chromatic aberrations & cellShop.glb
    this._beaconMat = createGlassCrystalMaterial({
      uColor: 0xffd166,
      uCoreColor: 0xff9900,
      uEdgeColor: 0x00f0ff,
      uOpacity: 0.88,
      uRefractionRatio: 1.45,
      uChromaticAberration: 0.38,
      uFresnelPower: 2.2,
      uDispersion: 0.50,
      uGlowIntensity: 0.95
    });

    // Check if cellShop.glb is already loaded or load asynchronously
    const cachedGeom = glbGeometryCache.getGeometrySync ? glbGeometryCache.getGeometrySync('cellShop') : null;
    if (cachedGeom) {
      this._beaconGeom = cachedGeom;
      this._beaconMesh = new THREE.Mesh(this._beaconGeom, this._beaconMat);
      this._beaconMesh.position.set(worldX, 0.012, worldZ);
      this._visualGroup.add(this._beaconMesh);
      this._attachShopLabel();
    } else {
      // Async load cellShop.glb geometry and replace immediately
      glbGeometryCache.getGeometry('cellShop').then((geom) => {
        if (!this.shopTileSpawned || !this._beaconMat) return;
        if (geom) {
          if (this._beaconMesh) {
            this._visualGroup.remove(this._beaconMesh);
          }
          this._beaconGeom = geom;
          this._beaconMesh = new THREE.Mesh(this._beaconGeom, this._beaconMat);
          this._beaconMesh.position.set(worldX, 0.012, worldZ);
          this._visualGroup.add(this._beaconMesh);
          this._attachShopLabel();
        }
      }).catch(err => {
        console.warn('[ShopTileSystem] Failed to load cellShop.glb:', err);
      });
    }

    if (playSpawnAnimation && this._ringMesh) {
      this._ringMesh.scale.set(0.01, 0.01, 0.01);
      const tw2 = anime({
        targets: this._ringMesh.scale,
        x: [0.01, 1],
        y: [0.01, 1],
        z: [0.01, 1],
        duration: 400,
        easing: 'easeOutQuad'
      });
      this._activeTweens.push(tw2);
    }
  }

  _attachShopLabel() {
    if (this._labelId !== null && this.labelSystem) {
      try { this.labelSystem.removeLabel(this._labelId); } catch (_) {}
      this._labelId = null;
    }
    if (this.labelSystem && this._beaconMesh) {
      try {
        this._labelId = this.labelSystem.createLabel(this._beaconMesh, {
          text: '🛍️ SKLEP',
          className: 'label-shop',
          worldOffset: { x: 0, y: 0.035, z: 0 },
          category: 'shop'
        });
      } catch (_) {}
    }
  }

  update(delta, ballPhysPos = null) {
    if (this._interactionCooldown > 0) {
      this._interactionCooldown -= delta;
    }

    if (!this.shopTileSpawned || this.shopTileConsumed || !this.shopTileData) return;

    this._animTime += delta;

    // Floating & spinning animation of the shop totem
    if (this._beaconMesh && this.state !== SHOP_TILE_LIFECYCLE_STATES.COMPLETING) {
      const hoverY = 0.012 + Math.sin(this._animTime * 3.2) * 0.003;
      this._beaconMesh.position.y = hoverY;
      this._beaconMesh.rotation.y = this._animTime * 1.4;
      this._beaconMesh.rotation.x = Math.sin(this._animTime * 1.5) * 0.12;

      // Pulse shader or standard material
      if (this._beaconMat) {
        if (this._beaconMat.uniforms) {
          if (this._beaconMat.uniforms.uTime) {
            this._beaconMat.uniforms.uTime.value = this._animTime;
          }
          if (this._beaconMat.uniforms.uGlowIntensity && this.state !== SHOP_TILE_LIFECYCLE_STATES.ACTIVATING) {
            this._beaconMat.uniforms.uGlowIntensity.value = 0.85 + Math.sin(this._animTime * 4.0) * 0.35;
          }
        } else if (this._beaconMat.emissiveIntensity !== undefined) {
          this._beaconMat.emissiveIntensity = 0.75 + Math.sin(this._animTime * 4.0) * 0.35;
        }
      }
    }

    // Ground ring pulse
    if (this._ringMesh && this._ringMat && this.state !== SHOP_TILE_LIFECYCLE_STATES.COMPLETING) {
      this._ringMesh.rotation.y = -this._animTime * 0.8;
      this._ringMat.opacity = 0.6 + Math.sin(this._animTime * 3.5) * 0.25;
    }

    // Check ball collision / occupancy with Shop Tile during PLAYING
    if (ballPhysPos && this.tileManager && gameStateManager.is(GAME_STATES.PLAYING) && !this._isInteractionLocked) {
      const { gridX, gridY } = this.tileManager.getTileGridPosFromPhysics(ballPhysPos.x, ballPhysPos.y);
      const isInside = (gridX === this.shopTileData.gridX && gridY === this.shopTileData.gridY);

      if (isInside) {
        if (!this._isBallOnTile && this._interactionCooldown <= 0 && this.state === SHOP_TILE_LIFECYCLE_STATES.SPAWNED) {
          this._isBallOnTile = true;
          this.triggerInteraction();
        }
      } else {
        this._isBallOnTile = false;
      }
    }
  }

  /**
   * Called when player ball rolls onto the active Shop Tile.
   */
  triggerInteraction() {
    if (!this.shopTileSpawned || this.shopTileConsumed || !this.shopTileData) return;
    if (this._isInteractionLocked || this.state !== SHOP_TILE_LIFECYCLE_STATES.SPAWNED) return;

    // Lock immediate re-interaction
    this._isInteractionLocked = true;
    this.state = SHOP_TILE_LIFECYCLE_STATES.ACTIVATING;
    this._interactionCooldown = 5.0;

    // Play quick contact / activation sound and visual reaction
    playSound(1100, 0.2);
    setTimeout(() => playSound(1400, 0.25), 80);

    if (this._beaconMat) {
      if (this._beaconMat.uniforms && this._beaconMat.uniforms.uGlowIntensity) {
        this._beaconMat.uniforms.uGlowIntensity.value = 2.0;
      } else if (this._beaconMat.emissiveIntensity !== undefined) {
        this._beaconMat.emissiveIntensity = 2.0;
      }
    }

    // Mark as shop open
    this.state = SHOP_TILE_LIFECYCLE_STATES.SHOP_OPEN;

    // Emit activation event to open in-level shop interface
    eventBus.emit('shopTile:activated', { ...this.shopTileData });
  }

  /**
   * Called after the player closes the in-level Shop.
   * Plays snappy arcade disappearance animation, removes visual beacon,
   * converts tile back to normal, and triggers authoritative player tile capture.
   */
  completeAndCapture(onComplete = null) {
    if (!this.shopTileSpawned || this.shopTileConsumed || !this.shopTileData) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    this.state = SHOP_TILE_LIFECYCLE_STATES.COMPLETING;
    const tileData = { ...this.shopTileData };

    // Play arcade-style disappearance animation
    playSound(1400, 0.15);
    setTimeout(() => playSound(1800, 0.25), 90);

    const finishSequence = () => {
      // 1. Mark as permanently consumed
      this.state = SHOP_TILE_LIFECYCLE_STATES.CONSUMED;
      this.shopTileConsumed = true;
      this.shopTileSpawned = false;

      // 2. Remove all shop visuals & label
      this._cleanupVisuals();

      // 3. Revert tile from being special shop tile to normal capturable tile
      if (this.tileManager) {
        this.tileManager.revertTileFromShop(tileData.gridX, tileData.gridY);

        // 4. Authoritatively conquer tile as legitimate player capture
        this.tileManager.conquerTile(tileData.gridX, tileData.gridY);
      }

      this.shopTileData = null;
      this._isInteractionLocked = false;

      eventBus.emit('shopTile:consumed', { ...tileData });

      if (typeof onComplete === 'function') {
        onComplete();
      }
    };

    if (this._beaconMesh && this._ringMesh) {
      const tw1 = anime({
        targets: this._beaconMesh.scale,
        x: [1, 0.001],
        y: [1, 1.8],
        z: [1, 0.001],
        duration: 280,
        easing: 'easeInBack'
      });
      const tw2 = anime({
        targets: this._ringMesh.scale,
        x: [1, 0.001],
        y: [1, 0.001],
        z: [1, 0.001],
        duration: 260,
        easing: 'easeInQuad',
        complete: () => {
          finishSequence();
        }
      });
      this._activeTweens.push(tw1, tw2);
    } else {
      finishSequence();
    }
  }

  _cleanupVisuals() {
    for (const tw of this._activeTweens) {
      try { tw.pause(); } catch (_) {}
    }
    this._activeTweens = [];

    if (this._beaconMesh) {
      this._visualGroup.remove(this._beaconMesh);
      this._beaconMesh = null;
    }
    if (this._beaconGeom) {
      this._beaconGeom.dispose();
      this._beaconGeom = null;
    }
    if (this._beaconMat) {
      this._beaconMat.dispose();
      this._beaconMat = null;
    }

    if (this._ringMesh) {
      this._visualGroup.remove(this._ringMesh);
      this._ringMesh = null;
    }
    if (this._ringGeom) {
      this._ringGeom.dispose();
      this._ringGeom = null;
    }
    if (this._ringMat) {
      this._ringMat.dispose();
      this._ringMat = null;
    }

    if (this._labelId !== null && this.labelSystem) {
      try {
        this.labelSystem.removeLabel(this._labelId);
      } catch (_) {}
      this._labelId = null;
    }
  }

  // ==========================================
  // STATE PERSISTENCE
  // ==========================================

  getSaveState() {
    return {
      state: this.state,
      shopTileSpawned: this.shopTileSpawned,
      shopTileConsumed: this.shopTileConsumed,
      shopTileData: this.shopTileData ? { ...this.shopTileData } : null
    };
  }

  loadSaveState(state) {
    if (!state) return;
    this.shopTileConsumed = !!state.shopTileConsumed;
    this.shopTileSpawned = !!state.shopTileSpawned && !this.shopTileConsumed;
    this.shopTileData = (this.shopTileSpawned && state.shopTileData) ? { ...state.shopTileData } : null;
    this.state = this.shopTileConsumed ? SHOP_TILE_LIFECYCLE_STATES.CONSUMED : (this.shopTileSpawned ? SHOP_TILE_LIFECYCLE_STATES.SPAWNED : SHOP_TILE_LIFECYCLE_STATES.UNSPAWNED);

    if (this.shopTileSpawned && this.shopTileData && this.tileManager) {
      this.tileManager.convertTileToShop(this.shopTileData.gridX, this.shopTileData.gridY);
      this._createVisualBeacon(this.shopTileData.worldX, this.shopTileData.worldZ, false);
    }
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];

    this._cleanupVisuals();

    if (this.boardGroup && this._visualGroup.parent === this.boardGroup) {
      this.boardGroup.remove(this._visualGroup);
    }

    this.scene = null;
    this.boardGroup = null;
    this.tileManager = null;
    this.labelSystem = null;
  }
}
