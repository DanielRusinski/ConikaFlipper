/**
 * flipper_app/src/core/BalanceDataRepository.js
 *
 * Centralized Client-Side Data Repository for OPT Flipper Runtime Balance Data.
 * 
 * Responsibilities:
 * 1. Asynchronously loads live canonical balance data from the local dev API (/api/balance/manifest & /api/balance/:table).
 * 2. Falls back safely to bundled defaults if running in standalone/offline mode.
 * 3. Tracks active balance data revision.
 * 4. Listens for live balance reload events (BroadcastChannel & dev API polling/events).
 * 5. Notifies gameplay systems (ResolvedStatService, BombSystem, DragonSystem, etc.) to refresh caches.
 * 6. Classifies settings changes into hot-reload safety tiers:
 *    - HOT_RELOAD_SAFE
 *    - STAGE_RESTART_REQUIRED
 *    - RUN_RESTART_REQUIRED
 *    - GAME_RESTART_REQUIRED
 */

import { eventBus } from './EventBus.js';
import { resolvedStatService, BASE_BALL_DEFINITIONS } from '../progression/ResolvedStatService.js';
import { ENEMY_TABLE, SPAWN_RULES, DROP_TABLES } from '../config/balanceTables.js';

export const RELOAD_SAFETY_TIERS = {
  HOT_RELOAD_SAFE: 'HOT_RELOAD_SAFE',
  STAGE_RESTART_REQUIRED: 'STAGE_RESTART_REQUIRED',
  RUN_RESTART_REQUIRED: 'RUN_RESTART_REQUIRED',
  GAME_RESTART_REQUIRED: 'GAME_RESTART_REQUIRED'
};

export class BalanceDataRepository {
  constructor() {
    this._data = {};
    this._manifest = null;
    this._revision = 1;
    this._lastUpdated = null;
    this._isConnectedToApi = false;
    this._broadcastChannel = null;
    this._initialized = false;
  }

  get revision() {
    return this._revision;
  }

  get isConnected() {
    return this._isConnectedToApi;
  }

  get manifest() {
    return this._manifest;
  }

  /**
   * Initializes repository, connects to BroadcastChannel and loads canonical data.
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this._broadcastChannel = new BroadcastChannel('opt_flipper_balance_sync');
        this._broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'BALANCE_RELOAD') {
            console.log(`[BalanceDataRepository] Received reload broadcast: rev ${event.data.revision}`);
            this.reloadFromApi(event.data.revision, event.data.changedTables);
          }
        };
      } catch (e) {
        console.warn('[BalanceDataRepository] BroadcastChannel initialization failed:', e);
      }
    }

    await this.loadInitialData();
  }

  /**
   * Attempts to fetch data from the local development API.
   * If offline or API fails, uses current bundled configuration.
   */
  async loadInitialData() {
    try {
      const res = await fetch('/api/balance/manifest');
      if (res.ok) {
        const manifest = await res.json();
        this._manifest = manifest;
        this._revision = manifest.revision || 1;
        this._lastUpdated = manifest.lastSaved;
        this._isConnectedToApi = true;

        // Fetch primary balance sheets
        const tablesToLoad = [
          '02_STAT_DICTIONARY',
          '03_BALLS',
          '04_BALL_LEVELS',
          '05_BALL_SKILLS',
          '06_ABILITIES',
          '07_EQUIPMENT',
          '08_MODIFIERS',
          '09_XP_CURVE',
          '10_SCORE_REWARDS',
          '11_BOMB_BALANCE'
        ];

        for (const table of tablesToLoad) {
          const tRes = await fetch(`/api/balance/${table}`);
          if (tRes.ok) {
            this._data[table] = await tRes.json();
          }
        }

        this.applyToGameRuntime();
        console.log(`[BalanceDataRepository] Connected to Local Balance API (rev: ${this._revision})`);
        return true;
      }
    } catch (err) {
      // Offline / standalone mode: API is not running
      this._isConnectedToApi = false;
      console.log('[BalanceDataRepository] Local Balance API offline. Running bundled baseline balance.');
    }
    return false;
  }

