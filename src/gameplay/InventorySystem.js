import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';
import { itemDatabase } from '../shop/ItemDatabase.js';
import { SHOP_CONFIG } from '../shop/ShopConfig.js';
import { saveMigrationService } from '../core/SaveMigrationService.js';

export class InventorySystem {
  constructor() {
    this.selectedBallType = 'brass';
    this.items = []; // Array of { id, count, equipped, ... }
    this.unlockedBalls = ['brass'];
    this.yellowCoins = SHOP_CONFIG.startingYellowCoins || 150;
    this.redCoins = SHOP_CONFIG.startingRedCoins || 10;
    this._storageKey = 'opt_flipper_inventory';
    this._unsubs = [];
  }

  init() {
    this.load();

    // Immediately synchronize HUD and UI with stored balances
    this.emitCurrencyChanged();

    // Listen for in-game coin pick-ups to credit wallet
    this._unsubs.push(
      eventBus.on('coin:collected', (data) => {
        if (!data) return;
        const type = data.type === 'red' ? 'red' : 'yellow';
        this.addCoins(type, 1);
      })
    );
  }

  // ==========================================
  // BALL & EQUIPMENT API
  // ==========================================

  getSelectedBall() {
    return this.selectedBallType;
  }

  setSelectedBall(type) {
    if (GAME_CONFIG.ball.types.includes(type) && this.isBallUnlocked(type)) {
      this.selectedBallType = type;
      this.save();
      eventBus.emit('ball:typeChanged', { type });
      return true;
    }
    return false;
  }

  unlockBall(type) {
    if (!this.unlockedBalls.includes(type)) {
      this.unlockedBalls.push(type);
      this.save();
      eventBus.emit('ball:unlocked', { type });
    }
  }

  isBallUnlocked(type) {
    return this.unlockedBalls.includes(type);
  }

  // ==========================================
  // CURRENCY & WALLET API
  // ==========================================

  getYellowCoins() {
    return this.yellowCoins;
  }

  getRedCoins() {
    return this.redCoins;
  }

  canAfford(yellowCost = 0, redCost = 0) {
    return this.yellowCoins >= yellowCost && this.redCoins >= redCost;
  }

  /**
   * Atomically deducts yellow and red coins.
   * Balances will never become negative.
   * Returns true on success, false if unaffordable.
   */
  deductCoins(yellowCost = 0, redCost = 0) {
    if (!this.canAfford(yellowCost, redCost)) {
      return false;
    }
    this.yellowCoins -= Math.max(0, yellowCost);
    this.redCoins -= Math.max(0, redCost);
    this.save();
    this.emitCurrencyChanged();
    return true;
  }

  addCoins(type, amount = 1) {
    const val = Math.max(0, Math.floor(amount));
    if (val <= 0) return;

    if (type === 'red') {
      this.redCoins += val;
    } else {
      this.yellowCoins += val;
    }
    this.save();
    this.emitCurrencyChanged();
  }

  emitCurrencyChanged() {
    eventBus.emit('currency:changed', {
      yellowCoins: this.yellowCoins,
      redCoins: this.redCoins
    });
  }

  // ==========================================
  // ITEMS API
  // ==========================================

  getItems() {
    return this.items;
  }

  /**
   * Returns total owned quantity of an item across inventory.
   */
  getItemQuantity(itemId) {
    if (!itemId) return 0;
    let total = 0;
    for (const item of this.items) {
      if (typeof item === 'string') {
        if (item === itemId) total++;
      } else if (item && item.id === itemId) {
        total += Math.max(1, item.count || 1);
      }
    }
    return total;
  }

  hasItem(itemId) {
    return this.getItemQuantity(itemId) > 0;
  }

  isEquipped(itemId, ballId = null) {
    const def = itemDatabase.get(itemId);
    if (def && def.ballType) {
      return this.selectedBallType === def.ballType;
    }
    const targetBall = (ballId || this.selectedBallType).toLowerCase();
    const res = saveMigrationService.loadOrMigrate();
    if (res && res.save && res.save.loadouts && res.save.loadouts[targetBall]) {
      const loadout = res.save.loadouts[targetBall].default;
      if (Object.values(loadout).includes(itemId)) {
        return true;
      }
    }
    for (const item of this.items) {
      if (item && item.id === itemId && item.equipped) {
        return true;
      }
    }
    return false;
  }

