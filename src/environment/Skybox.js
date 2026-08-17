import * as THREE from 'three';

export class Skybox {
  constructor(scene) {
    this.scene = scene;
    this._build();
  }

  _build() {
    // --- Gradient sky dome ---
    const vertShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDir = normalize(vWorldPosition);
        float gradient = max(0.0, viewDir.y);

        // Sky gradient
        vec3 sky = mix(bottomColor, topColor, gradient);

        // Sun disk
        float sunAngle = dot(viewDir, normalize(sunDirection));
        float sunDisk = smoothstep(0.9995, 1.0, sunAngle);
        sky += sunColor * sunDisk * 0.5;

        // Sun glow
        float sunGlow = pow(max(0.0, sunAngle), 64.0);
        sky += sunColor * sunGlow * 0.15;

        // Horizon haze
        float horizonGlow = pow(1.0 - abs(viewDir.y), 8.0);
        sky += vec3(0.8, 0.6, 0.3) * horizonGlow * 0.1;

        gl_FragColor = vec4(sky, 1.0);
      }
    `;

    const skyGeo = new THREE.SphereGeometry(800, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0a0a1a) },
        bottomColor: { value: new THREE.Color(0x1a1a2e) },
        sunColor: { value: new THREE.Color(0xff8844) },
        sunDirection: { value: new THREE.Vector3(0.3, 0.6, 0.5).normalize() }
      },
      vertexShader: vertShader,
      fragmentShader: fragShader,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.name = 'skybox';
    this.scene.add(this.sky);

    // --- Stars ---
    this._createStars();

    // --- Distant fog particles (moonlight scattering) ---
    this._createAtmosphericHaze();
  }

  _createStars() {
    const starCount = 3000;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      // Random points on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 750 + Math.random() * 50;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      sizes[i] = 0.5 + Math.random() * 1.5;

      const brightness = 0.3 + Math.random() * 0.7;
      const temp = Math.random();
      if (temp > 0.95) {
        // Blue star
        colors[i * 3] = brightness * 0.6;
        colors[i * 3 + 1] = brightness * 0.7;
        colors[i * 3 + 2] = brightness;
      } else if (temp > 0.85) {
        // Orange star
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness * 0.6;
        colors[i * 3 + 2] = brightness * 0.3;
      } else {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      }
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.name = 'stars';
    this.scene.add(this.stars);
  }

  _createAtmosphericHaze() {
    const hazeCount = 500;
    const positions = new Float32Array(hazeCount * 3);

    for (let i = 0; i < hazeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 300;
      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = 10 + Math.random() * 80;
      positions[i * 3 + 2] = Math.sin(angle) * dist;
    }

    const hazeGeo = new THREE.BufferGeometry();
    hazeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const hazeMat = new THREE.PointsMaterial({
      size: 15,
      color: 0x444466,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    this.haze = new THREE.Points(hazeGeo, hazeMat);
    this.haze.name = 'atmospheric_haze';
    this.scene.add(this.haze);
  }

  update(dt) {
    // Slow rotation for atmosphere
    if (this.haze) {
      this.haze.rotation.y += dt * 0.002;
    }
  }
}
