import { Pane } from 'tweakpane';
import { BOARD_GUIDANCE_CONFIG } from '../guidance/BoardGuidanceConfig.js';
import { boardGuidanceService } from '../guidance/BoardGuidanceService.js';
import { inputManager } from '../core/InputManager.js';

/**
 * ============================================================================
 * TILE MARKUP DEBUG PANEL (Key M)
 * ============================================================================
 *
 * Interactive Tweakpane interface to adjust and calibrate the tile guidance marker
 * (ItemBeam effect: height, core radius, glow radius, bloom/glow boost, base glow,
 * particle brightness, scatter, colors).
 *
 * Toggled by pressing key "M" / "m" on the keyboard.
 */
export class TileMarkupPanel {
  constructor() {
    this._pane = null;
    this._visible = false;
    this._keyHandler = this._handleKeyDown.bind(this);

    const m = BOARD_GUIDANCE_CONFIG.marker;
    this._params = {
      height: m.height || 0.16,
      coreRadius: m.coreRadius || 0.0035,
      glowRadius: m.glowRadius || 0.0125,
      topScale: m.topScale !== undefined ? m.topScale : 0.20,
      bloomBoost: m.bloomBoost !== undefined ? m.bloomBoost : 0.022,
      baseGlowOpacity: m.baseGlowOpacity !== undefined ? m.baseGlowOpacity : 0.022,
      particleBrightness: m.particleBrightness !== undefined ? m.particleBrightness : 0.25,
      particleCount: m.particleCount !== undefined ? m.particleCount : 30,
      particleRadius: m.particleRadius || 0.050,
      particleSize: m.particleSize !== undefined ? m.particleSize : 0.25,
      swirlParticleCount: m.swirlParticleCount !== undefined ? m.swirlParticleCount : 40,
      swirlRadius: m.swirlRadius || 0.016,
      swirlParticleSize: m.swirlParticleSize !== undefined ? m.swirlParticleSize : 0.022,
      swirlParticleOpacity: m.swirlParticleOpacity !== undefined ? m.swirlParticleOpacity : 0.85,
      color: '#' + (m.color || 0x00f0ff).toString(16).padStart(6, '0')
    };
  }

  init() {
    window.addEventListener('keydown', this._keyHandler);
  }

