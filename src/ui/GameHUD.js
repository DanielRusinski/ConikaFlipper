import { eventBus } from '../core/EventBus.js';
import { inputManager } from '../core/InputManager.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { BALL_COLORS, BALL_CSS_COLORS } from '../materials/ballMaterials.js';
import { ScoreDisplay } from './ScoreDisplay.js';
import anime from 'animejs';

export class GameHUD {
  constructor() {
    this._scoreDisplay = new ScoreDisplay({ digitCount: 6, digitHeight: 34, digitWidth: 18, fontSize: '22px', color: '#ffd700', customStyling: true });
    this._yellowScoreDisplay = new ScoreDisplay({ digitCount: 4, digitHeight: 22, digitWidth: 11, fontSize: '13px', color: '#ffd93d', customStyling: false });
    this._redScoreDisplay = new ScoreDisplay({ digitCount: 4, digitHeight: 22, digitWidth: 11, fontSize: '13px', color: '#ff6b6b', customStyling: false });
    this._tilesRemainingDisplay = new ScoreDisplay({ digitCount: 4, digitHeight: 22, digitWidth: 11, fontSize: '13px', color: '#00e5ff', customStyling: false });
    this._livesEl = null;
    this._timerEl = null;
    this._ballIndicatorEl = null;
    this._modifierEl = null;
    this._battleBtn = null;
    this._pauseBtn = null;
    this._recenterBtn = null;
    this._selectionBannerEl = null;
    this._launchBtn = null;
    this._unsubs = [];
    this._hudContainer = null;
  }

