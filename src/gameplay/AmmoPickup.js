import * as THREE from 'three';

export class AmmoPickup {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.glow = null;
    this.active = false;
    this.respawnTime = 15;
    this.timer = 0;

    this._createMesh();
  }

  _createMesh() {
    const group = new THREE.Group();

    // Ammo box
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x8B7355, roughness: 0.8, metalness: 0.1
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), boxMat);
    box.position.y = 0.15;
    group.add(box);

    // Yellow stripe
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xccaa00, emissive: 0xccaa00, emissiveIntensity: 0.2
    });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.05), stripeMat);
    stripe.position.set(0, 0.2, 0.21);
    group.add(stripe);

    // "A" label on top
    const labelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.1
    });
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), labelMat);
    label.position.set(0, 0.32, 0);
    group.add(label);

    // Glow point light
    this.glow = new THREE.PointLight(0xccaa00, 0, 2);
    group.add(this.glow);

    this.mesh = group;
    this.mesh.position.set(0, 0, 0);
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  spawn() {
    // Place at a random position on the map
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 12;
    this.mesh.position.set(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    );
    this.mesh.visible = true;
    this.active = true;
    this.glow.intensity = 0.8;
    this.timer = 0;
  }

  collect(weaponController) {
    if (!this.active) return;
    const weapon = weaponController.currentWeapon;
    if (!weapon) return;

    // Give ammo
    const ammoGiven = weapon.stats.magSize * 2;
    weapon.stats.reserveAmmo += ammoGiven;
    weaponController._updateHUD();

    this.active = false;
    this.mesh.visible = false;
    this.glow.intensity = 0;
    this.timer = 0;
  }

  update(dt, playerPos) {
    if (!this.active) {
      this.timer += dt;
      if (this.timer >= this.respawnTime) {
        this.spawn();
      }
      return;
    }

    // Float and rotate
    this.mesh.position.y = Math.sin(Date.now() * 0.003) * 0.1 + 0.15;
    this.mesh.rotation.y += dt * 0.5;

    // Glow pulse
    this.glow.intensity = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;

    // Check proximity to player for auto-collection
    if (playerPos && this.active) {
      const dist = playerPos.distanceTo(this.mesh.position);
      if (dist < 1.5) {
        this.collect(this.game?.weaponController);
      }
    }
  }

  reset() {
    this.active = false;
    this.mesh.visible = false;
    this.glow.intensity = 0;
    this.timer = 0;
  }
}
