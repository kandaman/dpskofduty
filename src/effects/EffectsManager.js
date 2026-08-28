import * as THREE from 'three';
import { BulletTracer } from './BulletTracer.js';
import {
  generateMuzzleFlashTexture,
  generateBulletHoleTexture,
  generateBloodSplatTexture
} from '../engine/TextureGenerator.js';

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.tracers = new BulletTracer(scene);

    // Particle pools
    this.sparks = [];
    this.bloodParticles = [];
    this.smokeParticles = [];
    this.impactDecals = [];
    this.bulletHoles = [];
    this.wallCracks = [];

    // Pre-generate decal textures
    this._bulletHoleTex = generateBulletHoleTexture();
    this._bloodSplatTex = generateBloodSplatTexture();

    // Create shared materials
    this.sparkMat = new THREE.MeshStandardMaterial({
      color: 0xffaa44,
      emissive: 0xff6600,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.1
    });

    this.bloodMat = new THREE.MeshStandardMaterial({
      color: 0x880000,
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.7
    });

    this.smokeMat = new THREE.SpriteMaterial({
      map: this._generateSmokeTexture(),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xaaaaaa
    });

    this.decalMat = new THREE.MeshBasicMaterial({
      map: this._bulletHoleTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.6
    });

    this._smokeLifetime = 0.5;
  }

  _generateSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(180,180,180,1)');
    gradient.addColorStop(0.3, 'rgba(150,150,150,0.5)');
    gradient.addColorStop(0.7, 'rgba(120,120,120,0.15)');
    gradient.addColorStop(1, 'rgba(100,100,100,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  bulletImpact(point, normal) {
    // --- Bullet hole decal on surface ---
    if (normal) {
      const decal = new THREE.Mesh(
        new THREE.CircleGeometry(0.015 + Math.random() * 0.015, 8),
        this.decalMat.clone()
      );
      decal.position.copy(point);
      // Orient to surface normal
      decal.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal.clone().normalize()
      );
      this.scene.add(decal);
      this.bulletHoles.push({
        mesh: decal,
        life: 30 + Math.random() * 30,
        age: 0
      });
    }

    // --- Spark particles (keep as geometry for physical spark effect) ---
    const sparkCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sparkCount; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.008 + Math.random() * 0.008, 4, 4),
        this.sparkMat
      );
      spark.position.copy(point);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 0.5 + 0.3,
        (Math.random() - 0.5) * 2
      );
      if (normal) {
        dir.add(normal.clone().multiplyScalar(2));
      }
      dir.normalize().multiplyScalar(1 + Math.random() * 2);

      this.scene.add(spark);
      this.sparks.push({
        mesh: spark,
        velocity: dir,
        life: 0.3 + Math.random() * 0.3,
        age: 0,
        initialScale: 0.5 + Math.random() * 0.5
      });
    }

    // --- Smoke puff (sprite) ---
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0x999999,
        transparent: true,
        opacity: 0.15
      })
    );
    smoke.position.copy(point);
    this.scene.add(smoke);
    this.smokeParticles.push({
      mesh: smoke,
      velocity: new THREE.Vector3(0, 0.3, 0),
      life: this._smokeLifetime,
      age: 0,
      maxScale: 0.4
    });
  }

  bloodSplat(point, direction) {
    // --- Blood particles (sprites for better visual) ---
    const bloodCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < bloodCount; i++) {
      // Use sprite with splat texture
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._bloodSplatTex,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        color: 0xaa0000
      }));

      sprite.position.copy(point);
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2.5
      );
      if (direction) {
        spread.add(direction.clone().multiplyScalar(1.5));
      }

      const size = 0.04 + Math.random() * 0.06;
      sprite.scale.set(size, size, 1);

      this.scene.add(sprite);
      this.bloodParticles.push({
        mesh: sprite,
        velocity: spread,
        life: 0.8 + Math.random() * 0.5,
        age: 0,
        gravity: -3
      });
    }

    // --- Blood pool decal on ground ---
    this._createBloodDecal(point);
  }

  _createBloodDecal(point) {
    const decalSize = 0.08 + Math.random() * 0.12;
    const bloodDecalMat = new THREE.MeshBasicMaterial({
      map: this._bloodSplatTex,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      color: 0x440000
    });
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(decalSize, 8),
      bloodDecalMat
    );
    decal.position.copy(point);
    decal.position.y = 0.01;
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.random() * Math.PI;
    this.scene.add(decal);
    this.impactDecals.push({
      mesh: decal,
      life: 10,
      age: 0
    });
  }

  muzzleFlash(point, direction) {
    // Quick flash sprite at muzzle
    const flash = new THREE.PointLight(0xffaa33, 5, 5);
    flash.position.copy(point);
    this.scene.add(flash);
    setTimeout(() => {
      this.scene.remove(flash);
    }, 40);
  }

  addEnvironmentSmoke(position, intensity = 1) {
    // For burning vehicles, etc.
    const smoke = new THREE.Sprite(this.smokeMat.clone());
    smoke.position.copy(position);
    smoke.position.y += 0.5;
    smoke.scale.set(0.3, 0.3, 1);
    smoke.material.opacity = 0.1 * intensity;
    this.scene.add(smoke);
    this.smokeParticles.push({
      mesh: smoke,
      velocity: new THREE.Vector3(0, 0.5, 0),
      life: 2 + Math.random(),
      age: 0,
      maxScale: 0.8 * intensity
    });
  }

  update(dt) {
    // Update tracers
    this.tracers.update(dt);

    // Update sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.age += dt;
      s.velocity.y -= 9.8 * dt;
      s.mesh.position.add(s.velocity.clone().multiplyScalar(dt));
      const scale = s.initialScale * (1 - s.age / s.life);
      s.mesh.scale.setScalar(Math.max(0, scale));

      if (s.age >= s.life) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }

    // Update blood
    for (let i = this.bloodParticles.length - 1; i >= 0; i--) {
      const b = this.bloodParticles[i];
      b.age += dt;
      b.velocity.y += b.gravity * dt;
      b.mesh.position.add(b.velocity.clone().multiplyScalar(dt));
      b.mesh.material.opacity = 0.6 * (1 - b.age / b.life);

      if (b.age >= b.life) {
        this.scene.remove(b.mesh);
        this.bloodParticles.splice(i, 1);
      }
    }

    // Update smoke
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const s = this.smokeParticles[i];
      s.age += dt;
      if (s.mesh.position) {
        s.mesh.position.add(s.velocity.clone().multiplyScalar(dt));
      }
      const scale = (s.age / s.life) * s.maxScale;
      s.mesh.scale.setScalar(scale);
      if (s.mesh.material) {
        s.mesh.material.opacity = 0.3 * (1 - s.age / s.life);
      }

      if (s.age >= s.life) {
        this.scene.remove(s.mesh);
        this.smokeParticles.splice(i, 1);
      }
    }

    // Update impact decals
    for (let i = this.impactDecals.length - 1; i >= 0; i--) {
      const d = this.impactDecals[i];
      d.age += dt;
      d.mesh.material.opacity = 0.4 * (1 - d.age / d.life);

      if (d.age >= d.life) {
        this.scene.remove(d.mesh);
        this.impactDecals.splice(i, 1);
      }
    }

    // Update bullet holes
    for (let i = this.bulletHoles.length - 1; i >= 0; i--) {
      const h = this.bulletHoles[i];
      h.age += dt;
      h.mesh.material.opacity = 0.6 * (1 - h.age / h.life);

      if (h.age >= h.life) {
        this.scene.remove(h.mesh);
        this.bulletHoles.splice(i, 1);
      }
    }
  }

  reset() {
    this.tracers.reset();
    for (const arr of [this.sparks, this.bloodParticles, this.smokeParticles,
                       this.impactDecals, this.bulletHoles, this.wallCracks]) {
      for (const item of arr) {
        this.scene.remove(item.mesh);
      }
    }
    this.sparks = [];
    this.bloodParticles = [];
    this.smokeParticles = [];
    this.impactDecals = [];
    this.bulletHoles = [];
    this.wallCracks = [];
  }
}
