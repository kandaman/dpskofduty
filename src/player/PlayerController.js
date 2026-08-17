import * as THREE from 'three';

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;

    // Position
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Movement parameters
    this.walkSpeed = 5;
    this.sprintSpeed = 8;
    this.acceleration = 50;
    this.friction = 10;
    this.airFriction = 4;
    this.gravity = -25;
    this.jumpForce = 7;
    this.crouchSpeed = 3;

    // State
    this.isGrounded = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.crouchHeight = 0;
    this.targetCrouch = 0;

    // Collision
    this.height = 1.7;
    this.radius = 0.4;
    this.groundTolerance = 0.1;

    // Previous position for footstep detection
    this._prevPos = new THREE.Vector3();
    this._movedDistance = 0;
    this._stepCycle = 0;

    // Jump
    this.canJump = true;
    this.jumpHoldTime = 0;
    this.isJumping = false;
  }

  getEyeHeight() {
    return this.isCrouching ? 1.0 : 1.7;
  }

  update(dt) {
    const input = this.game.input;
    this._prevPos.copy(this.position);

    // --- Sprint ---
    this.isSprinting = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');

    // --- Crouch ---
    const wantCrouch = input.isKeyDown('ControlLeft') || input.isKeyDown('ControlRight');
    this.targetCrouch = wantCrouch ? 1 : 0;
    this.crouchHeight += (this.targetCrouch - this.crouchHeight) * (1 - Math.exp(-12 * dt));
    this.isCrouching = this.crouchHeight > 0.1;

    // --- Movement direction ---
    const forward = this.camera.getForward();
    const right = this.camera.getRight();

    let moveX = 0, moveZ = 0;
    if (input.isKeyDown('KeyW')) moveZ -= 1;
    if (input.isKeyDown('KeyS')) moveZ += 1;
    if (input.isKeyDown('KeyA')) moveX -= 1;
    if (input.isKeyDown('KeyD')) moveX += 1;

    // Normalize
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    // Current speed (walk/sprint)
    const speed = this.isSprinting ? this.sprintSpeed : (this.walkSpeed * (1 - this.crouchHeight * 0.5));

    // Calculate desired velocity
    const desiredVel = new THREE.Vector3()
      .addScaledVector(forward, moveZ * speed)
      .addScaledVector(right, moveX * speed);

    // Vertical velocity (gravity)
    const verticalVel = this.velocity.y;

    // Horizontal acceleration
    const friction = this.isGrounded ? this.friction : this.airFriction;

    const horVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const desiredHor = new THREE.Vector3(desiredVel.x, 0, desiredVel.z);

    const accel = this.isGrounded ? this.acceleration : this.acceleration * 0.3;
    const diff = desiredHor.clone().sub(horVel);

    // Apply acceleration
    if (diff.length() > 0) {
      const accelMag = Math.min(diff.length(), accel * dt);
      horVel.add(diff.normalize().multiplyScalar(accelMag));
    }

    // Apply friction
    if (horVel.length() > 0) {
      const frictionForce = friction * dt;
      if (frictionForce > horVel.length()) {
        horVel.set(0, 0, 0);
      } else {
        horVel.normalize().multiplyScalar(horVel.length() - frictionForce);
      }
    }

    // --- Jump ---
    this.isJumping = false;
    if (input.isKeyDown('Space') && this.isGrounded && this.canJump) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
      this.canJump = false;
      this.isJumping = true;
    }
    if (!input.isKeyDown('Space')) {
      this.canJump = true;
    }

    // Apply velocity
    this.velocity.x = horVel.x;
    this.velocity.z = horVel.z;

    // Gravity
    if (!this.isGrounded) {
      this.velocity.y += this.gravity * dt;
      if (this.velocity.y < -30) this.velocity.y = -30;
    } else {
      this.velocity.y = 0;
    }

    // Apply to position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground check (simple - floor at y=0)
    if (this.position.y <= 0) {
      if (this.velocity.y < 0) {
        const impactVel = Math.abs(this.velocity.y);
        this.position.y = 0;
        this.velocity.y = 0;
        this.isGrounded = true;
        if (impactVel > 2) {
          this.game.camera.landImpact(impactVel);
          this.game.audio.playProcedural('impact', { volume: Math.min(impactVel / 20, 1) });
        }
      }
    }

    // --- Footstep detection ---
    if (this.isGrounded) {
      const moved = this._prevPos.distanceTo(this.position);
      this._movedDistance += moved;
      if (moved > 0.001) {
        this._stepCycle += moved * (this.isSprinting ? 2.5 : 1.5);
        if (this._stepCycle > 1.2) {
          this._stepCycle = 0;
          this.game.audio.playProcedural('footstep', {
            volume: 0.4 + Math.random() * 0.2,
            duration: 0.08
          });
        }
      }
    } else {
      this._stepCycle = 0.8; // Ready to footstep on landing
    }

    // Update camera position to follow player with offset
    const eyeHeight = this.getEyeHeight() - this.crouchHeight * 0.7;
    this.camera.camera.position.x = this.position.x + this.camera.positionOffset.x;
    this.camera.camera.position.y = this.position.y + eyeHeight + this.camera.positionOffset.y;
    this.camera.camera.position.z = this.position.z + this.camera.positionOffset.z;
  }
}
