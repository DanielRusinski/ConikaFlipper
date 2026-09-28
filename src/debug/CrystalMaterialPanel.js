import { Pane } from 'tweakpane';
import { inputManager } from '../core/InputManager.js';
import {
  updateCrystalUniforms,
  setCrystalTimeMultiplier,
  getCrystalTimeMultiplier,
  CRYSTAL_GEL_PRESETS
} from '../materials/crystalGelMaterial.js';

/**
 * ============================================================================
 * CRYSTAL MATERIAL DEBUG PANEL (Key 4)
 * ============================================================================
 * 
 * Interactive Tweakpane interface to fine-tune the Crystal Gel Shader Material:
 * - Glitter / sparkle size and density (drobiny wewnątrz kryształu)
 * - Gradient vertical stretch (rozciągnięcie gradientu koloru)
 * - Refraction vector displacement, Fresnel edge thickness, EXR reflections
 * - Fake AO shading intensity
 * - Animation speed multiplier
 * - Color inspection / custom palettes per crystal type
 * 
 * Toggled by pressing key "4" (Digit4 / Numpad4) on keyboard.
 */
export class CrystalMaterialPanel {
  constructor() {
    this._pane = null;
    this._visible = false;
    this._keyHandler = this._handleKeyDown.bind(this);

    // Initial parameters matching refined presets
    this._params = {
      targetCrystal: 'all',
      glitterSize: 0.08,
      glitterDensity: 80.0,
      gradientStretch: 8.0,
      refractionRatio: 1.6,
      glassThickness: 0.6,
      envReflection: 0.16,
      aoIntensity: 0.50,
      solidOpacity: 1.0,
      animSpeed: getCrystalTimeMultiplier() || 1.19,

      // Color inspector values (populated from selected crystal preset)
      colorTop: '#ffffff',
      colorMid: '#ff2ebd',
      colorBot: '#9900ee',
      aoColor: '#9900ff'
    };
  }

  init() {
    window.addEventListener('keydown', this._keyHandler);
  }

  _handleKeyDown(e) {
    if ((e.code === 'Digit4' || e.code === 'Numpad4' || e.key === '4') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (inputManager.isEditableTarget(document.activeElement)) return;
      this.toggle();
    }
  }

