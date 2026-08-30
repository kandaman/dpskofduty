import * as THREE from 'three';
import { Game } from './Game.js';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  let game;

  const blocker = document.getElementById('blocker');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');

  startBtn.addEventListener('click', () => {
    blocker.style.display = 'none';
    window.THREE = THREE;
    game = new Game();
    window.game = game;
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

  // Click anywhere while playing to re-lock the pointer. Without this, a
  // silently dropped lock (Esc cooldown, focus loss) leaves the player
  // unable to aim — the cursor just sits there and mouse look is dead.
  document.addEventListener('click', () => {
    if (game && game.running && !game.gameOver && !document.pointerLockElement) {
      game.input.lock();
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
