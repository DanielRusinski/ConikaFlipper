import { ScoreDisplay } from './ScoreDisplay.js';
import { replaceEmojisWithAtlasIcons } from './IconService.js';

/**
 * ArcadeSlotCounter
 * 
 * Reusable 3D/HUD arcade slot-rolling counter badge.
 * Provides entry/exit pop animations, slot rotating numbers matching ScoreDisplay,
 * and glowing arcade styling. Supports integer values, decimal time values,
 * warning/success states, reduced motion, custom prefix/suffix, and particle hooks.
 */
export class ArcadeSlotCounter {
  constructor(options = {}) {
    this.type = options.type || 'countdown'; // 'countdown' | 'multicolor' | 'custom'
    this.initialValue = options.initialValue !== undefined ? options.initialValue : 4;
    this.prefix = options.prefix !== undefined ? options.prefix : (this.type === 'countdown' ? '⏱️' : '🎨');
    this.suffix = options.suffix || '';
    this.color = options.color || (this.type === 'countdown' ? '#ffd700' : '#fc05b8');
    this.badgeBorder = options.badgeBorder || (this.type === 'countdown' ? 'rgba(255, 215, 0, 0.7)' : 'rgba(252, 5, 184, 0.8)');
    this.badgeBg = options.badgeBg || (this.type === 'countdown' ? 'linear-gradient(135deg, rgba(20, 15, 5, 0.92), rgba(40, 30, 10, 0.95))' : 'linear-gradient(135deg, rgba(25, 5, 20, 0.92), rgba(35, 10, 30, 0.95))');
    this.glowColor = options.glowColor || (this.type === 'countdown' ? 'rgba(255, 215, 0, 0.5)' : 'rgba(252, 5, 184, 0.6)');
    this.digitCount = options.digitCount !== undefined ? options.digitCount : 1;
    this.reducedMotion = options.reducedMotion !== undefined ? options.reducedMotion : false;
    this.isDecimal = options.isDecimal || false;
    this.decimalPlaces = options.decimalPlaces || 1;
    this.onParticle = options.onParticle || null;
    
    this.domElement = document.createElement('div');
    this.domElement.className = `arcade-tile-counter arcade-counter-${this.type}`;
    
    this._prefixEl = document.createElement('span');
    this._prefixEl.className = 'arcade-counter-prefix';
    this._prefixEl.innerHTML = replaceEmojisWithAtlasIcons(this.prefix);

    this._slotContainer = document.createElement('div');
    this._slotContainer.className = 'arcade-counter-slot';

    this._suffixEl = document.createElement('span');
    this._suffixEl.className = 'arcade-counter-suffix';
    this._suffixEl.textContent = this.suffix;

    this.domElement.appendChild(this._prefixEl);
    this.domElement.appendChild(this._slotContainer);
    if (this.suffix) {
      this.domElement.appendChild(this._suffixEl);
    }

    this._scoreDisplay = new ScoreDisplay({
      digitCount: this.digitCount,
      digitHeight: 20,
      digitWidth: 14,
      fontSize: '15px',
      color: this.color,
      customStyling: false
    });
    this._scoreDisplay.init(this._slotContainer);
    this.setValue(this.initialValue);

    this._applyBaseStyles();
    this.playEntryAnimation();
  }

