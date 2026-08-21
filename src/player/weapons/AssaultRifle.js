import * as THREE from 'three';

export class AssaultRifle {
  constructor(game) {
    this.game = game;
    this.stats = {
      name: 'M4A1',
      damage: 100, // PHASE 3: 100 = 1-body-shot kill, 200 headshot, for 2fps speed
      fireRate: 750,
      magSize: 30,
      reserveAmmo: 1500, // PHASE 3: increased for 2fps spray-fire + ammo crate margin
      reloadTime: 2100,
      recoilPitch: 0.04,
      recoilYaw: 0.02,
      recoilSpread: 0.03,
      spread: 0.015,
      adsSpread: 0.007,
      range: 200
    };

    this.ammo = this.stats.magSize;
    this.mesh = this._createWeaponModel();

    // Shell ejection point
    this.shellEjectPoint = new THREE.Object3D();
    this.shellEjectPoint.position.set(-0.05, 0.08, -0.25);
    this.mesh.add(this.shellEjectPoint);

    this._fireAnimTime = 0;
    this._isFiring = false;
  }

  _createWeaponModel() {
    const group = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, metalness: 0.7, roughness: 0.35
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, metalness: 0.9, roughness: 0.2
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f, roughness: 0.8, metalness: 0.1
    });
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f, roughness: 0.7, metalness: 0.1
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x222222, metalness: 0.6, roughness: 0.4
    });
    const sightMat = new THREE.MeshStandardMaterial({
      color: 0x111111, metalness: 0.5, roughness: 0.3
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, metalness: 0.5, roughness: 0.5
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x444444, metalness: 0.4, roughness: 0.6
    });

    const s = 0.55; // overall scale factor applied at the end

    // --- Receiver (main body) ---
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.32), bodyMat);
    receiver.position.set(0, 0, -0.08);
    group.add(receiver);

    // --- Upper receiver / carry handle area ---
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.18), bodyMat);
    upper.position.set(0, 0.038, -0.06);
    group.add(upper);

    // --- Barrel ---
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.38, 10), barrelMat);
    barrel.position.set(0, 0, -0.42);
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);

    // --- Barrel nut ---
    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.02, 10), darkMat);
    barrelNut.position.set(0, 0, -0.25);
    barrelNut.rotation.x = Math.PI / 2;
    group.add(barrelNut);

    // --- Handguard / rail system (RIS) ---
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.2), railMat);
    handguard.position.set(0, 0, -0.3);
    group.add(handguard);

    // Rail top
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.18), railMat);
    railTop.position.set(0, 0.02, -0.3);
    group.add(railTop);

    // Rail bottom
    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.18), railMat);
    railBottom.position.set(0, -0.02, -0.3);
    group.add(railBottom);

    // Rail sides
    for (let side of [-1, 1]) {
      const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.02, 0.16), railMat);
      railSide.position.set(side * 0.017, 0, -0.3);
      group.add(railSide);
    }

    // --- Gas block ---
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.03), darkMat);
    gasBlock.position.set(0, 0, -0.5);
    group.add(gasBlock);

    // --- Pistol grip ---
    const gripGeom = new THREE.CylinderGeometry(0.025, 0.04, 0.06, 5);
    const grip = new THREE.Mesh(gripGeom, gripMat);
    grip.position.set(0, -0.05, 0.02);
    grip.rotation.x = -0.2;
    group.add(grip);

    // Grip texture lines
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.002, 0.002),
        darkMat
      );
      line.position.set(0, -0.03 + i * 0.02, 0.04);
      group.add(line);
    }

    // --- Magazine ---
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.065, 0.07), bodyMat);
    magBody.position.set(0, -0.055, -0.06);
    magBody.rotation.x = -0.08;
    group.add(magBody);

    // Magazine floor plate
    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.06), darkMat);
    magPlate.position.set(0, -0.09, -0.06);
    group.add(magPlate);

    // Magazine ribs
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.001), accentMat);
      rib.position.set(0, -0.06 + i * 0.02, -0.095);
      group.add(rib);
    }

    // --- Stock ---
    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.12), stockMat);
    stockBody.position.set(0, 0.005, 0.22);
    stockBody.rotation.x = 0.03;
    group.add(stockBody);

    // Stock buffer tube
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.08, 8), darkMat);
    bufferTube.position.set(0, 0.02, 0.14);
    bufferTube.rotation.x = Math.PI / 2;
    group.add(bufferTube);

    // Stock cheek rest
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.08), darkMat);
    cheekRest.position.set(0, 0.025, 0.23);
    group.add(cheekRest);

    // Stock butt pad
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), darkMat);
    buttPad.position.set(0, 0.005, 0.28);
    group.add(buttPad);

    // --- Front sight ---
    const frontSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.02, 0.005), sightMat);
    frontSightBase.position.set(0, 0.04, -0.45);
    group.add(frontSightBase);

    // Front sight posts
    for (let side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.025, 0.003), sightMat);
      post.position.set(side * 0.008, 0.05, -0.45);
      group.add(post);
    }

    // --- Rear sight ---
    const rearSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.015, 0.005), sightMat);
    rearSightBase.position.set(0, 0.038, 0.02);
    group.add(rearSightBase);

    // Rear sight aperture
    const aperture = new THREE.Mesh(
      new THREE.TorusGeometry(0.005, 0.002, 6, 8),
      sightMat
    );
    aperture.position.set(0, 0.045, 0.02);
    group.add(aperture);

    // --- Muzzle brake ---
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.025, 10), barrelMat);
    muzzleBrake.position.set(0, 0, -0.6);
    muzzleBrake.rotation.x = Math.PI / 2;
    group.add(muzzleBrake);

    // Muzzle brake ports
    for (let i = 0; i < 3; i++) {
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.002), darkMat);
      port.position.set(0, 0.012, -0.6 + (i - 1) * 0.006);
      group.add(port);
      const port2 = port.clone();
      port2.position.y = -0.012;
      group.add(port2);
    }

    // --- Forward assist ---
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.008, 6), darkMat);
    fa.position.set(0.035, 0.01, -0.02);
    fa.rotation.z = Math.PI / 2;
    group.add(fa);

    // --- Ejection port (cutout visual) ---
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.002), darkMat);
    ejectionPort.position.set(0.018, 0.03, -0.08);
    group.add(ejectionPort);

    // --- Bolt catch ---
    const boltCatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.003), accentMat);
    boltCatch.position.set(0.035, 0.005, -0.04);
    group.add(boltCatch);

    // --- Trigger guard ---
    const trigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.003, 0.025), darkMat);
    trigGuard.position.set(0, -0.025, 0.04);
    group.add(trigGuard);

    // --- Trigger ---
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.003), darkMat);
    trigger.position.set(0, -0.02, 0.05);
    group.add(trigger);

    // --- Bolts / screws (visual details) ---
    for (let pos of [[0.025, 0.01, -0.15], [-0.025, 0.01, -0.15]]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.002, 4), accentMat);
      screw.position.set(pos[0], pos[1], pos[2]);
      group.add(screw);
    }

    // Apply scale
    group.scale.set(s, s, s);

    return group;
  }

  fire() {
    if (this.ammo <= 0) return false;
    this.ammo--;
    this._fireAnimTime = 0;
    this._isFiring = true;
    return true;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  update(dt) {
    if (this._isFiring) {
      this._fireAnimTime += dt;
      // Subtle kick-back animation
      this.mesh.position.z += -0.008 * Math.sin(this._fireAnimTime * 40) * Math.exp(-this._fireAnimTime * 15);

      if (this._fireAnimTime > 0.08) {
        this._isFiring = false;
        this._fireAnimTime = 0;
      }
    }
  }
}
