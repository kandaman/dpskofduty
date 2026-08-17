import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import * as THREE from 'three';

export class PostPipeline {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);

    // --- Render pass ---
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // --- Bloom pass (AAA glow effect) ---
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4,   // strength
      0.5,   // radius
      0.1    // threshold
    );
    this.composer.addPass(this.bloomPass);

    // --- Vignette (darkens edges) ---
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 0.5;
    vignettePass.uniforms['darkness'].value = 0.6;
    this.composer.addPass(vignettePass);

    // --- Color correction / LUT ---
    const colorCorrectionUniforms = {
      brightness: { value: 0.05 },
      contrast: { value: 1.1 },
      saturation: { value: 1.05 },
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

    // --- Output pass (mandatory for correct tone mapping in r185+) ---
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    // Resize handler
    this._onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.composer.setSize(w, h);
      smaaPass.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  setBloomStrength(strength) {
    this.bloomPass.strength = strength;
  }

  render(delta) {
    this.composer.render(delta);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose();
  }
}
