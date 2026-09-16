import { TitleScreen } from './screens/TitleScreen.js';
import { GameOverScreen } from './screens/GameOverScreen.js';
import { EquipmentScreen } from './screens/EquipmentScreen.js';
import { PauseScreen } from './screens/PauseScreen.js';
import { StageClearScreen } from './screens/StageClearScreen.js';

export class ScreenManager {
  constructor() {
    this._screens = new Map();
    this._activeScreen = null;
  }

  init(container) {
    this._screens.set('title', new TitleScreen());
    this._screens.set('gameover', new GameOverScreen());
    this._screens.set('equipment', new EquipmentScreen());
    this._screens.set('pause', new PauseScreen());
    this._screens.set('stageclear', new StageClearScreen());

    for (const [name, screen] of this._screens.entries()) {
      screen.init(container);
    }
    this.hideAll();
  }

  show(screenName, data = null) {
    const key = (screenName || '').toLowerCase();
    if (this._activeScreen && this._activeScreen !== key) {
      this.hide(this._activeScreen);
    }
    
    const screen = this._screens.get(key) || this._screens.get(screenName);
    if (screen) {
      screen.show(data);
      this._activeScreen = key;
    }
  }

  hide(screenName) {
    const key = (screenName || '').toLowerCase();
    const screen = this._screens.get(key) || this._screens.get(screenName);
    if (screen) {
      screen.hide();
      if (this._activeScreen === key || this._activeScreen === screenName) {
        this._activeScreen = null;
      }
    }
  }

  hideAll() {
    for (const [name, screen] of this._screens.entries()) {
      screen.hide();
    }
    this._activeScreen = null;
  }

  getActive() {
    return this._activeScreen;
  }

  dispose() {
    for (const [name, screen] of this._screens.entries()) {
      screen.dispose();
    }
    this._screens.clear();
  }
}
