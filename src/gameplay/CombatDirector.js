// Lightweight CombatDirector that regulates pressure
// It monitors the fight and adjusts spawns to maintain engagement
// without being a full AI director.

export class CombatDirector {
  constructor(game) {
    this.game = game;

    // Pressure state
    this.pressureLevel = 0;        // 0=recovery, 1=moderate, 2=heavy, 3=extreme
    this.pressureTimer = 0;
    this.lastCombatTime = 0;
    this.lastDamageTime = 0;
    this.playerLowHealthCount = 0;

    // Config
    this.minActiveEnemies = 2;
    this.maxActiveEnemies = 5;
    this.recoveryDelay = 3.0;       // seconds of calm before reinforcing
    this.pressureRampTime = 30;     // seconds into wave before pressure increases

    this._lastHp = 1;
  }

  reset() {
    this.pressureLevel = 0;
    this.pressureTimer = 0;
    this.lastCombatTime = 0;
    this.lastDamageTime = 0;
    this.playerLowHealthCount = 0;
    this._lastHp = 1;
    this.lastDamageTime = 0;
    this.playerLowHealthCount = 0;
  }

  update(dt) {
    const game = this.game;
    const waveMgr = game.waveManager;
    const player = game.player;
    const enemies = game.enemyManager;

    // Don't direct during preparation, wave transitions, or victory
    if (waveMgr.state !== 'active') return;

    const activeEnemies = enemies.getActiveEnemies().length;
    const playerHp = player.health;
    const playerMax = player.maxHealth;
    const hpPct = playerHp / playerMax;

    // Track time since last meaningful combat event
    const hasCombat = activeEnemies > 0;
    if (hasCombat) this.lastCombatTime = 0;
    else this.lastCombatTime += dt;

    // Track time since player last took damage
    const gotHit = hpPct < 1 && this.lastDamageTime === 0;
    if (gotHit || hpPct < this._lastHp) {
      this.lastDamageTime = 0;
    } else {
      this.lastDamageTime += dt;
    }
    this._lastHp = hpPct;

    // Detect low health streak
    if (hpPct < 0.3) {
      this.playerLowHealthCount += dt;
    } else {
      this.playerLowHealthCount = Math.max(0, this.playerLowHealthCount - dt * 0.5);
    }

    // Calculate desired pressure based on time into wave
    const waveElapsed = (Date.now() - waveMgr.waveStartTime) / 1000;
    const waveProgress = Math.min(waveElapsed / this.pressureRampTime, 1);

    // Base desired active count from wave and pressure
    const baseDesired = this.minActiveEnemies + Math.floor(waveProgress * (this.maxActiveEnemies - this.minActiveEnemies));

    // Adjust for player state
    let desiredActive = baseDesired;

    // If player is very low HP, reduce pressure
    if (hpPct < 0.25) {
      desiredActive = Math.max(1, baseDesired - 2);
    }

    // If player has been searching too long (dead time), INCREASE pressure
    if (this.lastCombatTime > 5 && activeEnemies === 0) {
      desiredActive = Math.max(desiredActive, 3);
    }

    // If player has been low HP for a while, give a recovery break
    if (this.playerLowHealthCount > 8 && activeEnemies <= 1) {
      desiredActive = 0; // full recovery break
    }

    // Clamp
    desiredActive = Math.max(0, Math.min(this.maxActiveEnemies, desiredActive));

    // Return guidance for WaveManager
    return {
      desiredActive,
      currentActive: activeEnemies,
      reinforce: activeEnemies < desiredActive && this.lastCombatTime > this.recoveryDelay,
      slowSpawns: hpPct < 0.2 && activeEnemies >= 2,
      fullStop: this.playerLowHealthCount > 8
    };
  }
}
