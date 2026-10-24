import { eventBus } from '../core/EventBus.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import { timeManager } from '../core/TimeManager.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { saveMigrationService } from '../core/SaveMigrationService.js';
import { resolvedStatService } from '../progression/ResolvedStatService.js';
import { CONSUMABLE_DEFINITIONS } from '../config/equipmentConfig.js';
import { renderIconHTML } from '../ui/IconService.js';
import anime from 'animejs';

export class BattleMenuSystem {
  constructor() {
    this._container = null;
    this._active = false;
    this._savedTimeScale = 1;
    this._unsubs = [];
    this._domSlots = [];
    this._inventory = null;
    this._bombSystem = null;
    this._ballLifeSystem = null;
    this._consumableTypes = ['health_potion', 'bomb_pack', 'time_capsule', 'speed_tonic'];
  }

  init(uiContainer, dependencies = {}) {
    if (dependencies.inventory) this._inventory = dependencies.inventory;
    if (dependencies.bombSystem) this._bombSystem = dependencies.bombSystem;
    if (dependencies.ballLifeSystem) this._ballLifeSystem = dependencies.ballLifeSystem;

    if (typeof document === 'undefined') {
      return;
    }

    this._container = document.createElement('div');
    this._container.className = 'battle-menu-panel';
    this._container.style.position = 'absolute';
    this._container.style.bottom = '95px';
    this._container.style.left = '0';
    this._container.style.right = '0';
    this._container.style.margin = '0 auto';
    this._container.style.width = 'max-content';
    this._container.style.backgroundColor = 'rgba(8, 14, 28, 0.92)';
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
    title.innerHTML = `${renderIconHTML('lightning', { size: '36px' })} BATTLE CONSUMABLES`;
    title.style.margin = '0 0 15px 0';
    title.style.textAlign = 'center';
    title.style.color = '#00f0ff';
    title.style.letterSpacing = '1.5px';
    title.style.fontSize = '16px';
    title.style.fontWeight = '800';
    title.style.display = 'flex';
    title.style.alignItems = 'center';
    title.style.justifyContent = 'center';
    title.style.gap = '8px';
    this._container.appendChild(title);

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'battle-menu-slots';
    slotsContainer.style.display = 'flex';
    slotsContainer.style.gap = '12px';
    slotsContainer.style.marginBottom = '15px';

    this._consumableTypes.forEach((type, index) => {
      const slot = document.createElement('div');
      slot.className = 'battle-menu-slot';
      slot.dataset.type = type;
      slot.style.width = '84px';
      slot.style.height = '84px';
      slot.style.border = '2px solid rgba(0, 229, 255, 0.3)';
      slot.style.borderRadius = '12px';
      slot.style.background = 'rgba(255, 255, 255, 0.05)';
      slot.style.display = 'flex';
      slot.style.flexDirection = 'column';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';
      slot.style.cursor = 'pointer';
      slot.style.position = 'relative';
      slot.style.userSelect = 'none';
      slot.style.transition = 'all 0.2s ease';

      slot.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this.useConsumable(type);
      });

      slotsContainer.appendChild(slot);
      this._domSlots.push(slot);
    });
    this._container.appendChild(slotsContainer);

    const actions = document.createElement('div');
    actions.className = 'battle-menu-actions';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'center';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'hud-touch-btn';
    closeBtn.innerHTML = `${renderIconHTML('close', { size: '26px' })} Wróć do gry`;
    closeBtn.style.padding = '8px 20px';
    closeBtn.style.fontSize = '13px';
    closeBtn.style.pointerEvents = 'auto';
    closeBtn.style.display = 'inline-flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.gap = '6px';
    closeBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      this.close();
    });
    closeBtn.addEventListener('click', () => this.close());
    actions.appendChild(closeBtn);

    this._container.appendChild(actions);
    uiContainer.appendChild(this._container);

    this._unsubs.push(
      eventBus.on('inventory:changed', () => {
        if (this._active) this._updateSlotDisplay();
      })
    );
  }

  setDependencies({ inventory, bombSystem, ballLifeSystem }) {
    if (inventory) this._inventory = inventory;
    if (bombSystem) this._bombSystem = bombSystem;
    if (ballLifeSystem) this._ballLifeSystem = ballLifeSystem;
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
    // 0.15x slow motion radial menu per specification DEC_010 / DEC_013
    timeManager.targetTimeScale = 0.15;
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

  getConsumableCount(type) {
    const res = saveMigrationService.loadOrMigrate();
    if (res && res.save && res.save.inventory && res.save.inventory.consumables) {
      if (res.save.inventory.consumables[type] !== undefined) {
        return res.save.inventory.consumables[type];
      }
    }
    return this._inventory ? this._inventory.getItemQuantity(type) : 0;
  }

  /**
   * Attempts to consume a stored tactical consumable.
   * Decrements count in Save Schema v2 ONLY after successful use.
   */
  useConsumable(type) {
    const count = this.getConsumableCount(type);
    if (count <= 0) {
      eventBus.emit('ui:toast', { message: 'Brak przedmiotu w ekwipunku!', type: 'error' });
      return { success: false, reason: 'ITEM_NOT_OWNED' };
    }

    const def = CONSUMABLE_DEFINITIONS[type];
    if (!def) return { success: false, reason: 'UNKNOWN_CONSUMABLE' };

    let consumed = false;

    if (type === 'health_potion') {
      // Heal +1 life clamped by player.maxLives
      const maxLives = resolvedStatService.get('player.maxLives') || 5;
      const currentLives = this._ballLifeSystem ? this._ballLifeSystem.getLives() : 3;
      if (currentLives >= maxLives) {
        eventBus.emit('ui:toast', { message: 'Życia są już na maksymalnym poziomie!', type: 'warning' });
        return { success: false, reason: 'AT_MAX_CAPACITY' };
      }
      if (this._ballLifeSystem) {
        this._ballLifeSystem.addLife(1);
      }
      consumed = true;
      eventBus.emit('ui:toast', { message: '+1 Życie odnowione!', type: 'success' });
    } else if (type === 'bomb_pack') {
      // Grants bomb.grantAmount (3) bombs clamped to bomb.capacity
      const bombCap = resolvedStatService.get('bomb.capacity') || 3;
      const currentBombs = this._bombSystem ? this._bombSystem.getBombCount() : 0;

      if (currentBombs >= bombCap) {
        eventBus.emit('ui:toast', { message: 'Ładunki bomb są już na pełnej pojemności!', type: 'warning' });
        return { success: false, reason: 'AT_MAX_CAPACITY' };
      }

      const grantAmount = resolvedStatService.get('bomb.grantAmount') || 3;
      const amountToAdd = Math.min(grantAmount, bombCap - currentBombs);
      if (this._bombSystem) {
        this._bombSystem.addBombs(amountToAdd);
      }
      consumed = true;
      eventBus.emit('ui:toast', { message: `+${amountToAdd} Bomb dodane do zasobnika!`, type: 'success' });
    } else if (type === 'time_capsule') {
      // Grants +45 seconds to stage timer
      eventBus.emit('timer:add', { seconds: 45 });
      consumed = true;
      eventBus.emit('ui:toast', { message: '+45s Czasu etapu!', type: 'success' });
    } else if (type === 'speed_tonic') {
      // 1.35x speed boost for 25 seconds (Layer 6 Temporary Modifier)
      resolvedStatService.addModifier({
        id: 'MOD_TONIC_SPEED',
        statKey: 'ball.speedScale',
        operation: 'MULTIPLY',
        value: 1.35,
        layer: 6,
        sourceId: 'speed_tonic'
      });
      eventBus.emit('tonic:speedActivated', { duration: 25.0, multiplier: 1.35 });

      // Auto-revert after duration
      setTimeout(() => {
        resolvedStatService.removeModifier('MOD_TONIC_SPEED');
        eventBus.emit('tonic:speedExpired');
      }, 25000);

      consumed = true;
      eventBus.emit('ui:toast', { message: 'Tonik Szybkości (+35% prędkości na 25s)!', type: 'success' });
    }

    if (consumed) {
      // Atomically decrement count in Save Schema v2 and InventorySystem
      const res = saveMigrationService.loadOrMigrate();
      if (res && res.save && res.save.inventory && res.save.inventory.consumables) {
        res.save.inventory.consumables[type] = Math.max(0, (res.save.inventory.consumables[type] || 0) - 1);
        saveMigrationService.commitV2(res.save);
      }
      if (this._inventory) {
        this._inventory.removeItem(type, 1);
      }

      this._updateSlotDisplay();
      eventBus.emit('consumable:used', { type });
      return { success: true, type };
    }

    return { success: false };
  }

  _updateSlotDisplay() {
    if (this._domSlots.length === 0) return;
    this._consumableTypes.forEach((type, index) => {
      const slot = this._domSlots[index];
      if (!slot) return;
      const def = CONSUMABLE_DEFINITIONS[type];
      const count = this.getConsumableCount(type);

      // Check full active capacity block for bomb_pack
      let isBlocked = count <= 0;
      if (type === 'bomb_pack' && this._bombSystem) {
        const bombCap = resolvedStatService.get('bomb.capacity') || 3;
        if (this._bombSystem.getBombCount() >= bombCap) {
          isBlocked = true;
        }
      }

      slot.innerHTML = `
        <div style="font-size:24px; margin-bottom:4px; display:flex; align-items:center; justify-content:center;">${renderIconHTML(def.icon, { size: '56px' })}</div>
        <div style="font-size:11px; font-weight:700; text-align:center; color:#fff; line-height:1.1;">${def.name}</div>
        <div style="font-size:11px; color:#00f0ff; font-weight:800; margin-top:3px;">x${count}</div>
      `;

      if (count > 0 && !isBlocked) {
        slot.style.opacity = '1.0';
        slot.style.cursor = 'pointer';
        slot.style.borderColor = 'rgba(0, 229, 255, 0.8)';
        slot.style.background = 'rgba(0, 229, 255, 0.12)';
      } else if (count > 0 && isBlocked) {
        slot.style.opacity = '0.5';
        slot.style.cursor = 'not-allowed';
        slot.style.borderColor = 'rgba(255, 170, 0, 0.5)';
        slot.style.background = 'rgba(255, 170, 0, 0.06)';
      } else {
        slot.style.opacity = '0.35';
        slot.style.cursor = 'not-allowed';
        slot.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        slot.style.background = 'rgba(255, 255, 255, 0.02)';
      }
    });
  }

  dispose() {
    this._unsubs.forEach(u => u());
    this._unsubs = [];
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
  }
}
