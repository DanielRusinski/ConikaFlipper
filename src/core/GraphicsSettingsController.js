import { eventBus } from './EventBus.js';
import { GRAPHICS_CONFIG, PERFORMANCE_CONFIG } from '../config/graphicsConfig.js';

export const GRAPHICS_PRESETS = {
  MOBILE: 'mobile',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const GRAPHICS_STORAGE_KEY = 'opt_flipper_graphics_settings';

/**
 * GraphicsSettingsController
 *
 * Centralized, reactive graphics controller for OPT Flipper.
 * Exposes:
 * {
 *   quality: 'mobile' | 'low' | 'medium' | 'high',
 *   postProcessing: boolean,
 *   bloom: boolean,
 *   grain: boolean,
 *   otherEffects: boolean
 * }
 *
 * Preserves user preferences independently while enforcing logical pipeline gating:
 * - When postProcessing is OFF, bloom and grain passes become inactive in the pipeline,
 *   but the user's stored preferences remain preserved.
 * - Changing quality updates internal pixel ratio, shadows, and LOD scaling immediately.
 * - Live settings persist to localStorage.
 */
class GraphicsSettingsController {
  constructor() {
    this._settings = {
      quality: 'low',
      postProcessing: true,
      bloom: true,
      grain: true,
      otherEffects: true
    };

    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._loadSettings();
    this._initialized = true;
  }

  get settings() {
    return { ...this._settings };
  }

  get quality() {
    return this._settings.quality;
  }

  get postProcessing() {
    return this._settings.postProcessing;
  }

  get bloom() {
    return this._settings.bloom;
  }

  get grain() {
    return this._settings.grain;
  }

  get otherEffects() {
    return this._settings.otherEffects;
  }

  /**
   * Conceptually exposes the full configuration structure requested
   */
  get graphicsSettings() {
    return {
      quality: this._settings.quality,
      postProcessing: this._settings.postProcessing,
      bloom: this._settings.bloom,
      grain: this._settings.grain,
      otherEffects: this._settings.otherEffects
    };
  }

  /**
   * Pipeline active state queries (accounting for gating)
   */
  isPostProcessingActive() {
    return Boolean(this._settings.postProcessing);
  }

  isBloomActive() {
    return Boolean(this._settings.postProcessing && this._settings.bloom);
  }

  isGrainActive() {
    return Boolean(this._settings.postProcessing && this._settings.grain);
  }

  isOtherEffectsActive() {
    return Boolean(this._settings.otherEffects);
  }

  /**
   * Applies presets:
   * MOBILE: Quality: MOBILE (2x lower than lowest), PostProcessing: ON, Bloom: ON, Grain: ON, OtherEffects: ON
   * LOW:    Quality: LOW,    PostProcessing: OFF, Bloom: OFF, Grain: OFF, OtherEffects: OFF
   * MEDIUM: Quality: MEDIUM, PostProcessing: ON,  Bloom: ON,  Grain: OFF, OtherEffects: ON
   * HIGH:   Quality: HIGH,   PostProcessing: ON,  Bloom: ON,  Grain: ON,  OtherEffects: ON
   */
  applyPreset(presetKey) {
    const key = (presetKey || '').toLowerCase();
    if (key === 'mobile') {
      this._settings.quality = 'mobile';
      this._settings.postProcessing = true;
      this._settings.bloom = true;
      this._settings.grain = true;
      this._settings.otherEffects = true;
    } else if (key === 'low') {
      this._settings.quality = 'low';
      this._settings.postProcessing = true;
      this._settings.bloom = true;
      this._settings.grain = true;
      this._settings.otherEffects = true;
    } else if (key === 'medium') {
      this._settings.quality = 'medium';
      this._settings.postProcessing = true;
      this._settings.bloom = true;
      this._settings.grain = false;
      this._settings.otherEffects = true;
    } else if (key === 'high') {
      this._settings.quality = 'high';
      this._settings.postProcessing = true;
      this._settings.bloom = true;
      this._settings.grain = true;
      this._settings.otherEffects = true;
    } else {
      console.warn(`[GraphicsSettings] Unknown preset "${presetKey}". Expected 'mobile', 'low', 'medium', or 'high'.`);
      return;
    }

    this._saveSettings();
    this._broadcastChange();
  }

  /**
   * Updates an individual setting independently
   */
  setSetting(key, value) {
    if (!(key in this._settings)) {
      console.warn(`[GraphicsSettings] Unknown setting key "${key}".`);
      return;
    }

    if (key === 'quality') {
      const norm = String(value).toLowerCase();
      if (norm === 'mobile' || norm === 'low' || norm === 'medium' || norm === 'high') {
        this._settings.quality = norm;
      } else {
        console.warn(`[GraphicsSettings] Invalid quality "${value}". Expected mobile, low, medium, or high.`);
        return;
      }
    } else {
      this._settings[key] = Boolean(value);
    }

    this._saveSettings();
    this._broadcastChange();
  }

  setQuality(tier) {
    this.setSetting('quality', tier);
  }

  setPostProcessing(enabled) {
    this.setSetting('postProcessing', enabled);
  }

  setBloom(enabled) {
    this.setSetting('bloom', enabled);
  }

  setGrain(enabled) {
    this.setSetting('grain', enabled);
  }

  setOtherEffects(enabled) {
    this.setSetting('otherEffects', enabled);
  }

  _broadcastChange() {
    eventBus.emit('graphics:settingsChanged', {
      settings: this.graphicsSettings,
      effective: {
        postProcessing: this.isPostProcessingActive(),
        bloom: this.isBloomActive(),
        grain: this.isGrainActive(),
        otherEffects: this.isOtherEffectsActive()
      }
    });
  }

  _loadSettings() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(GRAPHICS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (['mobile', 'low', 'medium', 'high'].includes(parsed.quality)) {
              this._settings.quality = parsed.quality;
            }
            if (typeof parsed.postProcessing === 'boolean') {
              this._settings.postProcessing = parsed.postProcessing;
            }
            if (typeof parsed.bloom === 'boolean') {
              this._settings.bloom = parsed.bloom;
            }
            if (typeof parsed.grain === 'boolean') {
              this._settings.grain = parsed.grain;
            }
            if (typeof parsed.otherEffects === 'boolean') {
              this._settings.otherEffects = parsed.otherEffects;
            }
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[GraphicsSettings] Could not load saved settings from localStorage:', e);
    }

    // Default starting profile: LOW with all post-processing and effects enabled
    this._settings = {
      quality: 'low',
      postProcessing: true,
      bloom: true,
      grain: true,
      otherEffects: true
    };
  }

  _saveSettings() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(this._settings));
      }
    } catch (e) {
      console.warn('[GraphicsSettings] Could not save settings to localStorage:', e);
    }
  }

  resetToDefaults() {
    this._settings = {
      quality: 'low',
      postProcessing: true,
      bloom: true,
      grain: true,
      otherEffects: true
    };
    this._saveSettings();
    this._broadcastChange();
  }
}

export const graphicsSettingsController = new GraphicsSettingsController();
