import { ScreenManager } from './ScreenManager.js';
import { GameHUD } from './GameHUD.js';

export class UIManager {
  constructor() {
    this._container = null;
    this._screenManager = new ScreenManager();
    this._gameHUD = new GameHUD();
    this._scoreDisplay = null; // Managed by GameHUD
  }

  init() {
    this._container = document.getElementById('ui-overlay');
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'ui-overlay';
      this._container.style.position = 'absolute';
      this._container.style.top = '0';
      this._container.style.left = '0';
      this._container.style.width = '100%';
      this._container.style.height = '100%';
      this._container.style.pointerEvents = 'none'; // Ensure UI doesn't block tilt unless specific elements trap
      document.body.appendChild(this._container);
    }

    this._screenManager.init(this._container);
    
    // Create HUD container
    const hudContainer = document.createElement('div');
    hudContainer.id = 'game-hud-container';
    hudContainer.style.position = 'absolute';
    hudContainer.style.width = '100%';
    hudContainer.style.height = '100%';
    hudContainer.style.pointerEvents = 'none';
    this._container.appendChild(hudContainer);
    
    this._gameHUD.init(hudContainer);
  }

  update(delta) {
    this._gameHUD.update(delta);
  }

  resize(width, height) {
    // Handle any specific UI resizes if needed
  }

  dispose() {
    this._screenManager.dispose();
    this._gameHUD.dispose();
  }
}