  init(hudContainer) {
    this._hudContainer = hudContainer;
    
    // Create DOM structure matching responsive layout
    hudContainer.innerHTML = `
      <div id="hud-top-bar">
        <div class="hud-scores-wrapper">
          <div id="total-score-card" class="hud-item score-card">
            <span class="hud-title-badge">SCORE</span>
            <div id="score-display"></div>
          </div>
          <div id="tiles-remaining-card" class="hud-item tiles-card">
            <span class="hud-title-badge tiles-badge">TILES LEFT</span>
            <div id="tiles-remaining-slot" class="tiles-slot"></div>
          </div>
          <div class="hud-coins-box">
            <div id="yellow-coins-display" class="hud-item coin-counter yellow">
              <span class="coin-dot">🪙</span>
              <div id="yellow-coins-slot" class="coin-slot"></div>
            </div>
            <div id="red-coins-display" class="hud-item coin-counter red">
              <span class="coin-dot">🔴</span>
              <div id="red-coins-slot" class="coin-slot"></div>
            </div>
          </div>
        </div>
        <div class="hud-group hud-status-group">
          <div id="timer-display" class="hud-item"><span>⏱️</span><span>05:00</span></div>
          <div id="lives-display" class="hud-item">❤️ 3</div>
        </div>
      </div>

      <div id="selection-banner" style="display:none; position:absolute; top:75px; left:50%; transform:translateX(-50%); background:linear-gradient(180deg, rgba(16, 24, 46, 0.94), rgba(8, 14, 28, 0.98)); border:1.5px solid rgba(0, 229, 255, 0.65); border-radius:26px; padding:8px 20px; color:#fff; font-size:14px; font-weight:700; align-items:center; gap:14px; box-shadow:0 0 20px rgba(0, 229, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.65); z-index:100; pointer-events:auto; user-select:none; white-space:nowrap;">
        <span id="selection-text">🎯 Tap tile to spawn ball</span>
        <button id="selection-launch-btn" class="selection-launch-btn" style="background:linear-gradient(135deg, #00f0ff 0%, #0080ff 100%); color:#031020; border:none; border-radius:16px; padding:7px 18px; font-size:13px; font-weight:800; letter-spacing:0.8px; cursor:pointer; box-shadow:0 0 14px rgba(0, 240, 255, 0.6); text-transform:uppercase;">🚀 LAUNCH</button>
      </div>

      <div id="hud-bottom-bar">
        <div id="ball-indicator" title="Current Ball (Tap to customize)"></div>
        <div id="active-modifier"></div>
        <div style="display:flex; gap:10px; pointer-events:auto; align-items:center;">
          <button id="bomb-action-btn" class="hud-touch-btn bomb-hud-btn" style="display:none; pointer-events:auto; background:linear-gradient(180deg, rgba(50, 18, 18, 0.94), rgba(28, 8, 8, 0.98)); border:1.5px solid rgba(255, 69, 58, 0.7); border-radius:12px; padding:8px 16px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 69, 58, 0.35); align-items:center; gap:6px;">💣 <span id="bomb-btn-count">0</span></button>
          <button id="recenter-btn" class="hud-touch-btn" style="display:none; pointer-events:auto; background:linear-gradient(180deg, rgba(20, 36, 60, 0.92), rgba(10, 18, 36, 0.96)); border:1.5px solid rgba(0, 229, 255, 0.5); border-radius:12px; padding:8px 14px; color:#00e5ff; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 229, 255, 0.2); align-items:center; gap:5px;" title="Wyzeruj poziom stołu">🎯 Poziom</button>
          <button id="battle-menu-btn" class="hud-touch-btn" style="pointer-events:auto; background:linear-gradient(180deg, rgba(26, 36, 62, 0.92), rgba(13, 19, 36, 0.96)); border:1.5px solid rgba(120, 180, 255, 0.45); border-radius:12px; padding:8px 16px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 180, 255, 0.2); display:inline-flex; align-items:center; gap:6px;">⚡ Battle</button>
          <button id="pause-btn" class="hud-touch-btn" style="pointer-events:auto; background:linear-gradient(180deg, rgba(26, 36, 62, 0.92), rgba(13, 19, 36, 0.96)); border:1.5px solid rgba(120, 180, 255, 0.45); border-radius:12px; padding:8px 16px; color:#fff; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0, 0, 0, 0.55), 0 0 10px rgba(0, 180, 255, 0.2); display:inline-flex; align-items:center; gap:6px;">⏸️ Pause</button>
        </div>
      </div>
    `;

    const scoreContainer = document.getElementById('score-display');
    this._scoreDisplay.init(scoreContainer);

    const yellowSlot = document.getElementById('yellow-coins-slot');
    this._yellowScoreDisplay.init(yellowSlot);

    const redSlot = document.getElementById('red-coins-slot');
    this._redScoreDisplay.init(redSlot);

    const tilesSlot = document.getElementById('tiles-remaining-slot');
    if (tilesSlot) {
      this._tilesRemainingDisplay.init(tilesSlot);
    }

    this._livesEl = document.getElementById('lives-display');
    this._timerEl = document.getElementById('timer-display');
    this._ballIndicatorEl = document.getElementById('ball-indicator');
    this._modifierEl = document.getElementById('active-modifier');
    this._bombBtn = document.getElementById('bomb-action-btn');
    this._bombCountSpan = document.getElementById('bomb-btn-count');
    this._recenterBtn = document.getElementById('recenter-btn');
    this._battleBtn = document.getElementById('battle-menu-btn');
    this._pauseBtn = document.getElementById('pause-btn');
    this._selectionBannerEl = document.getElementById('selection-banner');
    this._launchBtn = document.getElementById('selection-launch-btn');

    if (this._recenterBtn) {
      if (inputManager.isGyroActive) {
        this._recenterBtn.style.display = 'inline-flex';
      }
      this._recenterBtn.addEventListener('click', () => {
        inputManager.calibrate();
        const origHtml = this._recenterBtn.innerHTML;
        this._recenterBtn.innerHTML = '✓ OK!';
        this._recenterBtn.style.borderColor = '#00ffcc';
        setTimeout(() => {
          if (this._recenterBtn) {
            this._recenterBtn.innerHTML = origHtml;
            this._recenterBtn.style.borderColor = 'rgba(0, 229, 255, 0.5)';
          }
        }, 700);
      });
    }

    if (this._bombBtn) {
      this._bombBtn.addEventListener('click', () => {
        eventBus.emit('ui:toggleBombTargeting');
      });
    }

    this._battleBtn.addEventListener('click', () => {
      eventBus.emit('ui:battleMenuRequested');
    });

    this._pauseBtn.addEventListener('click', () => {
      eventBus.emit('ui:pauseRequested');
    });

    this._ballIndicatorEl.addEventListener('click', () => {
      eventBus.emit('ui:equipmentRequested');
    });

    this._unsubs.push(
      eventBus.on('input:gyroActive', () => {
        if (this._recenterBtn) {
          this._recenterBtn.style.display = 'inline-flex';
        }
      }),
      eventBus.on('score:changed', (data) => {
        this._scoreDisplay.setValue(data.score || 0);
        if (data.yellowScore !== undefined) {
          this._yellowScoreDisplay.setValue(data.yellowScore);
        }
        if (data.redScore !== undefined) {
          this._redScoreDisplay.setValue(data.redScore);
        }
      }),
      eventBus.on('tiles:changed', (data) => {
        if (data && data.remaining !== undefined) {
          this._tilesRemainingDisplay.setValue(data.remaining);
        }
      }),
      eventBus.on('life:changed', (lives) => this._updateLives(lives)),
      eventBus.on('timer:changed', (data) => this._updateTimer(data.time, data.formatted, data.added)),
      eventBus.on('ball:typeChanged', (data) => this._updateBallIndicator(data.type)),
      eventBus.on('modifier:selected', (data) => this._updateModifier(data.card)),
      eventBus.on('bomb:countChanged', ({ count }) => {
        if (!this._bombBtn || !this._bombCountSpan) return;
        this._bombCountSpan.textContent = count;
        if (count > 0) {
          this._bombBtn.style.display = 'inline-flex';
        } else {
          this._bombBtn.style.display = 'none';
        }
      }),
      eventBus.on('bomb:targetingChanged', ({ active }) => {
        if (!this._bombBtn) return;
        if (active) {
          this._bombBtn.style.borderColor = '#00ffcc';
          this._bombBtn.style.boxShadow = '0 0 16px rgba(0, 255, 204, 0.7)';
        } else {
          this._bombBtn.style.borderColor = 'rgba(255, 69, 58, 0.7)';
          this._bombBtn.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 69, 58, 0.35)';
        }
      })
    );

