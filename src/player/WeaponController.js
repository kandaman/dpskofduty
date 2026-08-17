import * as THREE from 'three';
import { AssaultRifle } from './weapons/AssaultRifle.js';
import { WeaponSway } from './WeaponSway.js';

export class WeaponController {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    this.audio = game.audio;

    this.weaponSway = new WeaponSway(game);
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.name = 'weapon_group';

    // Parent weapon group to camera
    this.camera.camera.add(this.weaponGroup);

    this.weapons = [];
    this.currentIndex = 0;
    this.currentWeapon = null;

    // Firing state
    this.isFiring = false;
    this.fireTimer = 0;
    this.fireCooldown = 0;

    // Recoil
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRecoverySpeed = 12;
    this.recoilSmooth = 0;

    // Reload
    this.isReloading = false;
    this.reloadTimer = 0;
    this.reloadDuration = 0;

    // Weapon switch
    this.isSwitching = false;
    this.switchTimer = 0;
    this.switchDirection = 1;

    // Sprint-out
    this.sprintOutTimer = 0;
    this.sprintOutDuration = 0.25; // seconds to raise weapon after sprint
    this.isSprintBlocked = false;

    // Muzzle flash
    this.muzzleLight = null;

    // Shell ejection
    this.shells = [];

    // Hit markers
    this.hitMarkerTimer = 0;

