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

  // Pointer lock dropped mid-game (Esc, focus loss, driver hiccup) → show a
  // clear pause screen. Aiming is dead while unlocked, and without this the
  // player has no hint that a click recovers it.
  const pauseOverlay = document.createElement('div');
  pauseOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);'
    + 'display:none;align-items:center;justify-content:center;z-index:900;'
    + 'color:#fff;font-size:22px;font-family:sans-serif;letter-spacing:2px;'
    + 'text-shadow:0 0 10px rgba(0,0,0,0.8);cursor:pointer;';
  pauseOverlay.textContent = 'クリックして再開 — 照準ロックが解除されています';
  document.body.appendChild(pauseOverlay);

  document.addEventListener('pointerlockchange', () => {
    if (!game) return;
    const active = game.running && !game.gameOver;
    pauseOverlay.style.display = (active && !document.pointerLockElement) ? 'flex' : 'none';
  });
  pauseOverlay.addEventListener('click', () => {
    if (game) game.input.lock();
  });
});
