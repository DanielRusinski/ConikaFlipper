/**
 * SaveMigrationService
 * Implements Save Schema v2 proposal & non-destructive migration contract (DEC_007, DEC_015, ODEC_015, ODEC_020).
 *
 * Responsibilities:
 * 1. Atomically loads, migrates, and persists under root key 'opt_flipper_save_v2' (schemaVersion: 2).
 * 2. Writes verbatim backups of legacy v1 keys to:
 *    - 'opt_flipper_backup_v1_inventory'
 *    - 'opt_flipper_backup_v1_development'
 * 3. Enforces idempotency (repeated migration runs produce exact identical state).
 * 4. Validates payloads via validateSaveV2 before writing.
 * 5. Handles corrupt JSON safely by dumping to 'opt_flipper_corrupt_dump_<timestamp>' and loading clean defaults.
 * 6. Supports rollback from backups if migration validation fails.
 * 7. Non-destructively grandfathers legacy Crystarium nodes (DEC_007) without artificial level inflation.
 */

export const SAVE_V2_STORAGE_KEY = 'opt_flipper_save_v2';
export const BACKUP_V1_INVENTORY_KEY = 'opt_flipper_backup_v1_inventory';
export const BACKUP_V1_DEVELOPMENT_KEY = 'opt_flipper_backup_v1_development';
export const LEGACY_V1_INVENTORY_KEY = 'opt_flipper_inventory';
export const LEGACY_V1_DEVELOPMENT_KEY = 'opt_flipper_development_progression';

export const CANONICAL_BALL_IDS = ['brass', 'marble', 'wood', 'chrome'];

export const CANONICAL_EQUIPMENT_ITEMS = [
  'magnet_amulet',
  'chrono_ring',
  'lucky_charm',
  'heart_locket',
  'laser_cutter',
  'shockwave_hammer',
  'dragon_horn',
  'prism_aegis',
  'kinetic_ward',
  'radiant_bulwark',
  'amber_core',
  'crimson_geode',
  'emerald_relic'
];

export const CANONICAL_CONSUMABLE_ITEMS = [
  'health_potion',
  'bomb_pack',
  'time_capsule',
  'speed_tonic'
];

export const CANONICAL_ORB_ITEMS = [
  'brass_orb',
  'marble_orb',
  'wood_orb',
  'chrome_orb'
];

export const ITEM_SLOT_MAP = {
  laser_cutter: 'WEAPON',
  shockwave_hammer: 'WEAPON',
  dragon_horn: 'WEAPON',
  prism_aegis: 'SHIELD',
  kinetic_ward: 'SHIELD',
  radiant_bulwark: 'SHIELD',
  magnet_amulet: 'ACCESSORY',
  chrono_ring: 'ACCESSORY',
  lucky_charm: 'ACCESSORY',
  heart_locket: 'ACCESSORY',
  amber_core: 'CRYSTAL',
  crimson_geode: 'CRYSTAL',
  emerald_relic: 'CRYSTAL'
};

/**
 * Creates a clean default Save Schema v2 object.
 */
export function createDefaultSaveV2() {
  const save = {
    schemaVersion: 2,
    migratedFromVersion: null,
    lastSavedAtIso: new Date().toISOString(),
    profile: {
      accountLevel: null,
      accountProgressionStatus: 'DEFERRED',
      selectedBallId: 'brass',
      maxUnlockedStageGate: 1,
      highestGameplayStageReached: 1
    },
    inventory: {
      currencies: {
        yellowCoins: 0,
        redCoins: 0
      },
      orbsOwned: {
        brass_orb: 1,
        marble_orb: 0,
        wood_orb: 0,
        chrome_orb: 0
      },
      equipmentOwned: {},
      consumables: {},
      legacyV1ConsumablePurchases: {
        bomb_pack: 0
      }
    },
    balls: {},
    loadouts: {},
    crystarium: {
      maxUnlockedStage: 1,
      legacyUnlockedNodesByBall: {
        brass: {},
        marble: {},
        wood: {},
        chrome: {}
      }
    },
    settings: {
      tiltSensitivity: 1.0,
      graphicsQuality: 'HIGH'
    },
    unknownPreservedFields: {}
  };

  // Populate equipmentOwned and consumables with 0 defaults
  for (const item of CANONICAL_EQUIPMENT_ITEMS) {
    save.inventory.equipmentOwned[item] = 0;
  }
  for (const item of CANONICAL_CONSUMABLE_ITEMS) {
    save.inventory.consumables[item] = 0;
  }

  // Populate balls and loadouts for all 4 canonical balls
  for (const ballId of CANONICAL_BALL_IDS) {
    save.balls[ballId] = {
      unlocked: ballId === 'brass',
      level: 1,
      currentXp: 0,
      lifetimeXp: 0,
      availableSkillPoints: 0,
      spentSkillPoints: 0,
      spentSkillPointEquivalentFromLegacy: 0,
      unlockedSkillIds: [],
      crystariumNodeRecords: {},
      selectedLoadoutId: 'default'
    };

    save.loadouts[ballId] = {
      default: {
        WEAPON: null,
        SHIELD: null,
        ACCESSORY: null,
        CRYSTAL: null
      }
    };
  }

  return save;
}