    this._initWeapons();
  }

  _initWeapons() {
    const m4 = new AssaultRifle(this.game);
    this.weapons.push(m4);
    this.currentWeapon = m4;
    this.weaponGroup.add(m4.mesh);
    m4.setVisible(true);

    this.fireCooldown = 60 / m4.stats.fireRate;
    this.reloadDuration = m4.stats.reloadTime;

    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 5);
    this.weaponGroup.add(this.muzzleLight);
  }

  getCurrentWeapon() {
    return this.currentWeapon;
  }

  fire() {
    if (!this.currentWeapon || this.isReloading || this.isSwitching || this.isSprintBlocked) return;
    if (this.currentWeapon.ammo <= 0) {
      this._dryFire();
      return;
    }

    const weapon = this.currentWeapon;
    weapon.fire();

    // Recoil
    const recoilPitch = weapon.stats.recoilPitch + (Math.random() - 0.5) * weapon.stats.recoilSpread;
    const recoilYaw = (Math.random() - 0.5) * weapon.stats.recoilYaw;
    this.recoilPitch += recoilPitch;
    this.recoilYaw += recoilYaw;
    this.game.camera.addRecoil(recoilPitch * 0.02, recoilYaw * 0.01);

    // Camera shake
    this.game.camera.addShake(0.5);

    // Muzzle flash
    this._muzzleFlash();

    // Sound
    this.audio.playProcedural('gunshot', {
      volume: 0.6,
      duration: 0.15
    });

    // Shell ejection
    this._ejectShell();

    // Raycast for hit detection
    this._fireRaycast();

    // ADS reset
    this.isFiring = true;
    this.fireTimer = 0;
  }

  _fireRaycast() {
    const camera = this.game.camera.camera;
    const raycaster = new THREE.Raycaster();

    // Add spread
    const spread = this.currentWeapon.stats.spread * (this.game.camera.isAds ? 0.5 : 1.0);
    const spreadX = (Math.random() - 0.5) * spread;
    const spreadY = (Math.random() - 0.5) * spread;

    // Direction with spread
    const dir = new THREE.Vector3(0, 0, -1);
    const euler = new THREE.Euler(
      camera.rotation.x + spreadY,
      camera.rotation.y + spreadX,
      camera.rotation.z,
      camera.rotation.order
    );
    dir.applyEuler(euler);

    raycaster.set(camera.position, dir);
    raycaster.far = 200;

    // Fire tracer
    if (this.game.effects) {
      this.game.effects.tracers.addTracer(camera.position, dir);
    }

    const enemies = this.game.enemyManager ? this.game.enemyManager.enemies : [];
    const enemyMeshes = enemies.map(e => e.mesh);

    const intersects = raycaster.intersectObjects(enemyMeshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const enemy = enemies.find(e => {
        let obj = hit.object;
        while (obj) {
          if (obj === e.mesh) return true;
          obj = obj.parent;
        }
        return false;
      });

      if (enemy) {
        // Determine hit zone
        const hitPoint = hit.point;
        const enemyPos = enemy.mesh.position;
        const relativeHeight = hitPoint.y - enemyPos.y;

        let damage = this.currentWeapon.stats.damage;
        let isHeadshot = false;

        if (relativeHeight > 1.2) {
          damage *= 2.0;
          isHeadshot = true;
        } else if (relativeHeight > 0.6) {
          damage *= 1.0;
        } else {
          damage *= 0.7;
        }

        const killed = enemy.takeDamage(damage);

        // Hit marker
        this._showHitMarker(isHeadshot);
        this.game.audio.playProcedural('impact', { volume: 0.3, duration: 0.05 });

        if (this.game.effects) {
          this.game.effects.bloodSplat(hitPoint, dir.clone().negate());
        }

        if (killed) {
          this.game.audio.playProcedural('enemy_death', { volume: 0.4, duration: 0.3 });
          this.game.addScore(isHeadshot ? 150 : 100);
          if (isHeadshot) {
            this._showKillFeed('HEADSHOT +150');
          } else {
            this._showKillFeed('ELIMINATED +100');
          }
        } else {
          this.game.audio.playProcedural('enemy_hit', { volume: 0.3, duration: 0.1 });
        }
      } else {
        if (this.game.effects) {
          this.game.effects.bulletImpact(hit.point, hit.face.normal);
        }
      }
    }
  }

  _muzzleFlash() {
    this.muzzleLight.intensity = 10;
    this.muzzleLight.color.setHSL(0.1, 1, 0.5);

    // Expand crosshair on fire
    const cross = document.querySelectorAll('#crosshair .line');
    const expandAmount = 6;
    cross.forEach(el => {
      const orig = el.classList.contains('top') ? '8px' : el.classList.contains('bottom') ? '8px' : '8px';
      if (el.classList.contains('top') || el.classList.contains('bottom')) {
        el.style.height = (8 + expandAmount) + 'px';
        setTimeout(() => el.style.height = '8px', 80);
      } else {
        el.style.width = (8 + expandAmount) + 'px';
        setTimeout(() => el.style.width = '8px', 80);
      }
    });
  }

  _ejectShell() {
    const weapon = this.currentWeapon;
    if (!weapon.shellEjectPoint) return;

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6),
      new THREE.MeshStandardMaterial({
        color: 0xcc9944,
        metalness: 0.8,
        roughness: 0.3
      })
    );
    shell.rotation.x = Math.PI / 2;
    const worldPos = new THREE.Vector3();
    weapon.shellEjectPoint.getWorldPosition(worldPos);
    shell.position.copy(worldPos);
    this.scene.add(shell);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 2 + 1,
      -Math.random() * 1.5
    );
    this.shells.push({
      mesh: shell,
      velocity: vel,
      life: 2.0,
      rotation: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20)
    });
  }

  _showHitMarker(isHeadshot) {
    const hm = document.getElementById('hit-marker');
    if (hm) {
      hm.classList.add('show');
      hm.style.opacity = 1;
      const svg = hm.querySelector('svg');
      if (svg) {
        svg.innerHTML = isHeadshot
          ? '<line x1="8" y1="8" x2="32" y2="32" stroke="#ff4444" stroke-width="3"/><line x1="32" y1="8" x2="8" y2="32" stroke="#ff4444" stroke-width="3"/>'
          : '<line x1="12" y1="12" x2="28" y2="28" stroke="white" stroke-width="2"/><line x1="28" y1="12" x2="12" y2="28" stroke="white" stroke-width="2"/><circle cx="20" cy="20" r="6" fill="none" stroke="white" stroke-width="1.5"/>';
      }
      setTimeout(() => {
        hm.classList.remove('show');
        hm.style.opacity = 0;
      }, 150);
    }
  }

  _showKillFeed(type) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const entry = document.createElement('div');
    entry.className = 'kill-entry show';
    entry.innerHTML = `ENEMY ELIMINATED <span class="headshot">${type}</span>`;
    feed.appendChild(entry);
    setTimeout(() => {
      entry.style.opacity = '0';
      setTimeout(() => entry.remove(), 300);
    }, 2000);
  }

  _dryFire() {
    this.audio.playProcedural('impact', { volume: 0.1, duration: 0.02 });
  }

  reload() {
    if (this.isReloading || this.isSwitching || this.isSprintBlocked) return;
    const weapon = this.currentWeapon;
    if (weapon.ammo >= weapon.stats.magSize || weapon.stats.reserveAmmo <= 0) return;

    this.isReloading = true;
    this.reloadTimer = 0;
    this.reloadDuration = weapon.stats.reloadTime;
    this.audio.playProcedural('reload', { volume: 0.4, duration: 0.3 });
  }

  switchWeapon(index) {
    if (index === this.currentIndex || index >= this.weapons.length) return;
    if (this.isSwitching || this.isReloading) return;

    this.isSwitching = true;
    this.switchTimer = 0;
    this.switchDirection = index > this.currentIndex ? 1 : -1;

    this.weapons[this.currentIndex].setVisible(false);
    this.currentIndex = index;
    this.currentWeapon = this.weapons[index];
    this.currentWeapon.setVisible(true);

    this.fireCooldown = 60 / this.currentWeapon.stats.fireRate;
    this.reloadDuration = this.currentWeapon.stats.reloadTime;
    this._updateHUD();
  }

  _updateHUD() {
    const weapon = this.currentWeapon;
    if (!weapon) return;
    document.getElementById('ammo-current').textContent = weapon.ammo;
    document.getElementById('ammo-reserve').textContent = weapon.stats.reserveAmmo;
  }

  update(dt) {
    // --- Sprint-out system ---
    const isSprinting = this.camera.isSprinting;
    if (isSprinting) {
      this.isSprintBlocked = true;
      this.sprintOutTimer = 0;
    } else if (this.isSprintBlocked) {
      this.sprintOutTimer += dt;
      if (this.sprintOutTimer >= this.sprintOutDuration) {
        this.isSprintBlocked = false;
        this.sprintOutTimer = 0;
      }
    }

    // --- Fire rate limiting ---
    if (this.isFiring) {
      this.fireTimer += dt * 1000;
      if (this.fireTimer >= this.fireCooldown) {
        this.isFiring = false;
        this.fireTimer = 0;
      }
    }

    // --- Auto fire ---
    if (this.game.input.isMouseDown(0) && this.game.input.locked &&
        !this.isReloading && !this.isSwitching && !this.isSprintBlocked) {
      if (!this.isFiring) {
        this.fire();
      }
    }

    // --- Reload ---
    if (this.game.input.isKeyDown('KeyR') && !this.isReloading && !this.isSwitching && !this.isSprintBlocked) {
      this.reload();
    }

    if (this.isReloading) {
      this.reloadTimer += dt * 1000;
      if (this.reloadTimer >= this.reloadDuration) {
        this.isReloading = false;
        const weapon = this.currentWeapon;
        const need = weapon.stats.magSize - weapon.ammo;
        const available = Math.min(need, weapon.stats.reserveAmmo);
        weapon.ammo += available;
        weapon.stats.reserveAmmo -= available;
        this._updateHUD();
        this.reloadTimer = 0;
      }
    }

    // --- Weapon switch ---
    if (this.isSwitching) {
      this.switchTimer += dt * 1000;
      if (this.switchTimer > 300) {
        this.isSwitching = false;
        this.switchTimer = 0;
        this._updateHUD();
      }
    }

    // --- Recoil recovery ---
    if (this.recoilPitch !== 0 || this.recoilYaw !== 0) {
      const recovery = (1 - Math.exp(-this.recoilRecoverySpeed * dt));
      this.recoilPitch *= (1 - recovery);
      this.recoilYaw *= (1 - recovery);
      if (Math.abs(this.recoilPitch) < 0.001) this.recoilPitch = 0;
      if (Math.abs(this.recoilYaw) < 0.001) this.recoilYaw = 0;
    }

    // --- Muzzle light decay ---
    if (this.muzzleLight) {
      this.muzzleLight.intensity *= (1 - Math.exp(-60 * dt));
    }

    // --- Shell physics ---
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.velocity.y -= 15 * dt;
      shell.mesh.position.add(shell.velocity.clone().multiplyScalar(dt));
      shell.mesh.rotation.x += shell.rotation.x * dt;
      shell.mesh.rotation.y += shell.rotation.y * dt;

      shell.life -= dt;
      if (shell.life <= 0 || shell.mesh.position.y < -1) {
        this.scene.remove(shell.mesh);
        this.shells.splice(i, 1);
      }
    }

    // --- Visual recoil on weapon group ---
    const recoilRotX = this.recoilPitch * 0.5;
    const recoilRotY = this.recoilYaw * 0.3;
    this.weaponGroup.rotation.x += (recoilRotX - this.weaponGroup.rotation.x) * (1 - Math.exp(-15 * dt));
    this.weaponGroup.rotation.y += (recoilRotY - this.weaponGroup.rotation.y) * (1 - Math.exp(-15 * dt));
    this.weaponGroup.position.x += (this.recoilYaw * 0.002 - this.weaponGroup.position.x) * (1 - Math.exp(-15 * dt));
    this.weaponGroup.position.y += (Math.abs(this.recoilPitch) * 0.003 - this.weaponGroup.position.y) * (1 - Math.exp(-15 * dt));

    // --- Weapon update (fire animation) ---
    if (this.currentWeapon) {
      this.currentWeapon.update(dt);
    }

    // --- Weapon sway ---
    if (this.currentWeapon && !this.isSwitching) {
      this.weaponSway.update(dt, this.currentWeapon.mesh);
    }

    // --- HUD updates ---
    if (this.currentWeapon) {
      document.getElementById('ammo-current').textContent = this.currentWeapon.ammo;
    }
  }
}
