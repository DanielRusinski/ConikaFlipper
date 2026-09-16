import { eventBus } from '../../core/EventBus.js';
import { BALL_COLORS, BALL_CSS_COLORS, BALL_DISPLAY_NAMES } from '../../materials/ballMaterials.js';
import anime from 'animejs';

export class EquipmentScreen {
  constructor() {
    this._el = null;
    this._options = [];
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
      <div class="screen-backdrop" style="position:absolute; inset:0; background:rgba(6,10,22,0.88); backdrop-filter:blur(8px);"></div>
      <div class="screen-content" style="position:relative; z-index:1; text-align:center; color:white; max-width:600px; width:90%; padding:24px;">
        <h1 class="screen-title" style="font-size:36px; margin-bottom:20px; text-transform:uppercase; letter-spacing:2px; font-weight:800;">Equipment</h1>
        <p class="screen-subtitle" style="font-size:15px; color:#aaa; margin-bottom:28px;">Select your preferred rolling sphere</p>
        <div class="equipment-grid" style="display:flex; justify-content:center; gap:20px; margin-bottom:36px; flex-wrap:wrap;">
        </div>
        <button id="eq-back-btn" class="screen-btn" style="display:inline-block; width:auto; min-width:200px; padding:14px 44px; font-size:18px; font-weight:700; background:linear-gradient(135deg,#00b4d8,#0077b6); color:white; border:none; border-radius:12px; cursor:pointer; touch-action:manipulation; pointer-events:auto; position:relative; z-index:10; box-shadow:0 4px 16px rgba(0,180,216,0.5);">Back</button>
      </div>
    `;
    
    const grid = this._el.querySelector('.equipment-grid');
    const types = ['brass', 'marble', 'wood'];
    
    types.forEach(type => {
      const opt = document.createElement('div');
      opt.className = 'ball-option';
      opt.dataset.type = type;
      opt.style.padding = '18px';
      opt.style.background = 'rgba(255,255,255,0.06)';
      opt.style.borderRadius = '12px';
      opt.style.cursor = 'pointer';
      opt.style.border = '2px solid transparent';
      opt.style.width = '120px';
      opt.style.touchAction = 'manipulation';
      opt.style.transition = 'border-color 0.2s, background 0.2s, transform 0.15s';
      
      const cssColor = BALL_CSS_COLORS[type] || '#ccc';
      opt.innerHTML = `
        <div style="width:64px; height:64px; border-radius:50%; margin:0 auto 14px; background:radial-gradient(circle at 35% 35%, #ffffff 0%, ${cssColor} 45%, rgba(0,0,0,0.7) 100%); box-shadow:0 6px 16px rgba(0,0,0,0.5), inset 0 -4px 6px rgba(0,0,0,0.4);"></div>
        <div style="font-size:16px; font-weight:700; letter-spacing:0.5px;">${BALL_DISPLAY_NAMES[type] || type}</div>
      `;
      
      const selectHandler = (e) => {
        if (e) {
          e.stopPropagation();
        }
        this._selectBall(type);
      };
      opt.addEventListener('click', selectHandler);
      grid.appendChild(opt);
      this._options.push(opt);
    });
    
    container.appendChild(this._el);
    
    const backBtn = this._el.querySelector('#eq-back-btn');
    const triggerBack = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      eventBus.emit('ui:equipmentBack');
    };
    backBtn.addEventListener('click', triggerBack);
  }

  show(data = { selectedBall: 'brass' }) {
    this._el.classList.remove('hidden');
    this._el.style.display = 'flex';
    
    this._updateSelection(data.selectedBall);
    
    const content = this._el.querySelector('.screen-content');
    content.style.opacity = '0';
    content.style.transform = 'scale(0.9)';
    
    anime({
      targets: content,
      opacity: 1,
      scale: 1,
      duration: 400,
      easing: 'easeOutQuad'
    });
  }

  _selectBall(type) {
    this._updateSelection(type);
    eventBus.emit('ball:typeChanged', { type });
  }

  _updateSelection(type) {
    this._options.forEach(opt => {
      if (opt.dataset.type === type) {
        opt.style.borderColor = '#4CAF50';
        opt.style.background = '#333';
      } else {
        opt.style.borderColor = 'transparent';
        opt.style.background = '#222';
      }
    });
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
