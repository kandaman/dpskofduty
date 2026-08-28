import * as THREE from 'three';

/**
 * Skybox — procedural daytime atmosphere with Rayleigh scattering.
 *
 * Produces a realistic sky gradient with sun disk, atmospheric glow,
 * and horizon haze that matches the scene fog for seamless distance fade.
 * The sky color palette is a desert/war-theater late afternoon.
 */
export class Skybox {
  constructor(scene) {
    this.scene = scene;
    this._build();
  }

  _build() {
    // ─── PROCEDURAL ATMOSPHERE (Rayleigh-like scattering) ──────────────
    const vertShader = `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform vec3 horizonColor;
      uniform vec3 fogColor;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDir = normalize(vWorldPosition);
        float heightFactor = max(0.0, viewDir.y);

        // Sky gradient base
        vec3 sky = mix(bottomColor, topColor, heightFactor);

        // Add atmospheric scattering (blue at zenith, warm at horizon)
        vec3 rayleigh = vec3(0.5, 0.7, 0.9);
        float scattering = 1.0 - heightFactor;
        sky = mix(sky, rayleigh, scattering * 0.15);

        // Sun direction
        vec3 sunDir = normalize(sunDirection);
        float sunAngle = dot(viewDir, sunDir);

        // Sun glow (large warm halo)
        float sunGlow = pow(max(0.0, sunAngle), 16.0);
        sky += sunColor * sunGlow * 0.5;

        // Sun disk
        float sunDisk = smoothstep(0.998, 1.0, sunAngle);
        sky += vec3(1.0, 0.95, 0.8) * sunDisk * 3.0;

        // Horizon haze band
        float horizonBand = pow(1.0 - heightFactor, 5.0);
        sky = mix(sky, horizonColor, horizonBand * 0.5);

        gl_FragColor = vec4(sky, 1.0);
      }
    `;

    // Late afternoon military theater palette — warm, dusty
    const topColor = new THREE.Color(0x2a6ea5);      // deep blue
    const bottomColor = new THREE.Color(0xc8b898);   // warm dust near horizon
    const sunColor = new THREE.Color(0xffc888);       // warm sun
    const horizonColor = new THREE.Color(0xc8b898);  // dust haze
    const fogColor = new THREE.Color(0x8a9ba8);      // matches scene fog

    const sunDir = new THREE.Vector3(-0.3, 0.5, 0.7).normalize(); // ~30° elevation

    const skyGeo = new THREE.SphereGeometry(800, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
        sunColor: { value: sunColor },
        sunDirection: { value: sunDir },
        horizonColor: { value: horizonColor },
        fogColor: { value: fogColor }
      },
      vertexShader: vertShader,
      fragmentShader: fragShader,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.name = 'skybox';
    this.scene.add(this.sky);

    // ─── CLOUDS (thin, wispy) ──────────────────────────────────────────
    this._createClouds();

    // ─── DISTANT HAZE ──────────────────────────────────────────────────
    this._createHaze();
  }

  _createClouds() {
    // Thin cloud layer using semi-transparent sprites
    const cloudTexture = this._generateCloudTexture();

    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xeeeedd
    });

    this.clouds = [];
    const cloudCount = 60;
    for (let i = 0; i < cloudCount; i++) {
      const sprite = new THREE.Sprite(cloudMat.clone());

      // Distribute clouds in a ring at height ~60-80
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 200;
      const height = 50 + Math.random() * 50;
      sprite.position.set(
        Math.cos(angle) * dist,
        height,
        Math.sin(angle) * dist
      );

      const size = 30 + Math.random() * 80;
      sprite.scale.set(size, size * 0.4, 1);
      sprite.material.opacity = 0.05 + Math.random() * 0.15;

      this.clouds.push(sprite);
      this.scene.add(sprite);
    }
  }

  _generateCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Soft cloud blob
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  _createHaze() {
    // Subtle atmospheric haze particles
    const hazeCount = 200;
    const positions = new Float32Array(hazeCount * 3);
    const sizes = new Float32Array(hazeCount);

    for (let i = 0; i < hazeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 400;
      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = 5 + Math.random() * 40;
      positions[i * 3 + 2] = Math.sin(angle) * dist;
      sizes[i] = 10 + Math.random() * 20;
    }

    const hazeGeo = new THREE.BufferGeometry();
    hazeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    hazeGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const hazeMat = new THREE.PointsMaterial({
      size: 15,
      color: 0xc8b898,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    this.haze = new THREE.Points(hazeGeo, hazeMat);
    this.haze.name = 'atmospheric_haze';
    this.scene.add(this.haze);
  }

  update(dt) {
    // Slow cloud drift and haze rotation
    if (this.clouds) {
      for (const cloud of this.clouds) {
        cloud.position.x += dt * 0.3;
        if (cloud.position.x > 300) cloud.position.x = -300;
      }
    }
    if (this.haze) {
      this.haze.rotation.y += dt * 0.001;
    }
  }
}
