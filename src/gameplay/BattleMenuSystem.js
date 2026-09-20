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
    this._container.style.bottom = '95px';
    this._container.style.left = '0';
    this._container.style.right = '0';
    this._container.style.margin = '0 auto';
    this._container.style.width = 'max-content';
    this._container.style.backgroundColor = 'rgba(8, 14, 28, 0.88)';
    this._container.style.backdropFilter = 'blur(12px)';
    this._container.style.webkitBackdropFilter = 'blur(12px)';
    this._container.style.border = '1.5px solid rgba(0, 229, 255, 0.5)';
    this._container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 229, 255, 0.25)';
    this._container.style.color = 'white';
    this._container.style.padding = '18px 24px';
    this._container.style.borderRadius = '16px';
    this._container.style.display = 'none';
    this._container.style.opacity = '0';
    this._container.style.zIndex = '1500';
    this._container.style.pointerEvents = 'auto';

    const title = document.createElement('h3');
    title.className = 'battle-menu-title';
    title.innerText = '⚡ BATTLE & EQUIPMENT';
    title.style.margin = '0 0 15px 0';
    title.style.textAlign = 'center';
    title.style.color = '#00f0ff';
    title.style.letterSpacing = '1.5px';
    title.style.fontSize = '16px';
    title.style.fontWeight = '800';
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
      slot.style.border = '2px solid rgba(0, 229, 255, 0.3)';
      slot.style.borderRadius = '12px';
      slot.style.background = 'rgba(255, 255, 255, 0.05)';
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
    closeBtn.className = 'hud-touch-btn';
    closeBtn.innerText = '✕ Wróć do gry';
    closeBtn.style.padding = '8px 20px';
    closeBtn.style.fontSize = '13px';
    closeBtn.style.pointerEvents = 'auto';
    closeBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.close();
    });
    closeBtn.addEventListener('click', () => this.close());
    actions.appendChild(closeBtn);

    this._container.appendChild(actions);
    uiContainer.appendChild(this._container);
  }

  toggle() {
    if (this._active) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this._active) return;
    const currentState = gameStateManager.state;
    if (currentState !== GAME_STATES.PLAYING && currentState !== GAME_STATES.SELECTION) return;
    
    this._active = true;
    this._savedState = currentState;
    this._savedTimeScale = timeManager.targetTimeScale || 1.0;
    timeManager.targetTimeScale = GAME_CONFIG?.slowMotion?.scale || 0.04;
    gameStateManager.setState(GAME_STATES.SLOW_MOTION_MENU);

    eventBus.emit('battleMenu:stateChanged', { active: true });

    this._container.style.display = 'block';
    this._updateSlotDisplay();

    if (typeof anime.remove === 'function') {
      anime.remove(this._container);
    }
    anime({
      targets: this._container,
      translateY: [40, 0],
      opacity: [0, 1],
      duration: 350,
      easing: 'easeOutCubic'
    });
  }

  close() {
    if (!this._active) return;
    
    this._active = false;
    timeManager.targetTimeScale = this._savedTimeScale || 1.0;
    if (gameStateManager.state === GAME_STATES.SLOW_MOTION_MENU) {
      gameStateManager.setState(this._savedState || GAME_STATES.PLAYING);
    }
    this._savedState = null;
    eventBus.emit('battleMenu:stateChanged', { active: false });

    if (typeof anime.remove === 'function') {
      anime.remove(this._container);
    }
    anime({
      targets: this._container,
      translateY: [0, 30],
      opacity: [1, 0],
      duration: 250,
      easing: 'easeInCubic',
      complete: () => {
        this._container.style.display = 'none';
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
