import anime from 'animejs';
import { eventBus } from '../core/EventBus.js';
import { SHOP_CATEGORIES, SHOP_UI_STATES, SHOP_ENTRY_CONTEXTS, SHOP_CONFIG } from './ShopConfig.js';
import { itemDatabase } from './ItemDatabase.js';
import { shopService } from './ShopService.js';
import { playSound } from '../soundfx.js';
import { renderIconHTML } from '../ui/IconService.js';

export class ShopUI {
  constructor() {
    this._container = null;
    this._el = null;
    this._state = SHOP_UI_STATES.CLOSED;
    this._currentContext = SHOP_ENTRY_CONTEXTS.PRE_LEVEL;
    this._inventory = null;

    // View state
    this._mode = 'buy'; // 'buy' | 'sell'
    this._selectedCategory = 'accessories';
    this._selectedProductId = null;
    this._selectedQuantity = 1;

    // DOM references
    this._windowEl = null;
    this._yellowBalanceEl = null;
    this._redBalanceEl = null;
    this._contextBadgeEl = null;
    this._tabBuyBtn = null;
    this._tabSellBtn = null;
    this._categoriesBarEl = null;
    this._itemsContainerEl = null;
    this._detailPaneEl = null;
    this._toastEl = null;
    this._toastTimeout = null;

    this._unsubs = [];
  }

  init(container) {
    this._container = container;

    this._el = document.createElement('div');
    this._el.id = 'shop-overlay';
    this._el.className = 'hidden';

    this._el.innerHTML = `
      <div class="shop-backdrop"></div>
      <div class="shop-window" role="dialog" aria-modal="true" aria-label="Sklep">
        <!-- Header -->
        <header class="shop-header">
          <div class="shop-title-group">
            <span class="shop-title-icon">${renderIconHTML('shop_bag', { size: '48px' })}</span>
            <h2 class="shop-title-text">Sklep</h2>
            <span id="shop-context-badge" class="shop-context-badge">Przed Etapem</span>
          </div>

          <!-- Currency Balances -->
          <div class="shop-wallet">
            <div class="shop-wallet-pill yellow" title="Żółte monety">
              <span>${renderIconHTML('coin_yellow', { size: '32px' })}</span>
              <span id="shop-yellow-balance">0</span>
            </div>
            <div class="shop-wallet-pill red" title="Czerwone monety">
              <span>${renderIconHTML('coin_red', { size: '32px' })}</span>
              <span id="shop-red-balance">0</span>
            </div>
          </div>

          <button id="shop-close-btn" class="shop-close-btn" type="button" aria-label="Zamknij sklep">${renderIconHTML('close', { size: '32px' })}</button>
        </header>

        <!-- Buy / Sell Mode Tabs -->
        <nav class="shop-tabs">
          <button id="shop-tab-buy" class="shop-tab-btn active" type="button" style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">${renderIconHTML('cart', { size: '32px' })} Kupuj (Buy)</button>
          <button id="shop-tab-sell" class="shop-tab-btn" type="button" style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">${renderIconHTML('money_bag', { size: '32px' })} Sprzedaj (Sell)</button>
        </nav>

        <!-- Category Selector -->
        <div id="shop-categories-bar" class="shop-categories-bar"></div>

        <!-- Main Body -->
        <div class="shop-body">
          <div id="shop-items-container" class="shop-items-container"></div>
          <div id="shop-detail-pane" class="shop-detail-pane"></div>
        </div>

        <!-- Floating Toast Feedback -->
        <div id="shop-toast" class="shop-toast"></div>
      </div>
    `;

    this._container.appendChild(this._el);

    // Grab elements
    this._windowEl = this._el.querySelector('.shop-window');
    this._yellowBalanceEl = this._el.querySelector('#shop-yellow-balance');
    this._redBalanceEl = this._el.querySelector('#shop-red-balance');
    this._contextBadgeEl = this._el.querySelector('#shop-context-badge');
    this._tabBuyBtn = this._el.querySelector('#shop-tab-buy');
    this._tabSellBtn = this._el.querySelector('#shop-tab-sell');
    this._categoriesBarEl = this._el.querySelector('#shop-categories-bar');
    this._itemsContainerEl = this._el.querySelector('#shop-items-container');
    this._detailPaneEl = this._el.querySelector('#shop-detail-pane');
    this._toastEl = this._el.querySelector('#shop-toast');

    // Prevent background scrolling / canvas drag when touching or scrolling shop
    this._el.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    this._el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Close button
    const closeBtn = this._el.querySelector('#shop-close-btn');
    this._bindTrigger(closeBtn, () => this.close());

    // Backdrop click to close
    const backdrop = this._el.querySelector('.shop-backdrop');
    this._bindTrigger(backdrop, () => this.close());

    // Tabs
    this._bindTrigger(this._tabBuyBtn, () => this._switchMode('buy'));
    this._bindTrigger(this._tabSellBtn, () => this._switchMode('sell'));

    // Render category chips
    this._renderCategoriesBar();

    // Listen for currency and inventory updates
    this._unsubs.push(
      eventBus.on('currency:changed', (data) => this._updateBalances(data)),
      eventBus.on('inventory:changed', () => this._refreshView())
    );
  }

