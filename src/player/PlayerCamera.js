import * as THREE from 'three';

/**
 * FPS camera with three-layer architecture:
 *
 *   1. Movement orientation — yaw only
 *   2. Aim orientation      — yaw + clamped pitch
 *   3. Visual presentation  — aim + bob + shake + roll
 *
 * Movement MUST NOT read from the rendered camera quaternion; it must read
 * from `this.yaw` only, via getMovementForward() / getMovementRight().
 */
export class PlayerCamera {
  // Hard FPS pitch limit (85°).  Never allow exact ±90° — at the pole
  // yaw becomes geometrically ambiguous and horizontal mouse motion
  // appears as spinning.
  static MAX_PITCH = THREE.MathUtils.degToRad(85);

  // Visual pitch limit (87°) — allows a tiny buffer for bob/shake but
  // still prevents reaching the pole.
  static MAX_VISUAL_PITCH = THREE.MathUtils.degToRad(87);

  constructor(game) {
    this.game = game;

    // --- Perspective camera ---
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.05, 2000,
    );
    this.camera.position.set(0, 1.7, 0);

    // ─── Layer 1 & 2: authoritative view angles ─────────────────
    // These are the ONLY values used for movement direction.
    this.yaw   = 0;
    this.pitch = 0;

    // ─── Mouse inertia ──────────────────────────────────────────
    // smoothing 25: decay ~4%/frame — the view stops with the mouse.
    // The old value (8) glided ~150ms after the mouse stopped, which at
    // the pitch pole reads as "the view keeps spinning" (クルクル回転).
    this.velocity        = { yaw: 0, pitch: 0 };
    this.smoothing       = 25;
    this.mouseSensitivity = 0.002;

    // ─── Layer 3: visual effects ─────────────────────────────────
    // Head bob
    this.bobAmount  = 0;
    this.bobSpeed   = 0;
    this.bobPhase   = 0;
    this.bobOffset  = new THREE.Vector3();

    // Landing impact
    this.landOffset    = 0;
    this.landVelocity  = 0;

    // FOV
    this.baseFov       = 75;
    this.targetFov     = 75;
    this.currentFov    = 75;
    this.fovKick       = 0;
    this.fovKickTarget = 0;

    // ADS
    this.adsFov    = 55;
    this.isAds     = false;
    this.adsAmount = 0;
    this.adsSpeed  = 12;

    // Sprint
    this.isSprinting  = false;
    this.sprintFovAdd = 5;

    // Shake
    this.shakeAmount = 0;
    this.shakeDecay  = 4;
    this.shakeOffset = new THREE.Vector3();

    // Lean / roll
    this.leanAmount  = 0;
    this.leanTarget  = 0;
    this.rollAmount  = 0;

    // Position offset (world-space, added by PlayerController)
    this.positionOffset = new THREE.Vector3();

