import { getStageConfig } from '../config/stageConfig.js';
import anime from 'animejs';

export class StageBriefing {
  constructor() {
    this._container = null;
    this._el = null;
    this._card = null;
    this._visible = false;
  }

  init(container) {
    this._container = container;

    this._el = document.createElement('div');
    this._el.id = 'stage-briefing-overlay';
    this._el.style.position = 'fixed';
    this._el.style.inset = '0';
    this._el.style.display = 'none';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';
    this._el.style.pointerEvents = 'none';
    this._el.style.zIndex = '95';

    this._card = document.createElement('div');
    this._card.id = 'stage-briefing-card';
    this._card.style.background = 'linear-gradient(180deg, rgba(12, 20, 42, 0.96), rgba(6, 10, 24, 0.98))';
    this._card.style.border = '1.5px solid rgba(0, 240, 255, 0.65)';
    this._card.style.borderRadius = '20px';
    this._card.style.padding = '18px 26px';
    this._card.style.color = '#fff';
    this._card.style.maxWidth = '440px';
    this._card.style.width = '88%';
    this._card.style.boxShadow = '0 0 35px rgba(0, 240, 255, 0.35), 0 12px 40px rgba(0, 0, 0, 0.8)';
    this._card.style.display = 'flex';
    this._card.style.flexDirection = 'column';
    this._card.style.alignItems = 'center';
    this._card.style.textAlign = 'center';
    this._card.style.pointerEvents = 'auto';
    this._card.style.userSelect = 'none';

    this._card.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="font-size:18px;">🎯</span>
        <span id="sb-badge" style="font-size:13px; font-weight:900; color:#00f0ff; letter-spacing:1.5px; text-transform:uppercase; background:rgba(0,240,255,0.15); padding:3px 12px; border-radius:10px; border:1px solid rgba(0,240,255,0.4);">ETAP 1</span>
      </div>
      <h3 id="sb-objective" style="margin:0 0 8px 0; font-size:18px; font-weight:800; color:#ffffff; text-shadow:0 0 10px rgba(0,240,255,0.4);">CEL: Odkryj wszystkie wolne kafelki</h3>
      <p id="sb-hint" style="margin:0; font-size:13px; color:rgba(200, 230, 255, 0.85); line-height:1.45;">Wybierz dowolny wolny kafelek, aby wystawić bilę i rozpocząć etap!</p>
    `;

    this._el.appendChild(this._card);
    this._container.appendChild(this._el);
  }

  show(stageNumber = 1, totalTiles = null) {
    if (!this._el || !this._card) return;
    const config = getStageConfig(stageNumber);

    const badgeEl = this._card.querySelector('#sb-badge');
    const objEl = this._card.querySelector('#sb-objective');
    const hintEl = this._card.querySelector('#sb-hint');

    if (badgeEl) badgeEl.innerText = `ETAP ${config.number}`;
    if (objEl) {
      const tileInfo = totalTiles ? ` (${totalTiles} pól)` : '';
      objEl.innerText = `CEL: ${config.objective}${tileInfo}`;
    }
    if (hintEl) hintEl.innerText = config.hint;

    this._el.style.display = 'flex';
    this._visible = true;

    anime({
      targets: this._card,
      opacity: [0, 1],
      scale: [0.88, 1.0],
      duration: 350,
      easing: 'easeOutBack'
    });
  }

  showRespawnCountdown(startingCount = 9) {
    if (!this._el || !this._card) return;

    const badgeEl = this._card.querySelector('#sb-badge');
    const objEl = this._card.querySelector('#sb-objective');
    const hintEl = this._card.querySelector('#sb-hint');

    if (badgeEl) {
      badgeEl.innerText = '⚡ WZNOWIENIE GRY';
      badgeEl.style.color = '#ffcc00';
      badgeEl.style.borderColor = 'rgba(255, 204, 0, 0.5)';
      badgeEl.style.background = 'rgba(255, 204, 0, 0.15)';
    }

    if (objEl) {
      objEl.innerHTML = `START ZA: <span id="sb-count-num" style="font-size:32px; font-weight:900; color:#ffcc00; text-shadow:0 0 16px rgba(255,204,0,0.8);">${startingCount}</span>s`;
    }

    if (hintEl) {
      hintEl.innerText = 'Wskaż kafelek kliknięciem lub bila wystawi się automatycznie w pozycji kursora!';
    }

    this._el.style.display = 'flex';
    this._visible = true;

    anime({
      targets: this._card,
      opacity: [0, 1],
      scale: [0.88, 1.0],
      duration: 350,
      easing: 'easeOutBack'
    });
  }

  updateCountdown(seconds) {
    if (!this._card) return;
    const numEl = this._card.querySelector('#sb-count-num');
    if (numEl) {
      numEl.innerText = String(seconds);
      if (seconds <= 3) {
        numEl.style.color = '#ff3b30';
        numEl.style.textShadow = '0 0 18px rgba(255,59,48,0.9)';
      } else {
        numEl.style.color = '#ffcc00';
        numEl.style.textShadow = '0 0 16px rgba(255,204,0,0.8)';
      }
      anime({
        targets: numEl,
        scale: [1.35, 1.0],
        duration: 220,
        easing: 'easeOutBack'
      });
    }
  }

  hide() {
    if (!this._el || !this._card || !this._visible) return;
    this._visible = false;

    anime({
      targets: this._card,
      opacity: [1, 0],
      scale: [1.0, 0.92],
      duration: 250,
      easing: 'easeInQuad',
      complete: () => {
        if (!this._visible && this._el) {
          this._el.style.display = 'none';
        }
      }
    });
  }

  dispose() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }
}
