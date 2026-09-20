import { GRAPHICS_CONFIG } from '../config/graphicsConfig.js';
import { eventBus } from './EventBus.js';

export const QUALITY_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

class QualityManager {
  constructor() {
    const isMobile = GRAPHICS_CONFIG.isMobile;
    this.level = isMobile ? QUALITY_LEVELS.MEDIUM : QUALITY_LEVELS.HIGH;
    this.config = GRAPHICS_CONFIG.quality[this.level];
    this._autoEnabled = GRAPHICS_CONFIG.adaptiveQuality.enabled;
    this._lowFrameCount = 0;
    this._highFrameCount = 0;
    this._userPreference = null;
  }

  setLevel(level) {
    if (!QUALITY_LEVELS[level.toUpperCase()] && !Object.values(QUALITY_LEVELS).includes(level)) return;
    if (this.level === level) return;
    
    this.level = level;
    this.config = GRAPHICS_CONFIG.quality[level];
    
    eventBus.emit('quality:changed', { level: this.level, config: this.config });
  }

  setUserPreference(level) {
    this._userPreference = level;
    if (level) {
      this.setLevel(level);
    }
  }

  update(fps) {
    if (!this._autoEnabled || this._userPreference) return;
    
    const settings = GRAPHICS_CONFIG.adaptiveQuality;
    
    if (fps < settings.decreaseThreshold) {
      this._lowFrameCount++;
      this._highFrameCount = 0;
    } else if (fps > settings.increaseThreshold) {
      this._highFrameCount++;
      this._lowFrameCount = 0;
    } else {
      this._lowFrameCount = 0;
      this._highFrameCount = 0;
    }
    
    if (this._lowFrameCount > settings.decreaseFrames) {
      if (this.level === QUALITY_LEVELS.HIGH) this.setLevel(QUALITY_LEVELS.MEDIUM);
      else if (this.level === QUALITY_LEVELS.MEDIUM) this.setLevel(QUALITY_LEVELS.LOW);
      this._lowFrameCount = 0;
    } else if (this._highFrameCount > settings.increaseFrames) {
      if (this.level === QUALITY_LEVELS.LOW) this.setLevel(QUALITY_LEVELS.MEDIUM);
      else if (this.level === QUALITY_LEVELS.MEDIUM) this.setLevel(QUALITY_LEVELS.HIGH);
      this._highFrameCount = 0;
    }
  }

  dispose() {
    this.level = QUALITY_LEVELS.HIGH;
    this.config = GRAPHICS_CONFIG.quality[this.level];
    this._userPreference = null;
    this._lowFrameCount = 0;
    this._highFrameCount = 0;
  }
}

export const qualityManager = new QualityManager();
