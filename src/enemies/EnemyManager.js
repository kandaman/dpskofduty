import * as THREE from 'three';
import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.killCount = 0;
    this.killCounts = { rifleman: 0, rusher: 0, sniper: 0, boss: 0 };
    this.obstacles = [];

    // Cached character model (loaded once, cloned per enemy)
    this._characterModel = null;
    this._modelReady = false;

    // Start async load
    this._loadCharacterModel();
  }

  async _loadCharacterModel() {
    try {
      const scene = await this.game.assetManager.load('characters/CesiumMan.glb');
      this._characterModel = scene;
      this._modelReady = true;
      console.log('CesiumMan.glb loaded for enemy characters');
    } catch (err) {
      console.warn('CesiumMan.glb not available, using procedural enemies:', err.message);
    }
  }

  spawnEnemyAt(x, z, type = 'rifleman') {
    const pos = new THREE.Vector3(x, 0, z);
    const enemy = new Enemy(this.game, pos, type, this._characterModel);
    enemy.obstacles = this.obstacles;
    this.enemies.push(enemy);
    return enemy;
  }

  spawnBoss(position) {
    const enemy = new Enemy(this.game, position, 'boss', this._characterModel);
    enemy.obstacles = this.obstacles;
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
        if (this.killCounts[enemy.type] !== undefined) this.killCounts[enemy.type]++;

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
    this.killCounts = { rifleman: 0, rusher: 0, sniper: 0, boss: 0 };
  }
}