  /**
   * Adds an item to inventory.
   * Supports both addItem(object) (legacy API) and addItem(itemId, count).
   */
  addItem(itemOrId, count = 1) {
    const qty = Math.max(1, Math.floor(count));
    const rawId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;

    if (typeof itemOrId === 'string') {
      const def = itemDatabase.get(itemOrId);
      const isStackable = def ? def.stackable : false;

      if (isStackable) {
        const existing = this.items.find(it => it && it.id === itemOrId);
        if (existing) {
          existing.count = (existing.count || 1) + qty;
        } else {
          this.items.push({ id: itemOrId, count: qty, equipped: false });
        }
      } else {
        for (let i = 0; i < qty; i++) {
          this.items.push({ id: itemOrId, count: 1, equipped: false });
        }
      }
    } else if (itemOrId && typeof itemOrId === 'object') {
      const id = itemOrId.id;
      const def = id ? itemDatabase.get(id) : null;
      const isStackable = def ? def.stackable : (itemOrId.stackable || false);

      if (id && isStackable) {
        const existing = this.items.find(it => it && it.id === id);
        if (existing) {
          existing.count = (existing.count || 1) + (itemOrId.count || qty);
        } else {
          this.items.push({
            id,
            count: itemOrId.count || qty,
            equipped: !!itemOrId.equipped
          });
        }
      } else {
        this.items.push(itemOrId);
      }
    }

    // Direct sync to Save Schema v2 equipmentOwned and consumables
    if (rawId) {
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save && res.save.inventory) {
        const v2 = res.save;
        if (v2.inventory.equipmentOwned && v2.inventory.equipmentOwned[rawId] !== undefined) {
          v2.inventory.equipmentOwned[rawId] = (v2.inventory.equipmentOwned[rawId] || 0) + qty;
        }
        if (v2.inventory.consumables && v2.inventory.consumables[rawId] !== undefined) {
          v2.inventory.consumables[rawId] = (v2.inventory.consumables[rawId] || 0) + qty;
        }
        saveMigrationService.commitV2(v2);
      }
    }

