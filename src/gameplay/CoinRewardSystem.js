import * as THREE from 'three';
import { eventBus } from '../core/EventBus.js';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import anime from 'animejs';

export class CoinRewardSystem {
  constructor() {
    this._container = null;
    this._unsubs = [];
    this._camera = null;
    this._renderer = null;
    this._boardGroup = null;
    this._tempPos = new THREE.Vector3();
    this._multiplier = 1;
    this._multiplierTimer = 0;
  }

  init(uiContainer, boardGroup = null) {
    this._container = uiContainer;
    this._boardGroup = boardGroup;
    this._unsubs = [
      eventBus.on('tile:discovered', this._onTileDiscovered.bind(this)),
      eventBus.on('finding:collected', this._onCrystalCollected.bind(this)),
      eventBus.on('modifier:collected', this._onCrystalCollected.bind(this)),
      eventBus.on('modifier:selected', (data) => {
        if (data?.card?.effectType === 'scoreMultiplier') {
          this._multiplier = data.card.effectValue || data.card.value || 2;
          this._multiplierTimer = data.card.duration || 30;
        }
      })
    ];
  }

  update(camera, renderer, dt = 0) {
    this._camera = camera;
    this._renderer = renderer;
    if (this._multiplierTimer > 0 && dt > 0) {
      this._multiplierTimer -= dt;
      if (this._multiplierTimer <= 0) {
        this._multiplier = 1;
        this._multiplierTimer = 0;
      }
    }
  }

  _onTileDiscovered({ tileIndex, x, z, gridX, gridY }) {
    const isRed = Math.random() < (REWARD_CONFIG.coins?.red?.probability || 0.2);
    const coinConfig = isRed ? REWARD_CONFIG.coins.red : REWARD_CONFIG.coins.yellow;
    
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight / 2;

    if (this._camera && this._renderer && Number.isFinite(x) && Number.isFinite(z)) {
      const screenPos = this.projectToScreen(x, 0.02, z, this._camera, this._renderer);
      startX = screenPos.x;
      startY = screenPos.y;
    }

    // 1. Spawning dynamic on-board points popup (+10 / +50) for immediate reward feedback
    const baseVal = coinConfig?.value || (isRed ? 50 : 10);
    const pointsVal = baseVal * (this._multiplier || 1);
    this._spawnPointsPopup(startX, startY, pointsVal, isRed);

    // 2. Existing flying coin animation (preserved exactly as before)
    const coinEl = document.createElement('div');
    coinEl.className = 'coin-popup';
    coinEl.style.position = 'absolute';
    coinEl.style.width = '24px';
    coinEl.style.height = '24px';
    coinEl.style.borderRadius = '50%';
    coinEl.style.backgroundColor = isRed ? '#e63946' : '#ffd93d';
    coinEl.style.border = isRed ? '2px solid #ff8585' : '2px solid #fff275';
    coinEl.style.boxShadow = isRed ? '0 0 10px rgba(230, 57, 70, 0.8)' : '0 0 10px rgba(255, 217, 61, 0.8)';
    coinEl.style.zIndex = '2500';
    coinEl.style.pointerEvents = 'none';
    coinEl.style.left = `${startX - 12}px`;
    coinEl.style.top = `${startY - 12}px`;
    coinEl.style.transform = 'scale(0.2)';

    this._container.appendChild(coinEl);

    const targetDisplay = isRed 
      ? (document.getElementById('red-coins-display') || document.getElementById('score-display'))
      : (document.getElementById('yellow-coins-display') || document.getElementById('score-display'));
    const rect = targetDisplay ? targetDisplay.getBoundingClientRect() : { left: 40, top: 40, width: 0, height: 0 };
    const targetX = rect.left + (rect.width ? rect.width / 2 : 20);
    const targetY = rect.top + (rect.height ? rect.height / 2 : 15);

    anime({
      targets: coinEl,
      scale: [0.2, 1.2, 1.0],
      left: [
        { value: startX - 12 },
        { value: (startX + targetX) / 2 },
        { value: targetX - 12 }
      ],
      top: [
        { value: startY - 12 },
        { value: Math.min(startY, targetY) - 50 },
        { value: targetY - 12 }
      ],
      duration: 750,
      easing: 'easeOutCubic',
      complete: () => {
        if (coinEl.parentNode) {
          coinEl.parentNode.removeChild(coinEl);
        }
        eventBus.emit('coin:collected', {
          type: isRed ? 'red' : 'yellow',
          value: coinConfig?.value || (isRed ? 50 : 10)
        });
      }
    });
  }

