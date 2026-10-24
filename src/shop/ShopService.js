import { itemDatabase } from './ItemDatabase.js';
import { eventBus } from '../core/EventBus.js';

export class ShopService {
  constructor(inventorySystem = null) {
    this._inventory = inventorySystem;
    this._isTransacting = false;
  }

  setInventory(inventorySystem) {
    this._inventory = inventorySystem;
  }

  getInventory() {
    return this._inventory;
  }

  // ==========================================
  // BUYING VALIDATION & EXECUTION
  // ==========================================

  /**
   * Validates if a product can currently be purchased.
   * Returns { allowed: boolean, reason?: string, yellowCost: number, redCost: number }
   */
  canBuy(productId, quantity = 1) {
    if (!this._inventory) {
      return { allowed: false, reason: 'Brak aktywnego profilu gracza.' };
    }

    const qty = Math.max(1, Math.floor(quantity));
    const product = itemDatabase.get(productId);

    if (!product) {
      return { allowed: false, reason: 'Produkt nie istnieje w katalogu sklepu.' };
    }

    if (!product.unlocked) {
      return { allowed: false, reason: 'Produkt jest zablokowany przez postęp gry.' };
    }

    const yellowCost = (product.priceYellow || 0) * qty;
    const redCost = (product.priceRed || 0) * qty;

    const playerYellow = this._inventory.getYellowCoins();
    const playerRed = this._inventory.getRedCoins();

    if (playerYellow < yellowCost && playerRed < redCost) {
      return {
        allowed: false,
        reason: `Brak wystarczającej ilości żółtych (wymagane: ${yellowCost}, masz: ${playerYellow}) i czerwonych monet (wymagane: ${redCost}, masz: ${playerRed}).`,
        yellowCost,
        redCost
      };
    }

    if (playerYellow < yellowCost) {
      return {
        allowed: false,
        reason: `Za mało żółtych monet (wymagane: ${yellowCost}, posiadasz: ${playerYellow}).`,
        yellowCost,
        redCost
      };
    }

    if (playerRed < redCost) {
      return {
        allowed: false,
        reason: `Za mało czerwonych monet (wymagane: ${redCost}, posiadasz: ${playerRed}).`,
        yellowCost,
        redCost
      };
    }

    // Ownership & Stack limit validation (Target WP10 architecture:
    // Stored consumables such as bomb_pack are added to inventory.consumables up to maxStack/maxCarryCount;
    // They are allowed even if active bombs are currently at capacity.
    // Permanent equipment items are capped at maxStack (1).
    const currentQty = this._inventory.getItemQuantity(productId);
    if (product.maxStack && (currentQty + qty > product.maxStack)) {
      if (currentQty >= product.maxStack) {
        return {
          allowed: false,
          reason: `Osiągnięto maksymalny limit posiadania tego przedmiotu (${product.maxStack}).`,
          yellowCost,
          redCost
        };
      } else {
        const allowedQty = product.maxStack - currentQty;
        return {
          allowed: false,
          reason: `Możesz dokupić jeszcze maksymalnie ${allowedQty} szt.`,
          yellowCost,
          redCost
        };
      }
    }

    return { allowed: true, yellowCost, redCost, product };
  }

  /**
   * Executes atomic purchase transaction.
   */
  async buy(productId, quantity = 1) {
    if (this._isTransacting) {
      return { success: false, reason: 'Trwa przetwarzanie poprzedniej transakcji...' };
    }

    this._isTransacting = true;
    try {
      const check = this.canBuy(productId, quantity);
      if (!check.allowed) {
        eventBus.emit('shop:transactionFailed', {
          type: 'buy',
          productId,
          reason: check.reason
        });
        return { success: false, reason: check.reason };
      }

      const product = check.product;
      const { yellowCost, redCost } = check;

      // 1. Atomic deduction of currencies
      const deductSuccess = this._inventory.deductCoins(yellowCost, redCost);
      if (!deductSuccess) {
        const failReason = 'Nie udało się pobrać waluty z portfela.';
        eventBus.emit('shop:transactionFailed', { type: 'buy', productId, reason: failReason });
        return { success: false, reason: failReason };
      }

      // 2. Add product to inventory
      try {
        this._inventory.addItem(productId, quantity);

        // If this product represents a ball, unlock it
        if (product.ballType) {
          this._inventory.unlockBall(product.ballType);
        }

        // 3. Save player state
        this._inventory.save();

        const successMsg = `Pomyślnie zakupiono: ${product.name} (x${quantity})!`;

        eventBus.emit('shop:buy', {
          product,
          quantity,
          yellowCost,
          redCost
        });

        eventBus.emit('shop:transactionCompleted', {
          type: 'buy',
          product,
          quantity,
          yellowCost,
          redCost,
          message: successMsg
        });

        return { success: true, message: successMsg, product };
      } catch (err) {
        console.error('[ShopService] Error while granting product, rolling back coins:', err);
        // Rollback currencies if item addition failed
        this._inventory.addCoins('yellow', yellowCost);
        this._inventory.addCoins('red', redCost);
        this._inventory.save();

        const rollbackReason = 'Wystąpił błąd podczas dodawania przedmiotu. Środki zwrócono.';
        eventBus.emit('shop:transactionFailed', { type: 'buy', productId, reason: rollbackReason });
        return { success: false, reason: rollbackReason };
      }
    } finally {
      this._isTransacting = false;
    }
  }