    this.save();
    eventBus.emit('inventory:changed', { items: this.items });
  }

  /**
   * Removes an item from inventory.
   * Supports removeItem(index) (legacy API) and removeItem(itemId, count).
   */
  removeItem(indexOrId, count = 1) {
    if (typeof indexOrId === 'number') {
      if (indexOrId >= 0 && indexOrId < this.items.length) {
        this.items.splice(indexOrId, 1);
        this.save();
        eventBus.emit('inventory:changed', { items: this.items });
      }
      return;
    }

    const itemId = indexOrId;
    let remainingToRemove = Math.max(1, Math.floor(count));

    for (let i = this.items.length - 1; i >= 0 && remainingToRemove > 0; i--) {
      const it = this.items[i];
      if (typeof it === 'string' && it === itemId) {
        this.items.splice(i, 1);
        remainingToRemove--;
      } else if (it && it.id === itemId) {
        const currentCount = it.count || 1;
        if (currentCount <= remainingToRemove) {
          remainingToRemove -= currentCount;
          this.items.splice(i, 1);
        } else {
          it.count = currentCount - remainingToRemove;
          remainingToRemove = 0;
        }
      }
    }

    // Direct sync to Save Schema v2 equipmentOwned and consumables
    if (itemId) {
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save && res.save.inventory) {
        const v2 = res.save;
        const removeCount = Math.max(1, Math.floor(count));
        if (v2.inventory.equipmentOwned && v2.inventory.equipmentOwned[itemId] !== undefined) {
          v2.inventory.equipmentOwned[itemId] = Math.max(0, (v2.inventory.equipmentOwned[itemId] || 0) - removeCount);
        }
        if (v2.inventory.consumables && v2.inventory.consumables[itemId] !== undefined) {
          v2.inventory.consumables[itemId] = Math.max(0, (v2.inventory.consumables[itemId] || 0) - removeCount);
        }
        saveMigrationService.commitV2(v2);
      }
    }

    this.save();
    eventBus.emit('inventory:changed', { items: this.items });
  }

  getSellableItems() {
    const map = new Map();

    for (const entry of this.items) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (!id) continue;

      const def = itemDatabase.get(id);
      if (!def) continue;

      // Check if item is sellable
      if (def.sellable === false || (def.sellYellow === 0 && def.sellRed === 0)) {
        continue;
      }

      const count = typeof entry === 'object' && entry.count ? entry.count : 1;
      const isEquipped = this.isEquipped(id);

      if (map.has(id)) {
        const existing = map.get(id);
        existing.count += count;
        if (isEquipped) existing.isEquipped = true;
      } else {
        map.set(id, {
          item: def,
          count,
          isEquipped
        });
      }
    }

    return Array.from(map.values());
  }

  // ==========================================
  // PERSISTENCE (Save & Load)
  // ==========================================

  save() {
    try {
      const data = {
        selectedBallType: this.selectedBallType,
        unlockedBalls: this.unlockedBalls,
        yellowCoins: this.yellowCoins,
        redCoins: this.redCoins,
        items: this.items
      };
      // Maintain legacy v1 key for backward compatibility
      localStorage.setItem(this._storageKey, JSON.stringify(data));

      // Synchronize with Save Schema v2 (WP4)
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save) {
        const v2 = res.save;
        v2.inventory.currencies.yellowCoins = this.yellowCoins;
        v2.inventory.currencies.redCoins = this.redCoins;
        v2.profile.selectedBallId = this.selectedBallType;
        for (const ballId of this.unlockedBalls) {
          if (v2.balls[ballId]) {
            v2.balls[ballId].unlocked = true;
          }
        }
        // Mirror current items into v2 equipmentOwned and consumables
        for (const it of this.items) {
          const id = typeof it === 'string' ? it : it?.id;
          const count = typeof it === 'object' && it?.count ? it.count : 1;
          if (!id) continue;
          if (v2.inventory.equipmentOwned && v2.inventory.equipmentOwned[id] !== undefined) {
            v2.inventory.equipmentOwned[id] = Math.max(v2.inventory.equipmentOwned[id] || 0, count);
          }
          if (v2.inventory.consumables && v2.inventory.consumables[id] !== undefined) {
            v2.inventory.consumables[id] = Math.max(v2.inventory.consumables[id] || 0, count);
          }
        }
        saveMigrationService.commitV2(v2);
      }
    } catch (e) {
      console.warn('Failed to save inventory:', e);
    }
  }

  load() {
    try {
      // Run migration service to ensure v2 and backups exist
      const migrationRes = saveMigrationService.loadOrMigrate();

      const dataStr = localStorage.getItem(this._storageKey);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (Array.isArray(data.unlockedBalls) && data.unlockedBalls.length > 0) {
          this.unlockedBalls = Array.from(new Set(['brass', ...data.unlockedBalls]));
        } else {
          this.unlockedBalls = ['brass'];
        }

        if (
          data.selectedBallType &&
          GAME_CONFIG.ball.types.includes(data.selectedBallType) &&
          this.unlockedBalls.includes(data.selectedBallType)
        ) {
          this.selectedBallType = data.selectedBallType;
        } else {
          this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
        }

        if (data.yellowCoins !== undefined) {
          this.yellowCoins = Math.max(0, Number(data.yellowCoins) || 0);
        } else {
          this.yellowCoins = SHOP_CONFIG.startingYellowCoins || 150;
        }

        if (data.redCoins !== undefined) {
          this.redCoins = Math.max(0, Number(data.redCoins) || 0);
        } else {
          this.redCoins = SHOP_CONFIG.startingRedCoins || 10;
        }

        this.items = Array.isArray(data.items) ? data.items : [];
      } else if (migrationRes && migrationRes.save) {
        // Fallback to loaded v2 state if v1 key was not set
        const v2 = migrationRes.save;
        this.yellowCoins = v2.inventory.currencies.yellowCoins;
        this.redCoins = v2.inventory.currencies.redCoins;
        this.selectedBallType = v2.profile.selectedBallId || 'brass';
        const unl = Object.keys(v2.balls).filter(b => v2.balls[b].unlocked);
        this.unlockedBalls = unl.length > 0 ? unl : ['brass'];
        this.items = [];
      } else {
        this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
        this.unlockedBalls = ['brass'];
        this.yellowCoins = SHOP_CONFIG.startingYellowCoins || 150;
        this.redCoins = SHOP_CONFIG.startingRedCoins || 10;
        this.items = [];
      }
    } catch (e) {
      console.warn('Failed to load inventory:', e);
      this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
      this.unlockedBalls = ['brass'];
      this.yellowCoins = SHOP_CONFIG.startingYellowCoins || 150;
      this.redCoins = SHOP_CONFIG.startingRedCoins || 10;
      this.items = [];
    }

    this.emitCurrencyChanged();
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];
  }
}
