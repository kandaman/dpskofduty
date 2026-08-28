import * as THREE from 'three';

/**
 * Lighting — physically coherent military lighting setup.
 *
 * Establishes a strong primary light source (late afternoon sun) with
 * realistic color temperature, shadow configuration, and minimal flat
 * ambient fill. Designed to work with PBR materials and environment maps.
 *
 * Scene was changed from night/purple to late-afternoon desert theater
 * lighting for better material response and more realistic appearance.
 */
export class Lighting {
  constructor(scene) {
    this.scene = scene;
    this.mainLight = null;
    this._setup();
  }

  _setup() {
    // --- Scene background (matches skybox horizon for seamless transition) ---
    this.scene.background = new THREE.Color(0x87aeba);

    // --- Ambient light (skylight bounce) ---
    const ambient = new THREE.AmbientLight(0x8899bb, 0.4);
    this.scene.add(ambient);

    // --- Hemisphere light (daylight sky / earth bounce) ---
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.8);
    this.scene.add(hemi);

    // --- Main directional light (mid-afternoon sun, from slightly in front) ---
    // Elevation ~45°, azimuth from front-left — delivers sunlight on building faces
    // visible from the player's starting position
    const mainLight = new THREE.DirectionalLight(0xffd4a0, 4.0);
    mainLight.position.set(20, 35, 30);  // ~45° elevation, front-left
    mainLight.castShadow = true;

    // Shadow map: 4096 for ULTRA quality, better contact shadows
    mainLight.shadow.mapSize.width = 4096;
    mainLight.shadow.mapSize.height = 4096;
    mainLight.shadow.camera.near = 0.1;
    mainLight.shadow.camera.far = 80;
    mainLight.shadow.camera.left = -40;
    mainLight.shadow.camera.right = 40;
    mainLight.shadow.camera.top = 40;
    mainLight.shadow.camera.bottom = -40;

    // Improved shadow bias for PCFSoft — reduces both acne and peter-panning
    mainLight.shadow.bias = -0.0005;
    mainLight.shadow.normalBias = 0.02;

    // Shadow radius for softer, more realistic edges
    mainLight.shadow.radius = 4;

    // Use PCFSoft for modern shadow quality
    this.scene.add(mainLight);
    this.mainLight = mainLight;

    // --- Shadow camera helper (disabled in production, useful for debugging) ---
    // const helper = new THREE.CameraHelper(mainLight.shadow.camera);
    // this.scene.add(helper);

    // --- Fill light (cool, from opposite side) ---
    const fill = new THREE.DirectionalLight(0x8899cc, 0.25);
    fill.position.set(20, 15, -25);
    this.scene.add(fill);

    // --- Ambient point lights at lamp posts (warm, for atmosphere) ---
    const pointPositions = [
      [-15, 3, -15], [15, 3, -15], [-15, 3, 15], [15, 3, 15],
      [0, 3, -18], [0, 3, 18], [-18, 3, 0], [18, 3, 0]
    ];
    for (const pos of pointPositions) {
      const light = new THREE.PointLight(0xffaa44, 0.6, 20);
      light.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(light);
    }

    // --- Atmospheric fog (haze color matching sky horizon) ---
    this.scene.fog = new THREE.FogExp2(0x8a9ba8, 0.003);
  }

  /**
   * Get the main directional light (for shadow adjustments, sky alignment, etc.)
   */
  getMainLight() {
    return this.mainLight;
  }
}
