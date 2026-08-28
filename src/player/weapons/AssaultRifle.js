import * as THREE from 'three';

/**
 * AssaultRifle — M4A1 with PBR FBX model loading.
 *
 * Constructor creates a procedural placeholder mesh so the weapon is usable
 * immediately. Call loadFBX() to replace it with the high-detail FBX model
 * and PBR textures; the swap happens transparently once the assets arrive.
 */
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

    // ── Procedural fallback group ──────────────────────────────────────
    this._proceduralGroup = this._createWeaponModel();
    this._proceduralGroup.name = 'weapon_m4a1_fallback';

    // Container group — always the public face, contents swap later
    this.mesh = new THREE.Group();
    this.mesh.name = 'weapon_m4a1';
    this.mesh.add(this._proceduralGroup);

    // Shell ejection point
    this.shellEjectPoint = new THREE.Object3D();
    this.shellEjectPoint.position.set(-0.05, 0.08, -0.25);
    this.mesh.add(this.shellEjectPoint);

    // Muzzle flash point
    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0, -0.62);
    this.mesh.add(this.muzzlePoint);

    // Fire animation state
    this._fireAnimTime = 0;
    this._isFiring = false;
    this._boltPosition = 0;
    this._boltTarget = 0;
    this._boltMesh = null; // set in _createWeaponModel
    this._ejectionCover = null;

    // Flag: true once FBX is loaded and swapped in
    this._fbxLoaded = false;
    this._fbxModel = null; // the loaded FBX group (kept alive, hidden when not visible)

    // Kick off async FBX load
    this._initFBXLoad();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  FBX LOADING
  // ─────────────────────────────────────────────────────────────────────

  async _initFBXLoad() {
    try {
      const fbDir = 'weapons/m4a1';

      // Load FBX geometry
      const fbxGroup = await this.game.assetManager.loadFBX(`${fbDir}/M4A1.fbx`);

      // Load PBR textures
      const [baseColor, normal, metallic, roughness] = await Promise.all([
        this.game.assetManager.loadAssetTexture(`${fbDir}/M4A1_Base_Color.png`),
        this.game.assetManager.loadAssetTexture(`${fbDir}/M4A1_Normal.png`),
        this.game.assetManager.loadAssetTexture(`${fbDir}/M4A1_Metallic.png`),
        this.game.assetManager.loadAssetTexture(`${fbDir}/M4A1_Roughness.png`),
      ]);

      // Configure texture channels:
      //   BaseColor → sRGB (colour data, gamma-corrected)
      //   Normal/Metallic/Roughness/Height → NoColorSpace (tangent-space data, not colour)
      baseColor.colorSpace = THREE.SRGBColorSpace;
      normal.colorSpace = THREE.NoColorSpace;
      metallic.colorSpace = THREE.NoColorSpace;
      roughness.colorSpace = THREE.NoColorSpace;

      // Apply PBR material to every mesh in the FBX group
      fbxGroup.traverse((child) => {
        if (!child.isMesh) return;
        const origMat = child.material;

        const pbrMat = new THREE.MeshStandardMaterial({
          map: baseColor,
          normalMap: normal,
          normalScale: new THREE.Vector2(1, 1),
          metalnessMap: metallic,
          roughnessMap: roughness,
          metalness: 1.0,
          roughness: 0.6,
          envMap: this.game.assetManager._envMap || null,
          envMapIntensity: 1.0,
          color: 0xffffff,
        });

        // Copy vertex colours if the FBX has them
        if (origMat && Array.isArray(origMat) && origMat.length > 0) {
          // FBXLoader sometimes returns material arrays — take the first
        }

        child.material = pbrMat;
        child.castShadow = true;
        child.receiveShadow = true;
      });

      // Scale and position for first-person view
      // Centered under camera: slightly right, below center, forward
      fbxGroup.scale.set(0.55, 0.55, 0.55);
      fbxGroup.position.set(0.08, -0.18, -0.35);
      fbxGroup.rotation.set(0, 0, 0);

      // Apply environment map if already loaded
      if (this.game.assetManager._envMap) {
        fbxGroup.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.envMap = this.game.assetManager._envMap;
            child.material.needsUpdate = true;
          }
        });
      }

      // ── Swap into the container ──────────────────────────────────────
      this._swapToFBX(fbxGroup);

    } catch (err) {
      console.warn(`M4A1 FBX load failed, using procedural model: ${err.message}`);
    }
  }

  /**
   * Replace the procedural geometry inside this.mesh with the FBX group.
   * shellEjectPoint and muzzlePoint stay as children of this.mesh.
   */
  _swapToFBX(fbxGroup) {
    // Remember children to preserve
    const shellPt = this.shellEjectPoint;
    const muzzlePt = this.muzzlePoint;

    // Remove all current children
    while (this.mesh.children.length > 0) {
      this.mesh.remove(this.mesh.children[0]);
    }

    // Add FBX model
    this.mesh.add(fbxGroup);
    this._fbxModel = fbxGroup;

    // Re-add attachment points
    this.mesh.add(shellPt);
    this.mesh.add(muzzlePt);

    // Dispose procedural geometry to free memory
    this._disposeProcedural();

    this._fbxLoaded = true;
  }

  _disposeProcedural() {
    if (!this._proceduralGroup) return;
    this._proceduralGroup.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => m.dispose());
        }
      }
    });
    this._proceduralGroup = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  PROCEDURAL MODEL (fallback — runs synchronously at construction)
  // ─────────────────────────────────────────────────────────────────────

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

    const s = 0.55;

    // ─── LOWER RECEIVER ─────────────────────────────────────────────────
    const lowerRec = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.22), bodyMat);
    lowerRec.position.set(0, -0.005, -0.03);
    group.add(lowerRec);

    const triggerPocket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.025), darkMat);
    triggerPocket.position.set(0, -0.015, 0.05);
    group.add(triggerPocket);

    const trigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.035), darkMat);
    trigGuard.position.set(0, -0.032, 0.04);
    group.add(trigGuard);

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.015, 0.003), darkMat);
    trigger.position.set(0, -0.025, 0.05);
    group.add(trigger);

    const boltCatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.003), accentMat);
    boltCatch.position.set(0.035, 0.005, -0.04);
    group.add(boltCatch);

    const magRelease = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.003), accentMat);
    magRelease.position.set(0.03, -0.005, 0.01);
    group.add(magRelease);

    // ─── UPPER RECEIVER ─────────────────────────────────────────────────
    const upperRec = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.22), bodyMat);
    upperRec.position.set(0, 0.025, -0.06);
    group.add(upperRec);

    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.2), darkMat);
    seam.position.set(0, 0.008, -0.05);
    group.add(seam);

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.18), railMat);
    topRail.position.set(0, 0.033, -0.05);
    group.add(topRail);

    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.003, 0.003), railMat);
      tooth.position.set(0, 0.036, -0.08 + i * 0.02);
      group.add(tooth);
    }

    const fa = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.01, 6), darkMat);
    fa.position.set(0.035, 0.012, -0.02);
    fa.rotation.z = Math.PI / 2;
    group.add(fa);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.005), darkMat);
    ejectionPort.position.set(0.018, 0.03, -0.08);
    group.add(ejectionPort);

    this._boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.012), barrelMat);
    this._boltMesh.position.set(0.018, 0.025, -0.08);
    group.add(this._boltMesh);

    const chargeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.015, 6), darkMat);
    chargeHandle.position.set(0.012, 0.032, 0.08);
    chargeHandle.rotation.z = Math.PI / 2;
    group.add(chargeHandle);

    // ─── BARREL ─────────────────────────────────────────────────────────
    const barrelChamber = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, 10), barrelMat);
    barrelChamber.position.set(0, 0, -0.22);
    barrelChamber.rotation.x = Math.PI / 2;
    group.add(barrelChamber);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.016, 0.28, 10), barrelMat);
    barrel.position.set(0, 0, -0.45);
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);

    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.02, 10), darkMat);
    barrelNut.position.set(0, 0, -0.25);
    barrelNut.rotation.x = Math.PI / 2;
    group.add(barrelNut);

    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.025), darkMat);
    gasBlock.position.set(0, 0, -0.5);
    group.add(gasBlock);

    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.22, 6), barrelMat);
    gasTube.position.set(0, 0.018, -0.35);
    gasTube.rotation.x = Math.PI / 2;
    group.add(gasTube);

    // ─── HANDGUARD / RAIL SYSTEM ────────────────────────────────────────
    const handguardBody = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.2), railMat);
    handguardBody.position.set(0, 0, -0.3);
    group.add(handguardBody);

    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.006, 0.18), railMat);
    railTop.position.set(0, 0.023, -0.3);
    group.add(railTop);

    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.006, 0.18), railMat);
    railBottom.position.set(0, -0.023, -0.3);
    group.add(railBottom);

    for (let side of [-1, 1]) {
      const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.16), railMat);
      railSide.position.set(side * 0.02, 0, -0.3);
      group.add(railSide);
    }

    for (let i = 0; i < 8; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.002, 0.003), darkMat);
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

    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.002, 0.002), darkMat);
      line.position.set(0, -0.04 + i * 0.02, 0.055);
      group.add(line);
    }

    // ─── MAGAZINE ───────────────────────────────────────────────────────
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.065, 0.07), magMat);
    magBody.position.set(0, -0.055, -0.06);
    magBody.rotation.x = -0.08;
    group.add(magBody);

    const magPlate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.06), darkMat);
    magPlate.position.set(0, -0.09, -0.06);
    group.add(magPlate);

    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.001), accentMat);
      rib.position.set(0, -0.06 + i * 0.02, -0.095);
      group.add(rib);
    }

    for (let i = 0; i < 3; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.001, 4), barrelMat);
      round.position.set(0.008, -0.04 + i * 0.005, -0.08);
      round.rotation.z = Math.PI / 2;
      group.add(round);
    }

    // ─── STOCK ──────────────────────────────────────────────────────────
    const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.08, 8), darkMat);
    bufferTube.position.set(0, 0.02, 0.14);
    bufferTube.rotation.x = Math.PI / 2;
    group.add(bufferTube);

    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.12), stockMat);
    stockBody.position.set(0, 0.005, 0.22);
    stockBody.rotation.x = 0.03;
    group.add(stockBody);

    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.08), darkMat);
    cheekRest.position.set(0, 0.025, 0.23);
    group.add(cheekRest);

    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), darkMat);
    buttPad.position.set(0, 0.005, 0.28);
    group.add(buttPad);

    for (let i = 0; i < 3; i++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.003, 4), accentMat);
      hole.position.set(0, 0.015, 0.19 + i * 0.03);
      hole.rotation.x = Math.PI / 2;
      group.add(hole);
    }

    const slingMount = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 4, 8), darkMat);
    slingMount.position.set(-0.02, 0.02, 0.2);
    group.add(slingMount);

    // ─── FRONT SIGHT ────────────────────────────────────────────────────
    const frontSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.02, 0.005), sightMat);
    frontSightBase.position.set(0, 0.04, -0.45);
    group.add(frontSightBase);

    for (let side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.025, 0.003), sightMat);
      post.position.set(side * 0.008, 0.05, -0.45);
      group.add(post);
    }

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.015, 4), accentMat);
    pin.position.set(0, 0.06, -0.45);
    pin.rotation.x = Math.PI / 2;
    group.add(pin);

    // ─── REAR SIGHT ─────────────────────────────────────────────────────
    const rearSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.015, 0.005), sightMat);
    rearSightBase.position.set(0, 0.038, 0.02);
    group.add(rearSightBase);

    const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.002, 6, 8), sightMat);
    aperture.position.set(0, 0.048, 0.02);
    group.add(aperture);

    const adjKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.003, 6), darkMat);
    adjKnob.position.set(0, 0.055, 0.02);
    group.add(adjKnob);

    // ─── MUZZLE BRAKE ───────────────────────────────────────────────────
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.025, 10), barrelMat);
    muzzleBrake.position.set(0, 0, -0.6);
    muzzleBrake.rotation.x = Math.PI / 2;
    group.add(muzzleBrake);

    for (let i = 0; i < 3; i++) {
      const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.002), darkMat);
      port.position.set(0, 0.014, -0.6 + (i - 1) * 0.006);
      group.add(port);
      const port2 = port.clone();
      port2.position.y = -0.014;
      group.add(port2);
    }

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
    this._ejectionCover = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.003), bodyMat);
    this._ejectionCover.position.set(0.018, 0.03, -0.08);
    group.add(this._ejectionCover);

    // ─── AMBIENT OCCLUSION GEOMETRY ─────────────────────────────────────
    const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.006, 4), darkMat);
    selector.position.set(0, 0.02, 0.06);
    selector.rotation.z = Math.PI / 2;
    group.add(selector);

    group.scale.set(s, s, s);

    return group;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────

  fire() {
    if (this.ammo <= 0) return false;
    this.ammo--;
    this._fireAnimTime = 0;
    this._isFiring = true;

    // Fallback bolt animation (only works on procedural model)
    this._boltTarget = -0.02;

    if (this._ejectionCover) {
      this._ejectionCover.rotation.x = -0.3;
    }

    return true;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }

  update(dt) {
    // Fire animation (kick-back) — applied to this.mesh regardless of model type
    if (this._isFiring) {
      this._fireAnimTime += dt;
      const kick = -0.008 * Math.sin(this._fireAnimTime * 40) * Math.exp(-this._fireAnimTime * 15);
      this.mesh.position.z += kick;

      // Bolt animation (procedural model only)
      if (!this._fbxLoaded && this._boltMesh) {
        const boltRecovery = 1 - Math.exp(-this._fireAnimTime * 50);
        this._boltPosition += (this._boltTarget - this._boltPosition) * (1 - Math.exp(-60 * dt));
        this._boltMesh.position.z = -0.08 + this._boltPosition;
      }

      if (this._fireAnimTime > 0.15) {
        this._isFiring = false;
        this._fireAnimTime = 0;
        this._boltTarget = 0;
      }
    }

    // Ejection cover closes after bolt returns (procedural only)
    if (!this._isFiring && this._ejectionCover && !this._fbxLoaded) {
      this._ejectionCover.rotation.x += (0 - this._ejectionCover.rotation.x) * (1 - Math.exp(-20 * dt));
    }

    // Bolt position smoothing (procedural only)
    if (!this._isFiring && this._boltMesh && !this._fbxLoaded) {
      this._boltPosition += (0 - this._boltPosition) * (1 - Math.exp(-20 * dt));
      this._boltMesh.position.z = -0.08 + this._boltPosition;
    }
  }
}
