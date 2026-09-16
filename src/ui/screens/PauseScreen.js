import { eventBus } from '../../core/EventBus.js';
import anime from 'animejs';

export class PauseScreen {
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
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,24,0.85); backdrop-filter:blur(8px);"></div>
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; background:rgba(20,24,40,0.95); padding:36px; border-radius:16px; border:1.5px solid rgba(255,255,255,0.2); max-width:400px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
        <h1 style="font-size:36px; margin-bottom:28px; letter-spacing:2px; font-weight:800;">PAUSED</h1>
        <button id="pause-resume-btn" class="screen-btn" style="display:block; width:100%; max-width:220px; margin:0 auto 14px; padding:15px; font-size:18px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Resume</button>
        <button id="pause-settings-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:220px; margin:0 auto 14px; padding:14px; font-size:16px; font-weight:600; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Settings</button>
        <button id="pause-restart-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:220px; margin:0 auto 14px; padding:14px; font-size:16px; font-weight:600; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Restart</button>
        <button id="pause-quit-btn" class="screen-btn danger" style="display:block; width:100%; max-width:220px; margin:0 auto; padding:14px; font-size:16px; font-weight:600; background:linear-gradient(135deg,#e63946,#c1121f); color:white; border:none; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Quit to Title</button>
      </div>
    `;
    
    container.appendChild(this._el);
    
    const resumeBtn = this._el.querySelector('#pause-resume-btn');
    const triggerResume = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:resumeRequested');
    };
    resumeBtn.addEventListener('click', triggerResume);

    const settingsBtn = this._el.querySelector('#pause-settings-btn');
    const triggerSettings = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:settingsRequested');
    };
    settingsBtn.addEventListener('click', triggerSettings);
    
    const restartBtn = this._el.querySelector('#pause-restart-btn');
    const triggerRestart = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:restartRequested');
    };
    restartBtn.addEventListener('click', triggerRestart);
    
    const quitBtn = this._el.querySelector('#pause-quit-btn');
    const triggerQuit = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:titleRequested');
    };
    quitBtn.addEventListener('click', triggerQuit);
  }

  show() {
    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';
    
    const content = this._el.querySelector('.screen-content');
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
    
    try {
      content.style.opacity = '0';
      content.style.transform = 'translateY(-20px)';
      anime({
        targets: content,
        opacity: 1,
        translateY: 0,
        duration: 350,
        easing: 'easeOutQuad'
      });
    } catch (e) {
      content.style.opacity = '1';
      content.style.transform = 'translateY(0)';
    }
    
    const resumeBtn = this._el.querySelector('#pause-resume-btn');
    if (resumeBtn) resumeBtn.focus();
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
