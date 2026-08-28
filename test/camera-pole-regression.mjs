/**
 * Camera Pole Regression Test — verifies no spinning/discontinuity when
 * aiming near vertical (±80°, ±84°, ±85°) and applying horizontal mouse input.
 *
 * Usage:
 *   node test/camera-pole-regression.mjs
 *
 * Requires Vite dev server on http://localhost:3000
 */

import { chromium } from 'playwright';
import fs from 'fs';
const URL = 'http://localhost:3000';

// Pitch values to test (degrees).  ±85 should clamp to MAX_PITCH (85°).
const TEST_PITCHES = [80, 84, 85, -80, -84, -85];
const MOUSE_DELTA  = 50; // px horizontal movement per frame

function rad(d) { return d * Math.PI / 180; }

let passes = 0;
let failures = 0;

function check(label, ok, detail) {
  if (ok) { passes++; console.log(`  PASS ${label}`); }
  else    { failures++; console.log(`  FAIL ${label}: ${detail}`); }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== CAMERA POLE REGRESSION TEST ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.evaluate(() => document.getElementById('start-btn')?.click());
  await page.waitForFunction(() => window.game?.running, { timeout: 15000 });
  console.log('Game started.\n');

  // Check static class constants
  const caps = await page.evaluate(() => {
    const PC = window.game.camera.constructor;
    return {
      MAX_PITCH: PC.MAX_PITCH,
      MAX_VISUAL_PITCH: PC.MAX_VISUAL_PITCH,
    };
  });
  console.log(`Camera limits: MAX_PITCH=${(caps.MAX_PITCH * 180 / Math.PI).toFixed(1)}°  MAX_VISUAL_PITCH=${(caps.MAX_VISUAL_PITCH * 180 / Math.PI).toFixed(1)}°\n`);

  // ─── Test 1: Pitch clamps ──────────────────────────────────────
  console.log('--- Clamp tests ---');
  for (const deg of TEST_PITCHES) {
    await page.evaluate(({ deg }) => {
      const c = window.game.camera;
      c.yaw = 0;
      c.pitch = deg * Math.PI / 180;
    }, { deg });

    await sleep(50);

    const actual = await page.evaluate(() => window.game.camera.pitch);
    const actualDeg = actual * 180 / Math.PI;
    const expectedClamp = caps.MAX_PITCH;
    const clamped = Math.abs(actualDeg) <= Math.abs(deg);

    check(`pitch ${deg}° → ${actualDeg.toFixed(2)}°`,
      clamped,
      `pitch escaped to ${actualDeg.toFixed(2)}° (limit ${caps.MAX_PITCH * 180 / Math.PI}°)`);

    // Verify pitch never exceeds limit
    const absActual = Math.abs(actual);
    check(`pitch ${deg}° stays within MAX_PITCH`,
      absActual <= caps.MAX_PITCH + 0.001,
      `|pitch| = ${absActual * 180 / Math.PI}° > ${caps.MAX_PITCH * 180 / Math.PI}°`);
  }

  // ─── Test 2: Horizontal mouse near vertical, no spin ──────────
  console.log('\n--- Spin (discontinuity) tests ---');
  const SPIN_THRESHOLD = 0.5; // radians frame-to-frame quaternion angle

  for (const deg of [85, -85, 80, -80]) {
    await page.evaluate(({ deg }) => {
      const c = window.game.camera;
      c.yaw = 0;
      c.pitch = deg * Math.PI / 180;
      c.velocity.yaw = 0;
      c.velocity.pitch = 0;
    }, { deg });

    await sleep(100);

    // Apply repeated horizontal mouse movement and track quaternion
    let maxFrameDelta = 0;
    let prevQ = null;
    let prevUp = null;
    const NUM_FRAMES = 30;

    for (let frame = 0; frame < NUM_FRAMES; frame++) {
      // Inject horizontal mouse delta via raw mouse move
      await page.mouse.move(960 + MOUSE_DELTA * (frame % 2 === 0 ? 1 : -1), 540);
      await sleep(50);

      const qState = await page.evaluate(() => {
        const c = window.game.camera;
        return {
          yaw: c.yaw,
          pitch: c.pitch,
          q: [c.camera.quaternion.x, c.camera.quaternion.y, c.camera.quaternion.z, c.camera.quaternion.w],
          up: [c.camera.up.x, c.camera.up.y, c.camera.up.z],
          finite: isFinite(c.camera.quaternion.x) && isFinite(c.camera.quaternion.y) &&
                  isFinite(c.camera.quaternion.z) && isFinite(c.camera.quaternion.w),
          nan: isNaN(c.camera.quaternion.x) || isNaN(c.camera.quaternion.y) ||
               isNaN(c.camera.quaternion.z) || isNaN(c.camera.quaternion.w),
        };
      });

      // Debug first frame
      if (frame === 0) {
        console.log(`  pitch=${deg}° initial: yaw=${(qState.yaw * 180 / Math.PI).toFixed(2)}° pitch=${(qState.pitch * 180 / Math.PI).toFixed(2)}°`);
      }

      check(`pitch=${deg}° frame=${frame} no NaN`,
        !qState.nan,
        `NaN in quaternion`);

      check(`pitch=${deg}° frame=${frame} finite`,
        qState.finite,
        'non-finite quaternion');

      if (qState.nan || !qState.finite) continue;

      // Quaternion angular delta and up-vector continuity — compute in-page
      // to avoid needing THREE in the Node.js context.
      if (prevQ) {
        const metrics = await page.evaluate(({ prev, curr }) => {
          const qp = new THREE.Quaternion(prev[0], prev[1], prev[2], prev[3]);
          const qc = new THREE.Quaternion(curr[0], curr[1], curr[2], curr[3]);
          return {
            angleDelta: qp.angleTo(qc),
          };
        }, { prev: prevQ, curr: qState.q });

        const angleDelta = metrics.angleDelta;
        maxFrameDelta = Math.max(maxFrameDelta, angleDelta);

        if (angleDelta > SPIN_THRESHOLD) {
          check(`pitch=${deg}° no spin (frame=${frame}, Δq=${angleDelta.toFixed(3)})`,
            false,
            `quaternion angular delta ${angleDelta.toFixed(3)} > ${SPIN_THRESHOLD} — possible spin`);
        }
      }

      // Check camera up continuity
      if (prevUp) {
        const upDelta = await page.evaluate(({ pUp, cUp }) => {
          const pu = new THREE.Vector3(pUp[0], pUp[1], pUp[2]);
          const cu = new THREE.Vector3(cUp[0], cUp[1], cUp[2]);
          return pu.angleTo(cu);
        }, { pUp: prevUp, cUp: qState.up });

        if (upDelta > 1.0) {
          check(`pitch=${deg}° up vector continuous`,
            false,
            `up vector jump ${upDelta.toFixed(3)} rad`);
        }
      }

      prevQ  = qState.q;
      prevUp = qState.up;
    }

    console.log(`  pitch=${deg}° max frame Δq=${maxFrameDelta.toFixed(4)} rad`);
  }

  // ─── Test 3: Pitch stays bounded during mouse motion ──────────
  console.log('\n--- Pitch bound tests ---');
  for (const startDeg of [85, -85]) {
    await page.evaluate(({ deg }) => {
      const c = window.game.camera;
      c.yaw = 0;
      c.pitch = deg * Math.PI / 180;
      c.velocity.yaw = 0;
      c.velocity.pitch = 0;
    }, { deg: startDeg });

    await sleep(50);

    // Apply additional upward mouse motion
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(960, 540 + (startDeg > 0 ? -20 : 20));
      await sleep(50);
    }

    const final = await page.evaluate(() => window.game.camera.pitch);
    const finalDeg = final * 180 / Math.PI;

    check(`pitch remains clamped (start=${startDeg}°) final=${finalDeg.toFixed(2)}°`,
      Math.abs(final) <= caps.MAX_PITCH + 0.01,
      `|pitch| = ${Math.abs(final) * 180 / Math.PI}° > ${caps.MAX_PITCH * 180 / Math.PI}°`);
  }

  // ─── Test 4: D key works at extreme pitch ─────────────────────
  console.log('\n--- D at extreme pitch ---');
  for (const pitchDeg of [80, -80]) {
    await page.evaluate(({ deg }) => {
      const g = window.game;
      g.player.position.set(3, 0, -8);
      g.player.velocity.set(0, 0, 0);
      g.camera.yaw = 0;
      g.camera.pitch = deg * Math.PI / 180;
    }, { deg: pitchDeg });

    await sleep(100);

    const before = await page.evaluate(() => ({
      x: window.game.player.position.x,
      z: window.game.player.position.z,
    }));

    await page.keyboard.down('d');
    await sleep(300);
    await page.keyboard.up('d');

    const after = await page.evaluate(() => ({
      x: window.game.player.position.x,
      z: window.game.player.position.z,
    }));

    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const moved = Math.sqrt(dx * dx + dz * dz);

    // Expected right at yaw=0: (cos(0), -sin(0)) = (1, 0)
    const dot = dx / (moved || 1);

    check(`pitch=${pitchDeg}° D moves right, moved=${moved.toFixed(3)} dot=${dot.toFixed(3)}`,
      moved > 0.05 && dot > 0.9,
      `D strafe failed: dx=${dx.toFixed(4)} dz=${dz.toFixed(4)} moved=${moved.toFixed(3)} dot=${dot.toFixed(3)}`);
  }

  // ─── Results ──────────────────────────────────────────────────
  console.log(`\n=== Results: ${passes} PASS, ${failures} FAIL ===`);
  if (consoleErrors.length > 0) {
    console.log(`Console errors: ${consoleErrors.length}`);
  }

  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
