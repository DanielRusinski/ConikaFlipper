import { eventBus } from '../core/EventBus.js';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import anime from 'animejs';

export class ModifierCardSystem {
  constructor() {
    this._container = null;
    this._cards = [];
    this._selectedCard = null;
    this._active = false;
    this._unsubs = [];
    this._modifierId = null;
  }

  init(uiContainer) {
    this._container = document.createElement('div');
    this._container.className = 'modifier-cards';
    this._container.style.display = 'none';
    this._container.style.position = 'absolute';
    this._container.style.top = '0';
    this._container.style.left = '0';
    this._container.style.width = '100%';
    this._container.style.height = '100%';
    this._container.style.display = 'flex';
    this._container.style.alignItems = 'center';
    this._container.style.justifyContent = 'center';
    this._container.style.gap = '20px';
    this._container.style.backgroundColor = 'rgba(0,0,0,0.5)';
    this._container.style.zIndex = '2000';
    this._container.style.opacity = '0';
    
    uiContainer.appendChild(this._container);

    this._unsubs.push(
      eventBus.on('modifier:collected', this._onModifierCollected.bind(this))
    );
  }

  _onModifierCollected({ id }) {
    if (this._active) return;
    this._active = true;
    this._modifierId = id;
    
    gameStateManager.setState(GAME_STATES.MODIFIER_SELECTION);
    
    // Clear container
    this._container.innerHTML = '';
    
    // Get 3 random cards
    const allCards = REWARD_CONFIG.modifiers?.cards || [];
    const selection = [];
    if (allCards.length > 0) {
      for (let i = 0; i < 3; i++) {
        selection.push(allCards[Math.floor(Math.random() * allCards.length)]);
      }
    } else {
      // Fallback dummy cards
      selection.push(
        { id: '1', title: 'Speed', desc: 'Faster ball', effectType: 'speedMultiplier', value: 1.5, duration: 10 },
        { id: '2', title: 'Points', desc: '2x Points', effectType: 'scoreMultiplier', value: 2, duration: 10 },
        { id: '3', title: 'Luck', desc: 'More items', effectType: 'findingProbability', value: 0.5, duration: 10 }
      );
    }
    
    this._cards = selection;
    
    selection.forEach((cardData, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'modifier-card';
      cardEl.style.width = '200px';
      cardEl.style.height = '300px';
      cardEl.style.backgroundColor = 'white';
      cardEl.style.borderRadius = '10px';
      cardEl.style.padding = '20px';
      cardEl.style.cursor = 'pointer';
      cardEl.style.display = 'flex';
      cardEl.style.flexDirection = 'column';
      cardEl.style.alignItems = 'center';
      cardEl.style.transform = 'translateY(50px)';
      cardEl.style.opacity = '0';
      cardEl.tabIndex = 0;
      
      const badgeHtml = cardData.duration > 0
        ? `+${cardData.duration}s Time Added ⏱️`
        : `💣 ${cardData.effectValue || 3} Bomby gotowe`;

      cardEl.innerHTML = `
        <div class="modifier-card-title" style="font-weight:bold;font-size:20px;margin-bottom:10px;">${cardData.icon ? cardData.icon + ' ' : ''}${cardData.title}</div>
        <div class="modifier-card-desc" style="flex-grow:1;text-align:center;font-size:14px;color:#333;margin-bottom:12px;">${cardData.description || cardData.desc || ''}</div>
        <div class="modifier-card-rarity" style="font-size:14px;font-weight:bold;color:#00887a;background:rgba(0,255,204,0.15);padding:4px 10px;border-radius:12px;border:1px solid rgba(0,180,150,0.3);">${badgeHtml}</div>
      `;
      
      const onSelect = () => this._selectCard(index);
      cardEl.addEventListener('click', onSelect);
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      });
      
      this._container.appendChild(cardEl);
    });
    
    this._container.style.display = 'flex';
    
    anime({
      targets: this._container,
      opacity: 1,
      duration: 300,
      easing: 'linear'
    });
    
    anime({
      targets: this._container.childNodes,
      translateY: 0,
      opacity: 1,
      delay: anime.stagger(100),
      duration: 500,
      easing: 'easeOutQuad'
    });
    
    if (this._container.firstChild) {
      this._container.firstChild.focus();
    }
  }

  _selectCard(cardIndex) {
    if (this._selectedCard !== null) return; // Prevent double select
    this._selectedCard = cardIndex;
    
    const cardData = this._cards[cardIndex];
    const cards = Array.from(this._container.childNodes);
    
    cards.forEach((card, idx) => {
      if (idx !== cardIndex) {
        anime({
          targets: card,
          opacity: 0,
          scale: 0.8,
          duration: 300,
          easing: 'easeInQuad'
        });
      } else {
        anime({
          targets: card,
          scale: 1.1,
          boxShadow: '0 0 20px rgba(255,255,255,0.8)',
          duration: 300,
          easing: 'easeOutQuad'
        });
      }
    });
    
    this._applyEffect(cardData);
    eventBus.emit('modifier:selected', { id: this._modifierId, card: cardData });
    
    setTimeout(() => {
      this.hide();
      if (gameStateManager.state === GAME_STATES.MODIFIER_SELECTION) {
        gameStateManager.setState(GAME_STATES.PLAYING);
      }
    }, 1000);
  }

  _applyEffect(card) {
    if (card.effectType === 'scoreMultiplier') {
      // Event already emitted above will be caught by ScoreSystem
    } else if (card.effectType === 'speedMultiplier') {
      eventBus.emit('modifier:speed', { value: card.value, duration: card.duration });
    } else if (card.effectType === 'findingProbability') {
      eventBus.emit('modifier:finding', { value: card.value, duration: card.duration });
    } else if (card.effectType === 'bombCluster') {
      eventBus.emit('card:grantBombs', { count: card.effectValue || 3 });
    } else if (card.effectType === 'dragonCompanion') {
      eventBus.emit('card:summonDragon', { duration: card.duration || 6 });
    }
  }

  hide() {
    anime({
      targets: this._container,
      opacity: 0,
      duration: 300,
      easing: 'linear',
      complete: () => {
        this._container.style.display = 'none';
        this._container.innerHTML = '';
        this._active = false;
        this._selectedCard = null;
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
