import * as THREE from 'three';
import { Renderer } from './engine/Renderer.js';
import { InputManager } from './engine/InputManager.js';
import { AudioManager } from './engine/AudioManager.js';
import { MaterialManager } from './engine/MaterialManager.js';
import { AssetManager } from './engine/AssetManager.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { PlayerController } from './player/PlayerController.js';
import { WeaponController } from './player/WeaponController.js';
import { Level } from './environment/Level.js';
import { Lighting } from './environment/Lighting.js';
import { Skybox } from './environment/Skybox.js';
import { EnemyManager } from './enemies/EnemyManager.js';
import { EffectsManager } from './effects/EffectsManager.js';
import { Minimap } from './effects/Minimap.js';
import { WaveManager } from './gameplay/WaveManager.js';
import { AmmoPickup } from './gameplay/AmmoPickup.js';
import { CombatDirector } from './gameplay/CombatDirector.js';
import { PostPipeline } from './postprocessing/PostPipeline.js';

export class Game {
  constructor() {
    this.running = false;
    this.score = 0;
    this.gameOver = false;

    // Core
    this.scene = new THREE.Scene();

    // Systems (order: material manager first so textures are ready for level/weapons)
    this.input = new InputManager();
    this.materials = new MaterialManager();
    this.assetManager = new AssetManager();
    this.camera = new PlayerCamera(this);
    this.renderer = new Renderer(this);
    this.audio = new AudioManager(this.camera.camera);
    this.player = new PlayerController(this);
    this.weaponController = new WeaponController(this);
    this.enemyManager = new EnemyManager(this);
    this.effects = new EffectsManager(this.scene);

    // Level
    this.lighting = new Lighting(this.scene);
    this.level = new Level(this.scene, this.materials);
    this.skybox = new Skybox(this.scene);

    // Share obstacle meshes with enemy manager
    this.enemyManager.obstacles = this.level.getObstacleMeshes();

    // Set camera reference in PlayerController
    this.player.camera = this.camera;

    // Clock
    this.clock = new THREE.Clock();

    // DT cap: can be increased for testing at low framerates
    this.dtCap = 0.05;

    // Game loop binding
    this._boundLoop = this._loop.bind(this);

    // F3 input/camera debug overlay (diagnoses "key X doesn't work" /
    // "view spins at pole" reports remotely)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this._toggleDebug();
      }
    });

    // Player alive state
    this.player.alive = true;
    this.player.maxHealth = 100;
    this.player.health = 100;

    // Health regen
    this.healthRegenDelay = 3.0; // seconds after last hit before regen starts
    this.healthRegenTimer = 0;
    this.healthRegenRate = 15; // HP per second

    // Gameplay systems
    this.combatDirector = new CombatDirector(this);
    this.waveManager = new WaveManager(this);
    this.ammoPickup = new AmmoPickup(this.scene);
    this.ammoPickup.game = this;

    // Minimap
    this.minimap = new Minimap(this);

    // Death animation
    this._deathAnimActive = false;
    this._deathAnimTimer = 0;
    this._deathAnimDuration = 1.5;

    // Post-processing (created after renderer is set up)
    this.postPipeline = new PostPipeline(
      this.renderer.renderer,
      this.scene,
      this.camera.camera
    );
  }

  async start() {
    this.running = true;
    this.clock.start();

    // Load HDRI environment map for PBR lighting (async, non-blocking)
    this._loadEnvironmentMap();

    // Start wave-based progression
    this.waveManager.start();

    this._loop();
  }

  async _loadEnvironmentMap() {
    try {
      const envMap = await this.assetManager.loadEnvironmentMap(
        'industrial_sunset_2k.hdr',
        this.scene,
        this.renderer.renderer
      );
      // Propagate envMap to all PBR materials
      this.materials.setEnvMap(envMap);
      this.materials.setEnvMapIntensity(0.8);
    } catch (err) {
      // HDRI not available — fall back to procedural sky lighting
      console.log('HDRI not available, using procedural sky:', err.message);
    }
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(this._boundLoop);

    const dt = Math.min(this.clock.getDelta(), this.dtCap);

    // Update world matrices for raycasting (enemy LOS checks)
    this.scene.updateMatrixWorld(true);

    this._update(dt);
    this._render(dt);
  }

  _update(dt) {
    // Hide/show UI based on pointer lock
    const hud = document.getElementById('hud');
    if (hud) {
      hud.style.display = this.input.locked ? 'block' : 'none';
    }

    // Death animation (runs even when game is over)
    if (this._deathAnimActive) {
      this._deathAnimTimer += dt;
      const t = Math.min(this._deathAnimTimer / this._deathAnimDuration, 1);
      const baseY = 0;
      this.camera.camera.position.y = baseY + (0.5 - 0.5 * Math.cos(t * Math.PI)) * 1.7;
      this.camera.pitch += (-Math.PI / 6 - this.camera.pitch) * (1 - Math.exp(-3 * dt));
      this.camera.camera.rotation.z = t * 0.3;
      const hp = 1 - t;
      var hf = document.getElementById('health-fill');
      var ht = document.getElementById('health-text');
      if (hf) hf.style.width = (hp * 100) + '%';
      if (ht) ht.textContent = Math.ceil(hp * 100);
      const di = document.getElementById('damage-indicator');
      if (di) di.style.borderColor = `rgba(255,0,0,${t * 0.8})`;
      if (t >= 1) {
        this._deathAnimActive = false;
        this._showGameOver();
      }
      return;
    }

    if (this.gameOver) return;

    // Update player
    this.player.update(dt);

    // Update camera (consumes mouse delta internally)
    this.camera.update(dt);

    // Update weapons
    this.weaponController.update(dt);

    // Debug weapon position
    this.weaponController.weaponGroup.position.set(0, 0, 0);

    // Update wave manager
    this.waveManager.update(dt);

    // Update enemies
    this.enemyManager.update(dt);

    // Update ammo pickup
    this.ammoPickup.update(dt, this.player.position);

    // Update skybox
    this.skybox.update(dt);

    // Update effects
    this.effects.update(dt);

    // Health regen
    const isRegenActive = this.healthRegenTimer >= this.healthRegenDelay;
    if (this.player.health > 0 && this.player.health < this.player.maxHealth) {
      this.healthRegenTimer += dt;
      if (this.healthRegenTimer >= this.healthRegenDelay) {
        this.player.health = Math.min(
          this.player.maxHealth,
          this.player.health + this.healthRegenRate * dt
        );
      }
    }

    // Update score display
    const scoreEl = document.getElementById('score-text');
    if (scoreEl) scoreEl.textContent = this.score;

    // Update health display
    const healthPct = Math.max(0, this.player.health / this.player.maxHealth);
    const healthFill = document.getElementById('health-fill');
    const healthText = document.getElementById('health-text');
    if (healthFill) healthFill.style.width = (healthPct * 100) + '%';
    if (healthText) healthText.textContent = Math.ceil(this.player.health);

    // Regen bar (shows when regen will start)
    const regenBar = document.getElementById('regen-fill');
    if (regenBar) {
      if (isRegenActive && healthPct < 1) {
        regenBar.style.width = '100%';
      } else if (healthPct < 1) {
        const regenProgress = this.healthRegenTimer / this.healthRegenDelay;
        regenBar.style.width = (regenProgress * 100) + '%';
      } else {
        regenBar.style.width = '0%';
      }
    }

    // Damage indicator & low health effect
    const di = document.getElementById('damage-indicator');
    if (di) {
      di.classList.remove('hit');
      if (healthPct < 0.3) {
        const intensity = (1 - healthPct / 0.3) * 0.6;
        di.style.borderColor = `rgba(255,0,0,${intensity})`;
        di.style.borderWidth = '6px';
      } else {
        di.style.borderColor = 'transparent';
        di.style.borderWidth = '4px';
      }
    }

    // Update compass
    this._updateCompass();

    // Update minimap
    this.minimap.update();

    // F3 debug overlay
    this._updateDebug();
  }

  _toggleDebug() {
    if (this.debugOverlay) {
      this.debugOverlay.remove();
      this.debugOverlay = null;
      return;
    }
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.7);'
      + 'color:#0f0;font:12px monospace;padding:8px;z-index:10000;white-space:pre;line-height:1.5';
    document.body.appendChild(div);
    this.debugOverlay = div;
  }

  _updateDebug() {
    if (!this.debugOverlay) return;
    const i = this.input;
    const c = this.camera;
    const key = k => i.isKeyDown(k) ? '[ON ]' : '[   ]';
    this.debugOverlay.textContent =
      'locked : ' + i.locked + '\n'
      + 'W ' + key('KeyW') + '   A ' + key('KeyA') + '\n'
      + 'S ' + key('KeyS') + '   D ' + key('KeyD') + '\n'
      + 'lastKey: ' + (i.lastKeyCode || '-') + '\n'
      + 'yaw   : ' + c.yaw.toFixed(2) + '\n'
      + 'pitch : ' + THREE.MathUtils.radToDeg(c.pitch).toFixed(0) + 'deg\n'
      + 'pos   : ' + this.player.position.x.toFixed(1) + ', ' + this.player.position.z.toFixed(1);
  }

  _updateCompass() {
    const compass = document.getElementById('compass');
    if (!compass) return;

    const yaw = this.camera.yaw;
    const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;

    // Build compass once
    if (!this._compassBuilt) {
      this._compassBuilt = true;
      this._compassStrip = document.createElement('div');
      this._compassStrip.style.cssText = 'position:absolute;left:100px;transition:transform 0.05s;';
      compass.appendChild(this._compassStrip);

      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const pxPerDeg = 2;
      for (let d = -180; d <= 180; d += 5) {
        const tick = document.createElement('div');
        if (d % 45 === 0) {
          tick.className = 'compass-tick major';
          const label = document.createElement('div');
          label.className = 'compass-label';
          const idx = ((d + 720) % 360) / 45;
          label.textContent = dirs[Math.round(idx) % 8];
          label.style.left = '0px';
          tick.appendChild(label);
        } else if (d % 10 === 0) {
          tick.className = 'compass-tick';
        } else continue;

        tick.style.cssText += `position:absolute;left:${d * pxPerDeg + 360}px;`;
        tick.style.width = '1px';
        if (d % 45 === 0) tick.style.height = '10px';
        else tick.style.height = '6px';
        tick.style.background = d % 45 === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
        tick.style.top = d % 45 === 0 ? '0px' : '3px';
        this._compassStrip.appendChild(tick);
      }
    }

    // Just translate the strip
    this._compassStrip.style.transform = `translateX(${-deg * 2 + 360}px)`;
  }

  _render(dt) {
    this.postPipeline.render(dt);
  }

  addScore(points) {
    this.score += points;
  }

  takeDamage(amount) {
    if (this.player.health <= 0) return;

    this.player.health -= amount;
    this.healthRegenTimer = 0; // Reset regen delay

    // Show damage indicator
    const di = document.getElementById('damage-indicator');
    if (di) {
      di.classList.add('hit');
      setTimeout(() => di.classList.remove('hit'), 200);
    }

    if (this.player.health <= 0) {
      this.player.health = 0;
      this._onDeath();
    }
  }

  _onDeath() {
    this.gameOver = true;
    this._deathAnimActive = true;
    this._deathAnimTimer = 0;
    this.input.unlock();
  }

  _showGameOver() {
    var fs = document.getElementById('final-score');
    var fk = document.getElementById('final-kills');
    if (fs) fs.textContent = this.score;
    if (fk) fk.textContent = this.enemyManager.killCount;
    var go = document.getElementById('game-over');
    if (go) go.style.display = 'flex';
  }

  _showVictory() {
    var fs = document.getElementById('final-score');
    var fk = document.getElementById('final-kills');
    if (fs) fs.textContent = this.score;
    if (fk) fk.textContent = this.enemyManager.killCount;
    var wa = document.getElementById('wave-announce');
    if (wa) { wa.textContent = 'MISSION COMPLETE'; wa.style.opacity = '1'; }

    const hud = document.getElementById('hud');
    if (hud) {
      hud.innerHTML = `
        <div id="victory-screen">
          <h1 class="victory-title">MISSION COMPLETE</h1>
          <div class="victory-stats">
            <p>SCORE: <span id="final-score">${this.score}</span></p>
            <p>KILLS: <span id="final-kills">${this.enemyManager.killCount}</span></p>
          </div>
          <div class="victory-sub">ALL HOSTILES ELIMINATED</div>
          <button id="victory-restart" onclick="window.game.restart()" class="victory-btn">PLAY AGAIN</button>
        </div>
      `;
    }
  }

  restart() {
    // Reset player
    this.player.health = this.player.maxHealth;
    this.player.alive = true;
    this.player.position.set(0, 0, 0);
    this.player.velocity.set(0, 0, 0);
    this.player.isGrounded = true;

    // Reset camera
    this.camera.yaw = 0;
    this.camera.pitch = 0;
    this.camera.velocity.yaw = 0;
    this.camera.velocity.pitch = 0;
    this.camera.currentFov = this.camera.baseFov;

    // Reset score
    this.score = 0;

    // Reset enemies
    this.enemyManager.reset();

    // Reset effects
    this.effects.reset();

    // Reset wave manager, combat director, and ammo pickup
    this.combatDirector.reset();
    this.waveManager.reset();
    this.ammoPickup.reset();

    // Reset weapons
    const weapon = this.weaponController.currentWeapon;
    weapon.ammo = weapon.stats.magSize;
    weapon.stats.reserveAmmo = 360;

    // Reset UI — guard against null if HUD was replaced (e.g. after victory)
    var hm = document.getElementById('hit-marker');
    if (hm) { hm.classList.remove('show'); hm.style.opacity = '0'; }
    var kf = document.getElementById('kill-feed');
    if (kf) kf.innerHTML = '';
    var di = document.getElementById('damage-indicator');
    if (di) di.classList.remove('hit');
    var go = document.getElementById('game-over');
    if (go) go.style.display = 'none';

    this._deathAnimActive = false;
    this._deathAnimTimer = 0;

    this.gameOver = false;
    this.running = true;

    // Re-lock pointer
    this.input.lock();

    // Start wave progression
    this.waveManager.start();
  }

  stop() {
    this.running = false;
    this.input.dispose();
    this.renderer.dispose();
  }
}
