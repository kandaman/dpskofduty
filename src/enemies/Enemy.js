import * as THREE from 'three';

export class Enemy {
  constructor(game, position, type = 'rifleman') {
    this.game = game;
    this.type = type;
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;

    // State
    this.state = 'idle';
    this.stateTimer = 0;

    // Movement
    this.position = position.clone();
    this.velocity = new THREE.Vector3();

    // AI
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
    this.flankDirection = 1;
    this.combatMoveTimer = 0;

    // Cover seeking
    this.coverPos = null;
    this.coverTimer = 0;
    this.inCover = false;

    // Aggressive closing distance
    this.closingDistance = 0;

    // Animation
    this.animTime = 0;
    this.hitAnimTime = 0;
    this.deathAnimTime = 0;

    // Mesh
    this.mesh = this._createMesh();
    this.mesh.position.copy(position);
    this.game.scene.add(this.mesh);

    // Health bar
    this.healthBar = this._createHealthBar();
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
        this.accuracy = 0.08;
        this.detectionRange = 30;
        this.attackRange = 20;
        this.health = 100;
        break;

      case 'rusher':
        this.moveSpeed = 5 + Math.random() * 1.5;
        this.acceleration = 14;
        this.fireRate = 400 + Math.random() * 200;
        this.damage = 15;
        this.accuracy = 0.15;
        this.detectionRange = 35;
        this.attackRange = 8;
        this.health = 60;
        // Rushers close distance fast
        this.closingDistance = 1;
        break;

      case 'sniper':
        this.moveSpeed = 1 + Math.random() * 0.5;
        this.acceleration = 4;
        this.fireRate = 1500 + Math.random() * 500;
        this.damage = 25;
        this.accuracy = 0.02;
        this.detectionRange = 50;
        this.attackRange = 40;
        this.health = 50;
        break;

      case 'boss':
        this.moveSpeed = 1.5;
        this.acceleration = 6;
        this.fireRate = 400;
        this.damage = 20;
        this.accuracy = 0.03;
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
        // Crouch slightly when alerted
        this.mesh.position.y = 0.03;
        if (this.stateTimer <= 0) {
          this.state = 'combat';
          this.combatMoveTimer = 0;
        }
        if (distToPlayer > this.detectionRange * 1.5) {
          this.state = 'patrol';
        }
        break;

      case 'combat':
        this._combatUpdate(dt, playerPos, toPlayer, distToPlayer);
        if (distToPlayer > this.detectionRange * 2) {
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

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;

    this._lookAt(new THREE.Vector3(this.patrolTarget.x, 0, this.patrolTarget.z));
    this._walkAnim(dt, 0.5);
  }

  _combatUpdate(dt, playerPos, toPlayer, distToPlayer) {
    this._lookAt(playerPos);
    this.combatMoveTimer += dt;
    this.strafeTimer -= dt;

    // Update last known player position
    this.lastKnownPlayerPos = playerPos.clone();

    switch (this.type) {
      case 'rifleman':
        this._combatRifleman(dt, playerPos, toPlayer, distToPlayer);
        break;
      case 'rusher':
        this._combatRusher(dt, playerPos, toPlayer, distToPlayer);
        break;
      case 'sniper':
        this._combatSniper(dt, playerPos, toPlayer, distToPlayer);
        break;
      case 'boss':
        this._combatBoss(dt, playerPos, toPlayer, distToPlayer);
        break;
    }
  }

  _combatRifleman(dt, playerPos, toPlayer, distToPlayer) {
    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1) * (this.strafeDir > 0 ? 1 : -1);
      this.strafeTimer = 1.5 + Math.random() * 2;
    }

