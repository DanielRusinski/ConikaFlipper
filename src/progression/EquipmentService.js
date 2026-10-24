/**
 * EquipmentService.js
 * Authoritative service managing per-ball equipment loadouts and Layer 4 stat resolution.
 * Adheres strictly to:
 * - equipment-slot-framework.csv
 * - Save Schema v2 (loadouts[ballId].default)
 * - DEC_009 (Per-ball loadouts with global ownership)
 * - DEC_012 (Loadout changes allowed in EquipmentScreen / Title / between stages / Shop portal)
 * - BUG_004 fix (Equipment affects resolved stats ONLY when equipped)
 */

import { eventBus } from '../core/EventBus.js';
import { saveMigrationService } from '../core/SaveMigrationService.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_DEFINITIONS,
  EQUIPMENT_SLOT_DEFINITIONS
} from '../config/equipmentConfig.js';

export const EQUIP_REJECTION_REASONS = {
  ITEM_NOT_OWNED: 'ITEM_NOT_OWNED',
  INVALID_EQUIP_SLOT: 'INVALID_EQUIP_SLOT',
  BALL_NOT_UNLOCKED: 'BALL_NOT_UNLOCKED',
  LOADOUT_LOCKED_MID_ROLL: 'LOADOUT_LOCKED_MID_ROLL'
};

export class EquipmentService {
  constructor(inventorySystem = null) {
    this._inventory = inventorySystem;
    this._selectedBall = 'brass';
    this._unsubs = [];
    this._isMidRollLocked = false;
  }

  init(inventorySystem = null) {
    if (inventorySystem) {
      this._inventory = inventorySystem;
    }

    this._unsubs.push(
      eventBus.on('ball:typeChanged', (data) => {
        if (data && data.type) {
          this.setSelectedBall(data.type);
        }
      })
    );

    // Initial sync of Layer 4 modifiers
    this.syncActiveLoadoutToStatService();
  }

  setInventory(inventorySystem) {
    this._inventory = inventorySystem;
  }

  setSelectedBall(ballId) {
    if (ballId) {
      this._selectedBall = ballId.toLowerCase();
      this.syncActiveLoadoutToStatService();
    }
  }

  getSelectedBall() {
    return this._selectedBall;
  }

  setMidRollLock(locked) {
    this._isMidRollLocked = !!locked;
  }

  isMidRollLocked() {
    return this._isMidRollLocked;
  }

  /**
   * Retrieves the current loadout object for a given ball.
   * Format: { WEAPON: itemId|null, SHIELD: itemId|null, ACCESSORY: itemId|null, CRYSTAL: itemId|null }
   */
  getLoadout(ballId = null) {
    const targetBall = (ballId || this._selectedBall).toLowerCase();
    const res = saveMigrationService.loadOrMigrate();
    if (res && res.save && res.save.loadouts && res.save.loadouts[targetBall]) {
      const ballLoadout = res.save.loadouts[targetBall].default;
      return {
        WEAPON: ballLoadout.WEAPON || null,
        SHIELD: ballLoadout.SHIELD || null,
        ACCESSORY: ballLoadout.ACCESSORY || null,
        CRYSTAL: ballLoadout.CRYSTAL || null
      };
    }

    return {
      WEAPON: null,
      SHIELD: null,
      ACCESSORY: null,
      CRYSTAL: null
    };
  }

  /**
   * Validates whether an item can be equipped into a specific slot on a given ball.
   * Returns { allowed: boolean, reason?: string }
   */
  canEquip(itemId, slotKey, ballId = null) {
    const targetBall = (ballId || this._selectedBall).toLowerCase();

    if (this._isMidRollLocked) {
      return { allowed: false, reason: EQUIP_REJECTION_REASONS.LOADOUT_LOCKED_MID_ROLL };
    }

    const itemDef = EQUIPMENT_DEFINITIONS[itemId];
    if (!itemDef) {
      return { allowed: false, reason: EQUIP_REJECTION_REASONS.INVALID_EQUIP_SLOT };
    }

    const normalizedSlot = (slotKey || '').toUpperCase();
    if (!EQUIPMENT_SLOTS[normalizedSlot] || itemDef.slot !== normalizedSlot) {
      return { allowed: false, reason: EQUIP_REJECTION_REASONS.INVALID_EQUIP_SLOT };
    }

    // Check ownership in save schema v2 or inventorySystem
    const res = saveMigrationService.loadOrMigrate();
    const saveV2 = res ? res.save : null;
    const ownedCount = (saveV2 && saveV2.inventory && saveV2.inventory.equipmentOwned)
      ? (saveV2.inventory.equipmentOwned[itemId] || 0)
      : (this._inventory ? this._inventory.getItemQuantity(itemId) : 0);

    if (ownedCount <= 0) {
      return { allowed: false, reason: EQUIP_REJECTION_REASONS.ITEM_NOT_OWNED };
    }

    // Check if target ball is unlocked
    if (saveV2 && saveV2.balls && saveV2.balls[targetBall] && !saveV2.balls[targetBall].unlocked) {
      return { allowed: false, reason: EQUIP_REJECTION_REASONS.BALL_NOT_UNLOCKED };
    }

    return { allowed: true };
  }

