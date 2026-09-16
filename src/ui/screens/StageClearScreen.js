import { eventBus } from '../../core/EventBus.js';
import anime from 'animejs';

export class StageClearScreen {
  constructor() {
    this._el = null;
  }

  init(container) {
    this._el = document.createElement('div');
    this._el.className = 'screen-overlay hidden';
    this._el.style.position = 'fixed';
    this._el.style.inset = '0';
    this._el.style.width = '100vw';
    this._el.style.height = '100vh';
    this._el.style.display = 'none';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';
    this._el.style.zIndex = '4000';
    this._el.style.pointerEvents = 'auto';

    this._el.innerHTML = `
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(4, 8, 20, 0.88); backdrop-filter:blur(10px);"></div>
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; background:linear-gradient(180deg, rgba(16, 26, 50, 0.96), rgba(8, 14, 28, 0.98)); padding:36px 30px; border-radius:20px; border:2px solid rgba(0, 240, 255, 0.55); max-width:440px; width:90%; box-shadow:0 0 30px rgba(0, 240, 255, 0.3), 0 12px 40px rgba(0,0,0,0.7);">
        <div style="font-size:42px; line-height:1; margin-bottom:8px;">🏆</div>
        <h1 id="stage-clear-title" style="font-size:32px; font-weight:900; color:#00f0ff; margin-bottom:12px; letter-spacing:2px; text-shadow:0 0 16px rgba(0, 240, 255, 0.6); text-transform:uppercase;">ETAP 1 UKOŃCZONY!</h1>
        <p id="stage-clear-subtitle" style="font-size:14px; color:#88ccff; margin-bottom:20px; font-weight:600;">Wszystkie pola na stole zostały odkryte!</p>
        
        <div style="background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:24px; text-align:left; font-size:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#aaa;">Odkryte kafelki:</span>
            <span id="sc-tiles" style="color:#00ffcc; font-weight:800;">100% (612/612)</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#aaa;">Bonus za etap:</span>
            <span id="sc-bonus" style="color:#ffd93d; font-weight:800;">+1000 pkt</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="color:#aaa;">Bonus za czas:</span>
            <span id="sc-time-bonus" style="color:#ffd93d; font-weight:800;">+0 pkt</span>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.15); padding-top:8px; margin-top:8px; display:flex; justify-content:space-between; font-size:16px;">
            <span style="color:#fff; font-weight:700;">Wynik całkowity:</span>
            <span id="sc-total-score" style="color:#00f0ff; font-weight:900;">0</span>
          </div>
        </div>

        <button id="sc-next-btn" class="screen-btn" style="display:block; width:100%; max-width:260px; margin:0 auto; padding:15px; font-size:17px; font-weight:800; background:linear-gradient(135deg, #00f0ff 0%, #0080ff 100%); color:#031020; border:none; border-radius:12px; cursor:pointer; touch-action:manipulation; box-shadow:0 0 20px rgba(0, 240, 255, 0.5); text-transform:uppercase; letter-spacing:1px;">NASTĘPNY ETAP ➔</button>
      </div>
    `;

    container.appendChild(this._el);

    const nextBtn = this._el.querySelector('#sc-next-btn');
    const triggerNext = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:nextStageRequested');
    };
    nextBtn.addEventListener('click', triggerNext);
    nextBtn.addEventListener('touchend', triggerNext, { passive: false });
  }

  show(data = {}) {
    const stage = data.stage || 1;
    const tiles = data.tilesDiscovered || data.totalTiles || 0;
    const totalTiles = data.totalTiles || tiles;
    const stageBonus = data.stageBonus || 1000;
    const timeBonus = data.timeBonus || 0;
    const totalScore = data.totalScore || 0;

    this._el.querySelector('#stage-clear-title').innerText = `ETAP ${stage} UKOŃCZONY!`;
    this._el.querySelector('#sc-tiles').innerText = `100% (${tiles}/${totalTiles})`;
    this._el.querySelector('#sc-bonus').innerText = `+${stageBonus} pkt`;
    this._el.querySelector('#sc-time-bonus').innerText = `+${timeBonus} pkt`;
    this._el.querySelector('#sc-total-score').innerText = `${totalScore}`;

    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';

    anime({
      targets: this._el.querySelector('.screen-content'),
      scale: [0.85, 1],
      opacity: [0, 1],
      duration: 400,
      easing: 'easeOutBack'
    });
  }

  hide() {
    this._el.classList.add('hidden');
    this._el.style.display = 'none';
  }

  dispose() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }
}
