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

    // Encounter definitions — each has a gameplay purpose
    this.waveDefs = [
      {
        enemies: 3, types: ['rifleman'],
        interval: 2000, maxActive: 2,
        desc: 'RECON',
        purpose: 'Teach basic rifle combat. Enemies approach from distance.'
      },
      {
        enemies: 4, types: ['rifleman', 'rusher'],
        interval: 1800, maxActive: 3,
        desc: 'RUSH',
        purpose: 'Introduce close-range pressure. Rushers force repositioning.'
      },
      {
        enemies: 5, types: ['rifleman', 'rusher', 'sniper'],
        interval: 2000, maxActive: 3,
        desc: 'SNIPES',
        purpose: 'Introduce long-range threats. Prioritize snipers.'
      },
      {
        enemies: 7, types: ['rifleman', 'rusher', 'sniper'],
        interval: 1500, maxActive: 4,
        desc: 'COMBINED ARMS',
        purpose: 'Force prioritization between enemy roles.'
      },
      {
        enemies: 7, types: ['rifleman', 'rusher', 'sniper'],
        interval: 1500, maxActive: 4,
        desc: 'GAUNTLET',
        purpose: 'High-pressure combined arms. Use all mechanics.'
      },
      {
        enemies: 1, types: ['boss'],
        interval: 1000, maxActive: 2,
        desc: 'COMMANDER',
        purpose: 'Boss climax with light support.'
      }
    ];

    this.spawnTimer = 0;
    this.spawnQueue = [];
    this.waveStartTime = 0;
    this.forcedReinforcements = 0;
  }

  start() {
    this.state = 'preparing';
    this.currentWave = 0;
    this._announce('OPERATOR, REPORT FOR DUTY', 2);
    this._updateHUD('preparing');
    setTimeout(() => this._startNextWave(), 2000);
  }

  _startNextWave() {
    if (this.currentWave >= this.totalWaves) {
      this._victory();
      return;
    }

    const def = this.waveDefs[this.currentWave];
    this.currentWave++;
    this.state = 'active';

    // Build spawn queue from wave definition — spread types evenly
    this.spawnQueue = [];
    const typePool = [];
    for (let i = 0; i < def.enemies; i++) {
      const type = def.types[i % def.types.length];
      typePool.push(type);
    }
    // Shuffle the pool
    for (let i = typePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [typePool[i], typePool[j]] = [typePool[j], typePool[i]];
    }
    this.spawnQueue = typePool;
    this.enemiesForWave = this.spawnQueue.length;
    this.enemiesRemaining = this.spawnQueue.length;
    this.enemiesSpawned = 0;
    this.spawnTimer = 0;
    this.forcedReinforcements = 0;

    // Quick announcement
    this._announce(`WAVE ${this.currentWave}`, 0.3);
    setTimeout(() => {
      this._announce(def.desc, 1.2);
    }, 400);

    this.waveStartTime = Date.now();
    this._updateHUD('active');
  }

  update(dt) {
    if (this.state === 'preparing') {
      this.waveDelay += dt;
      return;
    }

    if (this.state === 'waveComplete') {
      this.waveDelay += dt;
      // Shorter delay for earlier waves, longer for later
      const waveDelayNeeded = this.currentWave <= 2 ? 2.5 : (this.currentWave <= 4 ? 3.0 : 4.0);
      if (this.waveDelay >= waveDelayNeeded) {
        this.waveDelay = 0;
        this._startNextWave();
      }
      return;
    }

    if (this.state === 'victory') return;

    const def = this.waveDefs[this.currentWave - 1];

    // Check CombatDirector for pressure guidance
    let directorGuidance = null;
    if (this.game.combatDirector) {
      directorGuidance = this.game.combatDirector.update(dt);
    }

    // Determine spawn interval (CombatDirector can slow it down)
    let interval = def.interval;
    if (directorGuidance && directorGuidance.slowSpawns) {
      interval = Math.max(interval, 4000); // slow spawns if player is overwhelmed
    }
    if (directorGuidance && directorGuidance.fullStop) {
      interval = 99999; // stop spawning entirely for recovery
    }

    // Spawn enemies
    if (this.spawnQueue.length > 0) {
      this.spawnTimer += dt * 1000;
      if (this.spawnTimer >= interval) {
        this.spawnTimer = 0;

        // Check if we should delay spawn (too many active enemies)
        const activeCount = this.game.enemyManager.getActiveEnemies().length;
        const maxActive = def.maxActive + this.forcedReinforcements;
        if (activeCount < maxActive || this.spawnQueue.length <= 1) {
          const type = this.spawnQueue.shift();
          this._spawnEnemyType(type, def);
          this.enemiesSpawned++;
          this._updateHUD('active');
        }
      }
    }

    // Auto-reinforce if CombatDirector says so and we still have queued enemies
    if (directorGuidance && directorGuidance.reinforce && this.spawnQueue.length > 0) {
      const activeCount = this.game.enemyManager.getActiveEnemies().length;
      if (activeCount < directorGuidance.desiredActive) {
        // Spawn one extra now
        const type = this.spawnQueue.shift();
        this._spawnEnemyType(type, def);
        this.enemiesSpawned++;
        this.spawnTimer = 0;
        this._updateHUD('active');
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

  _getSpawnPosition(def) {
    // Spawn relative to player position to avoid dead time
    const player = this.game.player;
    const playerPos = player ? player.position : new THREE.Vector3(0, 0, 0);

    // Choose direction away from player's facing to create encounters
    const angle = Math.random() * Math.PI * 2;

    // Distance varies by wave and type
    const minDist = 15;
    const maxDist = 25;
    const dist = minDist + Math.random() * (maxDist - minDist);

    const spawnPos = new THREE.Vector3(
      playerPos.x + Math.cos(angle) * dist,
      0,
      playerPos.z + Math.sin(angle) * dist
    );

    // Clamp to map bounds
    const bound = 19;
    spawnPos.x = Math.max(-bound, Math.min(bound, spawnPos.x));
    spawnPos.z = Math.max(-bound, Math.min(bound, spawnPos.z));

    return spawnPos;
  }

  _spawnEnemyType(type, def) {
    const spawnPos = this._getSpawnPosition(def);

    if (type === 'boss') {
      // Pre-account for 2 support riflemen that will spawn after delay
      // This prevents premature wave completion if boss dies before support spawns
      this.enemiesRemaining += 2;

      // Boss spawns ahead of player at moderate distance
      const playerPos = this.game.player ? this.game.player.position : new THREE.Vector3(0, 0, 0);
      const facing = this.game.camera ? this.game.camera.yaw : 0;
      const bossX = playerPos.x + Math.sin(facing) * 15;
      const bossZ = playerPos.z + Math.cos(facing) * 15;
      const bossPos = new THREE.Vector3(
        Math.max(-22, Math.min(22, bossX)),
        0,
        Math.max(-22, Math.min(22, bossZ))
      );
      this.game.enemyManager.spawnBoss(bossPos);
      this._announce('⚠ COMMANDER INCOMING', 0);

      // Also spawn 2 riflemen as boss support
      setTimeout(() => {
        if (this.state !== 'active' && this.state !== 'waveComplete') return;
        for (let i = 0; i < 2; i++) {
          const supportPos = this._getSpawnPosition(def);
          this.game.enemyManager.spawnEnemyAt(supportPos.x, supportPos.z, 'rifleman');
          this.enemiesSpawned++;
        }
        this._updateHUD('active');
      }, 2000);
    } else {
      this.game.enemyManager.spawnEnemyAt(spawnPos.x, spawnPos.z, type);
    }
  }

  onEnemyKilled() {
    this.enemiesRemaining--;
    if (this.enemiesRemaining < 0) this.enemiesRemaining = 0;
    this._updateHUD('active');
  }

  _completeWave() {
    this.state = 'waveComplete';
    this.waveDelay = 0;

    if (this.currentWave >= this.totalWaves) {
      // All waves done — transition to victory after short delay
      setTimeout(() => {
        if (this.state === 'waveComplete') {
          this._victory();
        }
      }, 1500);
      return;
    }

    this._announce(`WAVE ${this.currentWave} COMPLETE`, 0);

    // Spawn ammo crate
    if (this.game.ammoPickup) {
      this.game.ammoPickup.spawn();
    }

    // Show wave complete on HUD briefly
    this._updateHUD('complete');
  }

  _victory() {
    this.state = 'victory';
    this.victoryAchieved = true;
    this._announce('MISSION COMPLETE', 0);

    setTimeout(() => {
      if (this.game && !this.game.gameOver) {
        this.game._showVictory();
      }
    }, 2500);
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

  _updateHUD(state) {
    const waveEl = document.getElementById('wave-info');
    if (!waveEl) return;

    if (state === 'preparing') {
      waveEl.innerHTML = `<div class="wave-label">STAND BY</div>`;
      return;
    }

    const def = this.waveDefs[Math.min(this.currentWave - 1, this.waveDefs.length - 1)];
    waveEl.innerHTML = `
      <div class="wave-label">WAVE ${this.currentWave}/${this.totalWaves}</div>
      <div class="wave-desc">${def.desc}</div>
      <div class="wave-enemies">ENEMIES: ${this.enemiesRemaining}</div>
    `;
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
    this.forcedReinforcements = 0;
  }
}
