import * as THREE from 'three';

/**
 * BulletTracer — visual bullet streak with glow.
 *
 * Shows a brief bright line with a glowing head that follows the bullet
 * trajectory. Designed to be visible but not overwhelming.
 * In military shooters, tracers typically appear every 3rd-5th round,
 * but here we show every round for gameplay readability.
 */
export class BulletTracer {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];

    // Shared materials
    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  addTracer(origin, direction, speed = 120, length = 3) {
    const segments = Math.floor(length / 0.3);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 1) * 3);
    const alphas = new Float32Array(segments + 1);

    const dir = direction.clone().normalize();

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * length;
      const pos = origin.clone().add(dir.clone().multiplyScalar(t));
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      alphas[i] = 1 - (i / segments) * 0.8;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const tracer = new THREE.Line(geometry, this.tracerMat.clone());

    // Larger glow at tracer head
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      this.glowMat.clone()
    );
    glow.position.copy(origin);

    this.scene.add(tracer);
    this.scene.add(glow);

    this.tracers.push({
      line: tracer,
      glow: glow,
      velocity: dir.clone().multiplyScalar(speed),
      life: 0.05,
      age: 0,
      headPos: origin.clone(),
      headGlow: 0
    });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dt;

      // Move head along trajectory
      t.headPos.add(t.velocity.clone().multiplyScalar(dt));

      // Update line positions to follow head
      const positions = t.line.geometry.attributes.position.array;
      const segCount = (positions.length / 3) - 1;
      for (let j = 0; j <= segCount; j++) {
        const frac = j / segCount;
        const pos = t.headPos.clone().sub(t.velocity.clone().multiplyScalar(frac * 0.05));
        positions[j * 3] = pos.x;
        positions[j * 3 + 1] = pos.y;
        positions[j * 3 + 2] = pos.z;
      }
      t.line.geometry.attributes.position.needsUpdate = true;

      // Update glow position
      t.glow.position.copy(t.headPos);
      t.glow.material.opacity = 0.9 * (1 - t.age / t.life);

      // Fade out the trail
      t.line.material.opacity = 0.7 * (1 - t.age / t.life);

      if (t.age >= t.life) {
        this.scene.remove(t.line);
        this.scene.remove(t.glow);
        t.line.geometry.dispose();
        t.glow.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  reset() {
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      this.scene.remove(t.glow);
      t.line.geometry.dispose();
      t.glow.geometry.dispose();
    }
    this.tracers = [];
  }
}
