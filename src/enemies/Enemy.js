import * as THREE from 'three';

export class Enemy {
  constructor(game, position, type = 'rifleman') {
    this.game = game;
    this.type = type;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.obstacles = [];

    // State machine
    this.state = 'idle';
    this.stateTimer = 0;

    // Movement
    this.position = position.clone();
    this.velocity = new THREE.Vector3();

    // AI core
    this.detectionRange = 30;
    this.attackRange = 20;
    this.fireTimer = 0;
    this.damage = 8;
    this.accuracy = 0.08;

    // Type-specific defaults
    this._applyTypeDefaults(type);

    // Patrol
    this.patrolTarget = this._randomPatrolPoint();
    this.patrolWaitTime = 0;

    // Combat movement
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 2 + Math.random() * 3;
    this.lastKnownPlayerPos = null;
    this.combatMoveTimer = 0;
    this.lostSightTimer = 0;

    // Cover seeking
    this.coverPos = null;
    this.coverTimer = 0;
    this.inCover = false;
    this.coverSearchCooldown = 0;

    // Obstacle avoidance
    this.avoidDir = 0;
    this.avoidTimer = 0;

    // Animation
    this.animTime = 0;
    this.hitAnimTime = 0;
    this.deathAnimTime = 0;

    // Telegraphing
    this.aimWarningActive = false;
    this.aimWarningTimer = 0;

    // Telemetry (observational only — does not affect gameplay)
    this.telemetry = { shotsAttempted: 0, hits: 0, damageDealt: 0 };

    // Mesh
    this.mesh = this._createMesh();
    this.mesh.position.copy(position);
    this.game.scene.add(this.mesh);

    // Health bar
    this.healthBar = this._createHealthBar();

    // Line-of-sight raycaster (reusable)
    this._losRaycaster = new THREE.Raycaster();
    this._losRaycaster.far = 60;
  }

