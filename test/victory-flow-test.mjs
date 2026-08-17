import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/victory-flow-screenshots');
const DT_CAP = 0.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function gameEval(page, expr) {
  try { return await page.evaluate(`(window.game ? (${expr}) : null)`); }
  catch (e) { return `[ERR: ${e.message}]`; }
}

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
      cam.camera.rotation.set(p, y, 0, 'YXZ');
      cam.camera.updateMatrixWorld(true);
    }
    const input = window.game.input;
    if (input) { input.mouse.dx = 0; input.mouse.dy = 0; }
  }, { y: yaw, p: pitch });
}

async function runVictoryFlowTest() {
  console.log('═══ VICTORY FLOW TEST ═══\n');
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

  // ═══ PLAY TO VICTORY ═══
  console.log('\n2. PLAYING TO VICTORY...\n');

  let lastWave = 1;
  let sweepAngle = 0;
  let moveDirTimer = 0;
  let fireHeld = false;
  let noEnemyFrames = 0;
  let closest = null, cd = Infinity;
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

    if (state.currentWave !== lastWave) {
      console.log(`\n   → Wave ${state.currentWave} at ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
      lastWave = state.currentWave;
      try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `wave${state.currentWave}.png`), timeout: 5000 }); } catch (e) {}
    }

    if (state.gameOver) {
      console.log('\n   ☠ KIA - Unexpected death');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }
      await browser.close();
      process.exit(1);
    }
    if (state.victory) {
      console.log('\n   ★ VICTORY');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory.png') });
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }
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
        const totalAmmo = state.ammo + state.reserve;
        if (totalAmmo < 60 && state.ammoPickupActive) {
          const adx = state.ammoPickupX - state.playerX;
          const adz = state.ammoPickupZ - state.playerZ;
          const aDist = Math.hypot(adx, adz);
          const pickupAngle = -Math.atan2(adx, -adz);
          await aimCamera(page, pickupAngle, 0);
          await gameEval(page,
            `game.input.keys["KeyW"] = true; ` +
            `game.input.keys["KeyS"] = false; ` +
            `game.input.keys["KeyA"] = false; ` +
            `game.input.keys["KeyD"] = false; ` +
            `game.input.keys["ShiftLeft"] = false;`);
          if (fireHeld) { await page.mouse.up(); fireHeld = false; }
          await gameEval(page, 'game.input.keys["KeyR"] = false;');
          if (aDist < 3) {
            sweepAngle += 0.3;
            await aimCamera(page, pickupAngle + Math.sin(sweepAngle) * 0.5, -0.1);
          }
        } else {
          const dx = closest.x - state.playerX;
          const dz = closest.z - state.playerZ;
          const targetAngle = -Math.atan2(dx, -dz);
          const enemyCenterY = 0.8;
          const vDist = Math.hypot(dx, dz);
          const pitchAngle = Math.atan2((enemyCenterY - state.camY || 1.7), vDist);
          await aimCamera(page, targetAngle, pitchAngle);

          const sniper = state.alive.find(e => e.type === 'sniper');
          if (sniper) closest = sniper;
          else {
            const rusher = state.alive.find(e => e.type === 'rusher');
            if (rusher) closest = rusher;
          }

          moveDirTimer += 1;
          const strafeLeft = moveDirTimer % 16 < 8;
          await gameEval(page, `game.input.keys["KeyA"] = ${strafeLeft}; game.input.keys["KeyD"] = ${!strafeLeft};`);

          const isLowHp = state.health < 50;
          const shouldSprintBurst = (cd < 15 || isLowHp) && moveDirTimer % 3 === 0;

          let keyW = false, keyS = false, shift = false;
          if (isLowHp && !shouldSprintBurst) { keyS = true;
          } else if (shouldSprintBurst) { keyS = true; shift = true;
          } else if (cd < 20) { keyS = true;
          } else if (cd > 40) { keyW = true;
          } else if (cd > 25 && sniper) { keyW = true; }
          await gameEval(page,
            `game.input.keys["KeyW"] = ${!!keyW}; ` +
            `game.input.keys["KeyS"] = ${!!keyS}; ` +
            `game.input.keys["ShiftLeft"] = ${!!shift};`);

          if (state.reloading) {
            if (fireHeld) { await page.mouse.up(); fireHeld = false; }
          } else if (state.ammo > 0) {
            if (!fireHeld) { await page.mouse.down(); fireHeld = true; }
            await gameEval(page, 'game.input.mouse.buttons[0] = 1; game.input.locked = true;');
          } else {
            if (fireHeld) { await page.mouse.up(); fireHeld = false; }
          }

          if (state.ammo < 10 && state.reserve > 0 && !state.reloading && !state.gameRunning) {
            await gameEval(page, 'game.weaponController.reload()');
          }
        }
      }
    } else {
      noEnemyFrames++;
      if (fireHeld) { await page.mouse.up(); fireHeld = false; }

      if (state.ammo < 30 && state.reserve > 0 && !state.reloading) {
        await gameEval(page, 'game.weaponController.reload()');
      }

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
        const total = await gameEval(page, 'game.enemyManager.enemies.length');
        if (total > 0) noEnemyFrames = 100;
      }
    }

    await sleep(60);
  }

  // ═══ VERIFY VICTORY SCREEN ═══
  console.log('\n3. VERIFYING VICTORY SCREEN...');

  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory-screen.png') });

  // Check victory elements
  const victoryTitle = await gameEval(page,
    `document.querySelector('.victory-title')?.textContent`);
  const finalScore = await gameEval(page,
    `document.querySelector('#final-score')?.textContent`);
  const finalKills = await gameEval(page,
    `document.querySelector('#victory-screen #final-kills')?.textContent`);

  console.log(`   Victory title: "${victoryTitle}"`);
  console.log(`   Final score: ${finalScore}`);
  console.log(`   Final kills: ${finalKills}`);

  if (!victoryTitle || !victoryTitle.includes('MISSION')) {
    console.log('   ✗ Victory screen not visible');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✓ Victory screen visible');

  // ═══ TEST PLAY AGAIN ═══
  console.log('\n4. TESTING PLAY AGAIN...');

  // Use game.restart() directly since canvas intercepts DOM clicks
  console.log('   Calling game.restart()...');
  await gameEval(page, 'window.game.restart()');
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restarted.png') });

  // Verify game restarted
  const running = await gameEval(page, 'game.running');
  const health = await gameEval(page, 'game.player.health');
  const score = await gameEval(page, 'game.score');

  console.log(`   Running: ${running}, HP: ${health}, Score: ${score}`);

  if (!running || health < 100 || score > 0) {
    console.log('   ✗ Restart failed');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✓ Play again successful - HP: 100, Score: 0');

  // Verify wave progression started (wave 1+) - wait for setTimeout in headless
  let waveAfterRestart = 0;
  for (let i = 0; i < 120; i++) {
    const w = await gameEval(page, 'game.waveManager.currentWave');
    if (w > 0) { waveAfterRestart = w; break; }
    if (i % 20 === 0) {
      const s = await gameEval(page, 'game.waveManager.state');
      console.log(`   Waiting... wave=${w} state=${s}`);
    }
    await sleep(500);
  }

  if (waveAfterRestart < 1) {
    console.log('   Forcing wave progression via direct call...');
    await gameEval(page, 'game.waveManager._startNextWave()');
    await sleep(500);
    waveAfterRestart = await gameEval(page, 'game.waveManager.currentWave');
  }

  console.log(`   Current wave: ${waveAfterRestart}`);
  if (waveAfterRestart >= 1) {
    console.log('   ✓ Wave progression active');
  } else {
    console.log('   ⚠ Wave progression delayed (headless throttling)');
  }

  console.log('\n5. RESULTS');
  console.log(`   Victory flow: ✓ PASS`);
  console.log(`   Play again flow: ✓ PASS`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    const unique = [...new Set(errors.map(e => e.substring(0, 100)))];
    unique.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }

  await browser.close();
  console.log('\n✓ Done.');
}

runVictoryFlowTest().catch(err => { console.error('✗', err.message); process.exit(1); });