  _applyBaseStyles() {
    const el = this.domElement;
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.gap = '4px';
    el.style.padding = '3px 8px';
    el.style.borderRadius = '12px';
    el.style.background = this.badgeBg;
    el.style.border = `1.5px solid ${this.badgeBorder}`;
    el.style.boxShadow = `0 4px 14px rgba(0,0,0,0.6), 0 0 12px ${this.glowColor}, inset 0 1px 2px rgba(255,255,255,0.3)`;
    el.style.transformOrigin = 'center center';
    el.style.transition = this.reducedMotion
      ? 'opacity 0.15s ease'
      : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease, filter 0.2s ease';
    el.style.pointerEvents = 'none';
    el.style.userSelect = 'none';
    el.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))';

    this._prefixEl.style.fontSize = '13px';
    this._prefixEl.style.lineHeight = '1';
    this._prefixEl.style.display = 'inline-block';
    this._prefixEl.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))';

    this._suffixEl.style.fontSize = '12px';
    this._suffixEl.style.lineHeight = '1';
    this._suffixEl.style.display = this.suffix ? 'inline-block' : 'none';
    this._suffixEl.style.fontWeight = '700';
    this._suffixEl.style.color = this.color;
  }

  setPrefix(prefix) {
    this.prefix = prefix;
    this._prefixEl.innerHTML = replaceEmojisWithAtlasIcons(prefix);
  }

  setSuffix(suffix) {
    this.suffix = suffix;
    this._suffixEl.textContent = suffix;
    this._suffixEl.style.display = suffix ? 'inline-block' : 'none';
  }

  setValue(val) {
    let numeric = Number(val);
    if (isNaN(numeric)) numeric = 0;

    if (this.isDecimal) {
      // Scale by decimal factor to display in slot digits
      const multiplier = Math.pow(10, this.decimalPlaces);
      this._scoreDisplay.setValue(Math.round(numeric * multiplier));
    } else {
      this._scoreDisplay.setValue(Math.max(0, Math.floor(numeric)));
    }

    if (!this.reducedMotion) {
      this.popPulse();
    }
    if (typeof this.onParticle === 'function') {
      this.onParticle(numeric, this);
    }
  }

  getValue() {
    const raw = this._scoreDisplay.getValue();
    if (this.isDecimal) {
      return raw / Math.pow(10, this.decimalPlaces);
    }
    return raw;
  }

  setColor(hexColor) {
    this.color = hexColor;
    const digits = this._slotContainer.querySelectorAll('.score-digit-inner div');
    digits.forEach(d => {
      d.style.color = hexColor;
    });
    this._suffixEl.style.color = hexColor;
    this.domElement.style.border = `1.5px solid ${hexColor}`;
    this.domElement.style.boxShadow = `0 4px 14px rgba(0,0,0,0.6), 0 0 14px ${hexColor}, inset 0 1px 2px rgba(255,255,255,0.4)`;
  }

  setWarningState() {
    this.setColor('#ff3366');
    this.domElement.style.background = 'linear-gradient(135deg, rgba(40, 5, 10, 0.94), rgba(60, 10, 20, 0.96))';
    this.popPulse(1.35);
  }

  setSuccessState() {
    this.setColor('#7bf004');
    this.domElement.style.background = 'linear-gradient(135deg, rgba(10, 35, 5, 0.94), rgba(20, 50, 10, 0.96))';
    this.popPulse(1.4);
  }

  playEntryAnimation() {
    if (this.reducedMotion) {
      this.domElement.style.opacity = '1';
      return;
    }
    this.domElement.style.opacity = '0';
    this.domElement.style.transform = 'scale(0.3) translateY(10px)';
    
    // Trigger smooth bouncy arcade entry with glow pulse
    requestAnimationFrame(() => {
      this.domElement.style.opacity = '1';
      this.domElement.style.transform = 'scale(1.0) translateY(0px)';
    });
  }

  popPulse(scale = 1.28) {
    if (this.reducedMotion) return;
    this.domElement.style.transform = `scale(${scale})`;
    setTimeout(() => {
      if (this.domElement) {
        this.domElement.style.transform = 'scale(1.0)';
      }
    }, 160);
  }

  playExitAnimation(onComplete) {
    if (this.reducedMotion) {
      this.domElement.style.opacity = '0';
      setTimeout(() => {
        if (typeof onComplete === 'function') onComplete();
      }, 50);
      return;
    }
    this.domElement.style.transform = 'scale(1.45) translateY(-8px)';
    this.domElement.style.filter = 'brightness(2.0) drop-shadow(0 0 18px rgba(255,255,255,0.95))';
    this.domElement.style.opacity = '0';
    setTimeout(() => {
      if (typeof onComplete === 'function') onComplete();
    }, 260);
  }

  dispose() {
    if (this._scoreDisplay) {
      this._scoreDisplay.dispose();
      this._scoreDisplay = null;
    }
    if (this.domElement && this.domElement.parentNode) {
      this.domElement.parentNode.removeChild(this.domElement);
    }
  }
}