    this._updateLives(GAME_CONFIG.lives?.starting || 3);
    this._updateTimer(GAME_CONFIG.timer?.startingSeconds || 300, '05:00');
    this._updateBallIndicator(GAME_CONFIG.ball?.defaultType || 'brass');
  }

  showSelectionBanner(onLaunch) {
    if (!this._selectionBannerEl) return;
    this._selectionBannerEl.style.display = 'flex';
    if (this._launchBtn && onLaunch) {
      this._launchBtn.onclick = onLaunch;
    }
  }

  hideSelectionBanner() {
    if (!this._selectionBannerEl) return;
    this._selectionBannerEl.style.display = 'none';
  }

  _updateLives(lives) {
    const count = (typeof lives === 'object' && lives !== null) ? (lives.lives ?? 0) : (lives ?? 0);
    this._livesEl.innerText = `❤️ ${count}`;
  }

  _updateTimer(time, formatted, added) {
    const text = formatted || (time !== undefined ? `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}` : '05:00');
    this._timerEl.innerHTML = `<span>⏱️</span><span>${text}</span>`;

    if (added && added > 0) {
      // Glow pulse on timer box
      this._timerEl.style.borderColor = '#00ffcc';
      this._timerEl.style.boxShadow = '0 0 20px rgba(0, 255, 204, 0.7), inset 0 0 8px rgba(0, 255, 204, 0.4)';

      anime({
        targets: this._timerEl,
        scale: [1, 1.18, 1],
        duration: 500,
        easing: 'easeOutBack',
        complete: () => {
          setTimeout(() => {
            this._timerEl.style.borderColor = '';
            this._timerEl.style.boxShadow = '';
          }, 400);
        }
      });

      // Floating +XXs badge rising above timer
      const badge = document.createElement('div');
      badge.className = 'timer-bonus-badge';
      badge.innerText = `+${added}s ⏱️`;
      this._timerEl.appendChild(badge);

      anime({
        targets: badge,
        translateY: [0, -22],
        opacity: [1, 0],
        duration: 1200,
        easing: 'easeOutQuad',
        complete: () => {
          if (badge.parentNode) badge.parentNode.removeChild(badge);
        }
      });
    }
  }

  _updateBallIndicator(type) {
    const key = (type || 'brass').toLowerCase();
    const color = BALL_CSS_COLORS ? BALL_CSS_COLORS[key] : '#d4a84b';
    this._ballIndicatorEl.style.background = `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 50%, rgba(0,0,0,0.7) 100%)`;
    this._ballIndicatorEl.title = `Current ball: ${key} (Click to change)`;
  }

  _updateModifier(card) {
    if (!card) return;
    this._modifierEl.style.display = 'block';
    this._modifierEl.innerText = `Active: ${card.title}`;
    
    anime.remove(this._modifierEl);
    this._modifierEl.style.opacity = 1;

    setTimeout(() => {
      anime({
        targets: this._modifierEl,
        opacity: 0,
        duration: 500,
        easing: 'linear',
        complete: () => {
          this._modifierEl.style.display = 'none';
        }
      });
    }, (card.duration || 10) * 1000);
  }

  show() {
    this._hudContainer.style.display = 'flex';
  }

  hide() {
    this._hudContainer.style.display = 'none';
  }

  update(delta) {
    this._scoreDisplay.update(delta);
    if (this._yellowScoreDisplay) this._yellowScoreDisplay.update(delta);
    if (this._redScoreDisplay) this._redScoreDisplay.update(delta);
  }

  dispose() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    this._scoreDisplay.dispose();
    if (this._yellowScoreDisplay) this._yellowScoreDisplay.dispose();
    if (this._redScoreDisplay) this._redScoreDisplay.dispose();
    if (this._hudContainer) {
      this._hudContainer.innerHTML = '';
    }
  }
}
