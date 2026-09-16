import * as THREE from 'three';
import { eventBus } from '../core/EventBus.js';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import anime from 'animejs';

export class CoinRewardSystem {
  constructor() {
    this._container = null;
    this._unsub = null;
    this._camera = null;
    this._renderer = null;
    this._tempPos = new THREE.Vector3();
  }

  init(uiContainer, boardGroup = null) {
    this._container = uiContainer;
    this._boardGroup = boardGroup;
    this._unsub = eventBus.on('tile:discovered', this._onTileDiscovered.bind(this));
  }

  update(camera, renderer) {
    this._camera = camera;
    this._renderer = renderer;
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
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    const coins = this._container?.querySelectorAll('.coin-popup');
    if (coins) {
      coins.forEach(c => c.remove());
    }
    this._camera = null;
    this._renderer = null;
    this._boardGroup = null;
  }
}
