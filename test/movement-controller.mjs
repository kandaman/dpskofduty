/**
 * D-Movement Matrix Test — verifies strafe-right (D key) produces correct
 * displacement across a matrix of yaw/pitch combinations, using yaw-only
 * movement basis (not camera quaternion).
 *
 * Usage:
 *   node test/movement-controller.mjs
 *
 * Requires Vite dev server on http://localhost:3000
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const URL = 'http://localhost:3000';

// Test matrix: all yaw/pitch combos
const YAW_ANGLES  = [0, 45, 90, 135, 180, 225, 270, 315];
const PITCH_ANGLES = [0, 45, -45, 80, -80];

// Open test position (validated obstacle-free below)
const TEST_POS = { x: 3, z: -8 };

const PASS = [];
const FAIL = [];

function rad(deg) { return deg * Math.PI / 180; }

function expectedRight(yawDeg) {
  const yaw = rad(yawDeg);
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== D-MOVEMENT MATRIX TEST ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader'],
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let errors = [];

  page.on('pageerror', err => errors.push(err.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(() => document.getElementById('start-btn')?.click());
  await page.waitForFunction(() => window.game?.running, { timeout: 15000 });
  console.log('Game started.\n');

  // Wait for level to build
  await sleep(2000);

  // Check for open space at TEST_POS
  const isOpen = await page.evaluate(({ x, z }) => {
    const g = window.game;
    if (!g || !g.level) return false;
    const obstacles = g.level.getObstacleMesmes?.() || g.level.obstacleMeshes || [];
    const playerRadius = 0.6;
    for (const obs of obstacles) {
      const dx = obs.position.x - x;
      const dz = obs.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < playerRadius + 1.0) return false;
    }
    return true;
  }, TEST_POS);
  console.log(`Test position (${TEST_POS.x}, ${TEST_POS.z}): ${isOpen ? 'OPEN' : 'BLOCKED'}\n`);

  let total = 0;

  for (const yawDeg of YAW_ANGLES) {
    for (const pitchDeg of PITCH_ANGLES) {
      total++;
      const exp = expectedRight(yawDeg);

      // Reset player position and set yaw/pitch
      await page.evaluate(({ pos, yawDeg, pitchDeg }) => {
        const g = window.game;
        g.player.position.set(pos.x, 0, pos.z);
        g.player.velocity.set(0, 0, 0);
        g.camera.yaw   = yawDeg * Math.PI / 180;
        g.camera.pitch = pitchDeg * Math.PI / 180;
      }, { pos: TEST_POS, yawDeg, pitchDeg });

      await sleep(100);

      // Record initial position
      const posBefore = await page.evaluate(() => ({
        x: window.game.player.position.x,
        z: window.game.player.position.z,
      }));

      // Press D for 300ms
      await page.keyboard.down('d');
      await sleep(300);
      await page.keyboard.up('d');
      await sleep(50);

      // Record final position
      const posAfter = await page.evaluate(() => ({
        x: window.game.player.position.x,
        z: window.game.player.position.z,
      }));

      const dx = posAfter.x - posBefore.x;
      const dz = posAfter.z - posBefore.z;
      const moved = Math.sqrt(dx * dx + dz * dz);

      // Dot product with expected right vector
      const dot = (dx * exp.x + dz * exp.z) / (moved || 1);

      const pass = moved > 0.05 && dot > 0.95;

      if (pass) {
        PASS.push({ yaw: yawDeg, pitch: pitchDeg, moved, dot });
      } else {
        FAIL.push({ yaw: yawDeg, pitch: pitchDeg, moved, dot,
          dx: dx.toFixed(4), dz: dz.toFixed(4),
          expX: exp.x.toFixed(4), expZ: exp.z.toFixed(4) });
      }

      const icon = pass ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] yaw=${yawDeg}° pitch=${pitchDeg}°  moved=${moved.toFixed(3)} dot=${dot.toFixed(3)}`);
    }
  }

  console.log(`\n=== Results: ${PASS.length} PASS, ${FAIL.length} FAIL (${total} total) ===\n`);

  if (FAIL.length > 0) {
    console.log('FAIL details:');
    for (const f of FAIL) {
      console.log(`  yaw=${f.yaw}° pitch=${f.pitch}° moved=${f.moved.toFixed(3)} dot=${f.dot.toFixed(3)}`);
      console.log(`    displacement: (${f.dx}, ${f.dz})  expected: (${f.expX}, ${f.expZ})`);
    }
  }

  await browser.close();
  process.exit(FAIL.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