  // ==========================================
  // OPEN & CLOSE LIFECYCLE
  // ==========================================

  show(data = {}) {
    if (this._state === SHOP_UI_STATES.OPEN || this._state === SHOP_UI_STATES.OPENING) {
      return;
    }

    this._state = SHOP_UI_STATES.OPENING;
    this._currentContext = data.context || SHOP_ENTRY_CONTEXTS.PRE_LEVEL;
    this._inventory = data.inventory || shopService.getInventory();
    if (this._inventory) {
      shopService.setInventory(this._inventory);
    }

    // Set context badge
    if (this._contextBadgeEl) {
      if (this._currentContext === SHOP_ENTRY_CONTEXTS.IN_LEVEL_SHOP_TILE) {
        this._contextBadgeEl.textContent = 'Pole Sklepu';
        this._contextBadgeEl.style.color = '#00f0ff';
        this._contextBadgeEl.style.borderColor = 'rgba(0, 240, 255, 0.5)';
        this._contextBadgeEl.style.background = 'rgba(0, 240, 255, 0.15)';
      } else {
        this._contextBadgeEl.textContent = 'Przed Etapem';
        this._contextBadgeEl.style.color = '#ffd93d';
        this._contextBadgeEl.style.borderColor = 'rgba(255, 217, 61, 0.5)';
        this._contextBadgeEl.style.background = 'rgba(255, 217, 61, 0.15)';
      }
    }

    // Update wallet balances
    this._updateBalances();

    // Reset default view selection
    this._mode = 'buy';
    this._selectedCategory = 'accessories';
    this._tabBuyBtn.classList.add('active');
    this._tabSellBtn.classList.remove('active');
    this._categoriesBarEl.style.display = 'flex';

    this._selectFirstAvailableProduct();
    this._refreshView();

    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';

    anime({
      targets: this._windowEl,
      scale: [0.92, 1.0],
      opacity: [0, 1],
      duration: 320,
      easing: 'easeOutBack',
      complete: () => {
        this._state = SHOP_UI_STATES.OPEN;
      }
    });

    eventBus.emit('shop:open', { context: this._currentContext });
  }

  close() {
    if (this._state === SHOP_UI_STATES.CLOSED || this._state === SHOP_UI_STATES.CLOSING) {
      return;
    }

    this._state = SHOP_UI_STATES.CLOSING;

    anime({
      targets: this._windowEl,
      scale: [1.0, 0.94],
      opacity: [1, 0],
      duration: 220,
      easing: 'easeInQuad',
      complete: () => {
        this._el.classList.add('hidden');
        this._el.style.display = 'none';
        this._state = SHOP_UI_STATES.CLOSED;

        eventBus.emit('shop:close', { context: this._currentContext });
      }
    });
  }

