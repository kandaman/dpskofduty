import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/real-input-screenshots');
const DT_CAP = 0.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function gameEval(page, expr) {
  try { return await page.evaluate(`(window.game ? (${expr}) : null)`); }
  catch (e) { return `[ERR: ${e.message}]`; }
}

async function waitForGameFrames(page, count, maxMs = 10000) {
  const startFrame = await gameEval(page, 'game.renderer.renderer.info.render.frame');
  let seen = 0;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const current = await gameEval(page, 'game.renderer.renderer.info.render.frame');
    if (current !== startFrame) seen++;
    if (seen >= count) return true;
    await sleep(100);
  }
  return seen >= count;
}

function getDelta(pos1, pos2) {
  return {
    dx: pos2.x - pos1.x,
    dy: pos2.y - pos1.y,
    dz: pos2.z - pos1.z,
    dist: Math.hypot(pos2.x - pos1.x, pos2.z - pos1.z)
  };
}

async function runRealInputTest() {
  console.log('═══ REAL HUMAN INPUT TEST ═══\n');
  console.log('Using ONLY real browser keyboard events.');
  console.log('No game.input manipulation for input simulation.\n');
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

  let passCount = 0;
  let failCount = 0;
  function assert(condition, msg) {
    if (condition) {
      console.log(`   ✓ ${msg}`);
      passCount++;
    } else {
      console.log(`   ✗ ${msg}`);
      failCount++;
    }
  }

  // ═══ FRAME-TIMING HELPER ═══
  // At ~1 FPS in headless Chrome, we must hold keys long enough
  // to guarantee at least one game frame processes the input.
  async function holdKey(key, ms = 3000) {
    await page.keyboard.down(key);
    // Wait for at least 2 game frames while holding
    await waitForGameFrames(page, 2, ms);
    await page.keyboard.up(key);
    // Wait for 1 more frame to process the release
    await waitForGameFrames(page, 1, 2000);
  }

  // ═══ RESET HELPER ═══
  // Only resets internal state for MEASUREMENT, not input simulation
  async function resetPlayer(cameraYaw = 0) {
    await gameEval(page, `
      game.player.position.set(0, 0, 0);
      game.player.velocity.set(0, 0, 0);
    `);
    await page.evaluate((yaw) => {
      const game = window.game;
      const cam = game.camera;
      if (cam) {
        cam.yaw = yaw;
        cam.pitch = 0;
        cam.velocity.yaw = 0;
        cam.velocity.pitch = 0;
      }
      const input = game.input;
      if (input) { input.mouse.dx = 0; input.mouse.dy = 0; }
    }, cameraYaw);
    await waitForGameFrames(page, 2, 4000);
  }

  // ═══ LOAD & START ═══
  console.log('1. LOADING AND STARTING GAME\n');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);

  await page.click('#start-btn');
  await sleep(800);

  // Force pointer lock (headless can't do real pointerlockchange)
  await page.evaluate(() => {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  const hasGame = await gameEval(page, 'true');
  if (!hasGame) { console.log('   ✗ Game failed to start'); await browser.close(); process.exit(1); }
  console.log('   ✓ Game started');

  await gameEval(page, `game.dtCap = ${DT_CAP}`);
  // Wait for game frames to confirm loop is running
  const framesStarted = await waitForGameFrames(page, 3, 10000);
  console.log(`   ✓ Game loop ${framesStarted ? 'running' : 'NOT running'}`);

  // Wait for wave 1
  for (let i = 0; i < 90; i++) {
    const w = await gameEval(page, 'game.waveManager.currentWave');
    if (w > 0) break;
    await sleep(500);
  }
  console.log('   ✓ Wave 1 active\n');

  // ────────────────────────────────────────────────────
  // TEST: KEYBOARD INPUT VIA REAL BROWSER EVENTS
  // ────────────────────────────────────────────────────
  console.log('2. KEYBOARD MOVEMENT TESTS (real browser events)\n');

  // ═══ W TEST ═══
  console.log('   --- W (forward, facing -Z / default) ---');
  await resetPlayer(0);
  const pos_before_w = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('w', 4000);
  const pos_after_w = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_w = getDelta(pos_before_w, pos_after_w);
  console.log(`      Delta: dx=${delta_w.dx.toFixed(2)} dz=${delta_w.dz.toFixed(2)} dist=${delta_w.dist.toFixed(2)}`);
  assert(delta_w.dist > 0.5, `W moves forward (distance: ${delta_w.dist.toFixed(2)})`);

  // ═══ S TEST ═══
  console.log('\n   --- S (backward, facing -Z / default) ---');
  await resetPlayer(0);
  // Move forward first so we have room to go backward
  await page.keyboard.down('w');
  await waitForGameFrames(page, 2, 4000);
  await page.keyboard.up('w');
  await waitForGameFrames(page, 1, 2000);
  const pos_before_s = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('s', 4000);
  const pos_after_s = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_s = getDelta(pos_before_s, pos_after_s);
  console.log(`      Delta: dx=${delta_s.dx.toFixed(2)} dz=${delta_s.dz.toFixed(2)} dist=${delta_s.dist.toFixed(2)}`);
  assert(delta_s.dist > 0.5 || Math.abs(delta_s.dz) > 0.3, `S moves backward (dz: ${delta_s.dz.toFixed(2)})`);

  // ═══ A TEST ═══
  console.log('\n   --- A (strafe left, facing -Z) ---');
  await resetPlayer(0);
  const pos_before_a = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('a', 4000);
  const pos_after_a = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_a = getDelta(pos_before_a, pos_after_a);
  console.log(`      Delta: dx=${delta_a.dx.toFixed(2)} dz=${delta_a.dz.toFixed(2)} dist=${delta_a.dist.toFixed(2)}`);
  assert(delta_a.dist > 0.5, `A strafes left (distance: ${delta_a.dist.toFixed(2)})`);
  // A when facing -Z (yaw=0): left = -X
  assert(delta_a.dx < -0.3, `A moves in negative X direction (dx: ${delta_a.dx.toFixed(2)})`);

  // ═══ D TEST ═══
  console.log('\n   --- D (strafe right, facing -Z) ---');
  await resetPlayer(0);
  const pos_before_d = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('d', 4000);
  const pos_after_d = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_d = getDelta(pos_before_d, pos_after_d);
  console.log(`      Delta: dx=${delta_d.dx.toFixed(2)} dz=${delta_d.dz.toFixed(2)} dist=${delta_d.dist.toFixed(2)}}`);
  assert(delta_d.dist > 0.5, `D strafes right (distance: ${delta_d.dist.toFixed(2)})`);
  assert(delta_d.dx > 0.3, `D moves in positive X direction (dx: ${delta_d.dx.toFixed(2)})`);

  // ═══ KEY RELEASE TEST ═══
  console.log('\n   --- Key release (player must stop) ---');
  await resetPlayer(0);
  await page.keyboard.down('w');
  await waitForGameFrames(page, 2, 4000); // get moving
  await page.keyboard.up('w');
  await waitForGameFrames(page, 3, 6000); // wait for friction to stop
  const vel_after_release = await gameEval(page, '({vx:game.player.velocity.x, vz:game.player.velocity.z})');
  const speed = Math.hypot(vel_after_release.vx, vel_after_release.vz);
  console.log(`      Velocity after release: (${vel_after_release.vx.toFixed(4)}, ${vel_after_release.vz.toFixed(4)}) speed=${speed.toFixed(4)}`);
  assert(speed < 0.1, `Player stops after key release (speed: ${speed.toFixed(4)})`);

  // ═══ MOVEMENT AFTER CAMERA ROTATION ═══
  console.log('\n3. MOVEMENT AFTER CAMERA ROTATION (must be relative to facing)\n');

  // Turn 90° right → yaw = -PI/2 in THREE YXZ → facing +X
  console.log('   --- W when facing +X (90° right) ---');
  await resetPlayer(-Math.PI / 2);
  const pos_before_wx = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('w', 4000);
  const pos_after_wx = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_wx = getDelta(pos_before_wx, pos_after_wx);
  console.log(`      Delta: dx=${delta_wx.dx.toFixed(2)} dz=${delta_wx.dz.toFixed(2)} dist=${delta_wx.dist.toFixed(2)}`);
  assert(delta_wx.dist > 0.5, `W moves at +X facing (distance: ${delta_wx.dist.toFixed(2)})`);
  assert(delta_wx.dx > 0.3, `W is relative to facing: moves +X (dx: ${delta_wx.dx.toFixed(2)})`);

  // Turn 180° → yaw = PI → facing +Z
  console.log('\n   --- W when facing +Z (180° turn) ---');
  await resetPlayer(Math.PI);
  const pos_before_wz = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('w', 4000);
  const pos_after_wz = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_wz = getDelta(pos_before_wz, pos_after_wz);
  console.log(`      Delta: dx=${delta_wz.dx.toFixed(2)} dz=${delta_wz.dz.toFixed(2)} dist=${delta_wz.dist.toFixed(2)}`);
  assert(delta_wz.dist > 0.5, `W moves at +Z facing (distance: ${delta_wz.dist.toFixed(2)})`);
  assert(delta_wz.dz > 0.3, `W is relative to facing: moves +Z (dz: ${delta_wz.dz.toFixed(2)})`);

  // Turn 90° left → yaw = PI/2 → facing -X
  console.log('\n   --- W when facing -X (90° left) ---');
  await resetPlayer(Math.PI / 2);
  const pos_before_wnx = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await holdKey('w', 4000);
  const pos_after_wnx = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_wnx = getDelta(pos_before_wnx, pos_after_wnx);
  console.log(`      Delta: dx=${delta_wnx.dx.toFixed(2)} dz=${delta_wnx.dz.toFixed(2)} dist=${delta_wnx.dist.toFixed(2)}`);
  assert(delta_wnx.dist > 0.5, `W moves at -X facing (distance: ${delta_wnx.dist.toFixed(2)})`);
  assert(delta_wnx.dx < -0.3, `W is relative to facing: moves -X (dx: ${delta_wnx.dx.toFixed(2)})`);

  // ═══ RELOAD (R key) ═══
  console.log('\n4. RELOAD VIA REAL INPUT (R key)\n');
  await resetPlayer(0);
  // Set ammo low via gameEval (test setup, not input)
  await gameEval(page, `
    const wc = game.weaponController;
    wc.currentWeapon.ammo = 5;
    wc.currentWeapon.stats.reserveAmmo = 60;
  `);
  await waitForGameFrames(page, 1, 2000);

  await page.keyboard.down('r');
  await sleep(100);
  await page.keyboard.up('r');
  await waitForGameFrames(page, 3, 6000); // wait for reload to complete

  const ammo_after_r = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
  console.log(`      Ammo after R: ${ammo_after_r}/30`);
  assert(ammo_after_r >= 30, `R key triggers reload (ammo: ${ammo_after_r}/30)`);

  // ═══ SPRINT (Shift+W) ═══
  console.log('\n5. SPRINT VIA REAL INPUT (Shift+W)\n');
  await resetPlayer(0);
  const pos_before_sprint = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('w');
  await waitForGameFrames(page, 2, 4000);
  await page.keyboard.up('w');
  await page.keyboard.up('ShiftLeft');
  await waitForGameFrames(page, 1, 2000);
  const pos_after_sprint = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_sprint = getDelta(pos_before_sprint, pos_after_sprint);
  console.log(`      Sprint delta: ${delta_sprint.dist.toFixed(2)}`);
  assert(delta_sprint.dist > 0.5, `Sprint+W moves (distance: ${delta_sprint.dist.toFixed(2)})`);

  // ═══ INPUT STATE AFTER RESTART ═══
  console.log('\n6. INPUT STATE AFTER RESTART\n');

  // No sticky keys before restart
  const keysBeforeRestart = await gameEval(page,
    `JSON.stringify(Object.entries(game.input.keys).filter(([k,v]) => v).map(([k])=>k))`);
  console.log(`   Stuck keys before restart: ${keysBeforeRestart}`);

  // Death + restart
  await gameEval(page, 'game._onDeath()');
  await sleep(2000);

  // Check for stuck keys during death
  const keysDuringDeath = await gameEval(page,
    `JSON.stringify(Object.entries(game.input.keys).filter(([k,v]) => v).map(([k])=>k))`);
  console.log(`   Stuck keys during death: ${keysDuringDeath}`);

  await gameEval(page, 'window.game.restart()');
  await waitForGameFrames(page, 2, 5000);

  // Check for stuck keys after restart
  const keysAfterRestart = await gameEval(page,
    `JSON.stringify(Object.entries(game.input.keys).filter(([k,v]) => v).map(([k])=>k))`);
  console.log(`   Stuck keys after restart: ${keysAfterRestart}`);

  // Re-lock pointer
  await page.evaluate(() => {
    if (window.game && window.game.input) window.game.input.locked = true;
  });

  // Wait for wave 1
  console.log('   Waiting for wave 1...');
  let waveStarted = false;
  for (let i = 0; i < 90; i++) {
    const w = await gameEval(page, 'game.waveManager.currentWave');
    if (w > 0) { waveStarted = true; break; }
    await sleep(500);
  }
  console.log(`   Wave started: ${waveStarted}`);

  // Test W after restart
  console.log('\n   --- W after restart ---');
  await gameEval(page, 'game.player.position.set(0, 0, 0); game.player.velocity.set(0, 0, 0);');
  await waitForGameFrames(page, 1, 2000);
  const pos_before_rw = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await page.keyboard.down('w');
  await waitForGameFrames(page, 2, 4000);
  await page.keyboard.up('w');
  await waitForGameFrames(page, 1, 2000);
  const pos_after_rw = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_rw = getDelta(pos_before_rw, pos_after_rw);
  console.log(`      Delta: dx=${delta_rw.dx.toFixed(2)} dz=${delta_rw.dz.toFixed(2)} dist=${delta_rw.dist.toFixed(2)}`);
  assert(delta_rw.dist > 0.5, `W works after restart (distance: ${delta_rw.dist.toFixed(2)})`);

  // Test A after restart
  console.log('\n   --- A after restart ---');
  await gameEval(page, 'game.player.position.set(0, 0, 0); game.player.velocity.set(0, 0, 0);');
  await waitForGameFrames(page, 1, 2000);
  const pos_before_ra = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  await page.keyboard.down('a');
  await waitForGameFrames(page, 2, 4000);
  await page.keyboard.up('a');
  await waitForGameFrames(page, 1, 2000);
  const pos_after_ra = await gameEval(page, '({x:game.player.position.x, z:game.player.position.z})');
  const delta_ra = getDelta(pos_before_ra, pos_after_ra);
  console.log(`      Delta: dx=${delta_ra.dx.toFixed(2)} dz=${delta_ra.dz.toFixed(2)} dist=${delta_ra.dist.toFixed(2)}`);
  assert(delta_ra.dist > 0.5, `A works after restart (distance: ${delta_ra.dist.toFixed(2)})`);

  // ═══ SUMMARY ═══
  console.log('\n═══════════════════════════════════════');
  console.log('         REAL INPUT TEST RESULTS');
  console.log('═══════════════════════════════════════');
  console.log(`   PASSED: ${passCount}`);
  console.log(`   FAILED: ${failCount}`);

  if (errors.length > 0) {
    console.log(`\nRuntime errors (${errors.length}):`);
    const unique = [...new Set(errors.map(e => e.substring(0, 100)))];
    unique.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }

  await browser.close();

  if (failCount > 0) {
    console.log(`\n✗ ${failCount} test(s) FAILED`);
    process.exit(1);
  }
  console.log('\n✓ All real-input tests passed.');
}

runRealInputTest().catch(err => { console.error('✗', err.message); process.exit(1); });
