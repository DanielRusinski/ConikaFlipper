import { eventBus } from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/gameConfig.js';
import { BALL_COLORS, BALL_CSS_COLORS, BALL_DISPLAY_NAMES } from '../../materials/ballMaterials.js';
import { resolvedStatService } from '../../progression/ResolvedStatService.js';
import { ballProgressionService } from '../../progression/BallProgressionService.js';
import { equipmentService } from '../../progression/EquipmentService.js';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_DEFINITIONS,
  EQUIPMENT_SLOT_DEFINITIONS
} from '../../config/equipmentConfig.js';
import { saveMigrationService } from '../../core/SaveMigrationService.js';
import { renderIconHTML } from '../IconService.js';
import anime from 'animejs';

export class EquipmentScreen {
  constructor() {
    this._el = null;
    this._options = [];
    this._unlockedBalls = ['brass'];
    this._selectedBall = 'brass';
    this._loadoutContainer = null;
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
    this._el.style.zIndex = '5000';
    this._el.style.pointerEvents = 'auto';

    this._el.innerHTML = `
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,22,0.92); backdrop-filter:blur(10px);"></div>
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; max-width:720px; width:94%; max-height:92vh; overflow-y:auto; padding:20px 24px;">
        <h1 class="screen-title" style="font-size:32px; margin-bottom:8px; text-transform:uppercase; letter-spacing:2px; font-weight:800; color:#00f0ff;">Equipment & Loadout</h1>
        <p class="screen-subtitle" style="font-size:13px; color:#94a3b8; margin-bottom:20px;">Select your rolling sphere and customize its 4-slot tactical equipment loadout</p>
        
        <div class="equipment-grid" style="display:flex; justify-content:center; gap:14px; margin-bottom:22px; flex-wrap:wrap;"></div>

        <!-- 4-Slot Loadout Panel -->
        <div class="loadout-panel" style="background:rgba(255,255,255,0.04); border:1.5px solid rgba(0,240,255,0.25); border-radius:14px; padding:16px 20px; margin-bottom:24px;">
          <h3 style="font-size:16px; margin:0 0 12px 0; color:#00f0ff; letter-spacing:1px; font-weight:800;">
            EKWIPUNEK KULI: <span id="eq-active-ball-name" style="color:#fff;">MOSIĄDZ</span>
          </h3>
          <div class="loadout-slots-grid" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px;"></div>
        </div>

        <button id="eq-back-btn" class="screen-btn" style="display:inline-block; width:auto; min-width:200px; padding:12px 40px; font-size:16px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:12px; cursor:pointer; touch-action:manipulation; pointer-events:auto; position:relative; z-index:10; box-shadow:0 4px 16px rgba(0,180,216,0.5);">Back</button>
      </div>
    `;

    const grid = this._el.querySelector('.equipment-grid');
    const types = GAME_CONFIG.ball?.types || ['brass', 'marble', 'wood', 'chrome'];

    types.forEach(type => {
      const opt = document.createElement('div');
      opt.className = 'ball-option';
      opt.dataset.type = type;
      opt.style.padding = '12px 10px';
      opt.style.background = 'rgba(255,255,255,0.06)';
      opt.style.borderRadius = '12px';
      opt.style.cursor = 'pointer';
      opt.style.border = '2px solid transparent';
      opt.style.width = '128px';
      opt.style.touchAction = 'manipulation';
      opt.style.transition = 'border-color 0.2s, background 0.2s, transform 0.15s, opacity 0.2s';

      const cssColor = BALL_CSS_COLORS[type] || '#ccc';
      let previewBg = `radial-gradient(circle at 35% 35%, #ffffff 0%, ${cssColor} 45%, rgba(0,0,0,0.7) 100%)`;
      let previewGlow = '0 6px 16px rgba(0,0,0,0.5), inset 0 -4px 6px rgba(0,0,0,0.4)';
      if (type === 'chrome') {
        previewBg = `linear-gradient(180deg, #f8fafc 0%, #cbd5e1 35%, #181926 37%, #bf00ff 43%, #ff88ff 50%, #bf00ff 57%, #181926 63%, #cbd5e1 65%, #64748b 100%)`;
        previewGlow = '0 0 16px rgba(191, 0, 255, 0.75), 0 6px 16px rgba(0,0,0,0.5), inset 0 -4px 6px rgba(0,0,0,0.4)';
      }

      const speedScale = resolvedStatService.getBaseValue('ball.speedScale', type);
      const wallRest = resolvedStatService.getBaseValue('ball.wallRestitution', type);
      const ctrlResp = resolvedStatService.getBaseValue('ball.controlResponsiveness', type);
      const bombCap = resolvedStatService.getBaseValue('bomb.capacity', type);

      opt.innerHTML = `
        <div style="position:relative; width:52px; height:52px; margin:0 auto 8px;">
          <div style="width:52px; height:52px; border-radius:50%; background:${previewBg}; box-shadow:${previewGlow};"></div>
          <div class="card-level-badge" style="position:absolute; bottom:-3px; right:-6px; background:linear-gradient(135deg, #00f0ff, #0077b6); color:#fff; font-size:10px; font-weight:800; padding:1px 5px; border-radius:8px; border:1px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.6);">Lv.1</div>
        </div>
        <div style="font-size:14px; font-weight:700; letter-spacing:0.5px;">${BALL_DISPLAY_NAMES[type] || type}</div>
        <div class="card-xp-wrap" style="width:100%; height:4px; background:rgba(0,0,0,0.5); border-radius:2px; margin:4px 0 6px; overflow:hidden;">
          <div class="card-xp-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #00ffcc, #00f0ff); transition:width 0.3s ease;"></div>
        </div>
        <div style="font-size:11px; color:#94a3b8; line-height:1.4; text-align:left; background:rgba(0,0,0,0.25); border-radius:6px; padding:6px 8px;">
          <div style="display:flex; align-items:center; gap:4px;">${renderIconHTML('lightning', { size: '26px' })} Spd: ${(speedScale * 100).toFixed(1)}%</div>
          <div style="display:flex; align-items:center; gap:4px;">${renderIconHTML('tennis_ball', { size: '26px' })} Bnc: ${(wallRest * 100).toFixed(0)}%</div>
          <div style="display:flex; align-items:center; gap:4px;">${renderIconHTML('joystick', { size: '26px' })} Ctr: ${ctrlResp.toFixed(2)}x</div>
          <div style="display:flex; align-items:center; gap:4px;">${renderIconHTML('bomb', { size: '26px' })} Cap: ${bombCap}</div>
        </div>
        <div class="ball-lock-badge" style="font-size:11px; margin-top:6px; color:#f87171; display:none; font-weight:600; align-items:center; justify-content:center; gap:4px;">${renderIconHTML('lock', { size: '24px' })} Locked</div>
      `;

      opt.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        this._selectBall(type);
      });
      grid.appendChild(opt);
      this._options.push(opt);
    });

    this._loadoutContainer = this._el.querySelector('.loadout-slots-grid');

    container.appendChild(this._el);

    const backBtn = this._el.querySelector('#eq-back-btn');
    backBtn.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      eventBus.emit('ui:equipmentBack');
    });
  }

  show(data = { selectedBall: 'brass', unlockedBalls: ['brass'] }) {
    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';

    if (data && Array.isArray(data.unlockedBalls) && data.unlockedBalls.length > 0) {
      this._unlockedBalls = Array.from(new Set(['brass', ...data.unlockedBalls]));
    } else if (!this._unlockedBalls || this._unlockedBalls.length === 0) {
      this._unlockedBalls = ['brass'];
    }

    const candidate = (data && data.selectedBall) || this._selectedBall || 'brass';
    this._selectedBall = this._unlockedBalls.includes(candidate) ? candidate : 'brass';
    this._updateSelection(this._selectedBall);
    this._renderLoadout();

    const content = this._el.querySelector('.screen-content');
    content.style.opacity = '0';
    content.style.transform = 'scale(0.92)';

    anime({
      targets: content,
      opacity: 1,
      scale: 1,
      duration: 350,
      easing: 'easeOutQuad'
    });
  }

  isBallUnlocked(type) {
    return Array.isArray(this._unlockedBalls) && this._unlockedBalls.includes(type);
  }

  _selectBall(type) {
    if (!this.isBallUnlocked(type)) {
      return false;
    }
    this._selectedBall = type;
    this._updateSelection(type);
    this._renderLoadout();
    eventBus.emit('ball:typeChanged', { type });
    return true;
  }

  _updateSelection(type) {
    this._options.forEach(opt => {
      const optType = opt.dataset.type;
      const unlocked = this.isBallUnlocked(optType);
      const lockBadge = opt.querySelector('.ball-lock-badge');

      opt.dataset.locked = unlocked ? 'false' : 'true';
      opt.style.opacity = unlocked ? '1' : '0.45';
      opt.style.cursor = unlocked ? 'pointer' : 'not-allowed';
      if (lockBadge) {
        lockBadge.style.display = unlocked ? 'none' : 'block';
      }

      if (unlocked && optType === type) {
        opt.style.borderColor = '#00f0ff';
        opt.style.background = 'rgba(0, 240, 255, 0.12)';
      } else {
        opt.style.borderColor = 'transparent';
        opt.style.background = 'rgba(255, 255, 255, 0.05)';
      }

      const ballState = ballProgressionService.getBallState(optType);
      const levelBadge = opt.querySelector('.card-level-badge');
      const xpBar = opt.querySelector('.card-xp-bar');
      if (levelBadge) {
        levelBadge.textContent = `Lv.${ballState.level}`;
        if (ballState.level >= 9) {
          levelBadge.style.background = 'linear-gradient(135deg, #ffd700, #ff8800)';
          levelBadge.style.color = '#000';
        } else {
          levelBadge.style.background = 'linear-gradient(135deg, #00f0ff, #0077b6)';
          levelBadge.style.color = '#fff';
        }
      }
      if (xpBar) {
        if (ballState.level >= 9) {
          xpBar.style.width = '100%';
          xpBar.style.background = 'linear-gradient(90deg, #ffd700, #ff8800)';
        } else {
          const req = ballProgressionService.getRequiredXpForNextLevel(optType) || 500;
          const pct = Math.min(100, Math.max(0, Math.round((ballState.currentXp / req) * 100)));
          xpBar.style.width = `${pct}%`;
          xpBar.style.background = 'linear-gradient(90deg, #00ffcc, #00f0ff)';
        }
      }
    });

    const activeNameEl = this._el.querySelector('#eq-active-ball-name');
    if (activeNameEl) {
      activeNameEl.textContent = (BALL_DISPLAY_NAMES[type] || type).toUpperCase();
    }
  }

  _renderLoadout() {
    if (!this._loadoutContainer) return;
    this._loadoutContainer.innerHTML = '';

    const currentLoadout = equipmentService.getLoadout(this._selectedBall);
    const slots = ['WEAPON', 'SHIELD', 'ACCESSORY', 'CRYSTAL'];

    slots.forEach(slotKey => {
      const slotDef = EQUIPMENT_SLOT_DEFINITIONS[slotKey];
      const equippedItemId = currentLoadout[slotKey];
      const equippedItem = equippedItemId ? EQUIPMENT_DEFINITIONS[equippedItemId] : null;

      const slotEl = document.createElement('div');
      slotEl.style.background = 'rgba(0,0,0,0.35)';
      slotEl.style.border = equippedItem ? '1.5px solid #00f0ff' : '1px dashed rgba(255,255,255,0.2)';
      slotEl.style.borderRadius = '10px';
      slotEl.style.padding = '10px 8px';
      slotEl.style.textAlign = 'center';
      slotEl.style.transition = 'all 0.2s';

      slotEl.innerHTML = `
        <div style="font-size:11px; font-weight:800; color:#00f0ff; letter-spacing:0.5px; margin-bottom:4px; display:flex; align-items:center; justify-content:center; gap:4px;">
          ${renderIconHTML(slotDef.icon, { size: '28px' })} <span>${slotDef.label.toUpperCase()}</span>
        </div>
        <div style="font-size:22px; margin:4px 0; display:flex; align-items:center; justify-content:center;">${renderIconHTML(equippedItem ? equippedItem.icon : 'ball_white', { size: '48px' })}</div>
        <div style="font-size:12px; font-weight:700; color:${equippedItem ? '#fff' : '#64748b'};">
          ${equippedItem ? equippedItem.name : 'Pusty slot'}
        </div>
        <button class="eq-slot-btn" style="margin-top:6px; padding:3px 10px; font-size:10px; font-weight:700; border-radius:6px; border:none; cursor:pointer; background:${equippedItem ? 'rgba(239,68,68,0.8)' : 'rgba(0,240,255,0.8)'}; color:#fff;">
          ${equippedItem ? 'Zdejmij' : 'Załóż'}
        </button>
      `;

      const btn = slotEl.querySelector('.eq-slot-btn');
      btn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        if (equippedItem) {
          equipmentService.unequip(slotKey, this._selectedBall);
          this._renderLoadout();
        } else {
          // Open quick equip picker for this slot
          this._showEquipPicker(slotKey);
        }
      });

      this._loadoutContainer.appendChild(slotEl);
    });
  }

  _showEquipPicker(slotKey) {
    const res = saveMigrationService.loadOrMigrate();
    const owned = (res && res.save && res.save.inventory && res.save.inventory.equipmentOwned) || {};

    const eligibleItems = Object.keys(EQUIPMENT_DEFINITIONS).filter(id => {
      const def = EQUIPMENT_DEFINITIONS[id];
      return def.slot === slotKey && (owned[id] || 0) > 0;
    });

    if (eligibleItems.length === 0) {
      eventBus.emit('ui:toast', { message: `Brak posiadanych przedmiotów typu ${slotKey} w ekwipunku!`, type: 'warning' });
      return;
    }

    // Auto-equip first available item for user convenience
    const chosen = eligibleItems[0];
    equipmentService.equip(chosen, slotKey, this._selectedBall);
    this._renderLoadout();
  }

  hide() {
    this._el.classList.add('hidden');
    this._el.style.display = 'none';
  }

  dispose() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}