  hide() {
    this.close();
  }

  getState() {
    return this._state;
  }

  // ==========================================
  // VIEW SWITCHING & RENDERING
  // ==========================================

  _switchMode(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this._selectedQuantity = 1;

    playSound(700, 0.08);

    if (mode === 'buy') {
      this._tabBuyBtn.classList.add('active');
      this._tabSellBtn.classList.remove('active');
      this._categoriesBarEl.style.display = 'flex';
    } else {
      this._tabBuyBtn.classList.remove('active');
      this._tabSellBtn.classList.add('active');
      // Hide categories in Sell mode or filter by sellable
      this._categoriesBarEl.style.display = 'none';
    }

    this._selectFirstAvailableProduct();
    this._refreshView();
  }

  _selectFirstAvailableProduct() {
    if (this._mode === 'buy') {
      const items = itemDatabase.getByCategory(this._selectedCategory);
      this._selectedProductId = items.length > 0 ? items[0].id : null;
    } else {
      const sellables = this._inventory ? this._inventory.getSellableItems() : [];
      this._selectedProductId = sellables.length > 0 ? sellables[0].item.id : null;
    }
    this._selectedQuantity = 1;
  }

  _renderCategoriesBar() {
    this._categoriesBarEl.innerHTML = '';

    for (const cat of SHOP_CATEGORIES) {
      const chip = document.createElement('button');
      chip.className = `shop-category-chip ${cat.id === this._selectedCategory ? 'active' : ''}`;
      chip.type = 'button';
      chip.dataset.categoryId = cat.id;
      chip.innerHTML = `<span style="display:inline-flex; align-items:center;">${renderIconHTML(cat.icon, { size: '32px' })}</span><span>${cat.label}</span>`;

      this._bindTrigger(chip, () => {
        if (this._selectedCategory !== cat.id) {
          this._selectedCategory = cat.id;
          playSound(600, 0.06);

          // Update active chip styling
          const allChips = this._categoriesBarEl.querySelectorAll('.shop-category-chip');
          allChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');

          this._selectFirstAvailableProduct();
          this._refreshView();
        }
      });

      this._categoriesBarEl.appendChild(chip);
    }
  }

  _refreshView() {
    this._renderItemsList();
    this._renderDetailPane();
  }

