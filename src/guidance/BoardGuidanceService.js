import * as THREE from 'three';
import { eventBus } from '../core/EventBus.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import { BOARD_GUIDANCE_CONFIG } from './BoardGuidanceConfig.js';
import { BoardGuidanceMarker } from './BoardGuidanceMarker.js';
import { BoardGuidanceTargetSelector } from './BoardGuidanceTargetSelector.js';

/**
 * BoardGuidanceService
 * Modular controller managing the 10-second inactivity timer and Guidance Marker lifecycle.
 * Fully integrates with game pause, Shop states, tile captures, and board reloads.
 */
export class BoardGuidanceService {
  constructor() {
    this.boardGroup = null;
    this.tileManager = null;
    this.shopTileSystem = null;

    // Timer tracking
    this._inactivityTime = 0; // Accumulated seconds without a tile capture
    this._delayThreshold = BOARD_GUIDANCE_CONFIG.guidanceDelayMs / 1000; // 10.0 seconds
    this._enabled = BOARD_GUIDANCE_CONFIG.enabled;

    // Marker tracking
    this._activeMarker = null; // BoardGuidanceMarker instance
    this._currentTarget = null; // { gridX, gridY, index, worldX, worldZ }

    // Visual group for 3D marker
    this._visualGroup = new THREE.Group();
    this._visualGroup.name = 'BoardGuidanceVisualGroup';

    this._unsubs = [];
    this._rng = () => Math.random();
  }

  /**
   * Initializes the service with scene/board context and event listeners.
   */
  init(boardGroup, tileManager, shopTileSystem = null) {
    this.boardGroup = boardGroup;
    this.tileManager = tileManager;
    this.shopTileSystem = shopTileSystem;

    if (this.boardGroup && !this.boardGroup.children.includes(this._visualGroup)) {
      this.boardGroup.add(this._visualGroup);
    }

    this._unsubs.push(
      // Tile captured by player -> reset timer, acknowledge marker if targeted
      eventBus.on('tile:discovered', (data) => this._onTileCaptured(data)),

      // Stage / state transitions
      eventBus.on('stage:completed', () => this.reset(true)),
      eventBus.on('board:rebuilt', () => this.reset(true)),

      // Shop events -> pause or clean up
      eventBus.on('shopTile:spawned', () => this._onShopTileSpawned())
    );
  }

  setRNG(rng) {
    if (typeof rng === 'function') {
      this._rng = rng;
    }
  }

  /**
   * Resets the guidance timer and clears active markers.
   * @param {boolean} [fullClean=false] Whether to also remove visuals immediately
   */
  reset(fullClean = false) {
    this._inactivityTime = 0;

    if (fullClean) {
      this._removeActiveMarker(true);
      this._currentTarget = null;
    }
  }

  /**
   * Main per-frame update loop called from Game.js.
   * Advances the timer ONLY during unpaused PLAYING state with no blocking menus.
   */
  update(delta) {
    if (!this._enabled || !this.tileManager) return;

    // Check game state eligibility:
    // Only accumulate inactivity during active gameplay
    const isGameplayActive = gameStateManager.is(GAME_STATES.PLAYING);
    if (!isGameplayActive) {
      // Paused, in Shop, in Development, or in Transition -> timer paused
      return;
    }

    // 1. If marker is active, update its subtle idle bobbing/spinning
    if (this._activeMarker) {
      this._activeMarker.update(delta);

      // Verify target hasn't been conquered externally (e.g. bomb explosion)
      if (this._currentTarget && !BoardGuidanceTargetSelector.isTargetStillValid(this.tileManager, this._currentTarget, this._getShopTileData())) {
        this._removeActiveMarker(false);
        this._currentTarget = null;
        this._inactivityTime = 0;
      }
      return;
    }

    // 2. Accumulate inactivity time
    this._inactivityTime += delta;

    if (this._inactivityTime >= this._delayThreshold) {
      this._triggerGuidance();
    }
  }

  /**
   * Spawns or forces the guidance marker immediately on the given tile or current best target.
   * Useful for interactive testing / debug tuning.
   * @param {Object} [overrideTarget=null]
   */
  forceSpawnMarker(overrideTarget = null) {
    if (!this.tileManager) return;
    this._removeActiveMarker(true);

    const target = overrideTarget || BoardGuidanceTargetSelector.selectTarget(
      this.tileManager,
      this._getShopTileData(),
      this._rng
    );

    if (!target) return;

    this._currentTarget = target;
    this._activeMarker = new BoardGuidanceMarker(this._visualGroup, target);
  }