  _spawnPointsPopup(startX, startY, pointsVal, isRed) {
    if (!this._container || typeof document === 'undefined') return;

    // Cap active popups to prevent DOM flooding during rapid reveals or bomb blasts
    const active = this._container.querySelectorAll('.points-popup');
    if (active.length >= 24) {
      active[0].remove();
    }

    const popupEl = document.createElement('div');
    popupEl.className = `points-popup ${isRed ? 'points-red' : 'points-yellow'}`;
    popupEl.innerHTML = `<span class="points-plus">+</span>${pointsVal}`;
    
    popupEl.style.position = 'absolute';
    popupEl.style.left = `${startX}px`;
    popupEl.style.top = `${startY - 8}px`;
    popupEl.style.transform = 'translate(-50%, -50%) scale(0.35)';
    popupEl.style.opacity = '0';
    popupEl.style.zIndex = '2450';
    popupEl.style.pointerEvents = 'none';

    this._container.appendChild(popupEl);

    // Subtle horizontal jitter for lively organic motion
    const spreadX = (Math.random() - 0.5) * 22;

    anime({
      targets: popupEl,
      scale: [
        { value: 0.35, duration: 0 },
        { value: 1.45, duration: 160, easing: 'easeOutBack' },
        { value: 1.15, duration: 220, easing: 'easeInOutQuad' },
        { value: 0.95, duration: 250, easing: 'easeInQuad' }
      ],
      translateX: [
        { value: 0, duration: 0 },
        { value: spreadX, duration: 650, easing: 'easeOutSine' }
      ],
      translateY: [
        { value: 0, duration: 0 },
        { value: -48, duration: 650, easing: 'easeOutCubic' }
      ],
      opacity: [
        { value: 0, duration: 0 },
        { value: 1.0, duration: 100, easing: 'linear' },
        { value: 1.0, duration: 350 },
        { value: 0.0, duration: 200, easing: 'easeOutQuad' }
      ],
      duration: 650,
      complete: () => {
        if (popupEl.parentNode) {
          popupEl.parentNode.removeChild(popupEl);
        }
      }
    });
  }

  _onCrystalCollected(data) {
    if (!data) return;
    const { x, y, z, type, value, givesLife } = data;

    let startX = (typeof window !== 'undefined') ? window.innerWidth / 2 : 200;
    let startY = (typeof window !== 'undefined') ? window.innerHeight / 2 : 200;

    if (this._camera && this._renderer && Number.isFinite(x) && Number.isFinite(z)) {
      const screenPos = this.projectToScreen(x, y !== undefined ? y : 0.03, z, this._camera, this._renderer);
      startX = screenPos.x;
      startY = screenPos.y;
    }

    this._spawnCrystalPopup(startX, startY, type || (givesLife ? 'emerald_crystal' : 'points_crystal'), value);
  }

  _spawnCrystalPopup(startX, startY, type, value) {
    if (!this._container || typeof document === 'undefined') return;

    // Cap active crystal popups
    const active = this._container.querySelectorAll('.crystal-popup');
    if (active.length >= 8) {
      active[0].remove();
    }

    const popupEl = document.createElement('div');
    let subClass = 'crystal-popup-points';
    let icon = '💎';
    let text = `+${value || 250}`;

    if (type === 'emerald_crystal') {
      subClass = 'crystal-popup-emerald';
      icon = '💚';
      text = '+1 LIFE!';
    } else if (type === 'modifier') {
      subClass = 'crystal-popup-modifier';
      icon = '🃏';
      text = 'MODIFIER!';
    }

    popupEl.className = `crystal-popup ${subClass}`;
    popupEl.innerHTML = `<span class="crystal-icon">${icon}</span><span class="crystal-text">${text}</span>`;

    popupEl.style.position = 'absolute';
    popupEl.style.left = `${startX}px`;
    popupEl.style.top = `${startY - 16}px`;
    popupEl.style.transform = 'translate(-50%, -50%) scale(0.3)';
    popupEl.style.opacity = '0';
    popupEl.style.zIndex = '2600';
    popupEl.style.pointerEvents = 'none';

    this._container.appendChild(popupEl);

    // Subtle horizontal spread
    const spreadX = (Math.random() - 0.5) * 16;

    anime({
      targets: popupEl,
      scale: [
        { value: 0.3, duration: 0 },
        { value: 1.45, duration: 180, easing: 'easeOutBack' },
        { value: 1.15, duration: 250, easing: 'easeInOutQuad' },
        { value: 0.95, duration: 270, easing: 'easeInQuad' }
      ],
      translateX: [
        { value: 0, duration: 0 },
        { value: spreadX, duration: 750, easing: 'easeOutSine' }
      ],
      translateY: [
        { value: 0, duration: 0 },
        { value: -65, duration: 750, easing: 'easeOutCubic' }
      ],
      opacity: [
        { value: 0, duration: 0 },
        { value: 1.0, duration: 100, easing: 'linear' },
        { value: 1.0, duration: 420 },
        { value: 0.0, duration: 230, easing: 'easeOutQuad' }
      ],
      duration: 750,
      complete: () => {
        if (popupEl.parentNode) {
          popupEl.parentNode.removeChild(popupEl);
        }
      }
    });
  }

  projectToScreen(worldX, worldY, worldZ, camera, renderer) {
    this._tempPos.set(worldX, worldY, worldZ);
    if (this._boardGroup) {
      this._tempPos.applyMatrix4(this._boardGroup.matrixWorld);
    }
    this._tempPos.project(camera);
    const widthHalf = renderer.domElement.clientWidth / 2;
    const heightHalf = renderer.domElement.clientHeight / 2;
    return {
      x: (this._tempPos.x * widthHalf) + widthHalf,
      y: -(this._tempPos.y * heightHalf) + heightHalf
    };
  }

  dispose() {
    if (this._unsubs && this._unsubs.length) {
      for (const unsub of this._unsubs) {
        if (typeof unsub === 'function') unsub();
      }
      this._unsubs = [];
    }
    const coins = this._container?.querySelectorAll('.coin-popup');
    if (coins) {
      coins.forEach(c => c.remove());
    }
    const popups = this._container?.querySelectorAll('.points-popup');
    if (popups) {
      popups.forEach(p => p.remove());
    }
    const crystalPopups = this._container?.querySelectorAll('.crystal-popup');
    if (crystalPopups) {
      crystalPopups.forEach(p => p.remove());
    }
    this._camera = null;
    this._renderer = null;
    this._boardGroup = null;
  }
}
