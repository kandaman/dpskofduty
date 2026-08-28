import * as THREE from 'three';

export class Level {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.objects = [];
    this.obstacleMeshes = [];
    this._build();
  }

  getObstacleMeshes() {
    return this.obstacleMeshes;
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

  _addObstacle(geom, mat, pos, rot = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1)) {
    const mesh = this._addMesh(geom, mat, pos, rot, scale);
    this.obstacleMeshes.push(mesh);
    return mesh;
  }

  // ─── DETAILED BUILDING ────────────────────────────────────────────────────

  _buildDetailedBuilding(pos, w, h, d, style = 'concrete', hasWindows = true) {
    const x = pos.x, z = pos.z;
    const wallThick = 0.15;
    const wallH = h;

    // Choose materials based on style
    let wallMat, roofMat, trimMat, damageMat;
    switch (style) {
      case 'concrete':
        wallMat = this.materials.getConcrete('standard', { color: 0x99aab5 });
        roofMat = this.materials.getConcrete('standard', { color: 0x667788 });
        trimMat = this.materials.getConcrete('standard', { color: 0xbbccdd });
        break;
      case 'damaged':
        wallMat = this.materials.getConcrete('damaged', { color: 0x8899a0 });
        roofMat = this.materials.getConcrete('worn', { color: 0x556666 });
        trimMat = this.materials.getPaintedMetal(0x666677);
        break;
      case 'bunker':
        wallMat = this.materials.getConcrete('worn', { color: 0x778888 });
        roofMat = this.materials.getConcrete('dark', { color: 0x556666 });
        trimMat = this.materials.getBareMetal(0x777777, 0.5);
        break;
      case 'warehouse':
        wallMat = this.materials.getPaintedMetal(0x667788, { roughness: 0.6 });
        roofMat = this.materials.getPaintedMetalDark({ roughness: 0.7 });
        trimMat = this.materials.getBareMetal(0x888888, 0.4);
        break;
      default:
        wallMat = this.materials.getConcrete('standard');
        roofMat = this.materials.getConcrete('dark');
        trimMat = this.materials.getConcrete('standard', { color: 0xbbccdd });
    }

    // Interior wall material (darker, unseen from outside)
    const interiorMat = this.materials.getConcrete('dark', { color: 0x445555 });

    // --- Main wall structure ---
    this._addObstacle(
      new THREE.BoxGeometry(w, wallH, d),
      wallMat,
      new THREE.Vector3(x, pos.y + wallH / 2, z)
    );

    // --- Wall thickness (inner walls for depth) ---
    // Front inner
    this._addMesh(
      new THREE.BoxGeometry(w - wallThick * 2, wallH - 0.1, wallThick),
      interiorMat,
      new THREE.Vector3(x, pos.y + wallH / 2, z - d / 2 + wallThick / 2)
    );
    // Back inner
    this._addMesh(
      new THREE.BoxGeometry(w - wallThick * 2, wallH - 0.1, wallThick),
      interiorMat,
      new THREE.Vector3(x, pos.y + wallH / 2, z + d / 2 - wallThick / 2)
    );
    // Left inner
    this._addMesh(
      new THREE.BoxGeometry(wallThick, wallH - 0.1, d - wallThick * 2),
      interiorMat,
      new THREE.Vector3(x - w / 2 + wallThick / 2, pos.y + wallH / 2, z)
    );
    // Right inner
    this._addMesh(
      new THREE.BoxGeometry(wallThick, wallH - 0.1, d - wallThick * 2),
      interiorMat,
      new THREE.Vector3(x + w / 2 - wallThick / 2, pos.y + wallH / 2, z)
    );

    // --- Edge trims (corner columns) ---
    const trimH = wallH + 0.1;
    for (let cx of [-w / 2, w / 2]) {
      for (let cz of [-d / 2, d / 2]) {
        this._addMesh(
          new THREE.BoxGeometry(0.1, trimH, 0.1),
          trimMat,
          new THREE.Vector3(x + cx, pos.y + trimH / 2, z + cz)
        );
      }
    }

    // --- Base trim (bottom 30cm darker strip) ---
    this._addMesh(
      new THREE.BoxGeometry(w + 0.1, 0.3, d + 0.1),
      this.materials.getConcrete('dark', { color: 0x556666 }),
      new THREE.Vector3(x, pos.y + 0.15, z)
    );

    // --- Roof ---
    const roofMat2 = style === 'damaged'
      ? this.materials.getPaintedMetalDark({ roughness: 0.8 })
      : roofMat;
    this._addMesh(
      new THREE.BoxGeometry(w + 0.3, 0.15, d + 0.3),
      roofMat2,
      new THREE.Vector3(x, pos.y + wallH + 0.05, z)
    );

    // --- Roof edge trim (coping) ---
    for (let cx of [-w / 2 - 0.05, w / 2 + 0.05]) {
      this._addMesh(
        new THREE.BoxGeometry(0.06, 0.2, d + 0.2),
        trimMat,
        new THREE.Vector3(x + cx, pos.y + wallH + 0.1, z)
      );
    }
    for (let cz of [-d / 2 - 0.05, d / 2 + 0.05]) {
      this._addMesh(
        new THREE.BoxGeometry(w + 0.2, 0.2, 0.06),
        trimMat,
        new THREE.Vector3(x, pos.y + wallH + 0.1, z + cz)
      );
    }

    // --- Windows ---
    if (hasWindows && style !== 'bunker') {
      const winW = 0.5, winH = 0.7, gap = 1.2;
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.6
      });
      const frameMat = this.materials.getPaintedMetal(0x666677, { roughness: 0.5 });
      const sillMat = this.materials.getConcrete('standard', { color: 0x999aaa });

      const startX = x - w / 2 + gap;
      const endX = x + w / 2 - gap;
      const startZ = z - d / 2 + gap;
      const endZ = z + d / 2 - gap;

      // Window frames + glass + sills on each face
      const winY = pos.y + wallH * 0.5;

      for (let face of ['front', 'back', 'left', 'right']) {
        let minCoord, maxCoord, fixedCoord;
        let isXAxis;

        switch (face) {
          case 'front':
            minCoord = startX; maxCoord = endX; fixedCoord = z - d / 2 + 0.05;
            isXAxis = true;
            break;
          case 'back':
            minCoord = startX; maxCoord = endX; fixedCoord = z + d / 2 - 0.05;
            isXAxis = true;
            break;
          case 'left':
            minCoord = startZ; maxCoord = endZ; fixedCoord = x - w / 2 + 0.05;
            isXAxis = false;
            break;
          case 'right':
            minCoord = startZ; maxCoord = endZ; fixedCoord = x + w / 2 - 0.05;
            isXAxis = false;
            break;
        }

        for (let fc = minCoord; fc <= maxCoord; fc += gap) {
          if (isXAxis) {
            // Window frame (loop around glass)
            const frameW = 0.04;
            // Glass
            this._addMesh(
              new THREE.PlaneGeometry(winW, winH),
              windowMat,
              new THREE.Vector3(fc, winY, fixedCoord),
              new THREE.Euler(0, 0, 0)
            );
            // Frame top
            this._addMesh(
              new THREE.BoxGeometry(winW + frameW * 2, frameW, frameW),
              frameMat,
              new THREE.Vector3(fc, winY + winH / 2, fixedCoord)
            );
            // Frame bottom
            this._addMesh(
              new THREE.BoxGeometry(winW + frameW * 2, frameW, frameW),
              frameMat,
              new THREE.Vector3(fc, winY - winH / 2, fixedCoord)
            );
            // Frame left
            this._addMesh(
              new THREE.BoxGeometry(frameW, winH, frameW),
              frameMat,
              new THREE.Vector3(fc - winW / 2, winY, fixedCoord)
            );
            // Frame right
            this._addMesh(
              new THREE.BoxGeometry(frameW, winH, frameW),
              frameMat,
              new THREE.Vector3(fc + winW / 2, winY, fixedCoord)
            );
            // Window sill
            this._addMesh(
              new THREE.BoxGeometry(winW + 0.1, 0.03, 0.08),
              sillMat,
              new THREE.Vector3(fc, winY - winH / 2 - 0.02, fixedCoord + 0.05)
            );
          } else {
            // Side windows (similar but rotated)
            this._addMesh(
              new THREE.PlaneGeometry(winH, winW),
              windowMat,
              new THREE.Vector3(fixedCoord, winY, fc),
              new THREE.Euler(0, Math.PI / 2, 0)
            );
            // Frame (simplified for sides)
            const frameW = 0.04;
            this._addMesh(
              new THREE.BoxGeometry(frameW, winW + frameW * 2, frameW),
              frameMat,
              new THREE.Vector3(fixedCoord, winY, fc + winH / 2)
            );
            this._addMesh(
              new THREE.BoxGeometry(frameW, winW + frameW * 2, frameW),
              frameMat,
              new THREE.Vector3(fixedCoord, winY, fc - winH / 2)
            );
          }
        }
      }
    }

    // --- Damage for damaged style ---
    if (style === 'damaged') {
      // Cracked corner (add rubble nearby later)
      for (let i = 0; i < 3; i++) {
        const crackSize = 0.05 + Math.random() * 0.1;
        this._addMesh(
          new THREE.BoxGeometry(crackSize, crackSize * 2, crackSize),
          this.materials.getConcrete('dark', { color: 0x556666 }),
          new THREE.Vector3(
            x - w / 2 + 0.1 + Math.random() * 0.3,
            pos.y + Math.random() * wallH * 0.5,
            z - d / 2 + 0.1
          )
        );
      }
      // Bullet impacts near edges
      for (let i = 0; i < 5; i++) {
        const hole = new THREE.Mesh(
          new THREE.CircleGeometry(0.01 + Math.random() * 0.02, 6),
          new THREE.MeshBasicMaterial({ color: 0x222222 })
        );
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.5 + Math.random() * (w / 2 - 0.5);
        hole.position.set(
          x + Math.cos(angle) * dist,
          pos.y + 0.5 + Math.random() * (wallH - 1),
          z + Math.sin(angle) * dist
        );
        // Orient toward random direction
        hole.lookAt(new THREE.Vector3(
          x + Math.cos(angle) * (dist + 1),
          pos.y + 0.5 + Math.random() * (wallH - 1),
          z + Math.sin(angle) * (dist + 1)
        ));
        this._addMesh(
          new THREE.CircleGeometry(0.015, 6),
          new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
          hole.position
        );
      }
    }
  }

  // ─── BUILD SCENE ──────────────────────────────────────────────────────────

  _build() {
    const mats = this.materials;

    // ─── GROUND ───────────────────────────────────────────────────────────
    // Segmented ground for subtle vertex displacement
    const groundGeo = new THREE.PlaneGeometry(200, 200, 128, 128);

    // Subtle vertex displacement
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      // Gentle terrain noise
      const noiseVal = (Math.sin(x * 0.05) * Math.cos(z * 0.07) * 0.02 +
                        Math.sin(x * 0.12 + z * 0.1) * 0.008);
      positions.setY(i, noiseVal);
    }
    positions.needsUpdate = true;
    groundGeo.computeVertexNormals();

    const groundMat = mats.getDirt({
      color: 0x8a7a6a,
      roughness: 0.95,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.objects.push(ground);

    // ─── ROADS ────────────────────────────────────────────────────────────
    const roadMat = mats.getAsphalt({ color: 0x666666 });
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      const road = this._addMesh(
        new THREE.PlaneGeometry(4, 38),
        roadMat,
        new THREE.Vector3(Math.cos(angle) * 12, 0.01, Math.sin(angle) * 12)
      );
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -angle;
    }

    // Road edge markings (simple white lines)
    const markingMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.8,
      metalness: 0.0
    });
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      for (let side of [-1, 1]) {
        const mark = this._addMesh(
          new THREE.PlaneGeometry(0.1, 30),
          markingMat,
          new THREE.Vector3(
            Math.cos(angle) * 12 + Math.sin(angle) * side * 1.8,
            0.015,
            Math.sin(angle) * 12 + Math.cos(angle) * side * 1.8
          )
        );
        mark.rotation.x = -Math.PI / 2;
        mark.rotation.z = -angle;
      }
    }

    // ─── CENTRAL MONUMENT ────────────────────────────────────────────────
    const monumentMat = mats.getConcrete('worn', { color: 0x8899aa });
    const monumentMetal = mats.getBareMetal(0x888899, 0.3);

    // Base — octagonal
    this._addObstacle(
      new THREE.CylinderGeometry(5, 6, 0.8, 8),
      monumentMat,
      new THREE.Vector3(0, 0.4, 0)
    );
    // Base trim ring
    this._addMesh(
      new THREE.TorusGeometry(5.2, 0.08, 6, 24),
      monumentMetal,
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );

    // Column — octagonal with fluting detail
    const columnMat = mats.getConcrete('standard', { color: 0x99aabb });
    this._addObstacle(
      new THREE.CylinderGeometry(0.8, 1.0, 5, 8),
      columnMat,
      new THREE.Vector3(0, 3.3, 0)
    );
    // Column bands (metal rings)
    for (let cy of [0.8, 5.8]) {
      this._addMesh(
        new THREE.TorusGeometry(0.85, 0.04, 4, 16),
        monumentMetal,
        new THREE.Vector3(0, cy, 0),
        new THREE.Euler(Math.PI / 2, 0, 0)
      );
    }

    // Top cap
    this._addObstacle(
      new THREE.CylinderGeometry(1.2, 0.8, 0.4, 8),
      monumentMetal,
      new THREE.Vector3(0, 5.7, 0)
    );

    // ─── BUILDINGS ────────────────────────────────────────────────────────
    // Corner buildings - office style with more windows
    this._buildDetailedBuilding(new THREE.Vector3(-14, 0, -10), 5, 3.5, 5, 'concrete');
    this._buildDetailedBuilding(new THREE.Vector3(14, 0, 10), 6, 2.5, 5, 'concrete');
    this._buildDetailedBuilding(new THREE.Vector3(-12, 0, 14), 4, 4, 4, 'damaged');
    this._buildDetailedBuilding(new THREE.Vector3(12, 0, -14), 4, 3, 4, 'bunker');

    // Small structures - bunker/guard-post style
    this._buildDetailedBuilding(new THREE.Vector3(-18, 0, -4), 2.5, 1.8, 2.5, 'bunker', false);
    this._buildDetailedBuilding(new THREE.Vector3(18, 0, 4), 2.5, 1.8, 2.5, 'concrete', false);
    this._buildDetailedBuilding(new THREE.Vector3(-4, 0, -18), 2.5, 1.8, 2.5, 'bunker', false);
    this._buildDetailedBuilding(new THREE.Vector3(4, 0, 18), 2.5, 1.8, 2.5, 'concrete', false);

    // Two-story buildings
    this._buildDetailedBuilding(new THREE.Vector3(-8, 0, -7), 3.5, 5.5, 3.5, 'damaged');
    this._buildDetailedBuilding(new THREE.Vector3(8, 0, 7), 3.5, 5.5, 3.5, 'concrete');

    // ─── WALKWAY (connecting two buildings) ──────────────────────────────
    const walkwayMat = mats.getPaintedMetalDark({ roughness: 0.7 });
    const walkway = this._addObstacle(
      new THREE.BoxGeometry(6, 0.15, 2),
      walkwayMat,
      new THREE.Vector3(0, 3, -7)
    );
    // Walkway pillars
    for (let x of [-3, 3]) {
      this._addObstacle(
        new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6),
        mats.getDarkMetal(),
        new THREE.Vector3(x, 1.6, -7)
      );
    }
    // Walkway railing
    const railMat = mats.getDarkMetal();
    for (let side of [-1, 1]) {
      this._addMesh(
        new THREE.BoxGeometry(5.5, 0.03, 0.03),
        railMat,
        new THREE.Vector3(0, 3.5, -7 + side * 0.9)
      );
      // Vertical rail posts
      for (let rx = -2.5; rx <= 2.5; rx += 1.5) {
        this._addMesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4),
          railMat,
          new THREE.Vector3(rx, 3.25, -7 + side * 0.9)
        );
      }
    }

    // ─── STAIRS ──────────────────────────────────────────────────────────
    const stairMat = mats.getConcrete('standard', { color: 0x779988 });
    for (let i = 0; i < 5; i++) {
      this._addMesh(
        new THREE.BoxGeometry(1.2, 0.1, 0.3),
        stairMat,
        new THREE.Vector3(1.2, i * 0.15 + 0.05, 2 + i * 0.3)
      );
    }

    // ─── BARRIERS ────────────────────────────────────────────────────────
    const barrierMat = mats.getConcrete('anti_slip', { color: 0x889999 });
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
      const b = this._addObstacle(
        new THREE.BoxGeometry(w, h, 0.3),
        barrierMat,
        new THREE.Vector3(pos[0], h / 2, pos[1])
      );
      b.rotation.y = rot;
    }

    // ─── JERSEY BARRIERS (concrete road barriers) ────────────────────────
    const jerseyMat = mats.getConcrete('anti_slip', { color: 0x778888 });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const dist = 14;
      this._addObstacle(
        new THREE.BoxGeometry(1.8, 0.8, 0.4),
        jerseyMat,
        new THREE.Vector3(Math.cos(angle) * dist, 0.4, Math.sin(angle) * dist),
        new THREE.Euler(0, angle, 0)
      );
    }

    // ─── SANDBAGS ────────────────────────────────────────────────────────
    const sandbagMat = mats.getSandbag();
    const sandbagPositions = [
      [-11, -6], [11, 6], [-6, 11], [6, -11],
      [-13, 3], [13, -3], [3, 13], [-3, -13]
    ];
    for (const pos of sandbagPositions) {
      const sx = pos[0], sz = pos[1] || 0;
      for (let layer = 0; layer < 2; layer++) {
        this._addObstacle(
          new THREE.BoxGeometry(0.8, 0.25, 0.4),
          sandbagMat,
          new THREE.Vector3(sx + (layer === 1 ? 0.15 : 0), 0.15 + layer * 0.2, sz)
        );
        if (layer === 0) {
          this._addObstacle(
            new THREE.BoxGeometry(0.8, 0.25, 0.4),
            sandbagMat,
            new THREE.Vector3(sx - 0.15, 0.35, sz)
          );
        }
      }
    }

    // ─── ADDITIONAL SANDBAG WALLS ────────────────────────────────────────
    // More extensive sandbag positions for added cover
    const extraSandbags = [[-15, -8], [15, 8], [-8, 15], [8, -15]];
    for (const pos of extraSandbags) {
      for (let i = 0; i < 3; i++) {
        this._addObstacle(
          new THREE.BoxGeometry(0.8, 0.25, 0.4),
          sandbagMat,
          new THREE.Vector3(pos[0] + i * 0.5, 0.15, pos[1])
        );
        this._addObstacle(
          new THREE.BoxGeometry(0.8, 0.25, 0.4),
          sandbagMat,
          new THREE.Vector3(pos[0] + i * 0.5, 0.35, pos[1])
        );
      }
    }

    // ─── HESCO BARRIERS ──────────────────────────────────────────────────
    const hescoMat = mats.getSandbag({ color: 0x8a7a6a });
    const hescoPositions = [
      [-17, 0, -12], [17, 0, 12], [-17, 0, 12], [17, 0, -12],
      [-20, 0, 0], [20, 0, 0], [0, 0, -20], [0, 0, 20]
    ];
    for (const pos of hescoPositions) {
      this._addObstacle(
        new THREE.BoxGeometry(1, 1.2, 1),
        hescoMat,
        new THREE.Vector3(pos[0], 0.6, pos[2])
      );
    }

    // ─── CRATES ──────────────────────────────────────────────────────────
    const crateMat = mats.getWood({ color: 0x8B7355 });
    const crateMatDark = mats.getWood({ color: 0x6a5a3a });
    const cratePositions = [
      [-9, 0.3, -13], [-8, 0.6, -12.5], [-7.5, 0.45, -13.5],
      [9, 0.3, 12], [8.5, 0.6, 13], [7.5, 0.45, 12.5],
      [-4, 0.25, -15], [4, 0.25, 15],
      [0, 0.3, -12], [0, 0.3, 12]
    ];
    for (const pos of cratePositions) {
      const useMat = Math.random() > 0.5 ? crateMat : crateMatDark;
      const h = pos[1] * 2;
      this._addObstacle(
        new THREE.BoxGeometry(0.6, h, 0.6),
        useMat,
        new THREE.Vector3(pos[0], h / 2, pos[2])
      );
    }

    // ─── BARRELS ─────────────────────────────────────────────────────────
    const barrelMat = mats.getPaintedMetal(0x663333, { roughness: 0.5 });
    const barrelMatBlue = mats.getPaintedMetal(0x334466, { roughness: 0.5 });
    const barrelPositions = [
      [-12, -2], [12, 2], [-2, 12], [2, -12],
      [-15, 5], [15, -5]
    ];
    for (const pos of barrelPositions) {
      const useMat = Math.random() > 0.5 ? barrelMat : barrelMatBlue;
      this._addObstacle(
        new THREE.CylinderGeometry(0.2, 0.22, 0.4, 10),
        useMat,
        new THREE.Vector3(pos[0], 0.2, pos[1])
      );
    }

    // ─── WATER BARRELS (blue plastic) ────────────────────────────────────
    const waterMat = mats.getPlastic({ color: 0x224466, roughness: 0.4 });
    const waterPositions = [[-16, -5], [16, 5], [-5, 16], [5, -16]];
    for (const pos of waterPositions) {
      this._addObstacle(
        new THREE.CylinderGeometry(0.22, 0.2, 0.5, 10),
        waterMat,
        new THREE.Vector3(pos[0], 0.25, pos[1])
      );
    }

    // ─── JERRY CANS ──────────────────────────────────────────────────────
    const jerryMat = mats.getPaintedMetal(0x445533, { roughness: 0.6 });
    const jerryPositions = [[-17, -3], [17, 3], [-3, 17], [3, -17]];
    for (const pos of jerryPositions) {
      this._addObstacle(
        new THREE.BoxGeometry(0.15, 0.25, 0.1),
        jerryMat,
        new THREE.Vector3(pos[0], 0.125, pos[1])
      );
    }

    // ─── LAMP POSTS ──────────────────────────────────────────────────────
    const postMat = mats.getDarkMetal();
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffaa44,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.1
    });

    const lampPositions = [
      [-18, -18], [18, -18], [-18, 18], [18, 18],
      [-10, -18], [10, -18], [-10, 18], [10, 18],
      [-18, -10], [18, -10], [-18, 10], [18, 10],
      [0, -19], [0, 19], [-19, 0], [19, 0]
    ];
    for (const pos of lampPositions) {
      this._addMesh(
        new THREE.CylinderGeometry(0.06, 0.08, 3, 6),
        postMat,
        new THREE.Vector3(pos[0], 1.5, pos[1])
      );
      this._addMesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        lampMat,
        new THREE.Vector3(pos[0], 3.15, pos[1])
      );
    }

    // ─── FLOODLIGHTS ─────────────────────────────────────────────────────
    const floodlightMat = mats.getPaintedMetalDark({ roughness: 0.5 });
    const floodPositions = [[-19, -19], [19, 19], [-19, 19], [19, -19]];
    for (const pos of floodPositions) {
      this._addMesh(
        new THREE.CylinderGeometry(0.05, 0.06, 4, 6),
        postMat,
        new THREE.Vector3(pos[0], 2, pos[1])
      );
      // Light housing
      this._addMesh(
        new THREE.BoxGeometry(0.15, 0.1, 0.2),
        floodlightMat,
        new THREE.Vector3(pos[0], 4.1, pos[1])
      );
    }

    // ─── DEBRIS ──────────────────────────────────────────────────────────
    const debrisMat = mats.getConcrete('dark', { color: 0x667766 });
    const debrisMat2 = mats.getConcrete('standard', { color: 0x887766 });
    for (let i = 0; i < 120; i++) {
      const size = 0.03 + Math.random() * 0.1;
      const useMat = Math.random() > 0.5 ? debrisMat : debrisMat2;
      const d = this._addMesh(
        new THREE.BoxGeometry(size, size * 0.5, size),
        useMat,
        new THREE.Vector3(
          (Math.random() - 0.5) * 36,
          size * 0.25,
          (Math.random() - 0.5) * 36
        )
      );
      d.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    }

    // ─── SMALL ROCKS ─────────────────────────────────────────────────────
    const rockMat = mats.getConcrete('dark', { color: 0x555555 });
    for (let i = 0; i < 40; i++) {
      const r = this._addMesh(
        new THREE.SphereGeometry(0.03 + Math.random() * 0.06, 5, 4),
        rockMat,
        new THREE.Vector3(
          (Math.random() - 0.5) * 35,
          0.01,
          (Math.random() - 0.5) * 35
        )
      );
      r.scale.y = 0.3 + Math.random() * 0.4;
    }

    // ─── VEHICLES ────────────────────────────────────────────────────────
    this._buildVehicle(new THREE.Vector3(-15, 0, 6), -Math.PI / 4, false);
    this._buildVehicle(new THREE.Vector3(14, 0, -5), Math.PI / 3, true);

    // ─── SIGN POSTS ──────────────────────────────────────────────────────
    const signMat = mats.getPaintedMetalDark({ roughness: 0.6 });
    const signPositions = [[-19, 0], [19, 0], [0, -19], [0, 19]];
    for (const pos of signPositions) {
      // Post
      this._addMesh(
        new THREE.CylinderGeometry(0.03, 0.035, 1.5, 6),
        postMat,
        new THREE.Vector3(pos[0], 0.75, pos[1])
      );
      // Sign board
      this._addMesh(
        new THREE.BoxGeometry(0.4, 0.3, 0.02),
        signMat,
        new THREE.Vector3(pos[0], 1.3, pos[1])
      );
    }

    // ─── ANTENNA ON ROOFTOP ─────────────────────────────────────────────
    const antennaMat = mats.getDarkMetal();
    const antennaPos = new THREE.Vector3(8, 5.7, 7);
    this._addMesh(
      new THREE.CylinderGeometry(0.01, 0.015, 0.8, 4),
      antennaMat,
      antennaPos.clone().add(new THREE.Vector3(0, 0.4, 0))
    );
    // Crossbars
    for (let side of [-1, 1]) {
      this._addMesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4),
        antennaMat,
        antennaPos.clone().add(new THREE.Vector3(side * 0.15, 0.6, 0)),
        new THREE.Euler(Math.PI / 2, 0, 0)
      );
    }
  }

  _buildVehicle(pos, rotation, isBurning = false) {
    const mats = this.materials;
    const carBodyMat = mats.getPaintedMetal(0x554433, { roughness: 0.7 });
    const carDarkMat = mats.getDarkMetal();
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x334466,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.5
    });
    const tireMat = mats.getPlastic({ color: 0x222222, roughness: 0.9 });

    // Vehicle body
    const body = this._addObstacle(
      new THREE.BoxGeometry(1.5, 0.4, 0.8),
      carBodyMat,
      new THREE.Vector3(pos.x, pos.y + 0.3, pos.z)
    );
    body.rotation.y = rotation;

    // Cabin
    const cabin = this._addObstacle(
      new THREE.BoxGeometry(0.8, 0.3, 0.6),
      carDarkMat,
      new THREE.Vector3(pos.x, pos.y + 0.6, pos.z)
    );
    cabin.rotation.y = rotation;

    // Windshield
    const windshield = this._addMesh(
      new THREE.BoxGeometry(0.7, 0.2, 0.02),
      glassMat,
      new THREE.Vector3(pos.x + Math.sin(rotation) * 0.35, pos.y + 0.55, pos.z + Math.cos(rotation) * 0.35)
    );
    windshield.rotation.y = rotation;

    // Wheels
    for (let wx of [-0.5, 0.5]) {
      for (let wz of [-0.35, 0.35]) {
        // Rotate wheel position by vehicle rotation
        const rwx = pos.x + wx * Math.cos(rotation) - wz * Math.sin(rotation);
        const rwz = pos.z + wx * Math.sin(rotation) + wz * Math.cos(rotation);
        this._addObstacle(
          new THREE.CylinderGeometry(0.12, 0.12, 0.05, 8),
          tireMat,
          new THREE.Vector3(rwx, pos.y + 0.12, rwz),
          new THREE.Euler(Math.PI / 2, 0, rotation)
        );
      }
    }

    // Burning vehicle effects
    if (isBurning) {
      // Orange glow under hood
      const fireMat = new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff2200,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.3
      });
      this._addMesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        fireMat,
        new THREE.Vector3(pos.x, pos.y + 0.4, pos.z)
      );

      // Smoke particles handled by EffectsManager at runtime
    }
  }
}
