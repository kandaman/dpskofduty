import * as THREE from 'three';

export class AssaultRifle {
  constructor(game) {
    this.game = game;
    this.materials = game.materials;
    this.stats = {
      name: 'M4A1',
      damage: 28,
      fireRate: 750,
      magSize: 30,
      reserveAmmo: 360,
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
    this.mesh.name = 'weapon_m4a1';

    // Shell ejection point
    this.shellEjectPoint = new THREE.Object3D();
    this.shellEjectPoint.position.set(-0.05, 0.08, -0.25);
    this.mesh.add(this.shellEjectPoint);

    // Muzzle flash point
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0, -0.62);
    this.mesh.add(this.muzzlePoint);

    this._fireAnimTime = 0;
    this._isFiring = false;
    this._boltPosition = 0; // for bolt animation
    this._boltTarget = 0;
  }

  _createWeaponModel() {
    const group = new THREE.Group();
    const m = this.materials;

    // Materials from MaterialManager
    const bodyMat = m.getWeaponBody();
    const barrelMat = m.getWeaponBarrel();
    const gripMat = m.getWeaponGrip();
    const stockMat = m.getWeaponStock();
    const railMat = m.getWeaponRail();
    const sightMat = m.getWeaponSight();
    const magMat = m.getWeaponMagazine();
    const darkMat = m.getDarkMetal();
    const accentMat = m.getBareMetal(0x777777, 0.5);

    const s = 0.55; // overall scale factor

    // ─── LOWER RECEIVER ─────────────────────────────────────────────────
    const lowerRec = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.22), bodyMat);
    lowerRec.position.set(0, -0.005, -0.03);
    group.add(lowerRec);

    // Trigger pocket
    const triggerPocket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.025), darkMat);
    triggerPocket.position.set(0, -0.015, 0.05);
    group.add(triggerPocket);

    // Trigger guard
    const trigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.035), darkMat);
    trigGuard.position.set(0, -0.032, 0.04);
    group.add(trigGuard);

    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.015, 0.003), darkMat);
    trigger.position.set(0, -0.025, 0.05);
    group.add(trigger);

    // Bolt catch
    const boltCatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.003), accentMat);
    boltCatch.position.set(0.035, 0.005, -0.04);
    group.add(boltCatch);

    // Magazine release
    const magRelease = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.003), accentMat);
    magRelease.position.set(0.03, -0.005, 0.01);
    group.add(magRelease);

    // ─── UPPER RECEIVER ─────────────────────────────────────────────────
    const upperRec = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.22), bodyMat);
    upperRec.position.set(0, 0.025, -0.06);
    group.add(upperRec);

    // Receiver seam (line between upper and lower)
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.2), darkMat);
    seam.position.set(0, 0.008, -0.05);
    group.add(seam);

    // Picatinny rail on top of upper receiver
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.18), railMat);
    topRail.position.set(0, 0.033, -0.05);
    group.add(topRail);

    // Rail teeth (small transverse ridges)
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.003, 0.003), railMat
      );
      tooth.position.set(0, 0.036, -0.08 + i * 0.02);
      group.add(tooth);
    }

    // Forward assist
    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.01, 6), darkMat);
    fa.position.set(0.035, 0.012, -0.02);
    fa.rotation.z = Math.PI / 2;
    group.add(fa);

    // Ejection port
    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.005), darkMat);
    ejectionPort.position.set(0.018, 0.03, -0.08);
    group.add(ejectionPort);

    // Bolt carrier (visible through ejection port)
    this._boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.012), barrelMat);
    this._boltMesh.position.set(0.018, 0.025, -0.08);
    group.add(this._boltMesh);

    // Charging handle
    const chargeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.015, 6), darkMat);
    chargeHandle.position.set(0.012, 0.032, 0.08);
    chargeHandle.rotation.z = Math.PI / 2;
    group.add(chargeHandle);

    // ─── BARREL ─────────────────────────────────────────────────────────
    // Barrel chamber (thicker)
    const barrelChamber = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, 10), barrelMat);
    barrelChamber.position.set(0, 0, -0.22);
    barrelChamber.rotation.x = Math.PI / 2;
    group.add(barrelChamber);

    // Barrel (thinner, taper)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, 0.28, 10), barrelMat);
    barrel.position.set(0, 0, -0.45);
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);

    // Barrel nut
    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.02, 10), darkMat);
    barrelNut.position.set(0, 0, -0.25);
    barrelNut.rotation.x = Math.PI / 2;
    group.add(barrelNut);

    // Gas block
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.025), darkMat);
    gasBlock.position.set(0, 0, -0.5);
    group.add(gasBlock);

    // Gas tube (thin cylinder above barrel)
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.22, 6), barrelMat);
    gasTube.position.set(0, 0.018, -0.35);
    gasTube.rotation.x = Math.PI / 2;
    group.add(gasTube);

    // ─── HANDGUARD / RAIL SYSTEM ────────────────────────────────────────
    // Main handguard body
    const handguardBody = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.2), railMat);
    handguardBody.position.set(0, 0, -0.3);
    group.add(handguardBody);

    // Rail top (full length)
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.006, 0.18), railMat);
    railTop.position.set(0, 0.023, -0.3);
    group.add(railTop);

    // Rail bottom
    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.006, 0.18), railMat);
    railBottom.position.set(0, -0.023, -0.3);
    group.add(railBottom);

    // Rail sides
    for (let side of [-1, 1]) {
      const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.16), railMat);
      railSide.position.set(side * 0.02, 0, -0.3);
      group.add(railSide);
    }

    // Rail panels (small slots on handguard)
    for (let i = 0; i < 8; i++) {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.002, 0.003), darkMat
      );
      slot.position.set(0, 0.025, -0.24 + i * 0.02);
      group.add(slot);
      const slot2 = slot.clone();
      slot2.position.y = -0.025;
      group.add(slot2);
    }

    // ─── PISTOL GRIP ────────────────────────────────────────────────────
    const gripGeom = new THREE.CylinderGeometry(0.025, 0.04, 0.06, 5);
    const grip = new THREE.Mesh(gripGeom, gripMat);
    grip.position.set(0, -0.05, 0.02);
    grip.rotation.x = -0.2;
    group.add(grip);

    // Grip texture lines (checkering)
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.002, 0.002),
        darkMat
      );
      line.position.set(0, -0.04 + i * 0.02, 0.055);
      group.add(line);
    }

    // ─── MAGAZINE ───────────────────────────────────────────────────────
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.065, 0.07), magMat);
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

    // Rounds visible at top of mag
    for (let i = 0; i < 3; i++) {
      const round = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.001, 4),
        barrelMat
      );
      round.position.set(0.008, -0.04 + i * 0.005, -0.08);
      round.rotation.z = Math.PI / 2;
      group.add(round);
    }

    // ─── STOCK ──────────────────────────────────────────────────────────
    // Buffer tube
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.08, 8), darkMat);
    bufferTube.position.set(0, 0.02, 0.14);
    bufferTube.rotation.x = Math.PI / 2;
    group.add(bufferTube);

    // Stock body
    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.12), stockMat);
    stockBody.position.set(0, 0.005, 0.22);
    stockBody.rotation.x = 0.03;
    group.add(stockBody);

    // Stock cheek rest
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.08), darkMat);
    cheekRest.position.set(0, 0.025, 0.23);
    group.add(cheekRest);

    // Stock butt pad
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), darkMat);
    buttPad.position.set(0, 0.005, 0.28);
    group.add(buttPad);

    // Stock adjustment holes
    for (let i = 0; i < 3; i++) {
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, 0.002, 0.003, 4), accentMat
      );
      hole.position.set(0, 0.015, 0.19 + i * 0.03);
      hole.rotation.x = Math.PI / 2;
      group.add(hole);
    }

    // Stock QD sling mount
    const slingMount = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 4, 8), darkMat);
    slingMount.position.set(-0.02, 0.02, 0.2);
    group.add(slingMount);

    // ─── FRONT SIGHT ────────────────────────────────────────────────────
    const frontSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.02, 0.005), sightMat);
    frontSightBase.position.set(0, 0.04, -0.45);
    group.add(frontSightBase);

    // Front sight posts (ears)
    for (let side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.025, 0.003), sightMat);
      post.position.set(side * 0.008, 0.05, -0.45);
      group.add(post);
    }

    // Front sight pin
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.015, 4), accentMat);
    pin.position.set(0, 0.06, -0.45);
    pin.rotation.x = Math.PI / 2;
    group.add(pin);

    // ─── REAR SIGHT ─────────────────────────────────────────────────────
    const rearSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.015, 0.005), sightMat);
    rearSightBase.position.set(0, 0.038, 0.02);
    group.add(rearSightBase);

    // Rear sight aperture (ring)
    const aperture = new THREE.Mesh(
      new THREE.TorusGeometry(0.005, 0.002, 6, 8),
      sightMat
    );
    aperture.position.set(0, 0.048, 0.02);
    group.add(aperture);

    // Rear sight adjustment knob
    const adjKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.003, 6), darkMat);
    adjKnob.position.set(0, 0.055, 0.02);
    group.add(adjKnob);

    // ─── MUZZLE BRAKE ───────────────────────────────────────────────────
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.025, 10), barrelMat);
    muzzleBrake.position.set(0, 0, -0.6);
    muzzleBrake.rotation.x = Math.PI / 2;
    group.add(muzzleBrake);

    // Muzzle brake ports
    for (let i = 0; i < 3; i++) {
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.002), darkMat);
      port.position.set(0, 0.014, -0.6 + (i - 1) * 0.006);
      group.add(port);
      const port2 = port.clone();
      port2.position.y = -0.014;
      group.add(port2);
    }

    // Muzzle threading (visible at tip)
    const muzzleThread = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.01, 10), barrelMat);
    muzzleThread.position.set(0, 0, -0.62);
    muzzleThread.rotation.x = Math.PI / 2;
    group.add(muzzleThread);

    // ─── SCREWS / BOLTS ────────────────────────────────────────────────
    for (let pos of [[0.025, 0.01, -0.15], [-0.025, 0.01, -0.15]]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.002, 4), accentMat);
      screw.position.set(pos[0], pos[1], pos[2]);
      group.add(screw);
    }

    // ─── DUST COVER / EJECTION PORT COVER ──────────────────────────────
    this._ejectionCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.012, 0.003),
      bodyMat
    );
    this._ejectionCover.position.set(0.018, 0.03, -0.08);
    group.add(this._ejectionCover);

    // ─── AMBIENT OCCLUSION GEOMETRY ─────────────────────────────────────
    // Small details that improve silhouette
    // Selector switch
    const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.006, 4), darkMat);
    selector.position.set(0, 0.02, 0.06);
    selector.rotation.z = Math.PI / 2;
    group.add(selector);

    // Apply scale
    group.scale.set(s, s, s);

    return group;
  }

  fire() {
    if (this.ammo <= 0) return false;
    this.ammo--;
    this._fireAnimTime = 0;
    this._isFiring = true;
    // Bolt slides back on fire
    this._boltTarget = -0.02;

    // Flip ejection port cover open
    if (this._ejectionCover) {
      this._ejectionCover.rotation.x = -0.3;
    }

    return true;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  update(dt) {
    // Fire animation (kick-back)
    if (this._isFiring) {
      this._fireAnimTime += dt;
      // Quick kick-back with recovery
      const kick = -0.008 * Math.sin(this._fireAnimTime * 40) * Math.exp(-this._fireAnimTime * 15);
      this.mesh.position.z += kick;

      // Bolt animation: snap back, return
      const boltRecovery = 1 - Math.exp(-this._fireAnimTime * 50);
      this._boltPosition += (this._boltTarget - this._boltPosition) * (1 - Math.exp(-60 * dt));
      if (this._boltMesh) {
        this._boltMesh.position.z = -0.08 + this._boltPosition;
      }

      if (this._fireAnimTime > 0.15) {
        this._isFiring = false;
        this._fireAnimTime = 0;
        this._boltTarget = 0;
      }
    }

    // Ejection cover closes after bolt returns
    if (!this._isFiring && this._ejectionCover) {
      this._ejectionCover.rotation.x += (0 - this._ejectionCover.rotation.x) * (1 - Math.exp(-20 * dt));
    }

    // Bolt position smoothing (return to rest)
    if (!this._isFiring && this._boltMesh) {
      this._boltPosition += (0 - this._boltPosition) * (1 - Math.exp(-20 * dt));
      this._boltMesh.position.z = -0.08 + this._boltPosition;
    }
  }
}