  _renderItemsList() {
    this._itemsContainerEl.innerHTML = '';

    if (this._mode === 'buy') {
      const products = itemDatabase.getByCategory(this._selectedCategory);
      if (products.length === 0) {
        this._itemsContainerEl.innerHTML = `<div class="shop-empty-state">Brak produktów w tej kategorii.</div>`;
        return;
      }

      for (const prod of products) {
        const card = document.createElement('div');
        const isSelected = prod.id === this._selectedProductId;
        const ownedCount = this._inventory ? this._inventory.getItemQuantity(prod.id) : 0;
        const canAfford = this._inventory ? this._inventory.canAfford(prod.priceYellow, prod.priceRed) : false;
        const isEquipped = this._inventory ? this._inventory.isEquipped(prod.id) : false;

        card.className = `shop-item-card ${isSelected ? 'selected' : ''} ${!canAfford ? 'unaffordable' : ''} ${isEquipped ? 'equipped' : ''}`;
        card.dataset.productId = prod.id;

        let badges = '';
        if (isEquipped) {
          badges += `<span class="shop-item-equipped-badge">Założona</span>`;
        }
        if (ownedCount > 0) {
          badges += `<span class="shop-item-owned-badge">x${ownedCount}</span>`;
        }

        let prices = '';
        if (prod.priceYellow > 0) {
          prices += `<span class="shop-price-badge yellow" style="display:inline-flex; align-items:center; gap:4px;">${renderIconHTML('coin_yellow', { size: '26px' })} ${prod.priceYellow}</span>`;
        }
        if (prod.priceRed > 0) {
          prices += `<span class="shop-price-badge red" style="display:inline-flex; align-items:center; gap:4px;">${renderIconHTML('coin_red', { size: '26px' })} ${prod.priceRed}</span>`;
        }
        if (prod.priceYellow === 0 && prod.priceRed === 0) {
          prices += `<span class="shop-price-badge yellow">Gratis</span>`;
        }

        card.innerHTML = `
          ${badges}
          <div class="shop-item-icon" style="display:flex; align-items:center; justify-content:center;">${renderIconHTML(prod.icon || 'package', { size: '56px' })}</div>
          <div class="shop-item-name">${prod.name}</div>
          <div class="shop-item-prices">${prices}</div>
        `;

        this._bindTrigger(card, () => {
          this._selectedProductId = prod.id;
          this._selectedQuantity = 1;
          playSound(550, 0.05);
          this._refreshView();
        });

        this._itemsContainerEl.appendChild(card);
      }
    } else {
      // Sell Mode
      const sellableEntries = this._inventory ? this._inventory.getSellableItems() : [];
      if (sellableEntries.length === 0) {
        this._itemsContainerEl.innerHTML = `
          <div class="shop-empty-state">
            <div style="font-size:32px; margin-bottom:8px; display:flex; justify-content:center;">${renderIconHTML('package', { size: '72px' })}</div>
            <div>Brak przedmiotów w ekwipunku, które można sprzedać.</div>
          </div>
        `;
        return;
      }

      for (const entry of sellableEntries) {
        const prod = entry.item;
        const isSelected = prod.id === this._selectedProductId;

        const card = document.createElement('div');
        card.className = `shop-item-card ${isSelected ? 'selected' : ''} ${entry.isEquipped ? 'equipped' : ''}`;
        card.dataset.productId = prod.id;

        let badges = '';
        if (entry.isEquipped) {
          badges += `<span class="shop-item-equipped-badge">Założona</span>`;
        }
        badges += `<span class="shop-item-owned-badge">x${entry.count}</span>`;

        let rewards = '';
        if (prod.sellYellow > 0) {
          rewards += `<span class="shop-price-badge yellow" style="display:inline-flex; align-items:center; gap:4px;">+${prod.sellYellow} ${renderIconHTML('coin_yellow', { size: '26px' })}</span>`;
        }
        if (prod.sellRed > 0) {
          rewards += `<span class="shop-price-badge red" style="display:inline-flex; align-items:center; gap:4px;">+${prod.sellRed} ${renderIconHTML('coin_red', { size: '26px' })}</span>`;
        }

        card.innerHTML = `
          ${badges}
          <div class="shop-item-icon" style="display:flex; align-items:center; justify-content:center;">${renderIconHTML(prod.icon || 'package', { size: '56px' })}</div>
          <div class="shop-item-name">${prod.name}</div>
          <div class="shop-item-prices">${rewards}</div>
        `;

        this._bindTrigger(card, () => {
          this._selectedProductId = prod.id;
          this._selectedQuantity = 1;
          playSound(550, 0.05);
          this._refreshView();
        });

        this._itemsContainerEl.appendChild(card);
      }
    }
  }