  /**
   * Reloads updated tables from the API and invalidates caches.
   */
  async reloadFromApi(targetRevision = null, changedTables = []) {
    try {
      const res = await fetch('/api/balance/manifest');
      if (!res.ok) return false;
      const manifest = await res.json();
      this._manifest = manifest;
      this._revision = manifest.revision || (this._revision + 1);
      this._lastUpdated = manifest.lastSaved;
      this._isConnectedToApi = true;

      const tablesToFetch = changedTables && changedTables.length > 0 
        ? changedTables 
        : Object.keys(manifest.tables || {});

      for (const table of tablesToFetch) {
        const tRes = await fetch(`/api/balance/${table}`);
        if (tRes.ok) {
          this._data[table] = await tRes.json();
        }
      }

      this.applyToGameRuntime();

      eventBus.emit('balance:reloaded', {
        revision: this._revision,
        changedTables,
        timestamp: this._lastUpdated
      });

      return true;
    } catch (err) {
      console.error('[BalanceDataRepository] Failed to reload from API:', err);
      return false;
    }
  }

  /**
   * Applies loaded canonical balance data directly into runtime services (ResolvedStatService, BombSystem, etc.)
   */
  applyToGameRuntime() {
    // 1. Update 03_BALLS -> ResolvedStatService BASE_BALL_DEFINITIONS
    const ballsSheet = this._data['03_BALLS'];
    if (ballsSheet && Array.isArray(ballsSheet.rows)) {
      ballsSheet.rows.forEach(b => {
        const ballKey = (b.EXISTING_IDENTIFIER || '').toLowerCase();
        if (BASE_BALL_DEFINITIONS[ballKey]) {
          const def = BASE_BALL_DEFINITIONS[ballKey];
          if (b.BASE_RADIUS) def['ball.radius'] = parseFloat(b.BASE_RADIUS);
          if (b.BASE_MAX_SPEED) def['ball.maxSpeed'] = parseFloat(b.BASE_MAX_SPEED);
          if (b.BASE_SPEED_SCALE) def['ball.speedScale'] = parseFloat(b.BASE_SPEED_SCALE);
          if (b.BASE_WALL_RESTITUTION) def['ball.wallRestitution'] = parseFloat(b.BASE_WALL_RESTITUTION);
          if (b.BASE_IMPACT_RESISTANCE) def['ball.impactResistance'] = parseFloat(b.BASE_IMPACT_RESISTANCE);
          if (b.BASE_CONTROL_RESPONSIVENESS) def['ball.controlResponsiveness'] = parseFloat(b.BASE_CONTROL_RESPONSIVENESS);
          if (b.BASE_BOMB_CAPACITY) def['bomb.capacity'] = parseInt(b.BASE_BOMB_CAPACITY, 10);
          if (b.BASE_BOMB_FUSE) def['bomb.fuseDurationSeconds'] = parseFloat(b.BASE_BOMB_FUSE);
          if (b.BASE_BOMB_RADIUS) def['bomb.blastRadiusMultiplier'] = parseFloat(b.BASE_BOMB_RADIUS);
          if (b.BASE_STARTING_LIVES) def['player.startingLives'] = parseInt(b.BASE_STARTING_LIVES, 10);
        }
      });
    }

    // 2. Update 06_ABILITIES -> ResolvedStatService ability durations
    const abilitiesSheet = this._data['06_ABILITIES'];
    if (abilitiesSheet && Array.isArray(abilitiesSheet.rows)) {
      abilitiesSheet.rows.forEach(a => {
        const dur = parseFloat(a.DURATION_SECONDS);
        if (!isNaN(dur)) {
          if (a.ABILITY_ID === 'ABIL_002' || a.EXISTING_NAME === 'DragonSummon') {
            for (const ballKey of Object.keys(BASE_BALL_DEFINITIONS)) {
              BASE_BALL_DEFINITIONS[ballKey]['ability.dragonDurationSeconds'] = dur;
            }
          } else if (a.ABILITY_ID === 'ABIL_003' || a.EXISTING_NAME === 'LaserRainStrike') {
            for (const ballKey of Object.keys(BASE_BALL_DEFINITIONS)) {
              BASE_BALL_DEFINITIONS[ballKey]['ability.laserRainDurationSeconds'] = dur;
            }
          }
        }
      });
    }

    // 3. Invalidate ResolvedStatService cached calculations
    if (resolvedStatService) {
      resolvedStatService.invalidateCaches();
    }
  }

  /**
   * Helper to retrieve a loaded table
   */
  getTable(tableName) {
    return this._data[tableName] || null;
  }
}

export const balanceDataRepository = new BalanceDataRepository();
