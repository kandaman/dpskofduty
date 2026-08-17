import * as THREE from 'three';

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this._build();
  }

  _makeMat(color, roughness = 0.7, metalness = 0.1) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  _addMesh(geom, mat, pos, rot = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.objects.push(mesh);
    return mesh;
  }

  _buildBuilding(pos, w, h, d, color, hasWindows = true) {
    const wallMat = this._makeMat(color, 0.8, 0.1);
    const roofMat = this._makeMat(0x444444, 0.9, 0.05);
    const windowMat = this._makeMat(0x112233, 0.3, 0.2);
    windowMat.emissive = new THREE.Color(0x112244);
    windowMat.emissiveIntensity = 0.1;

    // Main structure
    this._addMesh(new THREE.BoxGeometry(w, h, d), wallMat,
      new THREE.Vector3(pos.x, pos.y + h / 2, pos.z));

    // Roof
    this._addMesh(new THREE.BoxGeometry(w + 0.2, 0.15, d + 0.2), roofMat,
      new THREE.Vector3(pos.x, pos.y + h + 0.05, pos.z));

    // Windows
    if (hasWindows) {
      const winW = 0.6, winH = 0.8, gap = 1.2;
      const startX = pos.x - w / 2 + gap;
      const endX = pos.x + w / 2 - gap;
      const startZ = pos.z - d / 2 + gap;
      const endZ = pos.z + d / 2 - gap;

      // Front & back windows
      for (let z of [pos.z - d / 2 + 0.05, pos.z + d / 2 - 0.05]) {
        for (let x = startX; x <= endX; x += gap) {
          this._addMesh(new THREE.BoxGeometry(winW, winH, 0.05), windowMat,
            new THREE.Vector3(x, pos.y + h * 0.6, z));
        }
      }
      // Side windows
      for (let x of [pos.x - w / 2 + 0.05, pos.x + w / 2 - 0.05]) {
        for (let z = startZ; z <= endZ; z += gap) {
          this._addMesh(new THREE.BoxGeometry(0.05, winH, winW), windowMat,
            new THREE.Vector3(x, pos.y + h * 0.6, z));
        }
      }
    }
  }

  _build() {
    // Ground
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a3a,
      roughness: 0.95,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.objects.push(ground);

    // --- Roads / pathways (darker strips) ---
    const roadMat = this._makeMat(0x3a3a3a, 0.9, 0.05);
    // Cross roads
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      const road = this._addMesh(new THREE.PlaneGeometry(4, 40), roadMat,
        new THREE.Vector3(Math.cos(angle) * 12, 0.01, Math.sin(angle) * 12));
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -angle;
    }

    // --- Central monument / structure ---
    const monumentMat = this._makeMat(0x555566, 0.4, 0.6);
    // Base
    this._addMesh(new THREE.CylinderGeometry(5, 6, 0.8, 16), monumentMat,
      new THREE.Vector3(0, 0.4, 0));
    // Column
    this._addMesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 12),
      this._makeMat(0x666677, 0.3, 0.7),
      new THREE.Vector3(0, 3.3, 0));
    // Top
    this._addMesh(new THREE.CylinderGeometry(1.2, 0.6, 0.4, 12),
      this._makeMat(0x777788, 0.2, 0.8),
      new THREE.Vector3(0, 5.5, 0));

    // --- Buildings ---
    this._buildBuilding(new THREE.Vector3(-14, 0, -10), 5, 3.5, 5, 0x667788);
    this._buildBuilding(new THREE.Vector3(14, 0, 10), 6, 2.5, 5, 0x776655);
    this._buildBuilding(new THREE.Vector3(-12, 0, 14), 4, 4, 4, 0x556677);
    this._buildBuilding(new THREE.Vector3(12, 0, -14), 4, 3, 4, 0x887766);

    // Small structures
    this._buildBuilding(new THREE.Vector3(-18, 0, -4), 2.5, 1.8, 2.5, 0x666655);
    this._buildBuilding(new THREE.Vector3(18, 0, 4), 2.5, 1.8, 2.5, 0x556655);
    this._buildBuilding(new THREE.Vector3(-4, 0, -18), 2.5, 1.8, 2.5, 0x656565);
    this._buildBuilding(new THREE.Vector3(4, 0, 18), 2.5, 1.8, 2.5, 0x556666);

    // --- 2-story building (center-left) ---
    this._buildBuilding(new THREE.Vector3(-8, 0, -7), 3.5, 5.5, 3.5, 0x6a7a8a);

    // --- 2-story building (center-right) ---
    this._buildBuilding(new THREE.Vector3(8, 0, 7), 3.5, 5.5, 3.5, 0x7a6a5a);

    // --- Walkway connecting two buildings ---
    const walkwayMat = this._makeMat(0x555555, 0.7, 0.3);
    const walkway = this._addMesh(new THREE.BoxGeometry(6, 0.15, 2), walkwayMat,
      new THREE.Vector3(0, 3, -7));
    // Walkway pillars
    for (let x of [-3, 3]) {
      this._addMesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 6),
        this._makeMat(0x444444, 0.5, 0.5),
        new THREE.Vector3(x, 1.5, -7));
    }

    // --- Stairs near central platform ---
    const stairMat = this._makeMat(0x666666, 0.8, 0.2);
    for (let i = 0; i < 5; i++) {
      this._addMesh(new THREE.BoxGeometry(1.2, 0.1, 0.3), stairMat,
        new THREE.Vector3(1.2, i * 0.15 + 0.05, 2 + i * 0.3));
    }

    // --- Cover / barriers (L-shape, T-shape, etc.) ---
    const barrierMat = this._makeMat(0x777777, 0.6, 0.3);

    const barrierPositions = [
      [[-6, 2], 1.5, 0.8, 0],
      [[-6.6, 2], 1.5, 0.8, Math.PI / 2],
      [[6, -3], 1.5, 0.8, Math.PI / 2],
      [[6.6, -3], 1.5, 0.8, 0],
      [[-3, 7], 1.2, 0.8, 0.3],
      [[-3.6, 7], 1.2, 0.8, 0],
      [[3, -8], 1.2, 0.8, -0.3],
      [[3.6, -8], 1.2, 0.8, 0],
      [[-8, 5], 2.5, 0.8, 0.2],
      [[8, -5], 2.5, 0.8, -0.2],
      [[-5, -8], 2, 0.8, 0.5],
      [[5, 8], 2, 0.8, -0.5],
      [[-10, -3], 1, 0.6, 0],
      [[10, 3], 1, 0.6, Math.PI / 2]
    ];

    for (const [pos, w, h, rot] of barrierPositions) {
      this._addMesh(
        new THREE.BoxGeometry(w, h, 0.3),
        barrierMat,
        new THREE.Vector3(pos[0], h / 2, pos[1])
      ).rotation.y = rot;
    }

    // --- Sandbags ---
    const sandbagMat = this._makeMat(0x8B7355, 0.95, 0.0);
    const sandbagPositions = [
      [-11, -6], [11, 6], [-6, 11], [6, -11],
      [-13, 3], [13, -3], [3, 13], [-3, -13]
    ];
    for (const pos of sandbagPositions) {
      const x = pos[0], z = pos[1] || 0;
      for (let layer = 0; layer < 2; layer++) {
        this._addMesh(
          new THREE.BoxGeometry(0.8, 0.25, 0.4),
          sandbagMat,
          new THREE.Vector3(x + (layer === 1 ? 0.15 : 0), 0.15 + layer * 0.2, z)
        );
        if (layer === 0) {
          this._addMesh(
            new THREE.BoxGeometry(0.8, 0.25, 0.4),
            sandbagMat,
            new THREE.Vector3(x - 0.15, 0.35, z)
          );
        }
      }
    }

    // --- Fence / railings ---
    const fenceMat = this._makeMat(0x445555, 0.4, 0.5);
    const fencePosts = [
      [-19, -2], [-19, 2], [-2, -19], [2, -19],
      [19, -2], [19, 2], [-2, 19], [2, 19]
    ];
    for (const pos of fencePosts) {
      this._addMesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), fenceMat,
        new THREE.Vector3(pos[0], 0.6, pos[1]));
    }

    // --- HESCO barriers (large) ---
    const hescoMat = this._makeMat(0x8a7a6a, 0.9, 0.1);
    const hescoPositions = [
      [-17, 0, -12], [17, 0, 12], [-17, 0, 12], [17, 0, -12],
      [-20, 0, 0], [20, 0, 0], [0, 0, -20], [0, 0, 20]
    ];
    for (const pos of hescoPositions) {
      this._addMesh(new THREE.BoxGeometry(1, 1.2, 1), hescoMat,
        new THREE.Vector3(pos[0], 0.6, pos[2]));
    }

    // --- Crates / barrels ---
    const crateMat = this._makeMat(0x8B7355, 0.9, 0.0);
    const barrelMat2 = this._makeMat(0x663333, 0.6, 0.4);

    const cratePositions = [
      [-9, 0.3, -13], [-8, 0.6, -12.5], [-7.5, 0.45, -13.5],
      [9, 0.3, 12], [8.5, 0.6, 13], [7.5, 0.45, 12.5],
      [-4, 0.25, -15], [4, 0.25, 15],
      [0, 0.3, -12], [0, 0.3, 12]
    ];
    for (const pos of cratePositions) {
      this._addMesh(new THREE.BoxGeometry(0.6, pos[1] * 2, 0.6), crateMat,
        new THREE.Vector3(pos[0], pos[1], pos[2]));
    }

    // Barrels
    const barrelPositions = [
      [-12, -2], [12, 2], [-2, 12], [2, -12],
      [-15, 5], [15, -5]
    ];
    for (const pos of barrelPositions) {
      this._addMesh(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 8), barrelMat2,
        new THREE.Vector3(pos[0], 0.2, pos[1]));
    }

    // --- Lamp posts ---
    const postMat = this._makeMat(0x333333, 0.5, 0.6);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffaa44,
      emissiveIntensity: 0.5
    });

    const lampPositions = [
      [-18, -18], [18, -18], [-18, 18], [18, 18],
      [-10, -18], [10, -18], [-10, 18], [10, 18],
      [-18, -10], [18, -10], [-18, 10], [18, 10],
      [0, -19], [0, 19], [-19, 0], [19, 0]
    ];
    for (const pos of lampPositions) {
      const post = this._addMesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 6), postMat,
        new THREE.Vector3(pos[0], 1.5, pos[1]));
      const lamp = this._addMesh(new THREE.SphereGeometry(0.18, 6, 6), lampMat,
        new THREE.Vector3(pos[0], 3.15, pos[1]));
    }

    // --- Debris / rubble on ground ---
    const debrisMat = this._makeMat(0x555544, 0.95, 0.0);
    for (let i = 0; i < 80; i++) {
      const size = 0.03 + Math.random() * 0.08;
      const d = this._addMesh(
        new THREE.BoxGeometry(size, size * 0.5, size),
        debrisMat,
        new THREE.Vector3(
          (Math.random() - 0.5) * 36,
          size * 0.25,
          (Math.random() - 0.5) * 36
        )
      );
      d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }

    // --- Vehicle husk (wrecked car, simplified) ---
    const carMat = this._makeMat(0x554433, 0.8, 0.2);
    const carDark = this._makeMat(0x222222, 0.7, 0.4);
    // Body
    this._addMesh(new THREE.BoxGeometry(1.5, 0.4, 0.8), carMat,
      new THREE.Vector3(-15, 0.3, 6));
    // Cabin
    this._addMesh(new THREE.BoxGeometry(0.8, 0.3, 0.6), carDark,
      new THREE.Vector3(-15, 0.6, 6));
    // Wheels
    for (let wx of [-0.6, 0.6]) {
      for (let wz of [-0.4, 0.4]) {
        this._addMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), carDark,
          new THREE.Vector3(-15 + wx, 0.12, 6 + wz));
      }
    }

    // --- Second vehicle ---
    this._addMesh(new THREE.BoxGeometry(1.5, 0.4, 0.8), this._makeMat(0x445544, 0.8, 0.2),
      new THREE.Vector3(14, 0.3, -5));
    this._addMesh(new THREE.BoxGeometry(0.8, 0.3, 0.6), carDark,
      new THREE.Vector3(14, 0.6, -5));
    for (let wx of [-0.6, 0.6]) {
      for (let wz of [-0.4, 0.4]) {
        this._addMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), carDark,
          new THREE.Vector3(14 + wx, 0.12, -5 + wz));
      }
    }
  }
}
