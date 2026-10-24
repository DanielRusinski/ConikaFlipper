import { Game } from './core/Game.js';

const game = new Game();
game.init().then(() => {
  game.start();
}).catch(err => {
  console.error('Failed to initialize game:', err);
});
