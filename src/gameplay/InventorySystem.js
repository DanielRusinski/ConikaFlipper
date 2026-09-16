import { GAME_CONFIG } from '../config/gameConfig.js';
import { eventBus } from '../core/EventBus.js';

export class InventorySystem {
  constructor() {
    this.selectedBallType = 'brass';
    this.items = [];
    this._storageKey = 'opt_flipper_inventory';
  }

  init() {
    this.load();
  }

  getSelectedBall() {
    return this.selectedBallType;
  }

  setSelectedBall(type) {
    if (GAME_CONFIG.ball.types.includes(type)) {
      this.selectedBallType = type;
      this.save();
      eventBus.emit('ball:typeChanged', { type });
    }
  }

  addItem(item) {
    this.items.push(item);
    this.save();
  }

  removeItem(index) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.save();
    }
  }

  getItems() {
    return this.items;
  }

  save() {
    try {
      const data = {
        selectedBallType: this.selectedBallType,
        items: this.items
      };
      localStorage.setItem(this._storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save inventory:', e);
    }
  }

  load() {
    try {
      const dataStr = localStorage.getItem(this._storageKey);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.selectedBallType && GAME_CONFIG.ball.types.includes(data.selectedBallType)) {
          this.selectedBallType = data.selectedBallType;
        } else {
          this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
        }
        this.items = Array.isArray(data.items) ? data.items : [];
      } else {
        this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
      }
    } catch (e) {
      console.warn('Failed to load inventory:', e);
      this.selectedBallType = GAME_CONFIG.ball.defaultType || 'brass';
    }
  }

  dispose() {
    // Nothing to dispose
  }
}