  _renderDetailPane() {
    this._detailPaneEl.innerHTML = '';

    if (!this._selectedProductId) {
      this._detailPaneEl.innerHTML = `
        <div style="margin:auto; text-align:center; color:rgba(255,255,255,0.5); font-size:13px;">
          Wybierz produkt z listy, aby zobaczyć szczegóły.
        </div>
      `;
      return;
    }

    const prod = itemDatabase.get(this._selectedProductId);
    if (!prod) return;

    const ownedCount = this._inventory ? this._inventory.getItemQuantity(prod.id) : 0;
    const isEquipped = this._inventory ? this._inventory.isEquipped(prod.id) : false;

    // Header info
    const header = document.createElement('div');
    header.className = 'shop-detail-header';
    header.innerHTML = `
      <div class="shop-detail-icon" style="display:flex; align-items:center; justify-content:center;">${renderIconHTML(prod.icon || 'package', { size: '72px' })}</div>
      <div class="shop-detail-meta">
        <div class="shop-detail-title">${prod.name}</div>
        <div class="shop-detail-category">${prod.category}</div>
      </div>
    `;
    this._detailPaneEl.appendChild(header);

    // Description
    const desc = document.createElement('div');
    desc.className = 'shop-detail-desc';
    desc.textContent = prod.description || '';
    this._detailPaneEl.appendChild(desc);

    // Owned quantity & equipped info
    const ownedInfo = document.createElement('div');
    ownedInfo.className = 'shop-detail-owned-info';
    let statusText = `Posiadasz: ${ownedCount} szt.`;
    if (prod.maxStack) {
      statusText += ` (Maks: ${prod.maxStack})`;
    }
    if (isEquipped) {
      statusText += ` • <span style="color:#00ffaa; font-weight:800;">Założony</span>`;
    }
    ownedInfo.innerHTML = statusText;
    this._detailPaneEl.appendChild(ownedInfo);

    // Quantity selector (if stackable)
    if (prod.stackable) {
      const qtyBox = document.createElement('div');
      qtyBox.className = 'shop-qty-box';
      qtyBox.innerHTML = `
        <button id="shop-qty-minus" class="shop-qty-btn" type="button">-</button>
        <span id="shop-qty-value" class="shop-qty-num">${this._selectedQuantity}</span>
        <button id="shop-qty-plus" class="shop-qty-btn" type="button">+</button>
      `;

      const minusBtn = qtyBox.querySelector('#shop-qty-minus');
      const plusBtn = qtyBox.querySelector('#shop-qty-plus');
      const valSpan = qtyBox.querySelector('#shop-qty-value');

      const maxLimit = this._mode === 'buy'
        ? (prod.maxStack ? Math.max(1, prod.maxStack - ownedCount) : 99)
        : ownedCount;

      this._bindTrigger(minusBtn, () => {
        if (this._selectedQuantity > 1) {
          this._selectedQuantity--;
          valSpan.textContent = this._selectedQuantity;
          this._updateActionButton();
        }
      });

      this._bindTrigger(plusBtn, () => {
        if (this._selectedQuantity < maxLimit) {
          this._selectedQuantity++;
          valSpan.textContent = this._selectedQuantity;
          this._updateActionButton();
        }
      });

      this._detailPaneEl.appendChild(qtyBox);
    } else {
      this._selectedQuantity = 1;
    }

    // Restriction message slot & Action Button
    const restrictionBox = document.createElement('div');
    restrictionBox.id = 'shop-restriction-box';
    this._detailPaneEl.appendChild(restrictionBox);

    const actionBtn = document.createElement('button');
    actionBtn.id = 'shop-action-btn';
    actionBtn.className = `shop-action-btn ${this._mode}`;
    actionBtn.type = 'button';
    this._detailPaneEl.appendChild(actionBtn);

    this._bindTrigger(actionBtn, () => this._onExecuteAction());

    this._updateActionButton();
  }

