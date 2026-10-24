import { eventBus } from '../../core/EventBus.js';
import { soundSystem } from '../../audio/SoundSystem.js';
import { renderIconHTML } from '../IconService.js';
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
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; background:rgba(20,24,40,0.95); padding:32px 28px; border-radius:16px; border:1.5px solid rgba(255,255,255,0.2); max-width:400px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
        <h1 style="font-size:34px; margin-bottom:20px; letter-spacing:2px; font-weight:800;">PAUSED</h1>
        <button id="pause-resume-btn" class="screen-btn" style="display:block; width:100%; max-width:230px; margin:0 auto 12px; padding:14px; font-size:17px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Resume</button>

        <div class="pause-speed-box" style="margin: 12px auto; max-width: 230px; background: rgba(255,255,255,0.06); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); text-align:left;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:12px; font-weight:700;">
            <span style="color:#ddd; display:inline-flex; align-items:center; gap:6px;">${renderIconHTML('gamepad', { size: '28px' })} Czułość sterowania / Tilt Sensitivity</span>
            <span id="pause-tilt-val" style="color:#00ffcc; font-weight:800;">100%</span>
          </div>
          <input type="range" id="pause-tilt-slider" min="50" max="150" value="100" step="5" style="width:100%; cursor:pointer; accent-color:#00ffcc; touch-action:manipulation; display:block;">
        </div>

        <!-- Music Volume Controls -->
        <div class="pause-audio-box" style="margin: 10px auto 12px; max-width: 230px; background: rgba(255,255,255,0.06); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); text-align:left;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:12px; font-weight:700;">
            <span style="color:#ddd; display:inline-flex; align-items:center; gap:6px;">Muzyka / Music</span>
            <button id="pause-music-toggle-btn" type="button" style="background:rgba(0,229,255,0.2); border:1px solid #00e5ff; color:#00e5ff; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:700; cursor:pointer;">ON</button>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; color:#aaa;">
            <span>Głośność / Volume</span>
            <span id="pause-music-val" style="color:#00e5ff; font-weight:700;">55%</span>
          </div>
          <input type="range" id="pause-music-slider" min="0" max="100" value="55" step="5" style="width:100%; cursor:pointer; accent-color:#00e5ff; touch-action:manipulation; display:block;">
        </div>

        <button id="pause-settings-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:230px; margin:0 auto 10px; padding:12px; font-size:15px; font-weight:600; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Grafika / Graphics Settings</button>
        <button id="pause-dev-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:230px; margin:0 auto 10px; padding:8px 12px; font-size:13px; font-weight:500; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); color:#aaa; border-radius:8px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Deweloperskie / Dev Panel [1]</button>
        <button id="pause-restart-btn" class="screen-btn secondary" style="display:block; width:100%; max-width:230px; margin:0 auto 10px; padding:12px; font-size:15px; font-weight:600; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Restart</button>
        <button id="pause-quit-btn" class="screen-btn danger" style="display:block; width:100%; max-width:230px; margin:0 auto; padding:12px; font-size:15px; font-weight:600; background:linear-gradient(135deg,#e63946,#c1121f); color:white; border:none; border-radius:10px; cursor:pointer; touch-action:manipulation; pointer-events:auto;">Quit to Title</button>
      </div>
    `;
    
    container.appendChild(this._el);
    
    const resumeBtn = this._el.querySelector('#pause-resume-btn');
    const triggerResume = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:resumeRequested');
    };
    resumeBtn.addEventListener('click', triggerResume);

    // User Input Tilt Sensitivity slider (input.tiltSensitivity: 0.50 - 1.50, default 1.00)
    this._tiltSlider = this._el.querySelector('#pause-tilt-slider');
    this._tiltVal = this._el.querySelector('#pause-tilt-val');
    if (this._tiltSlider && this._tiltVal) {
      this._tiltSlider.addEventListener('input', (e) => {
        const percent = Number(e.target.value);
        this._tiltVal.textContent = `${percent}%`;
        const sensitivity = percent / 100;
        eventBus.emit('settings:changed', { key: 'tiltSensitivity', value: sensitivity });
      });
    }

    // Music controls
    this._musicToggleBtn = this._el.querySelector('#pause-music-toggle-btn');
    this._musicSlider = this._el.querySelector('#pause-music-slider');
    this._musicVal = this._el.querySelector('#pause-music-val');

    const updateMusicUI = () => {
      const enabled = soundSystem.isMusicEnabled;
      const vol = soundSystem.musicVolume;
      if (this._musicToggleBtn) {
        this._musicToggleBtn.textContent = enabled ? 'ON' : 'OFF';
        this._musicToggleBtn.style.color = enabled ? '#00e5ff' : '#aaa';
        this._musicToggleBtn.style.borderColor = enabled ? '#00e5ff' : 'rgba(255,255,255,0.2)';
        this._musicToggleBtn.style.background = enabled ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.06)';
      }
      if (this._musicSlider) {
        this._musicSlider.value = String(Math.round(vol * 100));
        this._musicSlider.disabled = !enabled;
        this._musicSlider.style.opacity = enabled ? '1' : '0.4';
      }
      if (this._musicVal) {
        this._musicVal.textContent = `${Math.round(vol * 100)}%`;
        this._musicVal.style.color = enabled ? '#00e5ff' : '#777';
      }
    };

    if (this._musicToggleBtn) {
      this._musicToggleBtn.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const next = !soundSystem.isMusicEnabled;
        soundSystem.setMusicEnabled(next);
        updateMusicUI();
      });
    }

    if (this._musicSlider) {
      this._musicSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value) / 100;
        soundSystem.setMusicVolume(val);
        if (this._musicVal) {
          this._musicVal.textContent = `${Math.round(val * 100)}%`;
        }
      });
    }

    updateMusicUI();

    this._unsubSettings = eventBus.on('settings:changed', ({ key, value }) => {
      if (key === 'tiltSensitivity' && this._tiltSlider && this._tiltVal) {
        const percent = Math.round(Number(value) * 100);
        this._tiltSlider.value = String(percent);
        this._tiltVal.textContent = `${percent}%`;
      }
    });

    this._unsubAudio = eventBus.on('audio:settingsChanged', () => {
      updateMusicUI();
    });

    const settingsBtn = this._el.querySelector('#pause-settings-btn');
    const triggerSettings = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      eventBus.emit('ui:settingsRequested');
    };
    settingsBtn.addEventListener('click', triggerSettings);

    const devBtn = this._el.querySelector('#pause-dev-btn');
    if (devBtn) {
      devBtn.addEventListener('click', (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        eventBus.emit('ui:devSettingsRequested');
      });
    }
    
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
    if (this._unsubSettings) {
      this._unsubSettings();
      this._unsubSettings = null;
    }
    if (this._unsubAudio) {
      this._unsubAudio();
      this._unsubAudio = null;
    }
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}
