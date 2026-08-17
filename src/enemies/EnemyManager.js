import * as THREE from 'three';
import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.killCount = 0;
  }

  spawnEnemyAt(x, z, type = 'rifleman') {
    const pos = new THREE.Vector3(x, 0, z);
    const enemy = new Enemy(this.game, pos, type);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnBoss(position) {
    const enemy = new Enemy(this.game, position, 'boss');
    // Boss is big - scale it up
    enemy.mesh.scale.set(1.5, 1.5, 1.5);
    this.enemies.push(enemy);
    return enemy;
  }

  update(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt);

      if (!enemy.alive && enemy.deathAnimTime > 4) {
        this.game.scene.remove(enemy.mesh);
        this.enemies.splice(i, 1);
        this.killCount++;

        // Notify wave manager
        if (this.game.waveManager) {
          this.game.waveManager.onEnemyKilled();
        }
      }
    }
  }

  getActiveEnemies() {
    return this.enemies.filter(e => e.alive);
  }

  reset() {
    for (const enemy of this.enemies) {
      this.game.scene.remove(enemy.mesh);
    }
    this.enemies = [];
    this.killCount = 0;
  }
}