/**
 * Validates a candidate Save Schema v2 payload.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateSaveV2(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Payload must be a non-null object'] };
  }

  if (payload.schemaVersion !== 2) {
    errors.push(`Invalid schemaVersion: expected 2, got ${payload.schemaVersion}`);
  }

  // Inventory & Currencies
  if (!payload.inventory || typeof payload.inventory !== 'object') {
    errors.push('Missing inventory object');
  } else {
    const curr = payload.inventory.currencies;
    if (!curr || typeof curr !== 'object') {
      errors.push('Missing inventory.currencies object');
    } else {
      if (!Number.isInteger(curr.yellowCoins) || curr.yellowCoins < 0) {
        errors.push(`Invalid yellowCoins: ${curr.yellowCoins}`);
      }
      if (!Number.isInteger(curr.redCoins) || curr.redCoins < 0) {
        errors.push(`Invalid redCoins: ${curr.redCoins}`);
      }
    }
  }

  // Balls domain
  if (!payload.balls || typeof payload.balls !== 'object') {
    errors.push('Missing balls object');
  } else {
    for (const ballId of CANONICAL_BALL_IDS) {
      const ball = payload.balls[ballId];
      if (!ball || typeof ball !== 'object') {
        errors.push(`Missing ball entry for: ${ballId}`);
        continue;
      }
      if (typeof ball.unlocked !== 'boolean') {
        errors.push(`Invalid ball.unlocked for ${ballId}`);
      }
      if (!Number.isInteger(ball.level) || ball.level < 1 || ball.level > 9) {
        errors.push(`Invalid ball.level for ${ballId}: ${ball.level}`);
      }
      if (!Number.isInteger(ball.currentXp) || ball.currentXp < 0) {
        errors.push(`Invalid ball.currentXp for ${ballId}: ${ball.currentXp}`);
      }
      if (!Number.isInteger(ball.availableSkillPoints) || ball.availableSkillPoints < 0) {
        errors.push(`Invalid ball.availableSkillPoints for ${ballId}: ${ball.availableSkillPoints}`);
      }
      if (!Array.isArray(ball.unlockedSkillIds)) {
        errors.push(`Invalid ball.unlockedSkillIds for ${ballId}`);
      }
    }

    if (payload.balls.brass && payload.balls.brass.unlocked !== true) {
      errors.push('Brass ball must always be unlocked');
    }
  }

  // Profile domain
  if (!payload.profile || typeof payload.profile !== 'object') {
    errors.push('Missing profile object');
  } else {
    const selBall = payload.profile.selectedBallId;
    if (!CANONICAL_BALL_IDS.includes(selBall)) {
      errors.push(`Invalid profile.selectedBallId: ${selBall}`);
    } else if (payload.balls && payload.balls[selBall] && payload.balls[selBall].unlocked !== true) {
      errors.push(`Selected ball ${selBall} is not unlocked`);
    }
  }

  // Loadouts domain
  if (!payload.loadouts || typeof payload.loadouts !== 'object') {
    errors.push('Missing loadouts object');
  } else {
    for (const ballId of CANONICAL_BALL_IDS) {
      const ballLoadout = payload.loadouts[ballId];
      if (!ballLoadout || typeof ballLoadout !== 'object') {
        errors.push(`Missing loadout for ball: ${ballId}`);
        continue;
      }
      const defSlot = ballLoadout.default;
      if (!defSlot || typeof defSlot !== 'object') {
        errors.push(`Missing default loadout slot for ball: ${ballId}`);
        continue;
      }
      for (const slotType of ['WEAPON', 'SHIELD', 'ACCESSORY', 'CRYSTAL']) {
        const equippedItem = defSlot[slotType];
        if (equippedItem !== null) {
          if (typeof equippedItem !== 'string') {
            errors.push(`Equipped item in ${ballId}.${slotType} must be a string or null`);
          } else {
            const expectedSlot = ITEM_SLOT_MAP[equippedItem];
            if (!expectedSlot || expectedSlot !== slotType) {
              errors.push(`Item ${equippedItem} cannot be equipped in slot ${slotType}`);
            }
            const owned = payload.inventory && payload.inventory.equipmentOwned
              ? payload.inventory.equipmentOwned[equippedItem]
              : 0;
            if (!owned || owned < 1) {
              errors.push(`Cannot equip unowned item ${equippedItem} in ${ballId}.${slotType}`);
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Pure migration function from v1 raw objects to v2 save schema.
 * Enforces:
 * - 1:1 Coins preservation
 * - Grandfathered Crystarium nodes with 0 level inflation
 * - Unlocked ball preservation and safe selectedBallId fallback
 * - Clearing bomb_pack lifetime purchase lockout
 * - Preserving unknown fields
 */