    if (distToPlayer > this.attackRange * 0.8) {
      // Approach with strafe
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = toPlayer.clone().add(strafe.multiplyScalar(this.strafeDir * 0.3));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
      this._walkAnim(dt, 1.0);
    } else {
      const strafeAxis = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const pushPull = Math.sin(this.combatMoveTimer * 0.7) * 0.3;
      const moveDir = strafeAxis.clone().multiplyScalar(this.strafeDir)
        .add(toPlayer.clone().multiplyScalar(pushPull));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * 0.7 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * 0.7 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));

      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this._fireAtPlayer(distToPlayer);
        this.fireTimer = this.fireRate + (Math.random() - 0.5) * 100;
      }
      this._walkAnim(dt, 0.7);
    }

    this._applyMovement(dt);
  }

  _combatRusher(dt, playerPos, toPlayer, distToPlayer) {
    // Rushers sprint directly at player, weaving slightly
    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1);
      this.strafeTimer = 0.5 + Math.random() * 1;
    }

    const strafeOffset = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const weaveAmount = distToPlayer < 5 ? 0.1 : 0.4;
    const moveDir = toPlayer.clone().add(strafeOffset.multiplyScalar(this.strafeDir * weaveAmount));
    moveDir.normalize();

    // Rushers move faster the closer they get
    const speedMul = 0.5 + (1 - Math.min(distToPlayer / 25, 1)) * 0.5;
    const speed = this.moveSpeed * speedMul;

    this.velocity.x += (moveDir.x * speed - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
    this.velocity.z += (moveDir.z * speed - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    this._walkAnim(dt, speedMul * 1.5);

    // Fire when close
    if (distToPlayer < this.attackRange) {
      this.fireTimer -= dt * 1000;
      if (this.fireTimer <= 0) {
        this._fireAtPlayer(distToPlayer);
        this.fireTimer = this.fireRate + (Math.random() - 0.5) * 100;
      }
    }

    this._applyMovement(dt);
  }

  _combatSniper(dt, playerPos, toPlayer, distToPlayer) {
    // Snipers maintain distance and fire precisely
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
      // Hold position, slight strafe
      this.velocity.x *= (1 - Math.exp(-5 * dt));
      this.velocity.z *= (1 - Math.exp(-5 * dt));
    }

    this._walkAnim(dt, 0.3);

    // Fire slowly and accurately
    this.fireTimer -= dt * 1000;
    if (this.fireTimer <= 0) {
      this._fireAtPlayer(distToPlayer);
      this.fireTimer = this.fireRate + Math.random() * 200;
    }

    this._applyMovement(dt);
  }

  _combatBoss(dt, playerPos, toPlayer, distToPlayer) {
    // Boss has phases based on HP
    const hpPct = this.health / this.maxHealth;

    if (this.strafeTimer <= 0) {
      this.strafeDir = (Math.random() > 0.5 ? 1 : -1);
      this.strafeTimer = 2 + Math.random() * 1;
    }

    // Below 50% HP, boss becomes more aggressive
    const aggroMul = hpPct < 0.5 ? 1.5 : 1.0;

    if (distToPlayer > this.attackRange * 0.6) {
      const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = toPlayer.clone().add(strafe.multiplyScalar(this.strafeDir * 0.2));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * aggroMul - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * aggroMul - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    } else {
      const strafeAxis = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = strafeAxis.clone().multiplyScalar(this.strafeDir).add(toPlayer.clone().multiplyScalar(0.3));
      moveDir.normalize();
      this.velocity.x += (moveDir.x * this.moveSpeed * 0.8 - this.velocity.x) * (1 - Math.exp(-this.acceleration * dt));
      this.velocity.z += (moveDir.z * this.moveSpeed * 0.8 - this.velocity.z) * (1 - Math.exp(-this.acceleration * dt));
    }

    // Boss fires more frequently
    const fireRateScaled = hpPct < 0.3 ? this.fireRate * 0.6 : (hpPct < 0.5 ? this.fireRate * 0.8 : this.fireRate);
    this.fireTimer -= dt * 1000;
    if (this.fireTimer <= 0) {
      // Boss fires in bursts
      const burstCount = hpPct < 0.3 ? 4 : 2;
      for (let i = 0; i < burstCount; i++) {
        setTimeout(() => {
          if (!this.alive) return;
          this._fireAtPlayer(distToPlayer);
        }, i * 100);
      }
      this.fireTimer = fireRateScaled + Math.random() * 200;
    }

    this._applyMovement(dt);
  }

  _applyMovement(dt) {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    const bound = this.type === 'boss' ? 22 : 19;
    this.position.x = Math.max(-bound, Math.min(bound, this.position.x));
    this.position.z = Math.max(-bound, Math.min(bound, this.position.z));

    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
  }

  _fireAtPlayer(distToPlayer) {
    if (!this.game.player || this.game.player.health <= 0) return;

    // Accuracy degrades with distance
    const effectiveAccuracy = this.accuracy + (distToPlayer - 10) * 0.005;
    if (Math.random() < Math.min(effectiveAccuracy, 0.6)) return;

    // Suppression fire - burst of 2-3 rounds
    const burstCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        if (!this.alive || !this.game.player || this.game.player.health <= 0) return;
        const damage = this.damage * (0.8 + Math.random() * 0.4);
        this.game.player.takeDamage(damage);
        this.game.camera.addShake(0.3);
        this.game.audio.playProcedural('impact', { volume: 0.15, duration: 0.05 });
      }, i * 80);
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
