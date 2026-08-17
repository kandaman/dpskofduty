import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/playthrough-screenshots');
const DT_CAP = 0.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function gameEval(page, expr) {
  try { return await page.evaluate(`(window.game ? (${expr}) : null)`); }
  catch (e) { return `[ERR: ${e.message}]`; }
}

// ─── HEADLESS INPUT HELPERS ────────────────────────────────────
async function forcePointerLock(page) {
  await page.evaluate(() => {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
}

async function aimCamera(page, yaw, pitch = 0) {
  await page.evaluate(({ y, p }) => {
    const cam = window.game.camera;
    if (cam) {
      cam.yaw = y;
      cam.pitch = p;
      cam.velocity.yaw = 0;
      cam.velocity.pitch = 0;
      // Set rotation Euler - THREE.js Object3D's rotation Euler has an
      // _onChange callback that updates quaternion.setFromEuler(this.rotation)
      cam.camera.rotation.set(p, y, 0, 'YXZ');
      // Must call updateMatrix to propagate quaternion -> matrix -> matrixWorld
      cam.camera.updateMatrixWorld(true);
    }
    const input = window.game.input;
    if (input) { input.mouse.dx = 0; input.mouse.dy = 0; }
  }, { y: yaw, p: pitch });
}

// ─── METRICS ────────────────────────────────────────────────────
class Metrics {
  constructor() {
    this.totalMs = 0;
    this.waveTimings = {};
    this.healthMin = 100;
    this.sessionStart = 0;
    this.reloadCount = 0;
    this.pickupCount = 0;
    this._lastAmmo = 30;
    this._lastReserve = 90;
    this.frames = 0;
  }
  start() { this.sessionStart = Date.now(); }
  sample(state) {
    this.totalMs = Date.now() - this.sessionStart;
    this.healthMin = Math.min(this.healthMin, state.health);
    this.frames++;
    if (state.currentWave > 0 && !this.waveTimings[state.currentWave]) {
      this.waveTimings[state.currentWave] = 0;
    }
    if (state.currentWave > 0) {
      this.waveTimings[state.currentWave] = (Date.now() - this.sessionStart) / 1000;
    }
    if (state.ammo > this._lastAmmo && this._lastAmmo === 0) this.reloadCount++;
    if (state.reserve > this._lastReserve + 20) this.pickupCount++;
    this._lastAmmo = state.ammo;
    this._lastReserve = state.reserve;
  }
  report(state) {
    const totalS = (this.totalMs / 1000).toFixed(0);
    console.log(`\n╔══════════════════════════════════════╗
║         PLAYTEST REPORT             ║
╚══════════════════════════════════════╝
SESSION: ${(this.totalMs / 60000).toFixed(1)} min (${totalS}s)
SCORE: ${state.score}   KILLS: ${state.killCount}
OUTCOME: ${state.gameOver ? '☠ KIA' : (state.victory ? '★ VICTORY' : '○ INCOMPLETE')}`);
    console.log(`\nWAVES:`);
    for (let w = 1; w <= 6; w++) {
      if (this.waveTimings[w]) console.log(`  Wave ${w}: ${this.waveTimings[w].toFixed(0)}s`);
    }
    console.log(`\nCOMBAT:`);
    console.log(`  Health min:    ${this.healthMin}`);
    console.log(`  Reloads:       ${this.reloadCount}`);
    console.log(`  Pickups:       ${this.pickupCount}`);
  }
}

// ─── MAIN ───────────────────────────────────────────────────────
async function runPlaythrough() {
  console.log('═══ REAL PLAYTHROUGH TEST ═══\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  const metrics = new Metrics();

  // ═══ LOAD & START ═══
  console.log('1. LOADING...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);

  await page.click('#start-btn');
  await sleep(800);

  await forcePointerLock(page);
  const hasGame = await gameEval(page, 'true');
  if (!hasGame) { console.log('   ✗ Game failed to start'); await browser.close(); process.exit(1); }
  console.log('   ✓ Game started, pointer lock forced');

  await gameEval(page, `game.dtCap = ${DT_CAP}`);
  await sleep(200);

  let waveStarted = false;
  for (let i = 0; i < 90; i++) {
    const w = await gameEval(page, 'game.waveManager.currentWave');
    if (w > 0) { waveStarted = true; break; }
    await sleep(500);
  }
  if (!waveStarted) { console.log('   ✗ Wave never started'); await browser.close(); process.exit(1); }
  console.log('   ✓ Wave 1 active');
  metrics.start();

  // ═══ PLAY LOOP ═══
  console.log('\n2. PLAYING...\n');

  let lastWave = 1;
  let screenshotN = 0;
  let sweepAngle = 0;
  let moveDirTimer = 0;
  let fireHeld = false;
  let rHeld = false;
  let noEnemyFrames = 0;
  let closest = null, cd = Infinity;
  let lastAmmo = -1;
  const startTime = Date.now();
  const MAX_MS = 900000;

  while (true) {
    if (Date.now() - startTime > MAX_MS) {
      console.log('\n   ⚠ TIMEOUT'); break;
    }

    const state = await gameEval(page, `({
      health: game.player.health,
      ammo: game.weaponController.currentWeapon.ammo,
      reserve: game.weaponController.currentWeapon.stats.reserveAmmo,
      score: game.score,
      currentWave: game.waveManager.currentWave,
      killCount: game.enemyManager.killCount,
      activeEnemies: game.enemyManager.getActiveEnemies().length,
      alive: game.enemyManager.enemies.filter(e => e.alive).map(e => ({
        x: e.position.x, z: e.position.z, type: e.type
      })),
      playerX: game.player.position.x,
      playerZ: game.player.position.z,
      camY: game.camera.camera.position.y,
      gameOver: game.gameOver,
      victory: game.waveManager.victoryAchieved,
      reloading: game.weaponController.isReloading,
      firing: game.weaponController.isFiring,
      sprintBlocked: game.weaponController.isSprintBlocked,
      gameRunning: game.running,
      ammoPickupActive: game.ammoPickup.active,
      ammoPickupX: game.ammoPickup.mesh.position.x,
      ammoPickupZ: game.ammoPickup.mesh.position.z
    })`);
    if (!state) { await sleep(50); continue; }

    metrics.sample(state);

    if (state.currentWave !== lastWave) {
      console.log(`\n   → Wave ${state.currentWave} at ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
      lastWave = state.currentWave;
      try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `wave${state.currentWave}.png`), timeout: 5000 }); } catch (e) {}
    }

    if (state.gameOver) {
      console.log('\n   ☠ KIA');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }
      if (rHeld) { await page.keyboard.up('KeyR'); rHeld = false; }
      break;
    }
    if (state.victory) {
      console.log('\n   ★ VICTORY');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory.png') });
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }
      if (rHeld) { await page.keyboard.up('KeyR'); rHeld = false; }
      break;
    }

    if (state.alive && state.alive.length > 0) {
      noEnemyFrames = 0;

      closest = null; cd = Infinity;
      for (const e of state.alive) {
        const d = Math.hypot(e.x - state.playerX, e.z - state.playerZ);
        if (d < cd) { cd = d; closest = e; }
      }

      if (closest) {
        // ── AMMO PICKUP NAVIGATION ──
        // If reserve is getting low and a pickup is active, go get it
        const totalAmmo = state.ammo + state.reserve;
        if (totalAmmo < 60 && state.ammoPickupActive) {
          const adx = state.ammoPickupX - state.playerX;
          const adz = state.ammoPickupZ - state.playerZ;
          const aDist = Math.hypot(adx, adz);
          const pickupAngle = -Math.atan2(adx, -adz);
          await aimCamera(page, pickupAngle, 0);

          // Use direct input for movement toward pickup
          await gameEval(page,
            `game.input.keys["KeyW"] = true; ` +
            `game.input.keys["KeyS"] = false; ` +
            `game.input.keys["KeyA"] = false; ` +
            `game.input.keys["KeyD"] = false; ` +
            `game.input.keys["ShiftLeft"] = false;`);
          if (fireHeld) { await page.mouse.up(); fireHeld = false; }
          // Release reload via direct input
          await gameEval(page, 'game.input.keys["KeyR"] = false;');
          rHeld = false;

          // If very close to pickup, sweep to find it
          if (aDist < 3) {
            sweepAngle += 0.3;
            await aimCamera(page, pickupAngle + Math.sin(sweepAngle) * 0.5, -0.1);
          }

          // Skip enemy combat this frame
        } else {
          const dx = closest.x - state.playerX;
          const dz = closest.z - state.playerZ;
        // THREE.js 'YXZ' Euler: direction = (-sin(yaw), ..., -cos(yaw))
        // So negative yaw = looking RIGHT, positive yaw = looking LEFT.
        // Correct formula: yaw = -atan2(dx, -dz)
        const targetAngle = -Math.atan2(dx, -dz);
        // Aim vertically at enemy center (y≈0.8) from camera height (state.camY≈1.7)
        // Positive pitch = looking UP in THREE 'YXZ' (direction.y = sin(pitch))
        // Enemy is below camera → need negative pitch (look DOWN)
        const enemyCenterY = 0.8;
        const vDist = Math.hypot(dx, dz);
        const pitchAngle = Math.atan2((enemyCenterY - state.camY || 1.7), vDist);
        await aimCamera(page, targetAngle, pitchAngle);

        // Priority target: sniper (high damage) > rusher > rifleman
        const sniper = state.alive.find(e => e.type === 'sniper');
        if (sniper) closest = sniper;
        else {
          const rusher = state.alive.find(e => e.type === 'rusher');
          if (rusher) closest = rusher;
        }

        moveDirTimer += 1;
        // Continuous strafe - set strafe direction directly in game input
        const strafeLeft = moveDirTimer % 16 < 8;
        await gameEval(page, `game.input.keys["KeyA"] = ${strafeLeft}; game.input.keys["KeyD"] = ${!strafeLeft};`);

        // Distance & health management with burst sprint
        // Sprint briefly to create distance, then fire while walking backward
        // Burst pattern: sprint 1 frame, walk+fire 2 frames
        const isLowHp = state.health < 50;
        const shouldSprintBurst = (cd < 15 || isLowHp) && moveDirTimer % 3 === 0;

        // Determine movement keys: KeyS (backward), KeyW (forward), ShiftLeft (sprint)
        let keyW = false, keyS = false, shift = false;
        if (isLowHp && !shouldSprintBurst) {
          // Low HP, walking backward and firing
          keyS = true;
        } else if (shouldSprintBurst) {
          // Burst sprint to create distance (firing blocked for ~1 frame)
          keyS = true; shift = true;
        } else if (cd < 20) {
          // Too close, back away and fire
          keyS = true;
        } else if (cd > 40) {
          // Too far, approach
          keyW = true;
        } else if (cd > 25 && sniper) {
          // Sniper at medium range - approach to pressure them
          keyW = true;
        } else {
          // Good range, strafe only (no W/S)
        }
        await gameEval(page,
          `game.input.keys["KeyW"] = ${!!keyW}; ` +
          `game.input.keys["KeyS"] = ${!!keyS}; ` +
          `game.input.keys["ShiftLeft"] = ${!!shift};`);

        if (state.reloading) {
          if (fireHeld) { await page.mouse.up(); fireHeld = false; }
        } else if (state.ammo > 0) {
          if (!fireHeld) { await page.mouse.down(); fireHeld = true; }
          // Force input state directly every frame (headless Chrome can lose
          // mouse button and pointer lock state)
          await gameEval(page, 'game.input.mouse.buttons[0] = 1; game.input.locked = true;');
        } else {
          if (fireHeld) { await page.mouse.up(); fireHeld = false; }
        }

        // ── FORCED RELOAD ──
        // If ammo is low and reserve exists, force the game to reload
        // by calling the reload function directly (bypasses input timing issues)
        if (state.ammo < 10 && state.reserve > 0 && !state.reloading) {
          await gameEval(page, 'game.weaponController.reload()');
        }
        // Release reload key when mag is full
        if ((state.ammo >= 30 || state.reserve === 0) && rHeld) {
          await gameEval(page, 'game.input.keys["KeyR"] = false;');
          rHeld = false;
        }

        lastAmmo = state.ammo;
      }
      } // end else (normal combat)
    } else {
      noEnemyFrames++;
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }

      // ── FORCED RELOAD (NO ENEMIES) ──
      if (state.ammo < 30 && state.reserve > 0 && !state.reloading) {
        await gameEval(page, 'game.weaponController.reload()');
      }
      // Release reload key when mag is full
      if (state.ammo >= 30 && rHeld) {
        await gameEval(page, 'game.input.keys["KeyR"] = false;');
        rHeld = false;
      }

      // No enemies: walk forward while sweeping, no sprint
      await gameEval(page,
        `game.input.keys["KeyW"] = true; ` +
        `game.input.keys["KeyS"] = false; ` +
        `game.input.keys["ShiftLeft"] = false;`);

      sweepAngle += 0.2;
      await aimCamera(page, sweepAngle, -0.1);
      const sweepStrafeLeft = Math.sin(sweepAngle * 0.5) > 0;
      await gameEval(page, `game.input.keys["KeyA"] = ${sweepStrafeLeft}; game.input.keys["KeyD"] = ${!sweepStrafeLeft};`);

      if (noEnemyFrames > 200) {
        const victory = await gameEval(page, 'game.waveManager.victoryAchieved');
        if (victory) break;
        // Check if any enemies exist in the manager (might not be visible yet)
        const total = await gameEval(page, 'game.enemyManager.enemies.length');
        if (total > 0) noEnemyFrames = 100; // reset, enemies exist but maybe far away
      }
    }

    if (metrics.frames % 100 === 0) {
      try {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `f${screenshotN++}.png`), timeout: 5000 });
      } catch (e) {
        // Screenshot may time out if game is busy rendering; skip gracefully
      }
    }

    if (metrics.frames % 5 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const distStr = closest && cd ? `${cd.toFixed(0)}m` : '?';
      process.stdout.write(`\r   [${elapsed}s] W${state.currentWave} HP:${state.health} A:${state.ammo}/${state.reserve} E:${state.activeEnemies} K:${state.killCount} D:${distStr}${state.firing?'🔥':' '}${state.gameRunning?'':'⛔'}      `);
    }

    await sleep(60);
  }

  console.log('\n\n3. RESULTS\n');
  const finalState = await gameEval(page,
    `({score:game.score,killCount:game.enemyManager.killCount,gameOver:game.gameOver,victory:game.waveManager.victoryAchieved})`);
  metrics.report(finalState || { score: 0, killCount: 0, gameOver: false, victory: false });

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    const unique = [...new Set(errors.map(e => e.substring(0, 100)))];
    unique.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }

  await browser.close();
  console.log('\n✓ Done.');
}

runPlaythrough().catch(err => { console.error('✗', err.message); process.exit(1); });
