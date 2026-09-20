import { eventBus } from '../core/EventBus.js';
import { REWARD_CONFIG } from '../config/rewardConfig.js';
import { gameStateManager, GAME_STATES } from '../core/GameStateManager.js';
import { timeManager } from '../core/TimeManager.js';
import { playSound } from '../soundfx.js';
import anime from 'animejs';

export class ModifierCardSystem {
  constructor() {
    this._container = null;
    this._cardsContainer = null;
    this._cards = [];
    this._selectedCard = null;
    this._active = false;
    this._unsubs = [];
    this._modifierId = null;
    this._savedTimeScale = 1.0;
  }

  init(uiContainer) {
    this._container = document.createElement('div');
    this._container.className = 'modifier-cards-overlay';
    this._container.style.display = 'none';
    this._container.style.position = 'fixed';
    this._container.style.inset = '0';
    this._container.style.flexDirection = 'column';
    this._container.style.alignItems = 'center';
    this._container.style.justifyContent = 'center';
    this._container.style.padding = '20px 16px';
    this._container.style.backgroundColor = 'rgba(6, 10, 24, 0.82)';
    this._container.style.backdropFilter = 'blur(10px)';
    this._container.style.webkitBackdropFilter = 'blur(10px)';
    this._container.style.zIndex = '2000';
    this._container.style.opacity = '0';
    this._container.style.pointerEvents = 'none';
    this._container.style.userSelect = 'none';
    this._container.style.webkitUserSelect = 'none';
    
    uiContainer.appendChild(this._container);

    this._unsubs.push(
      eventBus.on('modifier:collected', this._onModifierCollected.bind(this))
    );
  }

