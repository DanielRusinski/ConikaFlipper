class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback);
      if (this.events.get(event).size === 0) {
        this.events.delete(event);
      }
    }
  }

  once(event, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  emit(event, data) {
    if (this.events.has(event)) {
      for (const callback of this.events.get(event)) {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  clear() {
    this.events.clear();
  }

  dispose() {
    this.clear();
  }
}

export const eventBus = new EventBus();
