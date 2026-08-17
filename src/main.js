import { Game } from './Game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  let game;

  const blocker = document.getElementById('blocker');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');

  startBtn.addEventListener('click', () => {
    blocker.style.display = 'none';
    game = new Game();
    game.input.lock();
    game.start();
  });

  restartBtn.addEventListener('click', () => {
    if (game) {
      game.restart();
    }
  });

  // Click blocker to lock pointer when game is running
  blocker.addEventListener('click', () => {
    if (game && game.running && !game.gameOver) {
      game.input.lock();
    }
  });

  // Also click on canvas to re-lock
  document.addEventListener('click', () => {
    if (game && game.running && !game.gameOver && !document.pointerLockElement) {
      // Only if the game is active
    }
  });

  // ESC key to show blocker when game is paused
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game && game.running && !game.gameOver) {
      if (document.pointerLockElement) {
        game.input.unlock();
      }
    }
  });
});