  _createMesh() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x445566, roughness: 0.7, metalness: 0.1
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xddaa88, roughness: 0.6, metalness: 0.05
    });
    const gearMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a3a, roughness: 0.8, metalness: 0.2
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.8, metalness: 0.1
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8), bodyMat);
    torso.position.y = 0.8;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), headMat);
    head.position.y = 1.25;
    group.add(head);
    this.headMesh = head;

    // Helmet
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      gearMat
    );
    helmet.position.y = 1.25;
    helmet.rotation.x = Math.PI;
    group.add(helmet);

    // Vest
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.15), gearMat);
    vest.position.set(0, 0.8, -0.12);
    group.add(vest);

    // Arms
    const armGeom = new THREE.CylinderGeometry(0.06, 0.07, 0.4, 6);
    for (let side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeom, bodyMat);
      arm.position.set(side * 0.35, 0.75, 0);
      arm.rotation.z = side * 0.3;
      group.add(arm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), headMat);
      hand.position.set(side * 0.4, 0.55, 0);
      group.add(hand);

      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, 0.25),
        darkMat
      );
      gun.position.set(side * 0.42, 0.55, -0.15);
      gun.rotation.x = 0.5;
      group.add(gun);
    }

    // Legs
    const legGeom = new THREE.CylinderGeometry(0.08, 0.09, 0.4, 6);
    for (let side of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(legGeom, gearMat);
      leg.position.set(side, 0.2, 0);
      group.add(leg);
    }

    // Shoulder pads
    for (let side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), gearMat);
      pad.position.set(side * 0.28, 0.9, 0);
      pad.scale.set(1, 0.6, 0.8);
      group.add(pad);
    }

    // Belt
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 4, 8), gearMat);
    belt.position.set(0, 0.55, 0);
    belt.rotation.x = Math.PI / 2;
    group.add(belt);

    group.castShadow = true;
    group.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return group;
  }

  _applyTypeDefaults(type) {
    switch (type) {
      case 'rifleman':
        this.moveSpeed = 2 + Math.random() * 1.5;
        this.acceleration = 8;
        this.fireRate = 250 + Math.random() * 300;
        this.damage = 8;
        this.baseHitChance = 0.50;
        this.rangePenaltyPerMeter = 0.02;
        this.detectionRange = 30;
        this.attackRange = 20;
        this.health = 100;
        break;

      case 'rusher':
        this.moveSpeed = 5 + Math.random() * 1.5;
        this.acceleration = 14;
        this.fireRate = 400 + Math.random() * 200;
        this.damage = 15;
        this.baseHitChance = 0.55;
        this.rangePenaltyPerMeter = 0.05;
        this.detectionRange = 35;
        this.attackRange = 8;
        this.health = 60;
        this.closingDistance = 1;
        break;

      case 'sniper':
        this.moveSpeed = 1 + Math.random() * 0.5;
        this.acceleration = 4;
        this.fireRate = 1500 + Math.random() * 500;
        this.damage = 40;
        this.baseHitChance = 0.65;
        this.rangePenaltyPerMeter = 0.01;
        this.detectionRange = 50;
        this.attackRange = 40;
        this.health = 50;
        break;

      case 'boss':
        this.moveSpeed = 1.5;
        this.acceleration = 6;
        this.fireRate = 400;
        this.damage = 20;
        this.baseHitChance = 0.55;
        this.rangePenaltyPerMeter = 0.015;
        this.detectionRange = 50;
        this.attackRange = 30;
        this.health = 300;
        break;
    }
    this.maxHealth = this.health;
  }

  _createHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 64, 8);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 1.6;
    sprite.scale.set(0.4, 0.05, 1);
    this.mesh.add(sprite);
    return { sprite, canvas, ctx, texture };
  }

  _updateHealthBar() {
    const pct = this.health / this.maxHealth;
    const { canvas, ctx, texture } = this.healthBar;
    ctx.clearRect(0, 0, 64, 8);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = pct > 0.5 ? '#44cc44' : (pct > 0.25 ? '#cccc44' : '#cc4444');
    ctx.fillRect(0, 0, 64 * pct, 8);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 64, 8);
    texture.needsUpdate = true;
    this.healthBar.sprite.visible = pct < 1;
  }

  _randomPatrolPoint() {
    return new THREE.Vector3(
      (Math.random() - 0.5) * 30,
      0,
      (Math.random() - 0.5) * 30
    );
  }

  _distanceToPlayer() {
    if (!this.game.player) return Infinity;
    return this.position.distanceTo(this.game.player.position);
  }

  // ─── LINE OF SIGHT ────────────────────────────────────────────
  _hasLineOfSight(playerPos) {
    if (!playerPos || !this.obstacles.length) return true;
    const start = this.position.clone();
    start.y += 0.8; // chest height
    const end = playerPos.clone();
    end.y += 0.8;
    const dir = new THREE.Vector3().subVectors(end, start);
    const dist = dir.length();
    if (dist < 0.5) return true;
    dir.divideScalar(dist);

    this._losRaycaster.set(start, dir);
    this._losRaycaster.far = dist + 0.1;
    const hits = this._losRaycaster.intersectObjects(this.obstacles, false);
    return hits.length === 0 || hits[0].distance >= dist;
  }

  // ─── OBSTACLE AVOIDANCE ───────────────────────────────────────
  _steerAvoidObstacles(dt) {
    if (!this.obstacles.length) return;

    // Cast feeler rays forward, left-forward, right-forward
    const feelerDirs = [
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(-0.5, 0, -1).normalize(),
      new THREE.Vector3(0.5, 0, -1).normalize()
    ];
    const feelerLen = this.type === 'rusher' ? 2.5 : 2.0;

    let avoid = 0;
    for (const feelerDir of feelerDirs) {
      // Rotate feeler by enemy's facing
      const rotatedDir = feelerDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
      const start = new THREE.Vector3(this.position.x, 0.5, this.position.z);
      const end = start.clone().add(rotatedDir.multiplyScalar(feelerLen));

      this._losRaycaster.set(start, new THREE.Vector3().subVectors(end, start).normalize());
      this._losRaycaster.far = feelerLen;
      const hits = this._losRaycaster.intersectObjects(this.obstacles, false);

      if (hits.length > 0 && hits[0].distance < feelerLen) {
        // Steer away — stronger for center feeler
        const steerStrength = feelerDir.z < -0.8 ? 1.0 : 0.6;
        avoid += steerStrength * (feelerDir.x >= 0 ? 1 : -1);
      }
    }

    if (avoid !== 0) {
      this.avoidDir = Math.sign(avoid);
      this.avoidTimer = 0.3;
    } else if (this.avoidTimer > 0) {
      this.avoidTimer -= dt;
      if (this.avoidTimer <= 0) this.avoidDir = 0;
    }

    return this.avoidDir;
  }

  // ─── COVER SEEKING ────────────────────────────────────────────
  _findNearestCover() {
    if (!this.obstacles.length || !this.game.player) return null;

    const playerPos = this.game.player.position;
    let bestCover = null;
    let bestScore = Infinity;

    for (const obs of this.obstacles) {
      // Only use box obstacles that are at least 0.5m tall for cover
      const geom = obs.geometry;
      if (!geom || geom.type !== 'BoxGeometry') continue;
      const halfH = geom.parameters.height / 2;
      if (halfH < 0.25) continue;

      // Check all 4 cardinal directions from obstacle
      const obsPos = obs.position;
      const halfW = geom.parameters.width / 2;
      const halfD = geom.parameters.depth / 2;

      const candidates = [
        new THREE.Vector3(obsPos.x + halfW + 0.8, 0, obsPos.z),
        new THREE.Vector3(obsPos.x - halfW - 0.8, 0, obsPos.z),
        new THREE.Vector3(obsPos.x, 0, obsPos.z + halfD + 0.8),
        new THREE.Vector3(obsPos.x, 0, obsPos.z - halfD - 0.8),
      ];

      for (const candidate of candidates) {
        const distToEnemy = this.position.distanceTo(candidate);
        if (distToEnemy > 10) continue;

        const distToPlayer = candidate.distanceTo(playerPos);
        if (distToPlayer < 5) continue; // too close to player

        // Score: close to enemy, far from player, between enemy and player
        const dirToPlayer = new THREE.Vector3().subVectors(playerPos, candidate).normalize();
        const dirFromEnemy = new THREE.Vector3().subVectors(candidate, this.position).normalize();
        const betweenScore = 1 - Math.abs(dirToPlayer.dot(dirFromEnemy)); // 0 = between enemy and player

        const score = distToEnemy * 0.3 + distToPlayer * 0.2 + betweenScore * 5;
        if (score < bestScore) {
          bestScore = score;
          bestCover = candidate;
        }
      }
    }

    return bestCover;
  }

  // ─── COMBAT BEHAVIORS ─────────────────────────────────────────
  takeDamage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    this._updateHealthBar();
    this.state = 'hit';
    this.hitAnimTime = 0;

    if (this.health <= 0) {
      this.health = 0;
      this._die();
      return true;
    }

    this.state = 'combat';
    this.lastKnownPlayerPos = this.game.player ? this.game.player.position.clone() : null;
    return false;
  }

  _die() {
    this.alive = false;
    this.state = 'dead';
    this.deathAnimTime = 0;
    this.healthBar.sprite.visible = false;
  }

  _lookAt(target) {
    const dir = new THREE.Vector3().subVectors(target, this.position);
    dir.y = 0;
    if (dir.length() > 0.01) {
      const angle = Math.atan2(dir.x, dir.z);
      this.mesh.rotation.y = angle;
    }
  }

  update(dt) {
    if (!this.alive && this.state !== 'dead') return;

    const playerPos = this.game.player ? this.game.player.position : new THREE.Vector3(0, 0, 0);
    const dirToPlayer = new THREE.Vector3().subVectors(playerPos, this.position);
    dirToPlayer.y = 0;
    const toPlayer = dirToPlayer.clone().normalize();
    const distToPlayer = dirToPlayer.length();

    // Check line of sight
    const hasLoS = this._hasLineOfSight(playerPos);

    // State machine
    switch (this.state) {
      case 'idle':
      case 'patrol':
        this._patrol(dt);
        if (distToPlayer < this.detectionRange) {
          this.state = 'alert';
          this.stateTimer = 0.5 + Math.random() * 0.5;
          this.lastKnownPlayerPos = playerPos.clone();
        }
        break;

      case 'alert':
        this.stateTimer -= dt;
        this._lookAt(playerPos);
        this.lastKnownPlayerPos = playerPos.clone();
        this.mesh.position.y = 0.03; // crouch slightly
        if (this.stateTimer <= 0) {
          this.state = 'combat';
          this.combatMoveTimer = 0;
        }
        if (distToPlayer > this.detectionRange * 1.5) {
          this.state = 'patrol';
        }
        break;

      case 'combat':
        if (hasLoS) {
          this.lostSightTimer = 0;
          this.lastKnownPlayerPos = playerPos.clone();
        } else {
          this.lostSightTimer += dt;
        }
        this._combatUpdate(dt, playerPos, toPlayer, distToPlayer, hasLoS);
        if (distToPlayer > this.detectionRange * 2 && !hasLoS) {
          this.state = 'patrol';
        }
        break;

      case 'hit':
        this.hitAnimTime += dt;
        const flinch = Math.sin(this.hitAnimTime * 25) * 0.15 * Math.max(0, 1 - this.hitAnimTime * 4);
        this.mesh.position.x += (toPlayer.x || 0) * -flinch * 0.5;
        this.mesh.position.z += (toPlayer.z || 0) * -flinch * 0.5;
        if (this.hitAnimTime > 0.35) {
          this.state = 'combat';
          this.combatMoveTimer = 0;
          this.lastKnownPlayerPos = playerPos.clone();
        }
        break;

      case 'dead':
        this.deathAnimTime += dt;
        const deathRot = Math.min(this.deathAnimTime * 2, 1);
        this.mesh.rotation.x = deathRot * Math.PI / 2;
        this.mesh.position.y = -deathRot * 0.3;
        if (this.deathAnimTime > 3) {
          this.mesh.visible = false;
        }
        return;
    }

    // Idle breathing
    this.animTime += dt;
    if (this.state !== 'dead' && this.state !== 'hit') {
      this.mesh.position.y += Math.sin(this.animTime * 2) * 0.002;
    }
  }

  _patrol(dt) {
    this.patrolWaitTime -= dt;
    if (this.patrolWaitTime > 0) return;

    const dir = new THREE.Vector3().subVectors(this.patrolTarget, this.position);
    dir.y = 0;

    if (dir.length() < 1) {
      this.patrolTarget = this._randomPatrolPoint();
      this.patrolWaitTime = 1 + Math.random() * 3;
      return;
    }

    dir.normalize();
    this.velocity.x += (dir.x * this.moveSpeed * 0.5 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
    this.velocity.z += (dir.z * this.moveSpeed * 0.5 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));

    this._applyMovement(dt);
    this._lookAt(new THREE.Vector3(this.patrolTarget.x, 0, this.patrolTarget.z));
    this._walkAnim(dt, 0.5);
  }

  _combatUpdate(dt, playerPos, toPlayer, distToPlayer, hasLoS) {
    this._lookAt(playerPos);
    this.combatMoveTimer += dt;
    this.strafeTimer -= dt;

    // Telegraphing for snipers and rushers
    this._updateTelegraphing(dt, hasLoS, distToPlayer);

    switch (this.type) {
      case 'rifleman':
        this._combatRifleman(dt, playerPos, toPlayer, distToPlayer, hasLoS);
        break;
      case 'rusher':
        this._combatRusher(dt, playerPos, toPlayer, distToPlayer, hasLoS);
        break;
      case 'sniper':
        this._combatSniper(dt, playerPos, toPlayer, distToPlayer, hasLoS);
        break;
      case 'boss':
        this._combatBoss(dt, playerPos, toPlayer, distToPlayer, hasLoS);
        break;
    }
  }

  // ─── TELEGRAPHING ─────────────────────────────────────────────
  _updateTelegraphing(dt, hasLoS, distToPlayer) {
    if (this.type === 'sniper' && hasLoS && this.state === 'combat') {
      // Sniper aim warning: active just before firing
      this.aimWarningTimer += dt;
      if (this.fireTimer < this.fireRate * 0.3 && this.fireTimer > 0) {
        if (!this.aimWarningActive) {
          this.aimWarningActive = true;
          this._showAimIndicator(true);
        }
      } else {
        if (this.aimWarningActive) {
          this.aimWarningActive = false;
          this._showAimIndicator(false);
        }
      }
    } else if (this.type === 'rusher' && distToPlayer < 12) {
      // Rusher audio telegraph: play distinctive sound when close
      if (this.state === 'combat' && Math.random() < dt * 0.5) {
        this.game.audio.playProcedural('sniper_warning', { volume: 0.2, duration: 0.15 });
      }
    }
  }

  _showAimIndicator(active) {
    const indicator = document.getElementById('sniper-indicator');
    if (!indicator) {
      // Create one lazily
      const div = document.createElement('div');
      div.id = 'sniper-indicator';
      div.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none; z-index: 99;
        border: 3px solid transparent;
        box-shadow: inset 0 0 60px rgba(255,50,50,0);
        transition: all 0.1s;
      `;
      document.body.appendChild(div);
    }
    const el = document.getElementById('sniper-indicator');
    if (active) {
      // Calculate direction to this sniper from player
      const playerPos = this.game.player.position;
      const dir = new THREE.Vector3().subVectors(this.position, playerPos).normalize();
      const angle = Math.atan2(dir.x, dir.z);
      const yaw = this.game.camera.yaw;
      const relAngle = ((angle - yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

      // Show directional indicator
      const screenX = 960 + Math.sin(relAngle) * 300;
      const screenY = 540 - Math.cos(relAngle) * 200;

      el.style.cssText = `
        position: fixed;
        pointer-events: none; z-index: 99;
        background: none;
        opacity: 0.6;
      `;
      el.innerHTML = `<div style="
        position:absolute;left:${screenX - 15}px;top:${screenY - 15}px;
        width:30px;height:30px;
        border-left: 3px solid #ff3333;
        border-top: 3px solid #ff3333;
        transform: rotate(${relAngle * 180 / Math.PI}deg);
        opacity: ${this.damage > 25 ? 0.8 : 0.4};
      "></div>`;
    } else {
      el.innerHTML = '';
      el.style.opacity = '0';
    }
  }

  // ─── RIFLEMAN ─────────────────────────────────────────────────
  _combatRifleman(dt, playerPos, toPlayer, distToPlayer, hasLoS) {
    // Cover seeking
    this.coverSearchCooldown -= dt;
    if (this.coverSearchCooldown <= 0 && (!this.inCover || this.coverPos === null)) {
      this.coverPos = this._findNearestCover();
      this.coverSearchCooldown = 3 + Math.random() * 2;
      if (this.coverPos) {
        this.coverTimer = 0;
      }
    }

    // If we have a cover position and are not yet there, move to it
    if (this.coverPos && !this.inCover) {
      const dirToCover = new THREE.Vector3().subVectors(this.coverPos, this.position);
      dirToCover.y = 0;
      const distToCover = dirToCover.length();

      if (distToCover > 1) {
        // Move to cover - apply obstacle avoidance
        const avoid = this._steerAvoidObstacles(dt) || 0;
        const moveDir = dirToCover.normalize();
        const strafe = new THREE.Vector3(-moveDir.z, 0, moveDir.x);
        const finalDir = moveDir.clone().add(strafe.multiplyScalar(avoid * 0.5)).normalize();

        this.velocity.x += (finalDir.x * this.moveSpeed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
        this.velocity.z += (finalDir.z * this.moveSpeed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
        this._applyMovement(dt);
        this._walkAnim(dt, 1.0);
        return;
      } else {
        this.inCover = true;
        this.coverTimer = 2 + Math.random() * 3;
      }
    }

    // In cover: peek and fire
    if (this.inCover) {
      this.coverTimer -= dt;
      // Peek out slightly
      const peekAmount = Math.sin(this.combatMoveTimer * 2) * 0.2;
      this.mesh.position.x += peekAmount * 0.05;

      if (hasLoS) {
        this.fireTimer -= dt * 1000;
        if (this.fireTimer <= 0) {
          this._fireAtPlayer(distToPlayer, hasLoS);
          this.fireTimer = this.fireRate + (Math.random() - 0.5) * 100;
        }
      } else {
        // Lost sight - move out of cover to reacquire
        if (this.lostSightTimer > 1.5) {
          this.inCover = false;
          this.coverPos = null;
          this.lastKnownPlayerPos = this.game.player ? this.game.player.position.clone() : null;
        }
      }

      // Leave cover after timer
      if (this.coverTimer <= 0) {
        this.inCover = false;
        this.coverPos = null;
        this.strafeTimer = 0.5 + Math.random();
      }

      if (distToPlayer > this.attackRange * 0.8) {
        // Approach while maintaining cover idea
        const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
        const moveDir = toPlayer.clone().add(strafe.multiplyScalar(this.strafeDir * 0.3));
        moveDir.normalize();
        this.velocity.x += (moveDir.x * this.moveSpeed * 0.3 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
        this.velocity.z += (moveDir.z * this.moveSpeed * 0.3 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
        this._applyMovement(dt);
      }

      return;
    }

    // Not in cover - normal rifle combat with obstacle avoidance
    const avoid = this._steerAvoidObstacles(dt) || 0;

    if (distToPlayer > this.attackRange * 0.8) {
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = toPlayer.clone().add(strafe.multiplyScalar((this.strafeDir + avoid) * 0.3));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
      this._walkAnim(dt, 1.0);
    } else {
      const strafeAxis = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const pushPull = Math.sin(this.combatMoveTimer * 0.7) * 0.3;
      const moveDir = strafeAxis.clone().multiplyScalar(this.strafeDir + avoid * 0.5)
        .add(toPlayer.clone().multiplyScalar(pushPull));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * 0.7 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * 0.7 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));

      if (hasLoS) {
        this.fireTimer -= dt * 1000;
        if (this.fireTimer <= 0) {
          this._fireAtPlayer(distToPlayer, hasLoS);
          this.fireTimer = this.fireRate + (Math.random() - 0.5) * 100;
        }
      }
      this._walkAnim(dt, 0.7);
    }

    this._applyMovement(dt);
  }

  // ─── RUSHER ───────────────────────────────────────────────────
  _combatRusher(dt, playerPos, toPlayer, distToPlayer, hasLoS) {
    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1);
      this.strafeTimer = 0.5 + Math.random() * 1;
    }

    // Obstacle-aware charging
    const avoid = this._steerAvoidObstacles(dt) || 0;

    const strafeOffset = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const weaveAmount = distToPlayer < 5 ? 0.1 : 0.4;
    let moveDir = toPlayer.clone().add(strafeOffset.multiplyScalar((this.strafeDir + avoid * 0.5) * weaveAmount));

    // If we lost sight of the player, move toward last known position
    if (!hasLoS && this.lostSightTimer > 0.5) {
      const lastPos = this.lastKnownPlayerPos || playerPos;
      moveDir = new THREE.Vector3().subVectors(lastPos, this.position);
      moveDir.y = 0;
    }

    moveDir.normalize();

    const speedMul = 0.5 + (1 - Math.min(distToPlayer / 25, 1)) * 0.5;
    const speed = this.moveSpeed * speedMul;

    this.velocity.x += (moveDir.x * speed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
    this.velocity.z += (moveDir.z * speed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    this._walkAnim(dt, speedMul * 1.5);

    // Fire when close and have LOS
    if (distToPlayer < this.attackRange && hasLoS) {
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this._fireAtPlayer(distToPlayer, hasLoS);
        this.fireTimer = this.fireRate + (Math.random() - 0.5) * 100;
      }
    }

    this._applyMovement(dt);
  }

  // ─── SNIPER ───────────────────────────────────────────────────
  _combatSniper(dt, playerPos, toPlayer, distToPlayer, hasLoS) {
    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1);
      this.strafeTimer = 3 + Math.random() * 2;
    }

    if (distToPlayer < this.attackRange * 0.6) {
      // Retreat
      const retreatDir = toPlayer.clone().negate();
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = retreatDir.add(strafe.multiplyScalar(this.strafeDir * 0.5));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    } else {
      // Hold position with slight strafe
      this.velocity.x *= (1 - Math.exp(-5 * dt));
      this.velocity.z *= (1 - Math.exp(-5 * dt));
    }

    this._walkAnim(dt, 0.3);

    // Only fire when player is visible
    if (hasLoS) {
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        // Telegraph: aim warning has been shown before firing
        this._fireAtPlayer(distToPlayer, hasLoS);
        this.fireTimer = this.fireRate + Math.random() * 200;
      }
    }

    this._applyMovement(dt);
  }

  // ─── BOSS ─────────────────────────────────────────────────────
  _combatBoss(dt, playerPos, toPlayer, distToPlayer, hasLoS) {
    const hpPct = this.health / this.maxHealth;

    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1);
      this.strafeTimer = 2 + Math.random() * 1;
    }

    // Obstacle avoidance
    const avoid = this._steerAvoidObstacles(dt) || 0;

    const aggroMul = hpPct < 0.5 ? 1.5 : 1.0;

    if (distToPlayer > this.attackRange * 0.6) {
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = toPlayer.clone().add(strafe.multiplyScalar((this.strafeDir + avoid) * 0.2));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * aggroMul - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * aggroMul - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    } else {
      const strafeAxis = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = strafeAxis.clone().multiplyScalar(this.strafeDir + avoid).add(toPlayer.clone().multiplyScalar(0.3));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * 0.8 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * 0.8 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    }

    // Boss telegraphing
    if (hpPct < 0.3 && hasLoS) {
      const flashIntensity = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
      this.game.audio.playProcedural('gunshot', { volume: flashIntensity * 0.2, duration: 0.05 });
    }

    const fireRateScaled = hpPct < 0.3 ? this.fireRate * 0.6 : (hpPct < 0.5 ? this.fireRate * 0.8 : this.fireRate);
    this.fireTimer -= dt * 1000;
    if (this.fireTimer <= 0 && hasLoS) {
      const burstCount = hpPct < 0.3 ? 4 : 2;
      for (let i = 0; i < burstCount; i++) {
        setTimeout(() => {
          if (!this.alive) return;
          this._fireAtPlayer(distToPlayer, hasLoS);
        }, i * 100);
      }
      this.fireTimer = fireRateScaled + Math.random() * 200;
    }

    this._applyMovement(dt);
  }

  // ─── MOVEMENT ─────────────────────────────────────────────────
  _applyMovement(dt) {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const bound = this.type === 'boss' ? 22 : 19;
    this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
    this.position.z = Math.max(-bound, Math.min(bound, this.position.z));

    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
  }

  // ─── FIRING ───────────────────────────────────────────────────
  _fireAtPlayer(distToPlayer, hasLoS) {
    if (!this.game.player || this.game.player.health <= 0) return;

    // ── CLEAR ACCURACY MATH ──
    // Each enemy class has its own per-class accuracy curve:
    //
    // Rifleman:  50% base, 2%/m beyond 5m → 30% at 15m, 20% at 20m
    // Rusher:    55% base, 5%/m beyond 5m → 40% at 8m, 5% floor at 15m
    // Sniper:    65% base, 1%/m beyond 5m → 45% at 25m, 30% at 40m
    // Boss:      55% base, 1.5%/m beyond 5m → 32% at 20m, 17% at 30m
    //
    // All classes: floor 5%, ceiling 95%

    // If no line of sight, can't hit
    if (!hasLoS) return;

    const rangePenalty = Math.max(0, (distToPlayer - 5) * this.rangePenaltyPerMeter);
    let hitChance = this.baseHitChance - rangePenalty;
    hitChance = Math.max(0.05, Math.min(0.95, hitChance));

    this.telemetry.shotsAttempted++;

    // Roll for hit
    if (Math.random() > hitChance) return;

    this.telemetry.hits++;

    // Burst fire: 1-2 rounds per fire cycle (frame-rate independent, no wall-clock setTimeout)
    const burstCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < burstCount; i++) {
      if (!this.alive || !this.game.player || this.game.player.health <= 0) continue;
      const damage = this.damage * (0.8 + Math.random() * 0.4);
      this.telemetry.damageDealt += damage;
      this.game.takeDamage(damage);
      this.game.camera.addShake(0.3);
      this.game.audio.playProcedural('impact', { volume: 0.15, duration: 0.05 });

      // Tracer visual for the player (muzzle flash sound)
      if (this.type === 'sniper' || this.type === 'boss') {
        // Heavy hit - stronger feedback
        const di = document.getElementById('damage-indicator');
        if (di) {
          di.classList.add('hit');
          setTimeout(() => di.classList.remove('hit'), 300);
        }
      }
    }

    // Muzzle flash effect
    this.game.audio.playProcedural('gunshot', { volume: 0.12, duration: 0.08 });
  }

  _walkAnim(dt, speedMul = 1.0) {
    const walkPhase = this.animTime * (this.velocity.length() * 2 * speedMul);

    // Body bob (vertical)
    this.mesh.position.y = Math.abs(Math.sin(walkPhase)) * 0.025;

    // Side sway
    this.mesh.position.x += Math.sin(walkPhase * 2) * 0.004;

    // Gun bob in hands
    this.mesh.rotation.z = Math.sin(walkPhase) * 0.02;
  }
}