  /**
   * Refreshes the currently active marker with updated config parameters.
   */
  refreshActiveMarker() {
    if (!this._activeMarker || !this._currentTarget) return;
    const target = { ...this._currentTarget };
    this._removeActiveMarker(true);
    this._currentTarget = target;
    this._activeMarker = new BoardGuidanceMarker(this._visualGroup, target);
  }

  /**
   * Triggered when inactivity threshold (10s) is reached.
   */
  _triggerGuidance() {
    if (this._activeMarker) return; // Enforce only one marker at any time

    const target = BoardGuidanceTargetSelector.selectTarget(
      this.tileManager,
      this._getShopTileData(),
      this._rng
    );

    if (!target) {
      // No valid uncaptured tiles or level already complete
      return;
    }

    this._currentTarget = target;
    this._activeMarker = new BoardGuidanceMarker(this._visualGroup, target);

    eventBus.emit('guidance:markerShown', {
      gridX: target.gridX,
      gridY: target.gridY,
      index: target.index,
      worldX: target.worldX,
      worldZ: target.worldZ
    });
  }

  /**
   * Handles tile capture events emitted by TileManager.
   */
  _onTileCaptured(tileData) {
    if (!tileData) return;

    // 1. If the captured tile matches our current guidance target -> play disappearance animation!
    if (this._currentTarget && (tileData.index === this._currentTarget.index || 
        (tileData.gridX === this._currentTarget.gridX && tileData.gridY === this._currentTarget.gridY))) {
      
      const targetCopy = { ...this._currentTarget };
      this._currentTarget = null;
      this._inactivityTime = 0; // Fresh 10-second timer begins

      if (this._activeMarker) {
        const markerRef = this._activeMarker;
        this._activeMarker = null;
        markerRef.disappear(() => {
          markerRef.dispose();
        });
      }

      eventBus.emit('guidance:markerResolved', targetCopy);
    } else {
      // 2. Player captured a different tile!
      // Inactivity timer resets to 0, but the existing marker remains active on its assigned tile
      this._inactivityTime = 0;
    }
  }

  /**
   * Safety check: if Shop Tile spawns directly on the targeted tile, re-assign or remove marker.
   */
  _onShopTileSpawned() {
    const shopData = this._getShopTileData();
    if (shopData && this._currentTarget) {
      if (this._currentTarget.gridX === shopData.gridX && this._currentTarget.gridY === shopData.gridY) {
        this._removeActiveMarker(true);
        this._currentTarget = null;
        this._inactivityTime = 0;
      }
    }
  }

  _getShopTileData() {
    if (this.shopTileSystem && this.shopTileSystem.shopTileSpawned) {
      return this.shopTileSystem.shopTileData;
    }
    return null;
  }

  _removeActiveMarker(immediate = false) {
    if (this._activeMarker) {
      if (immediate) {
        this._activeMarker.dispose();
      } else {
        const markerRef = this._activeMarker;
        markerRef.disappear(() => markerRef.dispose());
      }
      this._activeMarker = null;
    }
  }

  // ==========================================
  // PERSISTENCE & RESTORE
  // ==========================================

  getSaveState() {
    return {
      inactivityTime: this._inactivityTime,
      currentTarget: this._currentTarget ? { ...this._currentTarget } : null
    };
  }

  loadSaveState(state) {
    if (!state) return;
    this.reset(true);

    if (state.currentTarget && this.tileManager) {
      // Validate that target is still valid before restoring marker
      if (BoardGuidanceTargetSelector.isTargetStillValid(this.tileManager, state.currentTarget, this._getShopTileData())) {
        this._currentTarget = state.currentTarget;
        this._activeMarker = new BoardGuidanceMarker(this._visualGroup, this._currentTarget);
      }
    }

    this._inactivityTime = typeof state.inactivityTime === 'number' ? state.inactivityTime : 0;
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];

    this._removeActiveMarker(true);
    this._currentTarget = null;

    if (this.boardGroup && this._visualGroup.parent === this.boardGroup) {
      this.boardGroup.remove(this._visualGroup);
    }

    this.boardGroup = null;
    this.tileManager = null;
    this.shopTileSystem = null;
  }
}

export const boardGuidanceService = new BoardGuidanceService();
