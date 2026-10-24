import { SoftArcadeMusic } from './SoftArcadeMusic.js';
import { eventBus } from '../core/EventBus.js';

export const AUDIO_STORAGE_KEY = 'opt_flipper_audio_settings';

/**
 * SoundSystem
 * Single-instance audio manager managing SoftArcadeMusic and global music settings.
 * Ensures:
 * - Exactly one persistent SoftArcadeMusic instance
 * - Interaction-gated startup (start on first user gesture)
 * - Safe lifecycle integration (pause/resume ducking, gameover preservation, visibility fade/restore)
 * - No stacking or duplicate AudioContext creation
 * - localStorage persistence for music preferences
 * - Sound effects separation
 */
class SoundSystem {
  constructor() {
    this._music = null;
    this._initialized = false;
    this._musicEnabled = true;
    this._musicVolume = 0.55;
    this._savedVolumeBeforeDuck = 0.55;
    this._isDucked = false;
    this._isPageHidden = false;
    this._startPromise = null;
    this._unsubs = [];
    this._userStarted = false;
  }

  get music() {
    return this._music;
  }

  get isMusicEnabled() {
    return this._musicEnabled;
  }

  get musicVolume() {
    return this._musicVolume;
  }

  init() {
    if (this._initialized) return;
    this._loadSettings();

    // Create the single persistent SoftArcadeMusic instance
    this._music = new SoftArcadeMusic({
      volume: this._musicEnabled ? this._musicVolume : 0
    });

    this._setupLifecycleEvents();
    this._initialized = true;
  }

  _loadSettings() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.musicEnabled === 'boolean') {
            this._musicEnabled = parsed.musicEnabled;
          }
          if (typeof parsed.musicVolume === 'number' && !Number.isNaN(parsed.musicVolume)) {
            this._musicVolume = Math.max(0, Math.min(1, parsed.musicVolume));
          }
        }
      }
    } catch (e) {
      console.warn('Could not load audio settings from localStorage:', e);
    }
    this._savedVolumeBeforeDuck = this._musicVolume;
  }

  _saveSettings() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
          musicEnabled: this._musicEnabled,
          musicVolume: this._musicVolume
        }));
      }
    } catch (e) {
      console.warn('Could not save audio settings to localStorage:', e);
    }
  }

  _setupLifecycleEvents() {
    // Visibility handling
    if (typeof document !== 'undefined') {
      const onVisibilityChange = () => {
        if (document.hidden) {
          this._isPageHidden = true;
          if (this._music && this._music.playing) {
            this._music.setVolume(0, 0.05);
          }
        } else {
          this._isPageHidden = false;
          if (this._music && this._music.playing && this._musicEnabled) {
            const targetVol = this._isDucked ? (this._musicVolume * 0.35) : this._musicVolume;
            this._music.setVolume(targetVol, 0.08);
          }
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this._unsubs.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));
    }

    // Settings changed bus events
    const unsubSettings = eventBus.on('settings:changed', ({ key, value }) => {
      if (key === 'musicEnabled') {
        this.setMusicEnabled(Boolean(value));
      } else if (key === 'musicVolume') {
        this.setMusicVolume(Number(value));
      }
    });
    this._unsubs.push(unsubSettings);
  }

  /**
   * Request startup of background music from a genuine user interaction.
   * Guarded against concurrent calls, multiple startups, and stacking.
   */
  async startMusic() {
    this._userStarted = true;
    if (!this._musicEnabled) {
      return;
    }
    if (!this._music) {
      this.init();
    }
    if (this._music.playing) {
      if (this._music.ctx && this._music.ctx.state === 'suspended') {
        try {
          await this._music.ctx.resume();
        } catch (e) {
          console.warn('AudioContext resume failed:', e);
        }
      }
      return;
    }
    if (this._startPromise) {
      return this._startPromise;
    }

    this._startPromise = (async () => {
      try {
        await this._music.start();
        // Restore current volume setting smoothly
        const vol = this._isPageHidden ? 0 : (this._isDucked ? (this._musicVolume * 0.35) : this._musicVolume);
        this._music.setVolume(vol, 0.05);
      } catch (err) {
        console.warn('SoftArcadeMusic failed to start safely:', err);
      } finally {
        this._startPromise = null;
      }
    })();

    return this._startPromise;
  }

  setMusicEnabled(enabled) {
    this._musicEnabled = Boolean(enabled);
    this._saveSettings();

    if (!this._music) return;

    if (this._musicEnabled) {
      if (this._userStarted && !this._music.playing) {
        this.startMusic();
      } else if (this._music.playing) {
        const targetVol = this._isPageHidden ? 0 : (this._isDucked ? (this._musicVolume * 0.35) : this._musicVolume);
        this._music.setVolume(targetVol, 0.08);
      }
    } else {
      if (this._music.playing) {
        this._music.stop({ fadeSeconds: 0.3 }).catch((err) => {
          console.warn('Error stopping music:', err);
        });
      }
    }

    eventBus.emit('audio:settingsChanged', {
      musicEnabled: this._musicEnabled,
      musicVolume: this._musicVolume
    });
  }

  setMusicVolume(val) {
    const clamped = Math.max(0, Math.min(1, Number(val) || 0));
    this._musicVolume = clamped;
    this._saveSettings();

    if (this._music && this._music.playing && this._musicEnabled && !this._isPageHidden) {
      const targetVol = this._isDucked ? (clamped * 0.35) : clamped;
      this._music.setVolume(targetVol, 0.08);
    }

    eventBus.emit('audio:settingsChanged', {
      musicEnabled: this._musicEnabled,
      musicVolume: this._musicVolume
    });
  }

  /**
   * Duck music volume (e.g. during pause screen or briefings)
   */
  duckMusic(factor = 0.35) {
    this._isDucked = true;
    if (this._music && this._music.playing && this._musicEnabled && !this._isPageHidden) {
      this._music.setVolume(this._musicVolume * factor, 0.1);
    }
  }

  /**
   * Unduck music volume (e.g. upon resume)
   */
  unduckMusic() {
    this._isDucked = false;
    if (this._music && this._music.playing && this._musicEnabled && !this._isPageHidden) {
      this._music.setVolume(this._musicVolume, 0.1);
    }
  }

  dispose() {
    if (this._music) {
      this._music.stop({ fadeSeconds: 0.1 }).catch(() => {});
    }
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch (_) {}
    }
    this._unsubs = [];
    this._initialized = false;
  }
}

export const soundSystem = new SoundSystem();
