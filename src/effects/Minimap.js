export class Minimap {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.style.cssText = `
      position: fixed; bottom: 60px; left: 20px;
      width: 160px; height: 160px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.15);
      pointer-events: none; z-index: 100;
      image-rendering: pixelated;
    `;
    this.canvas.width = 160;
    this.canvas.height = 160;
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.mapSize = 40; // world units
    this.pixelsPerUnit = 160 / this.mapSize;
  }

  update() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const ppu = this.pixelsPerUnit;

    // Clear
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fill();

    // Player position
    const pPos = this.game.player.position;

    // Buildings from the level (simplified positions)
    const buildings = [
      { x: -14, z: -10, w: 5, d: 5 },
      { x: 14, z: 10, w: 6, d: 5 },
      { x: -12, z: 14, w: 4, d: 4 },
      { x: 12, z: -14, w: 4, d: 4 },
      { x: -18, z: -4, w: 2.5, d: 2.5 },
      { x: 18, z: 4, w: 2.5, d: 2.5 },
      { x: -4, z: -18, w: 2.5, d: 2.5 },
      { x: 4, z: 18, w: 2.5, d: 2.5 },
      { x: -8, z: -7, w: 3.5, d: 3.5 },
      { x: 8, z: 7, w: 3.5, d: 3.5 }
    ];

    // Draw buildings relative to player
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (const b of buildings) {
      const dx = b.x - pPos.x;
      const dz = b.z - pPos.z;
      const sx = cx + dx * ppu;
      const sy = cy + dz * ppu;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
      ctx.fillRect(sx - b.w * ppu / 2, sy - b.d * ppu / 2, b.w * ppu, b.d * ppu);
    }

    // Draw enemies
    const enemies = this.game.enemyManager ? this.game.enemyManager.getActiveEnemies() : [];
    ctx.fillStyle = '#ff4444';
    for (const enemy of enemies) {
      const dx = enemy.position.x - pPos.x;
      const dz = enemy.position.z - pPos.z;
      const sx = cx + dx * ppu;
      const sy = cy + dz * ppu;
      if (sx < 0 || sx > w || sy < 0 || sy > h) {
        // Edge indicator
        const angle = Math.atan2(dz, dx);
        const ex = cx + Math.cos(angle) * (cx - 10);
        const ey = cy + Math.sin(angle) * (cy - 10);
        ctx.fillRect(ex - 2, ey - 2, 4, 4);
        continue;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw player arrow (rotated with yaw)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.game.camera.yaw);

    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(-3, 3);
    ctx.lineTo(0, 1);
    ctx.lineTo(3, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Border ring
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  dispose() {
    this.canvas.remove();
  }
}