  _updateActionButton() {
    const actionBtn = this._detailPaneEl?.querySelector('#shop-action-btn');
    const restrictionBox = this._detailPaneEl?.querySelector('#shop-restriction-box');
    if (!actionBtn || !restrictionBox) return;

    if (this._mode === 'buy') {
      const check = shopService.canBuy(this._selectedProductId, this._selectedQuantity);
      const totalYellow = check.yellowCost || 0;
      const totalRed = check.redCost || 0;

      let priceLabel = '';
      if (totalYellow > 0) priceLabel += `${totalYellow} 🪙 `;
      if (totalRed > 0) priceLabel += `${totalRed} 🔴`;
      if (totalYellow === 0 && totalRed === 0) priceLabel = 'Gratis';

      actionBtn.textContent = `Kup za ${priceLabel}`;

      if (!check.allowed) {
        actionBtn.disabled = true;
        restrictionBox.innerHTML = `<div class="shop-restriction-msg" style="display:flex; align-items:center; justify-content:center; gap:6px;">${renderIconHTML('warning', { size: '28px' })} <span>${check.reason}</span></div>`;
      } else {
        actionBtn.disabled = false;
        restrictionBox.innerHTML = '';
      }
    } else {
      // Sell
      const check = shopService.canSell(this._selectedProductId, this._selectedQuantity);
      const rewardYellow = check.yellowReward || 0;
      const rewardRed = check.redReward || 0;

      let rewardLabel = '';
      if (rewardYellow > 0) rewardLabel += `+${rewardYellow} 🪙 `;
      if (rewardRed > 0) rewardLabel += `+${rewardRed} 🔴`;

      actionBtn.textContent = `Sprzedaj za ${rewardLabel}`;

      if (!check.allowed) {
        actionBtn.disabled = true;
        restrictionBox.innerHTML = `<div class="shop-restriction-msg" style="display:flex; align-items:center; justify-content:center; gap:6px;">${renderIconHTML('warning', { size: '28px' })} <span>${check.reason}</span></div>`;
      } else {
        actionBtn.disabled = false;
        restrictionBox.innerHTML = '';
      }
    }
  }

  async _onExecuteAction() {
    const actionBtn = this._detailPaneEl?.querySelector('#shop-action-btn');
    if (actionBtn) actionBtn.disabled = true;

    if (this._mode === 'buy') {
      const result = await shopService.buy(this._selectedProductId, this._selectedQuantity);
      if (result.success) {
        playSound(1200, 0.15);
        setTimeout(() => playSound(1500, 0.2), 60);
        this.showToast(result.message, 'success');
        this._updateBalances();
        this._refreshView();
      } else {
        playSound(220, 0.18);
        this.showToast(result.reason, 'error');
        this._updateActionButton();
      }
    } else {
      // Sell
      const result = await shopService.sell(this._selectedProductId, this._selectedQuantity);
      if (result.success) {
        playSound(1100, 0.15);
        setTimeout(() => playSound(1350, 0.2), 60);
        this.showToast(result.message, 'success');
        this._updateBalances();

        // If no more units owned, select another sellable
        const owned = this._inventory ? this._inventory.getItemQuantity(this._selectedProductId) : 0;
        if (owned <= 0) {
          this._selectFirstAvailableProduct();
        }
        this._refreshView();
      } else {
        playSound(220, 0.18);
        this.showToast(result.reason, 'error');
        this._updateActionButton();
      }
    }
  }

  _updateBalances(data = null) {
    const yellow = data && data.yellowCoins !== undefined
      ? data.yellowCoins
      : (this._inventory ? this._inventory.getYellowCoins() : 0);

    const red = data && data.redCoins !== undefined
      ? data.redCoins
      : (this._inventory ? this._inventory.getRedCoins() : 0);

    if (this._yellowBalanceEl) this._yellowBalanceEl.textContent = String(yellow);
    if (this._redBalanceEl) this._redBalanceEl.textContent = String(red);
  }

  showToast(message, type = 'success') {
    if (!this._toastEl) return;
    if (this._toastTimeout) clearTimeout(this._toastTimeout);

    this._toastEl.textContent = message;
    this._toastEl.className = `shop-toast ${type} show`;

    this._toastTimeout = setTimeout(() => {
      this._toastEl.classList.remove('show');
    }, SHOP_CONFIG.toastDuration || 2200);
  }

  // ==========================================
  // MOBILE SAFE TAP & CLICK TRIGGER
  // ==========================================

  _bindTrigger(element, handler) {
    if (!element) return;
    let handled = false;

    element.addEventListener('pointerup', (e) => {
      handled = true;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
      setTimeout(() => { handled = false; }, 300);
    });

    element.addEventListener('click', (e) => {
      if (handled) return;
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    });
  }

  dispose() {
    for (const unsub of this._unsubs) {
      if (typeof unsub === 'function') unsub();
    }
    this._unsubs = [];

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      this._toastTimeout = null;
    }

    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

export const shopUI = new ShopUI();