export function migrateV1ToV2(v1Inv = {}, v1Dev = {}) {
  const save = createDefaultSaveV2();
  save.migratedFromVersion = 1;
  save.lastSavedAtIso = new Date().toISOString();

  // 1. Currencies
  if (v1Inv && typeof v1Inv === 'object') {
    if (v1Inv.yellowCoins !== undefined && Number.isFinite(Number(v1Inv.yellowCoins))) {
      save.inventory.currencies.yellowCoins = Math.max(0, Math.floor(Number(v1Inv.yellowCoins)));
    }
    if (v1Inv.redCoins !== undefined && Number.isFinite(Number(v1Inv.redCoins))) {
      save.inventory.currencies.redCoins = Math.max(0, Math.floor(Number(v1Inv.redCoins)));
    }
  }

  // 2. Crystarium & Development Progression (Grandfathering - DEC_007)
  const legacyUnlockedMap = {};
  if (v1Dev && typeof v1Dev === 'object') {
    if (Number.isFinite(Number(v1Dev.maxUnlockedStage))) {
      const st = Math.max(1, Math.min(3, Math.floor(Number(v1Dev.maxUnlockedStage))));
      save.profile.maxUnlockedStageGate = st;
      save.crystarium.maxUnlockedStage = st;
    }

    if (v1Dev.unlockedNodes && typeof v1Dev.unlockedNodes === 'object') {
      for (const ballId of CANONICAL_BALL_IDS) {
        const ballNodes = v1Dev.unlockedNodes[ballId];
        legacyUnlockedMap[ballId] = {};
        if (ballNodes && typeof ballNodes === 'object') {
          for (const [nodeId, rank] of Object.entries(ballNodes)) {
            if (rank) {
              legacyUnlockedMap[ballId][nodeId] = rank;
            }
          }
        }
      }
    }
  }
  save.crystarium.legacyUnlockedNodesByBall = legacyUnlockedMap;

  // 3. Balls Unlocked & Selected Ball Recovery (BUG_006 recovery)
  let rawUnlockedBalls = ['brass'];
  if (v1Inv && Array.isArray(v1Inv.unlockedBalls)) {
    rawUnlockedBalls = Array.from(new Set(['brass', ...v1Inv.unlockedBalls]));
  }

  // If player unlocked >= 1 node for a ball in v1, treat as unlocked (RISK_005)
  for (const ballId of CANONICAL_BALL_IDS) {
    if (Object.keys(legacyUnlockedMap[ballId] || {}).length > 0) {
      if (!rawUnlockedBalls.includes(ballId)) {
        rawUnlockedBalls.push(ballId);
      }
    }
  }

  // 4. Items Processing (Equipment, Consumables, Orbs, and bomb_pack lockout clearance)
  const rawItems = v1Inv && v1Inv.items ? v1Inv.items : {};
  if (Array.isArray(rawItems)) {
    // Some v1 tests used array of items [{ id, count, equipped }]
    for (const it of rawItems) {
      if (!it || !it.id) continue;
      const id = it.id;
      const count = Math.max(0, Math.floor(Number(it.count) || 1));
      applyItemToSave(save, id, count, it.equipped);
    }
  } else if (typeof rawItems === 'object') {
    // Normal v1 dictionary format { [itemId]: count }
    for (const [id, countRaw] of Object.entries(rawItems)) {
      const count = Math.max(0, Math.floor(Number(countRaw) || 0));
      applyItemToSave(save, id, count, false);
    }
  }

  // Ensure balls with orbs owned are marked unlocked
  for (const ballId of CANONICAL_BALL_IDS) {
    const orbKey = `${ballId}_orb`;
    if (save.inventory.orbsOwned[orbKey] >= 1 && !rawUnlockedBalls.includes(ballId)) {
      rawUnlockedBalls.push(ballId);
    }
  }

  // Finalize balls data & grandfathered node records
  for (const ballId of CANONICAL_BALL_IDS) {
    const isUnlocked = rawUnlockedBalls.includes(ballId);
    save.balls[ballId].unlocked = isUnlocked;

    const ballNodes = legacyUnlockedMap[ballId] || {};
    const nodeIds = Object.keys(ballNodes);
    save.balls[ballId].unlockedSkillIds = [...nodeIds];

    let totalEquivalentSp = 0;
    for (const nodeId of nodeIds) {
      const isMastery = nodeId.includes('_s3_') || nodeId.includes('mastery');
      const spEquivalent = isMastery ? 2 : 1;
      totalEquivalentSp += spEquivalent;

      save.balls[ballId].crystariumNodeRecords[nodeId] = {
        unlocked: true,
        grandfathered: true,
        legacySource: 'v1_crystarium',
        spentSkillPointEquivalent: spEquivalent
      };
    }
    save.balls[ballId].spentSkillPointEquivalentFromLegacy = totalEquivalentSp;

    // DEC_007: level remains 1, currentXp remains 0, availableSkillPoints remains 0
    save.balls[ballId].level = 1;
    save.balls[ballId].currentXp = 0;
    save.balls[ballId].availableSkillPoints = 0;
    save.balls[ballId].spentSkillPoints = 0;
  }

  // Selected ball check
  let selected = 'brass';
  if (v1Inv && v1Inv.selectedBallType && typeof v1Inv.selectedBallType === 'string') {
    selected = v1Inv.selectedBallType.toLowerCase();
  }
  if (save.balls[selected] && save.balls[selected].unlocked === true) {
    save.profile.selectedBallId = selected;
  } else {
    save.profile.selectedBallId = 'brass';
  }

  // 5. Unknown fields preservation
  const knownInvKeys = ['selectedBallType', 'unlockedBalls', 'yellowCoins', 'redCoins', 'items'];
  if (v1Inv && typeof v1Inv === 'object') {
    for (const [k, v] of Object.entries(v1Inv)) {
      if (!knownInvKeys.includes(k)) {
        save.unknownPreservedFields[k] = v;
      }
    }
  }
  const knownDevKeys = ['version', 'maxUnlockedStage', 'unlockedNodes', 'globalUnlockedNodes', 'selectedBallId'];
  if (v1Dev && typeof v1Dev === 'object') {
    for (const [k, v] of Object.entries(v1Dev)) {
      if (!knownDevKeys.includes(k)) {
        save.unknownPreservedFields[k] = v;
      }
    }
  }

  return save;
}

