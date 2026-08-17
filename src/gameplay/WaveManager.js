import * as THREE from 'three';

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.currentWave = 0;
    this.totalWaves = 6;
    this.state = 'preparing'; // preparing, active, waveComplete, victory
    this.enemiesRemaining = 0;
    this.enemiesSpawned = 0;
    this.enemiesForWave = 0;
    this.waveDelay = 0;
    this.waveDelayDuration = 4;
    this.victoryAchieved = false;

    // Wave definitions
    this.waveDefs = [
      { enemies: 3, types: ['rifleman'], interval: 3000, desc: 'SCOUTING PARTY' },
      { enemies: 5, types: ['rifleman', 'rifleman', 'rusher'], interval: 2500, desc: 'CONTACT' },
      { enemies: 6, types: ['rifleman', 'rusher', 'sniper'], interval: 2500, desc: 'ENGAGEMENT' },
      { enemies: 8, types: ['rifleman', 'rusher', 'rusher', 'sniper'], interval: 2000, desc: 'HEAVY CONTACT' },
      { enemies: 10, types: ['rifleman', 'rusher', 'sniper', 'sniper'], interval: 1800, desc: 'LAST STAND' },
      { enemies: 1, types: ['boss'], interval: 1000, desc: 'COMMANDER' }
    ];

    this.spawnTimer = 0;
    this.spawnQueue = [];
    this.waveStartTime = 0;
  }

  start() {
    this.state = 'preparing';
    this.currentWave = 0;
    this._announce('OPERATOR, REPORT FOR DUTY', 2);
    setTimeout(() => this._startNextWave(), 3000);
  }

  _startNextWave() {
    if (this.currentWave >= this.totalWaves) {
      this._victory();
      return;
    }

    const def = this.waveDefs[this.currentWave];
    this.currentWave++;
    this.state = 'active';

    // Build spawn queue from wave definition
    this.spawnQueue = [];
    const typePool = [];
    for (let i = 0; i < def.enemies; i++) {
      const type = def.types[Math.floor(Math.random() * def.types.length)];
      typePool.push(type);
    }
    this.spawnQueue = typePool;
    this.enemiesForWave = this.spawnQueue.length;
    this.enemiesRemaining = this.spawnQueue.length;
    this.enemiesSpawned = 0;
    this.spawnTimer = 0;

    this._announce(`WAVE ${this.currentWave}`, 0.5);
    setTimeout(() => {
      this._announce(def.desc, 1.5);
    }, 600);

    this.waveStartTime = Date.now();
    this._updateHUD();
  }

  update(dt) {
    if (this.state === 'preparing') {
      this.waveDelay += dt;
      return;
    }

    if (this.state === 'waveComplete') {
      this.waveDelay += dt;
      if (this.waveDelay >= this.waveDelayDuration) {
        this.waveDelay = 0;
        this._startNextWave();
      }
      return;
    }

    if (this.state === 'victory') return;

    // Spawn enemies for current wave
    if (this.spawnQueue.length > 0) {
      const def = this.waveDefs[this.currentWave - 1];
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= def.interval) {
        this.spawnTimer = 0;
        const type = this.spawnQueue.shift();
        this._spawnEnemyType(type);
        this.enemiesSpawned++;
        this._updateHUD();
      }
    }

    // Check if wave is complete
    if (this.spawnQueue.length === 0) {
      const alive = this.game.enemyManager.getActiveEnemies().length;
      if (alive === 0 && this.enemiesRemaining <= 0) {
        this._completeWave();
      }
    }
  }

  _spawnEnemyType(type) {
    // Spawn from edge of map, not too close to player
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 10;
    const pos = {
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist
    };

    if (type === 'boss') {
      // Boss spawns at center with announcement
      this.game.enemyManager.spawnBoss(new THREE.Vector3(0, 0, 8));
      this._announce('⚠ COMMANDER INCOMING', 0);
    } else {
      const variant = type === 'sniper' ? 'sniper' : (type === 'rusher' ? 'rusher' : 'rifleman');
      this.game.enemyManager.spawnEnemyAt(pos.x, pos.z, variant);
    }
  }

  onEnemyKilled() {
    this.enemiesRemaining--;
    if (this.enemiesRemaining < 0) this.enemiesRemaining = 0;
    this._updateHUD();
  }

  _completeWave() {
    this.state = 'waveComplete';
    this.waveDelay = 0;

    if (this.currentWave >= this.totalWaves) {
      // All waves done - transition to victory
      setTimeout(() => {
        if (this.state === 'waveComplete') {
          this._victory();
        }
      }, 2000);
      return;
    }

    this._announce(`WAVE ${this.currentWave} COMPLETE`, 0);

    // Spawn ammo crate
    if (this.game.ammoPickup) {
      this.game.ammoPickup.spawn();
    }

    this._updateHUD();
  }

  _victory() {
    this.state = 'victory';
    this.victoryAchieved = true;
    this._announce('MISSION COMPLETE', 0);

    // Show victory screen after delay
    setTimeout(() => {
      if (this.game && !this.game.gameOver) {
        this.game._showVictory();
      }
    }, 3000);
  }

  _announce(text, duration = 2) {
    const el = document.getElementById('wave-announce');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) scale(1)';
    if (duration > 0) {
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) scale(0.9)';
      }, duration * 1000);
    }
  }

  _updateHUD() {
    const waveEl = document.getElementById('wave-info');
    if (waveEl) {
      const def = this.waveDefs[Math.min(this.currentWave - 1, this.waveDefs.length - 1)];
      waveEl.innerHTML = `
        <div class="wave-label">WAVE ${this.currentWave}/${this.totalWaves}</div>
        <div class="wave-enemies">ENEMIES: ${this.enemiesRemaining}</div>
      `;
    }
  }

  getRemaining() {
    return this.enemiesRemaining;
  }

  reset() {
    this.currentWave = 0;
    this.state = 'preparing';
    this.enemiesRemaining = 0;
    this.enemiesSpawned = 0;
    this.enemiesForWave = 0;
    this.waveDelay = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.victoryAchieved = false;
  }
}