  // ==========================================
  // SELLING VALIDATION & EXECUTION
  // ==========================================

  /**
   * Validates if an owned item can currently be sold.
   * Returns { allowed: boolean, reason?: string, yellowReward: number, redReward: number }
   */
  canSell(productId, quantity = 1) {
    if (!this._inventory) {
      return { allowed: false, reason: 'Brak aktywnego profilu gracza.' };
    }

    const qty = Math.max(1, Math.floor(quantity));
    const product = itemDatabase.get(productId);

    if (!product) {
      return { allowed: false, reason: 'Przedmiot nie istnieje w bazie danych.' };
    }

    if (product.sellable === false || (product.sellYellow === 0 && product.sellRed === 0)) {
      return { allowed: false, reason: 'Ten przedmiot nie podlega sprzedaży.' };
    }

    const ownedQty = this._inventory.getItemQuantity(productId);
    if (ownedQty < qty) {
      return { allowed: false, reason: `Nie posiadasz wystarczającej liczby sztuk (masz: ${ownedQty}).` };
    }

    // Check equipped status: cannot sell active equipped ball or item
    if (this._inventory.isEquipped(productId)) {
      return {
        allowed: false,
        reason: 'Przedmiot jest aktualnie założony lub używany! Zmień wyposażenie przed sprzedażą.'
      };
    }

    const yellowReward = (product.sellYellow || 0) * qty;
    const redReward = (product.sellRed || 0) * qty;

    return { allowed: true, yellowReward, redReward, product };
  }

  /**
   * Executes atomic sale transaction.
   */
  async sell(productId, quantity = 1) {
    if (this._isTransacting) {
      return { success: false, reason: 'Trwa przetwarzanie poprzedniej transakcji...' };
    }

    this._isTransacting = true;
    try {
      const check = this.canSell(productId, quantity);
      if (!check.allowed) {
        eventBus.emit('shop:transactionFailed', {
          type: 'sell',
          productId,
          reason: check.reason
        });
        return { success: false, reason: check.reason };
      }

      const product = check.product;
      const { yellowReward, redReward } = check;

      // 1. Remove from inventory
      try {
        this._inventory.removeItem(productId, quantity);

        // 2. Award currencies
        if (yellowReward > 0) this._inventory.addCoins('yellow', yellowReward);
        if (redReward > 0) this._inventory.addCoins('red', redReward);

        // 3. Save player state
        this._inventory.save();

        const successMsg = `Sprzedano: ${product.name} (x${quantity}) za +${yellowReward} 🪙 ${redReward > 0 ? `+${redReward} 🔴` : ''}!`;

        eventBus.emit('shop:sell', {
          product,
          quantity,
          yellowReward,
          redReward
        });

        eventBus.emit('shop:transactionCompleted', {
          type: 'sell',
          product,
          quantity,
          yellowReward,
          redReward,
          message: successMsg
        });

        return { success: true, message: successMsg, product };
      } catch (err) {
        console.error('[ShopService] Error while processing sale, rolling back:', err);
        // Rollback item removal
        this._inventory.addItem(productId, quantity);
        this._inventory.save();

        const failReason = 'Wystąpił błąd podczas sprzedaży przedmiotu.';
        eventBus.emit('shop:transactionFailed', { type: 'sell', productId, reason: failReason });
        return { success: false, reason: failReason };
      }
    } finally {
      this._isTransacting = false;
    }
  }
}

export const shopService = new ShopService();