function applyItemToSave(save, id, count, equipped) {
  if (CANONICAL_ORB_ITEMS.includes(id)) {
    save.inventory.orbsOwned[id] = count;
  } else if (CANONICAL_EQUIPMENT_ITEMS.includes(id)) {
    save.inventory.equipmentOwned[id] = count;
    if (equipped && count > 0) {
      const slot = ITEM_SLOT_MAP[id];
      if (slot) {
        save.loadouts.brass.default[slot] = id;
      }
    }
  } else if (CANONICAL_CONSUMABLE_ITEMS.includes(id)) {
    if (id === 'bomb_pack') {
      // BUG_007 fix: clear consumable lockout, record legacy count
      save.inventory.legacyV1ConsumablePurchases.bomb_pack = count;
      save.inventory.consumables.bomb_pack = 0;
    } else {
      save.inventory.consumables[id] = count;
    }
  } else {
    // Store unrecognised item under unknown fields
    save.unknownPreservedFields[`item_${id}`] = count;
  }
}

/**
 * Main Save Migration Service class.
 */
export class SaveMigrationService {
  constructor(storage = null) {
    this._customStorage = storage;
  }

  get _storage() {
    return this._customStorage || globalThis.localStorage;
  }

  /**
   * Loads existing v2 save, or backs up and migrates v1 save, or initializes clean default.
   */
  loadOrMigrate() {
    try {
      // Step 1: Check if valid v2 save already exists
      const existingV2Str = this._storage ? this._storage.getItem(SAVE_V2_STORAGE_KEY) : null;
      if (existingV2Str) {
        try {
          const parsedV2 = JSON.parse(existingV2Str);
          const val = validateSaveV2(parsedV2);
          if (val.valid) {
            return {
              save: parsedV2,
              status: 'LOADED_V2',
              errors: []
            };
          } else {
            console.warn('[SaveMigrationService] Existing v2 save failed validation:', val.errors);
            this._dumpCorruptSave(existingV2Str);
          }
        } catch (parseErr) {
          console.warn('[SaveMigrationService] Corrupt v2 JSON detected:', parseErr);
          this._dumpCorruptSave(existingV2Str);
        }
      }

      // Step 2: Check for v1 keys
      const v1InvStr = this._storage ? this._storage.getItem(LEGACY_V1_INVENTORY_KEY) : null;
      const v1DevStr = this._storage ? this._storage.getItem(LEGACY_V1_DEVELOPMENT_KEY) : null;

      if (!v1InvStr && !v1DevStr) {
        // Fresh player install
        const freshV2 = createDefaultSaveV2();
        this.commitV2(freshV2);
        return {
          save: freshV2,
          status: 'CREATED_FRESH_V2',
          errors: []
        };
      }

      // Existing v1 player: Create verbatim backups before doing anything
      this._createVerbatimBackups(v1InvStr, v1DevStr);

      // Parse v1 strings safely
      let parsedInv = {};
      let parsedDev = {};
      let parseFailed = false;

      if (v1InvStr) {
        try {
          parsedInv = JSON.parse(v1InvStr);
        } catch (e) {
          console.warn('[SaveMigrationService] Malformed v1 inventory JSON:', e);
          this._dumpCorruptSave(v1InvStr);
          parseFailed = true;
        }
      }

      if (v1DevStr) {
        try {
          parsedDev = JSON.parse(v1DevStr);
        } catch (e) {
          console.warn('[SaveMigrationService] Malformed v1 development JSON:', e);
          this._dumpCorruptSave(v1DevStr);
          parseFailed = true;
        }
      }

      // Transform v1 -> v2
      const candidateV2 = migrateV1ToV2(parsedInv, parsedDev);
      const val = validateSaveV2(candidateV2);

      if (val.valid) {
        this.commitV2(candidateV2);
        return {
          save: candidateV2,
          status: 'MIGRATED_V1_TO_V2',
          errors: []
        };
      } else {
        console.error('[SaveMigrationService] Migration output failed validation! Aborting commit:', val.errors);
        this.rollbackToBackups();
        return {
          save: createDefaultSaveV2(),
          status: 'MIGRATION_VALIDATION_FAILED',
          errors: val.errors
        };
      }
    } catch (unexpectedErr) {
      console.error('[SaveMigrationService] Unexpected error during loadOrMigrate:', unexpectedErr);
      return {
        save: createDefaultSaveV2(),
        status: 'UNEXPECTED_ERROR',
        errors: [unexpectedErr.message]
      };
    }
  }

