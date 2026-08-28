import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import * as THREE from 'three';

export class PostPipeline {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.scene = scene;
    this.camera = camera;

    // Track enabled passes for quality control
    this.passes = {};

    // --- Render pass ---
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // --- GTAO (Ground Truth Ambient Occlusion) ---
    // Provides subtle contact shadows around geometry intersections
    const gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtaoPass.output = GTAOPass.OUTPUT.Default; // blend AO with scene
    gtaoPass.blendIntensity = 1.0;
    gtaoPass.updateGtaoMaterial({
      radius: 0.25,        // small radius for local contact shadows
      distanceExponent: 0.5, // short influence distance
      thickness: 0.5,        // occlusion thickness
      distanceFallOff: 1.0,
      scale: 1.0
    });
    this.composer.addPass(gtaoPass);
    this.passes.gtao = gtaoPass;

    // --- Bloom pass (subtle, for sun highlights and emissive surfaces) ---
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.15,  // strength — reduced from 0.4 for realism
      0.3,   // radius — tighter glow
      0.3    // threshold — only bright areas bloom
    );
    this.composer.addPass(this.bloomPass);
    this.passes.bloom = this.bloomPass;

    // --- Vignette (very subtle edge darkening) ---
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 0.4;
    vignettePass.uniforms['darkness'].value = 0.25;
    this.composer.addPass(vignettePass);

    // --- Color correction (military palette: slightly desaturated, warm highlights, cool shadows) ---
    const colorCorrectionUniforms = {
      brightness: { value: 0.0 },
      contrast: { value: 1.1 },
      saturation: { value: 0.9 }, // slight desaturation for military look
      hue: { value: 0.0 }
    };
    const colorPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        brightness: colorCorrectionUniforms.brightness,
        contrast: colorCorrectionUniforms.contrast,
        saturation: colorCorrectionUniforms.saturation
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        varying vec2 vUv;

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);

          // Contrast
          color.rgb = (color.rgb - 0.5) * contrast + 0.5;

          // Brightness
          color.rgb += brightness;

          // Saturation
          float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          color.rgb = mix(vec3(gray), color.rgb, saturation);

          gl_FragColor = color;
        }
      `
    });
    this.composer.addPass(colorPass);

    // --- SMAA (anti-aliasing) ---
    const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(smaaPass);
    this.passes.smaa = smaaPass;

    // --- Output pass (mandatory for correct tone mapping in r185+) ---
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // Resize handler
    this._onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.composer.setSize(w, h);
      smaaPass.setSize(w, h);
      if (gtaoPass.setSize) gtaoPass.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  setBloomStrength(strength) {
    if (this.bloomPass) {
      this.bloomPass.strength = strength;
    }
  }

  /**
   * Set quality level — enables/disables expensive passes.
   * @param {'ULTRA'|'HIGH'|'MEDIUM'} level
   */
  setQuality(level) {
    switch (level) {
      case 'ULTRA':
        this.passes.gtao.enabled = true;
        this.bloomPass.strength = 0.15;
        break;
      case 'HIGH':
        this.passes.gtao.enabled = true;
        this.bloomPass.strength = 0.12;
        break;
      case 'MEDIUM':
        this.passes.gtao.enabled = false;
        this.bloomPass.strength = 0.1;
        break;
    }
  }

  render(delta) {
    this.composer.render(delta);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose();
  }
}
