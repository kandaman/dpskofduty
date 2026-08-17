import * as THREE from 'three';
import { BulletTracer } from './BulletTracer.js';

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.tracers = new BulletTracer(scene);

    // Particle pools
    this.sparks = [];
    this.bloodParticles = [];
    this.smokeParticles = [];
    this.impactDecals = [];

    // Materials
    this.sparkMat = new THREE.MeshStandardMaterial({
      color: 0xffaa44,
      emissive: 0xff6600,
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.1
    });
    this.bloodMat = new THREE.MeshStandardMaterial({
      color: 0xaa0000,
      roughness: 0.5,
      metalness: 0.0,
      transparent: true,
      opacity: 0.8
    });
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.3
    });
  }

  bulletImpact(point, normal) {
    // Spark particles
    const sparkCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sparkCount; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 4, 4),
        this.sparkMat
      );
      spark.position.copy(point);

      // Random direction along surface
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

    // Small puff of smoke
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      this.smokeMat
    );
    smoke.position.copy(point);
    this.scene.add(smoke);
    this.smokeParticles.push({
      mesh: smoke,
      velocity: new THREE.Vector3(0, 0.2, 0),
      life: 0.5,
      age: 0,
      maxScale: 0.3
    });
  }

  bloodSplat(point, direction) {
    const bloodCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < bloodCount; i++) {
      const blood = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 4, 4),
        this.bloodMat
      );
      blood.position.copy(point);

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 3
      );
      if (direction) {
        spread.add(direction.clone().multiplyScalar(2));
      }

      this.scene.add(blood);
      this.bloodParticles.push({
        mesh: blood,
        velocity: spread,
        life: 0.8 + Math.random() * 0.5,
        age: 0,
        gravity: -5
      });
    }

    // Blood pool decal
    this._createBloodDecal(point);
  }

  _createBloodDecal(point) {
    const decalSize = 0.1 + Math.random() * 0.15;
    const decal = new THREE.Mesh(
      new THREE.CircleGeometry(decalSize, 6),
      new THREE.MeshStandardMaterial({
        color: 0x440000,
        transparent: true,
        opacity: 0.4,
        roughness: 0.8,
        depthWrite: false
      })
    );
    decal.position.copy(point);
    decal.position.y = 0.01;
    decal.rotation.x = -Math.PI / 2;
    this.scene.add(decal);
    this.impactDecals.push({
      mesh: decal,
      life: 8,
      age: 0
    });
  }

  muzzleFlash(point, direction) {
    // Quick flash sprite - just a light
    const flash = new THREE.PointLight(0xffaa33, 3, 3);
    flash.position.copy(point);
    this.scene.add(flash);
    setTimeout(() => {
      this.scene.remove(flash);
    }, 30);
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
      b.mesh.scale.setScalar(1 - b.age / b.life);
      if (b.mesh.material) {
        b.mesh.material.opacity = 0.8 * (1 - b.age / b.life);
      }

      if (b.age >= b.life) {
        this.scene.remove(b.mesh);
        this.bloodParticles.splice(i, 1);
      }
    }

    // Update smoke
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const s = this.smokeParticles[i];
      s.age += dt;
      s.mesh.position.add(s.velocity.clone().multiplyScalar(dt));
      const scale = (s.age / s.life) * s.maxScale;
      s.mesh.scale.setScalar(scale);
      s.mesh.material.opacity = 0.3 * (1 - s.age / s.life);

      if (s.age >= s.life) {
        this.scene.remove(s.mesh);
        this.smokeParticles.splice(i, 1);
      }
    }

    // Update decals
    for (let i = this.impactDecals.length - 1; i >= 0; i--) {
      const d = this.impactDecals[i];
      d.age += dt;
      d.mesh.material.opacity = 0.4 * (1 - d.age / d.life);

      if (d.age >= d.life) {
        this.scene.remove(d.mesh);
        this.impactDecals.splice(i, 1);
      }
    }
  }

  reset() {
    this.tracers.reset();
    for (const arr of [this.sparks, this.bloodParticles, this.smokeParticles, this.impactDecals]) {
      for (const item of arr) {
        this.scene.remove(item.mesh);
      }
    }
    this.sparks = [];
    this.bloodParticles = [];
    this.smokeParticles = [];
    this.impactDecals = [];
  }
}