  _createPane() {
    this._pane = new Pane({
      title: 'Kryształy - Shader Material (Klawisz 4)'
    });

    // Close button
    const closeBtn = this._pane.addButton({ title: '✕ Zamknij Panel (Klawisz 4)' });
    closeBtn.on('click', () => this.hide());

    // Target Crystal Selector
    this._pane.addBinding(this._params, 'targetCrystal', {
      label: 'Dotyczy typu',
      options: {
        'Wszystkie kryształy (All)': 'all',
        'Punkty (+250💎)': 'points_crystal',
        'Życie (+1❤️)': 'emerald_crystal',
        'Karty (🃏)': 'modifier'
      }
    }).on('change', (ev) => {
      this._onTargetChanged(ev.value);
    });

    // Main Parameters Folder
    const mainFolder = this._pane.addFolder({
      title: 'Drobinki i Gradient (Sparkles & Gel)',
      expanded: true
    });

    mainFolder.addBinding(this._params, 'glitterSize', {
      label: 'Wielkość drobin (Size)',
      min: 0.005,
      max: 0.35,
      step: 0.005
    }).on('change', (ev) => {
      updateCrystalUniforms({ uGlitterSize: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'glitterDensity', {
      label: 'Gęstość drobin (Density)',
      min: 10.0,
      max: 250.0,
      step: 1.0
    }).on('change', (ev) => {
      updateCrystalUniforms({ uGlitterDensity: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'gradientStretch', {
      label: 'Rozciągnięcie gradientu',
      min: 0.5,
      max: 50.0,
      step: 0.5
    }).on('change', (ev) => {
      updateCrystalUniforms({ uGradientStretch: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'refractionRatio', {
      label: 'Załamanie (Refraction)',
      min: 0.0,
      max: 4.0,
      step: 0.05
    }).on('change', (ev) => {
      updateCrystalUniforms({ uRefractionRatio: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'glassThickness', {
      label: 'Grubość szkła / Fresnel',
      min: 0.1,
      max: 3.0,
      step: 0.05
    }).on('change', (ev) => {
      updateCrystalUniforms({ uGlassThickness: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'envReflection', {
      label: 'Odbicia .EXR (Env)',
      min: 0.0,
      max: 1.0,
      step: 0.02
    }).on('change', (ev) => {
      updateCrystalUniforms({ uEnvReflection: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'aoIntensity', {
      label: 'Cień podstawy (Fake AO)',
      min: 0.0,
      max: 1.0,
      step: 0.02
    }).on('change', (ev) => {
      updateCrystalUniforms({ uAoIntensity: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'solidOpacity', {
      label: 'Przezroczystość (Opacity)',
      min: 0.1,
      max: 1.0,
      step: 0.05
    }).on('change', (ev) => {
      updateCrystalUniforms({ uOpacity: ev.value }, this._params.targetCrystal);
    });

    mainFolder.addBinding(this._params, 'animSpeed', {
      label: 'Prędkość animacji',
      min: 0.0,
      max: 4.0,
      step: 0.05
    }).on('change', (ev) => {
      setCrystalTimeMultiplier(ev.value);
    });

    // Quick Presets Folder
    const presetFolder = this._pane.addFolder({
      title: 'Szybkie Szablony (Presets)',
      expanded: false
    });

    const btnFine = presetFolder.addButton({ title: '✨ Drobne drobinki (Subtle Fine)' });
    btnFine.on('click', () => {
      this._applyPresetParams({
        glitterSize: 0.035,
        glitterDensity: 120.0,
        gradientStretch: 6.0
      });
    });

    const btnBalanced = presetFolder.addButton({ title: '💎 Zbalansowany (Balanced Standard)' });
    btnBalanced.on('click', () => {
      this._applyPresetParams({
        glitterSize: 0.08,
        glitterDensity: 80.0,
        gradientStretch: 8.0
      });
    });

    const btnRich = presetFolder.addButton({ title: '🔮 Wyrazisty brokat (Rich Sparkle)' });
    btnRich.on('click', () => {
      this._applyPresetParams({
        glitterSize: 0.14,
        glitterDensity: 60.0,
        gradientStretch: 15.0
      });
    });

    const btnReset = presetFolder.addButton({ title: '↺ Reset do domyślnych (Defaults)' });
    btnReset.on('click', () => {
      this._applyPresetParams({
        glitterSize: 0.08,
        glitterDensity: 80.0,
        gradientStretch: 8.0,
        refractionRatio: 1.6,
        glassThickness: 0.6,
        envReflection: 0.16,
        aoIntensity: 0.50,
        solidOpacity: 1.0,
        animSpeed: 1.19
      });
    });

    // Color Inspector Folder (Optional / Advanced)
    const colorFolder = this._pane.addFolder({
      title: 'Kolory Gradientu (Opcjonalne)',
      expanded: false
    });

    colorFolder.addBinding(this._params, 'colorTop', { label: 'Kolor Góra (Top)' }).on('change', (ev) => {
      updateCrystalUniforms({ uColorTop: ev.value }, this._params.targetCrystal);
    });

    colorFolder.addBinding(this._params, 'colorMid', { label: 'Kolor Środek (Mid)' }).on('change', (ev) => {
      updateCrystalUniforms({ uColorMid: ev.value }, this._params.targetCrystal);
    });

    colorFolder.addBinding(this._params, 'colorBot', { label: 'Kolor Spód (Bot)' }).on('change', (ev) => {
      updateCrystalUniforms({ uColorBot: ev.value }, this._params.targetCrystal);
    });

    colorFolder.addBinding(this._params, 'aoColor', { label: 'Kolor Cienia AO' }).on('change', (ev) => {
      updateCrystalUniforms({ uAoColor: ev.value }, this._params.targetCrystal);
    });

    // Position panel on left side to not overlap with SettingsPanel (Digit 1) on right side
    this._pane.element.style.position = 'fixed';
    this._pane.element.style.left = '16px';
    this._pane.element.style.top = '16px';
    this._pane.element.style.right = 'auto';
    this._pane.element.style.zIndex = '10005';
    this._pane.element.style.display = this._visible ? '' : 'none';
  }

  _onTargetChanged(targetKey) {
    const key = (targetKey === 'all') ? 'modifier' : targetKey;
    const preset = CRYSTAL_GEL_PRESETS[key] || CRYSTAL_GEL_PRESETS.modifier;
    if (preset) {
      if (preset.uColorTop) this._params.colorTop = preset.uColorTop;
      if (preset.uColorMid) this._params.colorMid = preset.uColorMid;
      if (preset.uColorBot) this._params.colorBot = preset.uColorBot;
      if (preset.uAoColor) this._params.aoColor = preset.uAoColor;
      if (this._pane) this._pane.refresh();
    }
  }

  _applyPresetParams(newParams) {
    Object.assign(this._params, newParams);
    if (newParams.animSpeed !== undefined) {
      setCrystalTimeMultiplier(newParams.animSpeed);
    }
    const uniformMap = {};
    if (newParams.glitterSize !== undefined) uniformMap.uGlitterSize = newParams.glitterSize;
    if (newParams.glitterDensity !== undefined) uniformMap.uGlitterDensity = newParams.glitterDensity;
    if (newParams.gradientStretch !== undefined) uniformMap.uGradientStretch = newParams.gradientStretch;
    if (newParams.refractionRatio !== undefined) uniformMap.uRefractionRatio = newParams.refractionRatio;
    if (newParams.glassThickness !== undefined) uniformMap.uGlassThickness = newParams.glassThickness;
    if (newParams.envReflection !== undefined) uniformMap.uEnvReflection = newParams.envReflection;
    if (newParams.aoIntensity !== undefined) uniformMap.uAoIntensity = newParams.aoIntensity;
    if (newParams.solidOpacity !== undefined) uniformMap.uOpacity = newParams.solidOpacity;

    updateCrystalUniforms(uniformMap, this._params.targetCrystal);

    if (this._pane) {
      this._pane.refresh();
    }
  }

  show() {
    if (!this._pane) this._createPane();
    this._visible = true;
    if (this._pane && this._pane.element) {
      this._pane.element.style.display = '';
      this._pane.refresh();
    }
  }

  hide() {
    this._visible = false;
    if (this._pane && this._pane.element) {
      this._pane.element.style.display = 'none';
    }
  }

  toggle() {
    if (this._visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._keyHandler);
    if (this._pane) {
      this._pane.dispose();
      this._pane = null;
    }
  }
}
