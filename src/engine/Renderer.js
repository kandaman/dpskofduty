import * as THREE from 'three';

export class Renderer {
  constructor(game) {
    this.game = game;
    this._quality = 'ULTRA'; // default highest quality

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });

    // Pixel ratio: cap at 2 for performance (set to 1 for MEDIUM)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Shadow configuration
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping — ACES Filmic for filmic contrast curve.
    // 1.0 (not 1.5): with the 4.0-intensity sun + HDRI IBL, 1.5 blew out
    // the ground and sky to white (washed-out scene).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Color space (default in r152+, explicit for safety)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Modern lighting model — physically correct falloff
    this.renderer.useLegacyLights = false;

    // Shadow bias correction for the renderer level
    this.renderer.shadowMap.bias = 0;

    document.body.prepend(this.renderer.domElement);

    this.resizeHandler = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      if (this.game.camera) {
        this.game.camera.camera.aspect = w / h;
        this.game.camera.camera.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Set quality level — adjusts pixel ratio, tone mapping, and shadow settings.
   * @param {'ULTRA'|'HIGH'|'MEDIUM'} level
   */
  setQuality(level) {
    this._quality = level;
    switch (level) {
      case 'ULTRA':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMappingExposure = 1.0;
        break;
      case 'HIGH':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.toneMappingExposure = 1.0;
        break;
      case 'MEDIUM':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
        this.renderer.toneMappingExposure = 0.9;
        break;
    }
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resizeHandler);
    this.renderer.dispose();
  }
}
