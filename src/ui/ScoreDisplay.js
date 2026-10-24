export class ScoreDisplay {
  constructor(options = {}) {
    this._container = null;
    this._digits = [];
    this._currentValue = -1;
    this._displayedValue = 0;
    this._animating = false;
    this._digitCount = options.digitCount !== undefined ? options.digitCount : 6;
    this._digitHeight = options.digitHeight !== undefined ? options.digitHeight : 34;
    this._digitWidth = options.digitWidth !== undefined ? options.digitWidth : 18;
    this._fontSize = options.fontSize || (this._digitHeight >= 30 ? '22px' : '13px');
    this._color = options.color || '#ffd700';
    this._customStyling = options.customStyling !== undefined ? options.customStyling : true;
  }

  init(container) {
    if (!container) return;
    this._container = container;
    this._container.style.display = 'flex';
    this._container.style.alignItems = 'center';
    this._container.style.gap = this._digitHeight >= 30 ? '3px' : '1px';
    this._container.style.overflow = 'hidden';
    this._container.style.boxSizing = 'border-box';
    this._container.style.height = `${this._digitHeight}px`;

    if (this._customStyling) {
      this._container.style.backgroundColor = 'rgba(12, 14, 28, 0.85)';
      this._container.style.backdropFilter = 'blur(8px)';
      this._container.style.padding = '2px 10px';
      this._container.style.borderRadius = '10px';
      this._container.style.border = '1px solid rgba(255, 215, 60, 0.4)';
      this._container.style.boxShadow = '0 4px 14px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.2)';
      this._container.style.height = `${this._digitHeight + 4}px`;
    }
    
    this._createDigits();
    this.setValue(0);
  }

  _createDigits() {
    this._container.innerHTML = '';
    this._digits = [];
    
    for (let i = 0; i < this._digitCount; i++) {
      const digitWrapper = document.createElement('div');
      digitWrapper.className = 'score-digit';
      digitWrapper.style.width = `${this._digitWidth}px`;
      digitWrapper.style.height = `${this._digitHeight}px`;
      digitWrapper.style.position = 'relative';
      digitWrapper.style.overflow = 'hidden';
      digitWrapper.style.flexShrink = '0';
      
      const digitInner = document.createElement('div');
      digitInner.className = 'score-digit-inner';
      digitInner.style.position = 'absolute';
      digitInner.style.top = '0';
      digitInner.style.left = '0';
      digitInner.style.width = '100%';
      digitInner.style.transition = 'transform 0.4s cubic-bezier(0.2, 1, 0.3, 1)';
      
      // Stack 0-9 cleanly centered vertically and upright
      for (let j = 0; j <= 9; j++) {
        const num = document.createElement('div');
        num.innerText = j;
        num.style.height = `${this._digitHeight}px`;
        num.style.lineHeight = `${this._digitHeight}px`;
        num.style.display = 'flex';
        num.style.alignItems = 'center';
        num.style.justifyContent = 'center';
        num.style.color = this._color;
        num.style.fontSize = this._fontSize;
        num.style.fontWeight = '800';
        num.style.fontFamily = 'monospace, system-ui, sans-serif';
        num.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
        digitInner.appendChild(num);
      }
      
      digitWrapper.appendChild(digitInner);
      this._container.appendChild(digitWrapper);
      this._digits.push(digitInner);
    }
  }

  setValue(newValue) {
    const val = Math.max(0, Math.floor(Number(newValue) || 0));
    if (val === this._currentValue && this._digits.length > 0) return;
    this._currentValue = val;
    
    const padded = String(val).padStart(this._digitCount, '0').slice(-this._digitCount);
    
    for (let i = 0; i < this._digitCount; i++) {
      const targetDigit = parseInt(padded[i], 10) || 0;
      this._animateDigit(this._digits[i], targetDigit);
    }
  }

  _animateDigit(digitEl, toDigit) {
    if (!digitEl) return;
    const offset = -toDigit * this._digitHeight;
    digitEl.style.transform = `translateY(${offset}px)`;
  }

  update(delta) {
    // Managed by CSS transitions
  }

  getValue() {
    return this._currentValue;
  }

  dispose() {
    if (this._container) {
      this._container.innerHTML = '';
    }
    this._digits = [];
  }
}
