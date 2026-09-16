import { eventBus } from '../../core/EventBus.js';
import anime from 'animejs';

export class TitleScreen {
  constructor() {
    this._container = null;
    this._el = null;
  }

  init(container) {
    this._container = container;
    
    this._el = document.createElement('div');
    this._el.className = 'screen-overlay hidden';
    this._el.id = 'title-screen';
    this._el.style.position = 'fixed';
    this._el.style.inset = '0';
    this._el.style.width = '100vw';
    this._el.style.height = '100vh';
    this._el.style.display = 'none';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';
    this._el.style.zIndex = '3000';
    this._el.style.pointerEvents = 'auto';
    
    this._el.innerHTML = `
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,24,0.85); backdrop-filter:blur(8px);"></div>
      <div class="screen-content" style="position:relative; text-align:center; color:white; z-index:1; padding:24px; max-width:440px; width:90%;">
        <h1 class="screen-title" style="font-size:clamp(32px, 8vw, 48px); margin-bottom:8px; font-weight:800; letter-spacing:2px; text-transform:uppercase;">OPT FLIPPER</h1>
        <p class="screen-subtitle" style="font-size:clamp(15px, 4vw, 20px); margin-bottom:36px; color:#00e5ff; font-weight:600; letter-spacing:1px;">Tilt & Discover</p>
        <button class="screen-btn" id="play-btn" style="display:block; width:100%; max-width:240px; margin:0 auto 14px; padding:16px; font-size:20px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:12px; cursor:pointer; touch-action:manipulation; pointer-events:auto; box-shadow:0 4px 16px rgba(0,180,216,0.4);">Play</button>
        <button class="screen-btn secondary" id="equipment-btn" style="display:block; width:100%; max-width:240px; margin:0 auto 14px; padding:14px; font-size:17px; font-weight:600; background:rgba(255,255,255,0.12); border:1.5px solid rgba(255,255,255,0.25); color:white; border-radius:12px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Equipment</button>
        <button class="screen-btn secondary" id="settings-btn" style="display:block; width:100%; max-width:240px; margin:0 auto; padding:14px; font-size:17px; font-weight:600; background:rgba(255,255,255,0.08); border:1.5px solid rgba(255,255,255,0.18); color:white; border-radius:12px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Settings</button>
      </div>
    `;
    
    container.appendChild(this._el);
    
    const playBtn = this._el.querySelector('#play-btn');
    const triggerStart = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:startRequested');
    };
    playBtn.addEventListener('click', triggerStart);
    playBtn.addEventListener('touchend', triggerStart, { passive: false });
    
    const eqBtn = this._el.querySelector('#equipment-btn');
    const triggerEq = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:equipmentRequested');
    };
    eqBtn.addEventListener('click', triggerEq);
    eqBtn.addEventListener('touchend', triggerEq, { passive: false });

    const setBtn = this._el.querySelector('#settings-btn');
    const triggerSet = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:settingsRequested');
    };
    setBtn.addEventListener('click', triggerSet);
    setBtn.addEventListener('touchend', triggerSet, { passive: false });
  }

  show(data) {
    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';
    
    const content = this._el.querySelector('.screen-content');
    content.style.opacity = '1';
    content.style.transform = 'scale(1)';
    
    try {
      content.style.opacity = '0';
      content.style.transform = 'scale(0.85)';
      anime({
        targets: content,
        opacity: 1,
        scale: 1,
        duration: 500,
        easing: 'easeOutQuad'
      });
    } catch (e) {
      content.style.opacity = '1';
      content.style.transform = 'scale(1)';
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
