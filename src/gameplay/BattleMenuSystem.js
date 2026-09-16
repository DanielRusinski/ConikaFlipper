import { eventBus } from '../core/EventBus.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import { timeManager } from '../core/TimeManager.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import anime from 'animejs';

export class BattleMenuSystem {
  constructor() {
    this._container = null;
    this._active = false;
    this._savedTimeScale = 1;
    this._items = [];
    this._unsubs = [];
    this._domSlots = [];
  }

  init(uiContainer) {
    this._container = document.createElement('div');
    this._container.className = 'battle-menu-panel';
    this._container.style.position = 'absolute';
    this._container.style.bottom = '20px';
    this._container.style.left = '50%';
    this._container.style.transform = 'translateX(-50%) translateY(100px)';
    this._container.style.backgroundColor = 'rgba(0,0,0,0.8)';
    this._container.style.color = 'white';
    this._container.style.padding = '20px';
    this._container.style.borderRadius = '10px';
    this._container.style.display = 'none';
    this._container.style.opacity = '0';
    this._container.style.zIndex = '1500';

    const title = document.createElement('h3');
    title.className = 'battle-menu-title';
    title.innerText = 'Battle Menu';
    title.style.margin = '0 0 15px 0';
    title.style.textAlign = 'center';
    this._container.appendChild(title);

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'battle-menu-slots';
    slotsContainer.style.display = 'flex';
    slotsContainer.style.gap = '10px';
    slotsContainer.style.marginBottom = '15px';

    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'battle-menu-slot';
      slot.style.width = '80px';
      slot.style.height = '80px';
      slot.style.border = '2px solid #555';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';
      slot.style.cursor = 'pointer';
      slot.innerText = 'Empty';
      
      slot.addEventListener('click', () => this.useItem(i));
      slotsContainer.appendChild(slot);
      this._domSlots.push(slot);
    }
    this._container.appendChild(slotsContainer);

    const actions = document.createElement('div');
    actions.className = 'battle-menu-actions';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'center';
    
    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close';
    closeBtn.style.padding = '8px 16px';
    closeBtn.addEventListener('click', () => this.close());
    actions.appendChild(closeBtn);

    this._container.appendChild(actions);
    uiContainer.appendChild(this._container);
  }

  open() {
    if (this._active || gameStateManager.state !== GAME_STATES.PLAYING) return;
    
    this._active = true;
    this._savedTimeScale = timeManager.timeScale;
    timeManager.timeScale = GAME_CONFIG?.slowMotion?.scale || 0.1;
    gameStateManager.setState(GAME_STATES.SLOW_MOTION_MENU);

    this._container.style.display = 'block';
    
    this._updateSlotDisplay();

    anime({
      targets: this._container,
      translateY: 0,
      opacity: 1,
      duration: 400,
      easing: 'easeOutExpo'
    });
  }

  close() {
    if (!this._active) return;
    
    anime({
      targets: this._container,
      translateY: 100,
      opacity: 0,
      duration: 300,
      easing: 'easeInExpo',
      complete: () => {
        this._container.style.display = 'none';
        this._active = false;
        timeManager.timeScale = this._savedTimeScale;
        if (gameStateManager.state === GAME_STATES.SLOW_MOTION_MENU) {
          gameStateManager.setState(GAME_STATES.PLAYING);
        }
      }
    });
  }

  addItem(item) {
    if (this._items.length < 3) {
      this._items.push(item);
      if (this._active) this._updateSlotDisplay();
    }
  }

  useItem(slotIndex) {
    if (slotIndex >= 0 && slotIndex < this._items.length) {
      const item = this._items[slotIndex];
      eventBus.emit('item:used', { item });
      this._items.splice(slotIndex, 1);
      this._updateSlotDisplay();
      
      if (this._items.length === 0) {
        setTimeout(() => this.close(), 300);
      }
    }
  }

  _updateSlotDisplay() {
    for (let i = 0; i < 3; i++) {
      if (i < this._items.length) {
        this._domSlots[i].innerText = this._items[i].name || 'Item';
        this._domSlots[i].style.borderColor = '#0f0';
      } else {
        this._domSlots[i].innerText = 'Empty';
        this._domSlots[i].style.borderColor = '#555';
      }
    }
  }

  update() {
    // Reserved for timers
  }

  dispose() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
  }
}
