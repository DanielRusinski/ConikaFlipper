import { SoftArcadeMusic } from './SoftArcadeMusic.js';

export const gameMusic = new SoftArcadeMusic({ volume: 0.55 });

// IMPORTANT: call start() from a user gesture, such as Start Game or Continue.
document.querySelector('#start-game')?.addEventListener('click', async () => {
  await gameMusic.start();
  // startGame();
});

document.querySelector('#music-toggle')?.addEventListener('change', async event => {
  if (event.target.checked) await gameMusic.start();
  else await gameMusic.stop({ fadeSeconds: 0.4 });
});

document.querySelector('#music-volume')?.addEventListener('input', event => {
  gameMusic.setVolume(event.target.value);
});

// Optional: avoid unwanted sound after the game is backgrounded.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) gameMusic.setVolume(0, 0.03);
  else gameMusic.setVolume(0.55, 0.08);
});
