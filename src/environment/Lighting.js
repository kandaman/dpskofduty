import * as THREE from 'three';

export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this._setup();
  }

  _setup() {
    // --- Ambient light (moonlight / skylight) ---
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    // --- Hemisphere light ---
    const hemi = new THREE.HemisphereLight(0x8888cc, 0x444422, 0.6);
    this.scene.add(hemi);

    // --- Main directional light (simulating moon/sun) ---
    const mainLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    mainLight.position.set(30, 40, 20);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 80;
    mainLight.shadow.camera.left = -40;
    mainLight.shadow.camera.right = 40;
    mainLight.shadow.camera.top = 40;
    mainLight.shadow.camera.bottom = -40;
    mainLight.shadow.bias = -0.001;
    this.scene.add(mainLight);

    // --- Fill light ---
    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);

    // --- Rim light ---
    const rim = new THREE.DirectionalLight(0xff8844, 0.2);
    rim.position.set(-10, 20, 30);
    this.scene.add(rim);

    // --- Ambient point lights at posts ---
    const pointPositions = [
      [-15, 3, -15], [15, 3, -15], [-15, 3, 15], [15, 3, 15],
      [0, 3, -18], [0, 3, 18], [-18, 3, 0], [18, 3, 0]
    ];
    for (const pos of pointPositions) {
      const light = new THREE.PointLight(0xffaa44, 0.3, 15);
      light.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(light);
    }

    // --- Fog ---
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);
  }
}