    // ─── Debug telemetry ────────────────────────────────────────
    this._debug = { forward: null, right: null };
  }

  // ════════════════════════════════════════════════════════════════
  //  LAYER 1 — YAW-ONLY MOVEMENT BASIS
  // ════════════════════════════════════════════════════════════════

  /**
   * Horizontal forward vector derived from yaw alone.
   * Pitch, roll, bob, shake, recoil — NONE of these affect movement.
   */
  getMovementForward() {
    return new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw),
    ).normalize();
  }

  /**
   * Horizontal right vector derived from yaw alone.
   */
  getMovementRight() {
    return new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw),
    ).normalize();
  }

  // ════════════════════════════════════════════════════════════════
  //  LAYER 2 — AIM ORIENTATION (for rendering, NOT for movement)
  // ════════════════════════════════════════════════════════════════

  getWorldDirection() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  /** @deprecated Use getMovementForward() for locomotion. */
  getForward() {
    const dir = this.getWorldDirection();
    dir.y = 0;
    if (dir.length() > 0) dir.normalize();
    return dir;
  }

  /** @deprecated Use getMovementRight() for locomotion. */
  getRight() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
  }

  // ════════════════════════════════════════════════════════════════
  //  INPUT
  // ════════════════════════════════════════════════════════════════

  handleMouseInput(dx, dy) {
    this.velocity.yaw   -= dx * this.mouseSensitivity;
    this.velocity.pitch -= dy * this.mouseSensitivity;
  }

  addRecoil(pitchAmount, yawAmount = 0) {
    this.velocity.pitch -= pitchAmount;
    this.velocity.yaw   += yawAmount;
    this.fovKickTarget  += 1.5;
  }

  addShake(amount) {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 8);
  }

  landImpact(velocity) {
    this.landVelocity = -Math.min(velocity, 0.5);
  }

  // ════════════════════════════════════════════════════════════════
  //  UPDATE
  // ════════════════════════════════════════════════════════════════

  update(dt) {
    const input = this.game.input;

    // ─── Mouse look ─────────────────────────────────────────────
    const mouseDelta = input.consumeMouseDelta();
    if (input.locked) {
      this.handleMouseInput(mouseDelta.dx, mouseDelta.dy);
    }

    // Apply velocity (semi-implicit)
    this.yaw   += this.velocity.yaw;
    this.pitch += this.velocity.pitch;

    // ─── Hard pitch clamp (Layer 2) ─────────────────────────────
    // Never allow pitch past 85°.  This is the PRIMARY guard against
    // pole singularities.
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -PlayerCamera.MAX_PITCH,
       PlayerCamera.MAX_PITCH,
    );

    // ─── Velocity decay ─────────────────────────────────────────
    const smoothFactor = 1 - Math.exp(-this.smoothing * dt);
    this.velocity.yaw   *= (1 - smoothFactor);
    this.velocity.pitch *= (1 - smoothFactor);

    // ─── Sprint / ADS ───────────────────────────────────────────
    this.isSprinting = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
    this.isAds       = input.isMouseDown(2) && input.locked;
    const adsTarget  = this.isAds ? 1 : 0;
    this.adsAmount  += (adsTarget - this.adsAmount) * (1 - Math.exp(-this.adsSpeed * dt));

    // ─── FOV ────────────────────────────────────────────────────
    const sprintFov = this.isSprinting ? this.sprintFovAdd : 0;
    this.targetFov  = this.baseFov - (this.baseFov - this.adsFov) * this.adsAmount + sprintFov;

    this.fovKickTarget *= (1 - Math.exp(-10 * dt));
    this.fovKick += (this.fovKickTarget - this.fovKick) * (1 - Math.exp(-12 * dt));
    this.fovKickTarget = 0;

    this.currentFov += (this.targetFov + this.fovKick - this.currentFov) * (1 - Math.exp(-10 * dt));
    this.camera.fov  = this.currentFov + this.shakeAmount * 0.2;
    this.camera.updateProjectionMatrix();

    // ─── Head bob (Layer 3 visual only) ─────────────────────────
    const isMoving = input.isKeyDown('KeyW') || input.isKeyDown('KeyS') ||
                     input.isKeyDown('KeyA') || input.isKeyDown('KeyD');
    const bobMultiplier = this.isSprinting ? 2.0 : (this.isAds ? 0.3 : 1.0);
    const speed = isMoving ? (this.isSprinting ? 12 : 8) : 0;

    this.bobSpeed += (speed - this.bobSpeed) * (1 - Math.exp(-10 * dt));
    this.bobPhase += this.bobSpeed * dt;

    const bobAmp = isMoving ? 0.025 * bobMultiplier : 0;
    this.bobOffset.x = Math.sin(this.bobPhase * 2) * bobAmp;
    this.bobOffset.y = Math.abs(Math.cos(this.bobPhase)) * bobAmp * 1.5;

    // ─── Landing impact ─────────────────────────────────────────
    this.landOffset    += this.landVelocity * dt;
    this.landVelocity  *= (1 - Math.exp(-15 * dt));
    this.landOffset    *= (1 - Math.exp(-12 * dt));
    if (Math.abs(this.landOffset) < 0.001) this.landOffset = 0;

    // ─── Camera shake ───────────────────────────────────────────
    if (this.shakeAmount > 0) {
      this.shakeOffset.x = (Math.random() - 0.5) * this.shakeAmount * 0.02;
      this.shakeOffset.y = (Math.random() - 0.5) * this.shakeAmount * 0.02;
      this.shakeOffset.z = (Math.random() - 0.5) * this.shakeAmount * 0.02;
      this.shakeAmount *= (1 - Math.exp(-this.shakeDecay * dt));
      if (this.shakeAmount < 0.01) {
        this.shakeAmount = 0;
        this.shakeOffset.set(0, 0, 0);
      }
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // ─── Lean / roll ────────────────────────────────────────────
    const strafeRight  = input.isKeyDown('KeyD') ? 1 : 0;
    const strafeLeft   = input.isKeyDown('KeyA') ? 1 : 0;
    this.leanTarget    = (strafeRight - strafeLeft) * 0.015 * (this.isSprinting ? 1.5 : 1.0);
    if (!isMoving) this.leanTarget *= 0.3;
    this.leanAmount   += (this.leanTarget - this.leanAmount) * (1 - Math.exp(-8 * dt));
    if (isMoving) {
      this.rollAmount += (this.leanTarget * 0.3 - this.rollAmount) * (1 - Math.exp(-5 * dt));
    } else {
      this.rollAmount *= (1 - Math.exp(-4 * dt));
    }

    // ─── Suppress rotational visual effects near vertical ───────
    // As pitch approaches MAX_PITCH, progressively reduce roll and
    // rotational shake/bob to zero so they cannot create the
    // appearance of spinning.
    const vertRatio = Math.abs(this.pitch) / PlayerCamera.MAX_PITCH;
    const suppress  = Math.max(0, 1 - vertRatio);  // 1 at horizon, 0 at 85°
    const safeRoll  = this.rollAmount * suppress;
    const safeBobY  = this.bobOffset.y * 0.5 * suppress;
    const safeShakeY = this.shakeOffset.y * suppress;
    const safeShakeX = this.shakeOffset.x * 0.5 * suppress;

    // ─── Clamp visual pitch (Layer 3) ───────────────────────────
    // Even with bob/shake, total pitch must stay below the pole.
    const visualPitch = this.pitch + safeBobY + safeShakeY;
    const clampedVisualPitch = THREE.MathUtils.clamp(
      visualPitch,
      -PlayerCamera.MAX_VISUAL_PITCH,
       PlayerCamera.MAX_VISUAL_PITCH,
    );

    // ─── Build camera quaternion ────────────────────────────────
    // Three.js Euler(pitch, yaw, roll, 'YXZ') decomposes as:
    //   Q = Qyaw * Qpitch * Qroll
    const q = new THREE.Quaternion();

    // 1) Yaw (world Y)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.camera.quaternion.copy(q);
    // 2) Pitch + bob/shake (local X) — safely clamped
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), clampedVisualPitch);
    this.camera.quaternion.multiply(q);
    // 3) Roll + shake (local Z) — suppressed near vertical
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), safeRoll + safeShakeX);
    this.camera.quaternion.multiply(q);

    // ─── Position offset ────────────────────────────────────────
    this.positionOffset.x = this.bobOffset.x + this.shakeOffset.x * 0.5;
    this.positionOffset.y = this.bobOffset.y + this.landOffset + this.shakeOffset.y * 0.3;
    this.positionOffset.z = this.shakeOffset.z * 0.5;

    // ─── Debug telemetry ────────────────────────────────────────
    this._debug.forward = this.getMovementForward();
    this._debug.right   = this.getMovementRight();
  }
}