  _onModifierCollected({ id }) {
    if (this._active) return;
    this._active = true;
    this._modifierId = id;
    this._selectedCard = null;
    
    this._savedTimeScale = timeManager.targetTimeScale || 1.0;
    timeManager.targetTimeScale = 0.04;
    gameStateManager.setState(GAME_STATES.MODIFIER_SELECTION);
    
    // Clear container
    this._container.innerHTML = '';
    
    // Title header
    const header = document.createElement('div');
    header.className = 'modifier-selection-header';
    header.style.textAlign = 'center';
    header.style.marginBottom = '22px';
    header.style.pointerEvents = 'none';
    header.innerHTML = `
      <div style="font-size:clamp(20px, 5vw, 26px);font-weight:900;color:#ff33cc;text-shadow:0 0 16px rgba(255,51,204,0.7),0 0 30px rgba(255,51,204,0.4);letter-spacing:2px;margin-bottom:6px;text-transform:uppercase;">
        🃏 WYBIERZ KARTĘ MODYFIKATORA
      </div>
      <div style="font-size:clamp(12px, 3.2vw, 14px);color:rgba(255,255,255,0.8);letter-spacing:0.5px;">
        Odkryto różowy kryształ! Wybierz jedną z poniższych kart:
      </div>
    `;
    this._container.appendChild(header);

    // Cards row container
    this._cardsContainer = document.createElement('div');
    this._cardsContainer.className = 'modifier-cards-row';
    this._cardsContainer.style.display = 'flex';
    this._cardsContainer.style.gap = '16px';
    this._cardsContainer.style.justifyContent = 'center';
    this._cardsContainer.style.alignItems = 'stretch';
    this._cardsContainer.style.flexWrap = 'wrap';
    this._cardsContainer.style.maxWidth = '840px';
    this._cardsContainer.style.width = '100%';
    this._cardsContainer.style.pointerEvents = 'auto';
    this._container.appendChild(this._cardsContainer);

    // Get 3 distinct random cards from pool
    const allCards = REWARD_CONFIG.modifiers?.cards || [];
    let selection = [];
    if (allCards.length >= 3) {
      const shuffled = [...allCards].sort(() => Math.random() - 0.5);
      selection = shuffled.slice(0, 3);
    } else if (allCards.length > 0) {
      selection = [...allCards];
    } else {
      // Fallback dummy cards
      selection.push(
        { id: '1', title: 'Speed', description: 'Szybszy ruch bili', effectType: 'speedMultiplier', effectValue: 1.4, duration: 15, icon: '💨', rarity: 'common' },
        { id: '2', title: 'Score ×2', description: 'Podwójne punkty za kafelki', effectType: 'scoreMultiplier', effectValue: 2, duration: 30, icon: '⭐', rarity: 'uncommon' },
        { id: '3', title: 'Lucky Find', description: 'Szybsze odkrywanie kryształów', effectType: 'findingProbability', effectValue: 0.35, duration: 20, icon: '🔮', rarity: 'rare' }
      );
    }
    
    this._cards = selection;
    
    selection.forEach((cardData, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'modifier-card';
      cardEl.tabIndex = 0;

      // Color scheme based on rarity
      let accentColor = '#00f0ff';
      let glowColor = 'rgba(0, 240, 255, 0.45)';
      let badgeBg = 'rgba(0, 240, 255, 0.15)';
      const rarity = (cardData.rarity || 'common').toLowerCase();
      if (rarity === 'legendary') {
        accentColor = '#bf5af2';
        glowColor = 'rgba(191, 90, 242, 0.55)';
        badgeBg = 'rgba(191, 90, 242, 0.2)';
      } else if (rarity === 'rare') {
        accentColor = '#ff375f';
        glowColor = 'rgba(255, 55, 95, 0.55)';
        badgeBg = 'rgba(255, 55, 95, 0.2)';
      } else if (rarity === 'uncommon') {
        accentColor = '#ffd60a';
        glowColor = 'rgba(255, 214, 10, 0.55)';
        badgeBg = 'rgba(255, 214, 10, 0.2)';
      }

      cardEl.style.width = 'clamp(180px, 28vw, 230px)';
      cardEl.style.minHeight = '280px';
      cardEl.style.background = 'linear-gradient(155deg, rgba(20, 26, 48, 0.95), rgba(10, 14, 28, 0.96))';
      cardEl.style.border = `2px solid ${accentColor}`;
      cardEl.style.boxShadow = `0 10px 30px rgba(0,0,0,0.7), 0 0 18px ${glowColor}`;
      cardEl.style.borderRadius = '16px';
      cardEl.style.padding = '18px 14px';
      cardEl.style.cursor = 'pointer';
      cardEl.style.display = 'flex';
      cardEl.style.flexDirection = 'column';
      cardEl.style.alignItems = 'center';
      cardEl.style.justifyContent = 'space-between';
      cardEl.style.transform = 'translateY(40px)';
      cardEl.style.opacity = '0';
      cardEl.style.pointerEvents = 'auto';
      cardEl.style.touchAction = 'manipulation';
      cardEl.style.userSelect = 'none';
      cardEl.style.webkitUserSelect = 'none';
      cardEl.style.transition = 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease';
      
      const badgeHtml = cardData.duration > 0
        ? `+${cardData.duration}s Czas gry ⏱️`
        : (cardData.effectType === 'bombCluster' ? `💣 ${cardData.effectValue || 3} Bomby` : '⚡ Aktywacja');

      cardEl.innerHTML = `
        <div style="font-size:42px;margin-bottom:6px;line-height:1;pointer-events:none;">${cardData.icon || '🃏'}</div>
        <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${accentColor};background:${badgeBg};padding:3px 10px;border-radius:10px;border:1px solid ${accentColor};margin-bottom:10px;pointer-events:none;">${rarity}</div>
        <div class="modifier-card-title" style="font-weight:800;font-size:18px;color:#fff;margin-bottom:8px;text-align:center;pointer-events:none;">${cardData.title}</div>
        <div class="modifier-card-desc" style="flex-grow:1;text-align:center;font-size:13px;color:rgba(255,255,255,0.78);line-height:1.35;margin-bottom:12px;pointer-events:none;">${cardData.description || cardData.desc || ''}</div>
        <div class="modifier-card-rarity" style="font-size:12px;font-weight:bold;color:${accentColor};background:${badgeBg};padding:5px 10px;border-radius:12px;border:1px solid ${accentColor};margin-bottom:14px;pointer-events:none;text-align:center;width:100%;">${badgeHtml}</div>
        <button class="modifier-pick-btn" style="width:100%;padding:9px 0;background:linear-gradient(135deg, ${accentColor}, #0077b6);border:none;border-radius:10px;color:#fff;font-weight:800;font-size:13px;cursor:pointer;pointer-events:none;letter-spacing:0.8px;text-transform:uppercase;box-shadow:0 4px 12px rgba(0,0,0,0.4);">Wybierz ➔</button>
      `;

      cardEl.addEventListener('mouseenter', () => {
        if (this._selectedCard === null) {
          cardEl.style.transform = 'translateY(-6px) scale(1.03)';
          cardEl.style.boxShadow = `0 14px 34px rgba(0,0,0,0.8), 0 0 26px ${glowColor}`;
        }
      });
      cardEl.addEventListener('mouseleave', () => {
        if (this._selectedCard === null) {
          cardEl.style.transform = 'translateY(0) scale(1)';
          cardEl.style.boxShadow = `0 10px 30px rgba(0,0,0,0.7), 0 0 18px ${glowColor}`;
        }
      });

      const onSelect = () => this._selectCard(index);

      cardEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      });

      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      });
      
      this._cardsContainer.appendChild(cardEl);
    });
    
    this._container.style.display = 'flex';
    this._container.style.pointerEvents = 'auto';
    
    anime({
      targets: this._container,
      opacity: 1,
      duration: 300,
      easing: 'linear'
    });
    
    anime({
      targets: this._cardsContainer.children,
      translateY: [40, 0],
      opacity: [0, 1],
      delay: anime.stagger(100),
      duration: 450,
      easing: 'easeOutQuad'
    });
    
    if (this._cardsContainer.firstChild) {
      this._cardsContainer.firstChild.focus();
    }
  }

  _selectCard(cardIndex) {
    if (this._selectedCard !== null) return; // Prevent double select
    this._selectedCard = cardIndex;
    
    try {
      playSound(1650, 0.35);
    } catch (_) {}

    const cardData = this._cards[cardIndex];
    const cards = Array.from(this._cardsContainer ? this._cardsContainer.children : []);
    
    cards.forEach((card, idx) => {
      card.style.pointerEvents = 'none';
      if (idx !== cardIndex) {
        anime({
          targets: card,
          opacity: 0,
          scale: 0.8,
          duration: 300,
          easing: 'easeInQuad'
        });
      } else {
        card.style.boxShadow = '0 0 35px rgba(0, 255, 204, 1), 0 0 50px rgba(0, 255, 204, 0.6)';
        card.style.borderColor = '#00ffcc';
        anime({
          targets: card,
          scale: 1.08,
          duration: 350,
          easing: 'easeOutBack'
        });
      }
    });
    
    this._applyEffect(cardData);
    eventBus.emit('modifier:selected', { id: this._modifierId, card: cardData });
    
    setTimeout(() => {
      this.hide();
      timeManager.targetTimeScale = this._savedTimeScale || 1.0;
      if (gameStateManager.state === GAME_STATES.MODIFIER_SELECTION) {
        gameStateManager.setState(GAME_STATES.PLAYING);
      }
    }, 850);
  }

  _applyEffect(card) {
    const val = card.effectValue ?? card.value ?? 1;
    const dur = card.duration ?? 10;
    card.value = val;
    card.effectValue = val;

    if (card.effectType === 'scoreMultiplier') {
      // Event already emitted will be caught by ScoreSystem
    } else if (card.effectType === 'speedMultiplier') {
      eventBus.emit('modifier:speed', { value: val, duration: dur });
    } else if (card.effectType === 'findingProbability') {
      eventBus.emit('modifier:finding', { value: val, duration: dur });
    } else if (card.effectType === 'bombCluster') {
      eventBus.emit('card:grantBombs', { count: val || 3 });
    } else if (card.effectType === 'dragonCompanion') {
      eventBus.emit('card:summonDragon', { duration: dur || 6 });
    }
  }

  hide() {
    this._container.style.pointerEvents = 'none';
    anime({
      targets: this._container,
      opacity: 0,
      duration: 280,
      easing: 'linear',
      complete: () => {
        this._container.style.display = 'none';
        this._container.style.pointerEvents = 'none';
        this._container.innerHTML = '';
        this._cardsContainer = null;
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