  _handleKeyDown(e) {
    if ((e.code === 'KeyM' || e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (inputManager && typeof inputManager.isEditableTarget === 'function') {
        if (inputManager.isEditableTarget(document.activeElement)) return;
      }
      this.toggle();
    }
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (!this._pane) {
      this._createPane();
    }
    this._pane.element.style.display = 'block';
    this._visible = true;

    // Force spawn guidance marker if not already present on board so player sees changes in real time
    if (boardGuidanceService) {
      if (!boardGuidanceService._activeMarker) {
        boardGuidanceService.forceSpawnMarker();
      }
    }
  }

  hide() {
    if (this._pane) {
      this._pane.element.style.display = 'none';
    }
    this._visible = false;
  }

  _syncConfig() {
    const m = BOARD_GUIDANCE_CONFIG.marker;
    m.height = this._params.height;
    m.coreRadius = this._params.coreRadius;
    m.glowRadius = this._params.glowRadius;
    m.topScale = this._params.topScale;
    m.bloomBoost = this._params.bloomBoost;
    m.baseGlowOpacity = this._params.baseGlowOpacity;
    m.particleBrightness = this._params.particleBrightness;
    m.particleCount = Math.round(this._params.particleCount);
    m.particleRadius = this._params.particleRadius;
    m.particleSize = this._params.particleSize;
    m.swirlParticleCount = Math.round(this._params.swirlParticleCount);
    m.swirlRadius = this._params.swirlRadius;
    m.swirlParticleSize = this._params.swirlParticleSize;
    m.swirlParticleOpacity = this._params.swirlParticleOpacity;
    m.color = parseInt(this._params.color.replace('#', ''), 16);

    if (boardGuidanceService && typeof boardGuidanceService.refreshActiveMarker === 'function') {
      boardGuidanceService.refreshActiveMarker();
    }
  }

  _createPane() {
    this._pane = new Pane({
      title: 'Tile Markup Settings (Key: M)'
    });

    const container = this._pane.element;
    container.style.position = 'fixed';
    container.style.top = '72px';
    container.style.left = '20px';
    container.style.zIndex = '9999';
    container.style.width = '320px';
    container.style.maxWidth = '90vw';

    // Close button
    const closeBtn = this._pane.addButton({ title: '✕ Close (or press M)' });
    closeBtn.on('click', () => this.hide());

    // Spawn / Re-target button
    const spawnBtn = this._pane.addButton({ title: '🎯 Spawn / Respawn Marker' });
    spawnBtn.on('click', () => {
      if (boardGuidanceService) {
        boardGuidanceService.forceSpawnMarker();
      }
    });

    // Bloom / Glow folder (DIRECT CONTROL OF GLOW / BLOOM INTENSITY)
    const glowFolder = this._pane.addFolder({
      title: 'Glow & Bloom Intensity',
      expanded: true
    });

    glowFolder.addBinding(this._params, 'bloomBoost', {
      label: 'Beam Bloom Boost',
      min: 0.0,
      max: 3.0,
      step: 0.05
    }).on('change', () => this._syncConfig());

    glowFolder.addBinding(this._params, 'baseGlowOpacity', {
      label: 'Base Disc & Ring Glow',
      min: 0.0,
      max: 2.0,
      step: 0.05
    }).on('change', () => this._syncConfig());

    glowFolder.addBinding(this._params, 'particleBrightness', {
      label: 'Particle Glow',
      min: 0.0,
      max: 1.0,
      step: 0.005
    }).on('change', () => this._syncConfig());

    // Main dimensions folder
    const dimFolder = this._pane.addFolder({
      title: 'Beam Dimensions',
      expanded: true
    });

    dimFolder.addBinding(this._params, 'height', {
      label: 'Height',
      min: 0.04,
      max: 0.50,
      step: 0.01
    }).on('change', () => this._syncConfig());

    dimFolder.addBinding(this._params, 'coreRadius', {
      label: 'Core Radius',
      min: 0.001,
      max: 0.02,
      step: 0.0005
    }).on('change', () => this._syncConfig());

    dimFolder.addBinding(this._params, 'glowRadius', {
      label: 'Glow Radius',
      min: 0.003,
      max: 0.05,
      step: 0.001
    }).on('change', () => this._syncConfig());

    dimFolder.addBinding(this._params, 'topScale', {
      label: 'Top Scale',
      min: 0.05,
      max: 1.0,
      step: 0.05
    }).on('change', () => this._syncConfig());

    // Particles folder
    const partFolder = this._pane.addFolder({
      title: 'Particle Atmosphere',
      expanded: false
    });

    partFolder.addBinding(this._params, 'particleCount', {
      label: 'Count',
      min: 0,
      max: 60,
      step: 2
    }).on('change', () => this._syncConfig());

    partFolder.addBinding(this._params, 'particleRadius', {
      label: 'Scatter Radius',
      min: 0.005,
      max: 0.05,
      step: 0.001
    }).on('change', () => this._syncConfig());

    partFolder.addBinding(this._params, 'particleSize', {
      label: 'Particle Size',
      min: 0.05,
      max: 1.5,
      step: 0.05
    }).on('change', () => this._syncConfig());

    // Swirling Particles (No Glow)
    const swirlFolder = this._pane.addFolder({
      title: 'Swirling Particles (No Glow)',
      expanded: true
    });

    swirlFolder.addBinding(this._params, 'swirlParticleCount', {
      label: 'Swirl Count',
      min: 0,
      max: 100,
      step: 5
    }).on('change', () => this._syncConfig());

    swirlFolder.addBinding(this._params, 'swirlRadius', {
      label: 'Orbit Radius',
      min: 0.004,
      max: 0.06,
      step: 0.002
    }).on('change', () => this._syncConfig());

    swirlFolder.addBinding(this._params, 'swirlParticleSize', {
      label: 'Swirl Size',
      min: 0.005,
      max: 0.50,
      step: 0.005
    }).on('change', () => this._syncConfig());

    swirlFolder.addBinding(this._params, 'swirlParticleOpacity', {
      label: 'Swirl Opacity',
      min: 0.0,
      max: 1.0,
      step: 0.05
    }).on('change', () => this._syncConfig());

    // Color & Style folder
    const styleFolder = this._pane.addFolder({
      title: 'Color & Tone',
      expanded: false
    });

    styleFolder.addBinding(this._params, 'color', {
      label: 'Beam Color'
    }).on('change', () => this._syncConfig());

    // Reset Defaults button
    const resetBtn = this._pane.addButton({ title: '↺ Reset Defaults' });
    resetBtn.on('click', () => {
      this._params.height = 0.50;
      this._params.coreRadius = 0.001;
      this._params.glowRadius = 0.013;
      this._params.topScale = 0.05;
      this._params.bloomBoost = 0.022;
      this._params.baseGlowOpacity = 0.022;
      this._params.particleBrightness = 0.25;
      this._params.particleCount = 30;
      this._params.particleRadius = 0.050;
      this._params.particleSize = 0.25;
      this._params.swirlParticleCount = 40;
      this._params.swirlRadius = 0.016;
      this._params.swirlParticleSize = 0.022;
      this._params.swirlParticleOpacity = 0.85;
      this._params.color = '#f55e00';
      this._pane.refresh();
      this._syncConfig();
    });
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    if (this._pane) {
      this._pane.dispose();
      this._pane = null;
    }
  }
}
