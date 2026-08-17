import * as THREE from 'three';

export class BulletTracer {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];

    // Tracer material
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Glow material for tracer head
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
  }

  addTracer(origin, direction, speed = 120, length = 2) {
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
      alphas[i] = 1 - (i / segments);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const tracer = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xffdd88,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        linewidth: 2
      })
    );

    // Add glow point at head
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 4, 4),
      this.glowMat
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

      // Move head
      t.headPos.add(t.velocity.clone().multiplyScalar(dt));

      // Update line positions
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

      // Update glow
      t.glow.position.copy(t.headPos);
      t.glow.material.opacity = 0.8 * (1 - t.age / t.life);

      // Fade out
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