  /**
   * Commits a validated v2 save to localStorage.
   */
  commitV2(saveObj) {
    if (!this._storage) return false;
    const val = validateSaveV2(saveObj);
    if (!val.valid) {
      console.error('[SaveMigrationService] Refusing to commit invalid save:', val.errors);
      return false;
    }
    saveObj.lastSavedAtIso = new Date().toISOString();
    this._storage.setItem(SAVE_V2_STORAGE_KEY, JSON.stringify(saveObj));
    return true;
  }

  /**
   * Creates verbatim backups of legacy v1 keys if they don't already exist.
   */
  _createVerbatimBackups(v1InvStr, v1DevStr) {
    if (!this._storage) return;
    if (v1InvStr !== null && !this._storage.getItem(BACKUP_V1_INVENTORY_KEY)) {
      this._storage.setItem(BACKUP_V1_INVENTORY_KEY, v1InvStr);
    }
    if (v1DevStr !== null && !this._storage.getItem(BACKUP_V1_DEVELOPMENT_KEY)) {
      this._storage.setItem(BACKUP_V1_DEVELOPMENT_KEY, v1DevStr);
    }
  }

  /**
   * Dumps malformed string to a timestamped backup.
   */
  _dumpCorruptSave(rawStr) {
    if (!this._storage || !rawStr) return;
    const dumpKey = `opt_flipper_corrupt_dump_${Date.now()}`;
    this._storage.setItem(dumpKey, String(rawStr));
  }

  /**
   * Restores v1 keys from the verbatim backup keys.
   */
  rollbackToBackups() {
    if (!this._storage) return false;
    const backupInv = this._storage.getItem(BACKUP_V1_INVENTORY_KEY);
    const backupDev = this._storage.getItem(BACKUP_V1_DEVELOPMENT_KEY);

    if (backupInv !== null) {
      this._storage.setItem(LEGACY_V1_INVENTORY_KEY, backupInv);
    }
    if (backupDev !== null) {
      this._storage.setItem(LEGACY_V1_DEVELOPMENT_KEY, backupDev);
    }
    return true;
  }
}

export const saveMigrationService = new SaveMigrationService();
