import * as THREE from 'three';

export class WeaponSway {
  constructor(game) {
    this.game = game;

    // Sway parameters
    this.positionSway = new THREE.Vector3();
    this.rotationSway = new THREE.Euler();
    this.positionTarget = new THREE.Vector3();
    this.rotationTarget = new THREE.Euler();

    this.swayAmount = 0.003;
    this.swaySmoothing = 6;
    this.positionSwayAmount = 0.002;
    this.positionSwaySmoothing = 4;

    // ADS offset
    this.adsOffset = new THREE.Vector3(0, -0.02, -0.35);
    this.defaultPosition = new THREE.Vector3(0.3, -0.25, -0.5);

    // Breath sway (subtle idle movement)
    this.breathPhase = 0;
    this.breathAmount = 0.0005;

    // Sprint lowering
    this.sprintLower = 0;
    this.sprintLowerTarget = 0;
    this.sprintRotTarget = 0;
    this.sprintRotation = 0;

    // Bob influence
    this.bobInfluence = new THREE.Vector3();
  }

  update(dt, weaponObject) {
    if (!weaponObject) return;

    const camera = this.game.camera;

    // --- Mouse sway (uses camera velocity, already consumed by camera update) ---
    const yawVel = camera.velocity.yaw;
    const pitchVel = camera.velocity.pitch;

    this.rotationTarget.x = pitchVel * 1.5;
    this.rotationTarget.y = yawVel * 1.5;
    this.rotationTarget.z = -yawVel * 0.3;

    this.positionTarget.x = -yawVel * 0.03;
    this.positionTarget.y = -pitchVel * 0.03;

    // --- Smooth sway ---
    this.positionSway.x += (this.positionTarget.x - this.positionSway.x) * (1 - Math.exp(-this.positionSwaySmoothing * dt));
    this.positionSway.y += (this.positionTarget.y - this.positionSway.y) * (1 - Math.exp(-this.positionSwaySmoothing * dt));

    this.rotationSway.x += (this.rotationTarget.x - this.rotationSway.x) * (1 - Math.exp(-this.swaySmoothing * dt));
    this.rotationSway.y += (this.rotationTarget.y - this.rotationSway.y) * (1 - Math.exp(-this.swaySmoothing * dt));
    this.rotationSway.z += (this.rotationTarget.z - this.rotationSway.z) * (1 - Math.exp(-this.swaySmoothing * dt));

    // --- Breath sway ---
    this.breathPhase += dt * 2.5;
    const breathX = Math.sin(this.breathPhase) * this.breathAmount;
    const breathY = Math.sin(this.breathPhase * 0.7 + 1) * this.breathAmount * 0.5;

    // --- Sprint lowering ---
    const isSprinting = camera.isSprinting && camera.isAds === false;
    this.sprintLowerTarget = isSprinting ? 1 : 0;
    this.sprintLower += (this.sprintLowerTarget - this.sprintLower) * (1 - Math.exp(-8 * dt));
    this.sprintRotTarget = isSprinting ? -0.15 : 0;
    this.sprintRotation += (this.sprintRotTarget - this.sprintRotation) * (1 - Math.exp(-8 * dt));

    // --- ADS positioning ---
    const adsAmount = camera.adsAmount;

    // Final position
    const basePos = this.defaultPosition.clone();
    const adsPos = this.defaultPosition.clone().add(this.adsOffset);

    const sprintOffset = new THREE.Vector3(0, -0.1, 0.15).multiplyScalar(this.sprintLower);

    const finalPos = new THREE.Vector3()
      .lerpVectors(basePos, adsPos, adsAmount)
      .add(this.positionSway)
      .add(sprintOffset)
      .add(new THREE.Vector3(breathX, breathY, 0));

    // Bob influence
    finalPos.x += camera.bobOffset.x * 0.5;
    finalPos.y += camera.bobOffset.y * -0.3;

    // Final rotation
    const finalRot = new THREE.Euler(
      this.rotationSway.x + this.sprintRotation * 0.5,
      this.rotationSway.y + this.sprintRotation,
      this.rotationSway.z
    );

    // Apply to weapon
    weaponObject.position.copy(finalPos);
    weaponObject.rotation.set(finalRot.x, finalRot.y, finalRot.z);
  }
}
