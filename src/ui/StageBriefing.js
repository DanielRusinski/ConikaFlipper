import { getStageConfig } from '../config/stageConfig.js';
import anime from 'animejs';

export class StageBriefing {
  constructor() {
    this._container = null;
    this._el = null;
    this._visible = false;
  }

  init(container) {
    this._container = container;

    this._el = document.createElement('div');
    this._el.id = 'stage-briefing-banner';
    this._el.style.position = 'fixed';
    this._el.style.top = '110px';
    this._el.style.left = '50%';
    this._el.style.transform = 'translateX(-50%)';
    this._el.style.background = 'linear-gradient(180deg, rgba(12, 20, 42, 0.96), rgba(6, 10, 24, 0.98))';
    this._el.style.border = '1.5px solid rgba(0, 240, 255, 0.65)';
    this._el.style.borderRadius = '18px';
    this._el.style.padding = '14px 24px';
    this._el.style.color = '#fff';
    this._el.style.maxWidth = '460px';
    this._el.style.width = '90%';
    this._el.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.3), 0 8px 30px rgba(0, 0, 0, 0.7)';
    this._el.style.zIndex = '95';
    this._el.style.display = 'none';
    this._el.style.flexDirection = 'column';
    this._el.style.alignItems = 'center';
    this._el.style.textAlign = 'center';
    this._el.style.pointerEvents = 'auto';
    this._el.style.userSelect = 'none';

    this._el.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <span style="font-size:16px;">🎯</span>
        <span id="sb-badge" style="font-size:12px; font-weight:900; color:#00f0ff; letter-spacing:1.5px; text-transform:uppercase; background:rgba(0,240,255,0.15); padding:2px 10px; border-radius:10px; border:1px solid rgba(0,240,255,0.4);">ETAP 1</span>
      </div>
      <h3 id="sb-objective" style="margin:0 0 6px 0; font-size:16px; font-weight:800; color:#ffffff; text-shadow:0 0 10px rgba(0,240,255,0.4);">CEL: Odkryj wszystkie wolne kafelki</h3>
      <p id="sb-hint" style="margin:0; font-size:12px; color:rgba(200, 230, 255, 0.85); line-height:1.4;">Wybierz dowolny wolny kafelek, aby wystawić bilę i rozpocząć etap!</p>
    `;

    this._container.appendChild(this._el);
  }

  show(stageNumber = 1, totalTiles = null) {
    if (!this._el) return;
    const config = getStageConfig(stageNumber);

    const badgeEl = this._el.querySelector('#sb-badge');
    const objEl = this._el.querySelector('#sb-objective');
    const hintEl = this._el.querySelector('#sb-hint');

    if (badgeEl) badgeEl.innerText = `ETAP ${config.number}`;
    if (objEl) {
      const tileInfo = totalTiles ? ` (${totalTiles} pól)` : '';
      objEl.innerText = `CEL: ${config.objective}${tileInfo}`;
    }
    if (hintEl) hintEl.innerText = config.hint;

    this._el.style.display = 'flex';
    this._visible = true;

    anime({
      targets: this._el,
      opacity: [0, 1],
      translateY: [-20, 0],
      duration: 400,
      easing: 'easeOutQuad'
    });
  }

  hide() {
    if (!this._el || !this._visible) return;
    this._visible = false;

    anime({
      targets: this._el,
      opacity: [1, 0],
      translateY: [0, -15],
      duration: 300,
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
