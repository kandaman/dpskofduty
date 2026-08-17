import * as THREE from 'three';

export class PlayerCamera {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 1.7, 0);

    // View angles
    this.yaw = 0;
    this.pitch = 0;

    // Camera inertia
    this.velocity = { yaw: 0, pitch: 0 };
    this.smoothing = 8;
    this.mouseSensitivity = 0.002;

    // Head bob
    this.bobAmount = 0;
    this.bobSpeed = 0;
    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();

    // Landing / impact
    this.landOffset = 0;
    this.landVelocity = 0;

    // FOV
    this.baseFov = 75;
    this.targetFov = 75;
    this.currentFov = 75;
    this.fovKick = 0;
    this.fovKickTarget = 0;

    // ADS
    this.adsFov = 55;
    this.isAds = false;
    this.adsAmount = 0;
    this.adsSpeed = 12;

    // Sprint
    this.isSprinting = false;
    this.sprintFovAdd = 5;

    // Camera shake
    this.shakeAmount = 0;
    this.shakeDecay = 4;
    this.shakeOffset = new THREE.Vector3();

    // Lean
    this.leanAmount = 0;
    this.leanTarget = 0;

    // Roll from strafing
    this.rollAmount = 0;

    // Position offset (added to player position by controller)
    this.positionOffset = new THREE.Vector3();
  }

  getWorldDirection() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  getForward() {
    const dir = this.getWorldDirection();
    dir.y = 0;
    if (dir.length() > 0) dir.normalize();
    return dir;
  }

  getRight() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
  }

  handleMouseInput(dx, dy) {
    this.velocity.yaw -= dx * this.mouseSensitivity;
    this.velocity.pitch -= dy * this.mouseSensitivity;
  }

  addRecoil(pitchAmount, yawAmount = 0) {
    this.velocity.pitch -= pitchAmount;
    this.velocity.yaw += yawAmount;
    // FOV kick
    this.fovKickTarget += 1.5;
  }

  addShake(amount) {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 8);
  }

  landImpact(velocity) {
    this.landVelocity = -Math.min(velocity, 0.5);
  }

  update(dt) {
    const input = this.game.input;

    // --- Mouse look with inertia ---
    const mouseDelta = input.consumeMouseDelta();
    if (input.locked) {
      this.handleMouseInput(mouseDelta.dx, mouseDelta.dy);
    }

    // Apply velocity with smoothing
    this.yaw += this.velocity.yaw;
    this.pitch += this.velocity.pitch;

    // Clamp pitch
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));

    // Decay velocity (inertia)
    const smoothFactor = 1 - Math.exp(-this.smoothing * dt);
    this.velocity.yaw *= (1 - smoothFactor);
    this.velocity.pitch *= (1 - smoothFactor);

    // --- Sprint ---
    this.isSprinting = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

    // --- ADS ---
    this.isAds = input.isMouseDown(2) && input.locked;
    const adsTarget = this.isAds ? 1 : 0;
    this.adsAmount += (adsTarget - this.adsAmount) * (1 - Math.exp(-this.adsSpeed * dt));

    // --- FOV management ---
    const sprintFov = this.isSprinting ? this.sprintFovAdd : 0;
    this.targetFov = this.baseFov - (this.baseFov - this.adsFov) * this.adsAmount + sprintFov;

    // FOV kick decay
    this.fovKickTarget *= (1 - Math.exp(-10 * dt));
    this.fovKick += (this.fovKickTarget - this.fovKick) * (1 - Math.exp(-12 * dt));
    this.fovKickTarget = 0;

    this.currentFov += (this.targetFov + this.fovKick - this.currentFov) * (1 - Math.exp(-10 * dt));
    this.camera.fov = this.currentFov + this.shakeAmount * 0.2;
    this.camera.updateProjectionMatrix();

    // --- Head bob ---
    const isMoving = input.isKeyDown('KeyW') || input.isKeyDown('KeyS') ||
                     input.isKeyDown('KeyA') || input.isKeyDown('KeyD');
    const bobMultiplier = this.isSprinting ? 2.0 : (this.isAds ? 0.3 : 1.0);
    const speed = isMoving ? (this.isSprinting ? 12 : 8) : 0;

    this.bobSpeed += (speed - this.bobSpeed) * (1 - Math.exp(-10 * dt));
    this.bobPhase += this.bobSpeed * dt;

    const bobAmp = this.bobSpeed > 0 ? 0.025 * bobMultiplier : 0;
    this.bobOffset.x = Math.sin(this.bobPhase * 2) * bobAmp;
    this.bobOffset.y = Math.abs(Math.cos(this.bobPhase)) * bobAmp * 1.5;

    // --- Landing impact ---
    this.landOffset += this.landVelocity * dt;
    this.landVelocity *= (1 - Math.exp(-15 * dt));

    // Spring back
    this.landOffset *= (1 - Math.exp(-12 * dt));
    if (Math.abs(this.landOffset) < 0.001) this.landOffset = 0;

    // --- Camera shake ---
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

    // --- Lean from strafing ---
    const strafeRight = input.isKeyDown('KeyD') ? 1 : 0;
    const strafeLeft = input.isKeyDown('KeyA') ? 1 : 0;
    this.leanTarget = (strafeRight - strafeLeft) * 0.015 * (this.isSprinting ? 1.5 : 1.0);
    if (!isMoving) this.leanTarget *= 0.3;
    this.leanAmount += (this.leanTarget - this.leanAmount) * (1 - Math.exp(-8 * dt));

    // --- Roll from movement ---
    if (isMoving) {
      this.rollAmount += (this.leanTarget * 0.3 - this.rollAmount) * (1 - Math.exp(-5 * dt));
    } else {
      this.rollAmount *= (1 - Math.exp(-4 * dt));
    }

    // --- Apply camera rotation ---
    const euler = new THREE.Euler(
      this.pitch + this.bobOffset.y * 0.5 + this.shakeOffset.y,
      this.yaw,
      this.rollAmount + this.shakeOffset.x * 0.5,
      'YXZ'
    );
    this.camera.quaternion.setFromEuler(euler);

    // --- Compute position offset (added to player position by PlayerController) ---
    this.positionOffset.x = this.bobOffset.x + this.shakeOffset.x * 0.5;
    this.positionOffset.y = this.bobOffset.y + this.landOffset + this.shakeOffset.y * 0.3;
    this.positionOffset.z = this.shakeOffset.z * 0.5;
  }
}