  /**
   * Equips an item into a slot for the specified ball (or active ball).
   * Persists cleanly into Save Schema v2 and updates ResolvedStatService Layer 4 immediately.
   */
  equip(itemId, slotKey, ballId = null) {
    const targetBall = (ballId || this._selectedBall).toLowerCase();
    const check = this.canEquip(itemId, slotKey, targetBall);
    if (!check.allowed) {
      return { success: false, reason: check.reason };
    }

    const normalizedSlot = slotKey.toUpperCase();
    const res = saveMigrationService.loadOrMigrate();
    if (!res || !res.save) {
      return { success: false, reason: 'SAVE_UNAVAILABLE' };
    }

    const v2 = res.save;
    if (!v2.loadouts[targetBall]) {
      v2.loadouts[targetBall] = { default: { WEAPON: null, SHIELD: null, ACCESSORY: null, CRYSTAL: null } };
    }

    const previousItem = v2.loadouts[targetBall].default[normalizedSlot];
    v2.loadouts[targetBall].default[normalizedSlot] = itemId;

    saveMigrationService.commitV2(v2);

    // Sync modifiers if target ball is currently active
    if (targetBall === this._selectedBall) {
      this.syncActiveLoadoutToStatService();
    }

    eventBus.emit('equipment:changed', {
      ballId: targetBall,
      slot: normalizedSlot,
      equippedItem: itemId,
      previousItem
    });

    return { success: true, slot: normalizedSlot, equippedItem: itemId };
  }

  /**
   * Unequips an item from a slot for the specified ball (or active ball).
   */
  unequip(slotKey, ballId = null) {
    const targetBall = (ballId || this._selectedBall).toLowerCase();
    if (this._isMidRollLocked) {
      return { success: false, reason: EQUIP_REJECTION_REASONS.LOADOUT_LOCKED_MID_ROLL };
    }

    const normalizedSlot = (slotKey || '').toUpperCase();
    if (!EQUIPMENT_SLOTS[normalizedSlot]) {
      return { success: false, reason: EQUIP_REJECTION_REASONS.INVALID_EQUIP_SLOT };
    }

    const res = saveMigrationService.loadOrMigrate();
    if (!res || !res.save) {
      return { success: false, reason: 'SAVE_UNAVAILABLE' };
    }

    const v2 = res.save;
    if (!v2.loadouts[targetBall] || !v2.loadouts[targetBall].default) {
      return { success: true, slot: normalizedSlot, unequippedItem: null };
    }

    const previousItem = v2.loadouts[targetBall].default[normalizedSlot];
    v2.loadouts[targetBall].default[normalizedSlot] = null;

    saveMigrationService.commitV2(v2);

    if (targetBall === this._selectedBall) {
      this.syncActiveLoadoutToStatService();
    }

    eventBus.emit('equipment:changed', {
      ballId: targetBall,
      slot: normalizedSlot,
      equippedItem: null,
      previousItem
    });

    return { success: true, slot: normalizedSlot, unequippedItem: previousItem };
  }

  /**
   * Synchronizes active ball's equipped items into ResolvedStatService Stage 4 (STAGE_4_EQUIPMENT).
   */
  syncActiveLoadoutToStatService(targetBallId = null) {
    const ballId = (targetBallId || this._selectedBall).toLowerCase();
    const loadout = this.getLoadout(ballId);

    // 1. Remove all existing Layer 4 modifiers
    const activeMods = resolvedStatService.getModifiers();
    for (const mod of activeMods) {
      if (mod.layer === 4) {
        resolvedStatService.removeModifier(mod.id);
      }
    }

    // 2. Add modifiers for each equipped item in the active loadout
    for (const slotKey of Object.keys(loadout)) {
      const equippedItemId = loadout[slotKey];
      if (equippedItemId && EQUIPMENT_DEFINITIONS[equippedItemId]) {
        const itemDef = EQUIPMENT_DEFINITIONS[equippedItemId];
        if (itemDef.modifier) {
          resolvedStatService.addModifier({
            id: itemDef.modifier.id,
            statKey: itemDef.modifier.statKey,
            operation: itemDef.modifier.operation,
            value: itemDef.modifier.value,
            priority: itemDef.modifier.priority !== undefined ? itemDef.modifier.priority : 0,
            layer: 4,
            sourceId: `EQUIP_${itemDef.id}`
          });
        }
      }
    }
  }

  dispose() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
  }
}

export const equipmentService = new EquipmentService();
