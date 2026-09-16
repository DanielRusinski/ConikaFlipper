import { eventBus } from '../../core/EventBus.js';
import anime from 'animejs';

export class GameOverScreen {
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
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,24,0.88); backdrop-filter:blur(8px);"></div>
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; background:rgba(20,24,40,0.95); padding:36px; border-radius:16px; border:1.5px solid rgba(255,255,255,0.2); max-width:400px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
        <h1 style="font-size:36px; color:#ff4d4d; margin-bottom:18px; letter-spacing:2px; font-weight:800;">GAME OVER</h1>
        <div id="go-score" style="font-size:32px; color:#ffd93d; font-weight:800; margin-bottom:8px;">Score: 0</div>
        <div id="go-tiles" style="font-size:16px; color:#aaa; margin-bottom:6px;">Tiles Discovered: 0</div>
        <div id="go-coins" style="font-size:16px; color:#aaa; margin-bottom:28px;">Coins Collected: 0</div>
        <button id="go-restart-btn" class="screen-btn" style="display:block; width:100%; max-width:220px; margin:0 auto 14px; padding:15px; font-size:18px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Restart</button>
        <button id="go-title-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:220px; margin:0 auto; padding:14px; font-size:16px; font-weight:600; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Title Screen</button>
      </div>
    `;
    
    container.appendChild(this._el);
    
    const restartBtn = this._el.querySelector('#go-restart-btn');
    const triggerRestart = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:restartRequested');
    };
    restartBtn.addEventListener('click', triggerRestart);
    restartBtn.addEventListener('touchend', triggerRestart, { passive: false });
    
    const titleBtn = this._el.querySelector('#go-title-btn');
    const triggerTitle = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:titleRequested');
    };
    titleBtn.addEventListener('click', triggerTitle);
    titleBtn.addEventListener('touchend', triggerTitle, { passive: false });
  }

  show(data = { score:0, tilesDiscovered:0, coinsCollected:0 }) {
    this._el.querySelector('#go-score').innerText = `Score: ${data.score || 0}`;
    this._el.querySelector('#go-tiles').innerText = `Tiles Discovered: ${data.tilesDiscovered || 0}`;
    this._el.querySelector('#go-coins').innerText = `Coins Collected: ${data.coinsCollected || 0}`;
    
    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';
    
    const content = this._el.querySelector('.screen-content');
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
    
    try {
      content.style.opacity = '0';
      content.style.transform = 'translateY(-30px)';
      anime({
        targets: content,
        opacity: 1,
        translateY: 0,
        duration: 400,
        easing: 'easeOutQuad'
      });
    } catch (e) {
      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    }
  }

  hide() {
    this._el.classList.add('hidden');
    this._el.style.display = 'none';
  }

  dispose() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}
