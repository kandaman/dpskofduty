import { Enemy } from './Enemy.js';

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 4000; // ms
    this.maxEnemies = 12;
    this.killCount = 0;
    this.difficultyTimer = 0;
    this.difficultyLevel = 1;
  }

  spawnEnemy() {
    if (this.enemies.filter(e => e.alive).length >= this.maxEnemies) return;

    // Spawn at random position around the map, at least 15 units away
    let pos;
    let attempts = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 20;
      pos = {
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist
      };
      attempts++;
    } while (attempts < 10);

    const spawnPos = new THREE.Vector3(pos.x, 0, pos.z);
    const enemy = new Enemy(this.game, spawnPos);

    // Scale with difficulty
    enemy.maxHealth = 100 + (this.difficultyLevel - 1) * 10;
    enemy.health = enemy.maxHealth;
    enemy.damage = 8 + (this.difficultyLevel - 1) * 1;
    enemy.moveSpeed = 2 + Math.random() * 1.5 + (this.difficultyLevel - 1) * 0.15;
    enemy.fireRate = Math.max(150, 200 + Math.random() * 300 - (this.difficultyLevel - 1) * 15);

    this.enemies.push(enemy);
  }

  update(dt) {
    // Difficulty scaling
    this.difficultyTimer += dt * 1000;
    if (this.difficultyTimer > 30000) { // Every 30 seconds
      this.difficultyLevel++;
      this.difficultyTimer = 0;
      this.spawnInterval = Math.max(1500, this.spawnInterval - 300);
    }

    // Spawn timer
    this.spawnTimer += dt * 1000;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    // Update all enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt);

      // Remove dead enemies after fade
      if (!enemy.alive && enemy.deathAnimTime > 4) {
        this.game.scene.remove(enemy.mesh);
        this.enemies.splice(i, 1);
        this.killCount++;
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
    this.spawnTimer = 0;
    this.killCount = 0;
    this.difficultyTimer = 0;
    this.difficultyLevel = 1;
  }
}
