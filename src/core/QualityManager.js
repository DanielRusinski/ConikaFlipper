import { GRAPHICS_CONFIG, PERFORMANCE_CONFIG } from '../config/graphicsConfig.js';
import { eventBus } from './EventBus.js';

export const QUALITY_LEVELS = {
  ULTRA: 'ultra',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

const LEVEL_ORDER = ['low', 'medium', 'high', 'ultra'];

class QualityManager {
  constructor() {
    // Initial tier: LOW per user request (with postprocessing & bloom enabled)
    this.level = QUALITY_LEVELS.LOW;
    this.config = PERFORMANCE_CONFIG.levels[this.level] || GRAPHICS_CONFIG.quality[this.level];

    this._autoEnabled = true;
    this._userPreference = null;

    // Rolling average FPS buffer
    this._sampleSize = PERFORMANCE_CONFIG.FPS_SAMPLE_SIZE || 60;
    this._fpsBuffer = new Float32Array(this._sampleSize);
    this._fpsIndex = 0;
    this._fpsCount = 0;
    this._fpsSum = 0;

    this.currentFps = 60;
    this.avgFps = 60;
    this.minFps = 60;
    this.frameTime = 16.67;

    // Time-based hysteresis counters (seconds)
    this._lowFpsDuration = 0;
    this._highFpsDuration = 0;
    this._cooldownTimer = 0;

    // WebGL runtime metrics
    this.metrics = {
      fps: 60,
      avgFps: 60,
      minFps: 60,
      frameTime: 16.67,
      level: this.level,
      pixelRatio: this.config.pixelRatio,
      drawCalls: 0,
      triangles: 0,
      particles: 0,
      activeCrystals: 0
    };
  }

  setLevel(level) {
    const normalized = level ? level.toLowerCase() : '';
    if (!LEVEL_ORDER.includes(normalized)) return;
    if (this.level === normalized) return;

    const previousLevel = this.level;
    this.level = normalized;
    this.config = PERFORMANCE_CONFIG.levels[this.level];
    this.metrics.level = this.level;
    this.metrics.pixelRatio = this.config.pixelRatio;

    // Reset counters and apply cooldown to prevent rapid oscillating/flapping
    this._lowFpsDuration = 0;
    this._highFpsDuration = 0;
    this._cooldownTimer = PERFORMANCE_CONFIG.QUALITY_CHANGE_COOLDOWN || 2.0;

    eventBus.emit('quality:changed', {
      level: this.level,
      previousLevel,
      config: this.config
    });
  }

  setUserPreference(level) {
    this._userPreference = level;
    if (level) {
      this.setLevel(level);
    }
  }

  /**
   * Main adaptive update called once per frame with current instantaneous FPS, delta time, and optional renderer info
   */
  update(fps, delta = 0.016, rendererInfo = null) {
    if (typeof fps !== 'number' || isNaN(fps) || fps <= 0) return;

    this.currentFps = fps;
    this.frameTime = delta * 1000;

    // Push into rolling average buffer
    if (this._fpsCount < this._sampleSize) {
      this._fpsBuffer[this._fpsIndex] = fps;
      this._fpsSum += fps;
      this._fpsCount++;
    } else {
      this._fpsSum -= this._fpsBuffer[this._fpsIndex];
      this._fpsBuffer[this._fpsIndex] = fps;
      this._fpsSum += fps;
    }
    this._fpsIndex = (this._fpsIndex + 1) % this._sampleSize;
    this.avgFps = this._fpsCount > 0 ? (this._fpsSum / this._fpsCount) : fps;
    if (fps < this.minFps && fps > 10) {
      this.minFps = fps;
    }

    // Capture WebGL metrics
    this.metrics.fps = Math.round(this.currentFps);
    this.metrics.avgFps = Math.round(this.avgFps);
    this.metrics.minFps = Math.round(this.minFps);
    this.metrics.frameTime = parseFloat(this.frameTime.toFixed(2));
    if (rendererInfo && rendererInfo.render) {
      this.metrics.drawCalls = rendererInfo.render.calls || 0;
      this.metrics.triangles = rendererInfo.render.triangles || 0;
    }

    // If manual override is active, skip auto-adjustment
    if (!this._autoEnabled || this._userPreference) return;

    // Decrement cooldown timer
    if (this._cooldownTimer > 0) {
      this._cooldownTimer -= delta;
      return;
    }

    const currentTierIdx = LEVEL_ORDER.indexOf(this.level);

    // 1. FAST DOWNGRADE: if average FPS is below MIN_FPS (50) for >= QUALITY_DOWN_DELAY (0.6s)
    if (this.avgFps < PERFORMANCE_CONFIG.QUALITY_DOWN_THRESHOLD) {
      this._lowFpsDuration += delta;
      this._highFpsDuration = 0;

      if (this._lowFpsDuration >= PERFORMANCE_CONFIG.QUALITY_DOWN_DELAY) {
        if (currentTierIdx > 0) {
          this.setLevel(LEVEL_ORDER[currentTierIdx - 1]);
        }
      }
      return;
    }

    // 2. SLOW UPGRADE: if average FPS remains stably above QUALITY_UP_THRESHOLD (62) for >= QUALITY_UP_DELAY (3.5s)
    if (this.avgFps > PERFORMANCE_CONFIG.QUALITY_UP_THRESHOLD) {
      this._highFpsDuration += delta;
      this._lowFpsDuration = 0;

      if (this._highFpsDuration >= PERFORMANCE_CONFIG.QUALITY_UP_DELAY) {
        if (currentTierIdx < LEVEL_ORDER.length - 1) {
          this.setLevel(LEVEL_ORDER[currentTierIdx + 1]);
        }
      }
      return;
    }

    // 3. STABLE ZONE (50 - 62 FPS): keep current settings, reset accumulation
    this._lowFpsDuration = 0;
    this._highFpsDuration = 0;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  dispose() {
    this.level = QUALITY_LEVELS.LOW;
    this.config = PERFORMANCE_CONFIG.levels[this.level];
    this._userPreference = null;
    this._fpsBuffer.fill(0);
    this._fpsIndex = 0;
    this._fpsCount = 0;
    this._fpsSum = 0;
    this._lowFpsDuration = 0;
    this._highFpsDuration = 0;
    this._cooldownTimer = 0;
  }
}

export const qualityManager = new QualityManager();
