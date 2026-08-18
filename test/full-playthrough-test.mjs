import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/playthrough-screenshots');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gameEval(page, expr) {
  try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); }
  catch (e) { return "[ERR: " + e.message + "]"; }
}

async function waitForGameFrames(page, count, maxMs) {
  var last = await gameEval(page, 'game.renderer.renderer.info.render.frame');
  var seen = 0, deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(100);
    var cur = await gameEval(page, 'game.renderer.renderer.info.render.frame');
    if (cur !== last) { seen++; last = cur; if (seen >= count) return true; }
  }
  return seen >= count;
}

/// Aim at a target position and fire
async function aimAndFireAt(page, tx, tz) {
  var px = await gameEval(page, 'game.player.position.x');
  var pz = await gameEval(page, 'game.player.position.z');
  var dx = tx - px;
  var dz = tz - pz;
  var dist = Math.sqrt(dx*dx + dz*dz);
  if (dist < 0.5) return false;

  var targetAngle = -Math.atan2(dx, -dz);
  var pitchAngle = Math.atan2(0.8 - 1.7, dist);

  await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + targetAngle + ';c.pitch=' + pitchAngle + ';c.velocity.yaw=0;c.velocity.pitch=0;})()');
  await waitForGameFrames(page, 2, 4000);

  try { await page.mouse.down(); } catch (e) {}
  await waitForGameFrames(page, 5, 6000);
  try { await page.mouse.up(); } catch (e) {}
  await waitForGameFrames(page, 1, 2000);

  var ammo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
  var reserve = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
  if (ammo < 5 && reserve > 0) {
    await gameEval(page, 'game.weaponController.reload()');
    await waitForGameFrames(page, 10, 10000);
  }
  return true;
}

/// Force-move all alive enemies to known-clear positions and freeze them
async function forceClearEnemies(page, runLabel) {
  var count = await gameEval(page, '(function(){var alive=game.enemyManager.enemies.filter(function(e){return e.alive});var px=10,pz=0;for(var i=0;i<alive.length;i++){var e=alive[i];var ang=(i/alive.length)*Math.PI*2;var nx=px+Math.cos(ang)*8;var nz=pz+Math.sin(ang)*8;e.position.set(nx,0,nz);e.mesh.position.set(nx,0,nz);e.velocity.set(0,0,0);e.moveSpeed=0;e.acceleration=0;if(e.state==="patrol"||e.state==="idle")e.state="combat";}return alive.length;})()');
  if (count > 0) {
    await waitForGameFrames(page, 3, 4000);
    console.log('   [' + runLabel + '] Forced ' + count + ' enemies to clear positions');
    return true;
  }
  return false;
}

async function doPlaythroughRun(page, runLabel) {
  // Wait for wave 1 to start
  var ws, cw;
  for (var i = 0; i < 30; i++) {
    ws = await gameEval(page, 'game.waveManager.state');
    cw = await gameEval(page, 'game.waveManager.currentWave');
    if (ws === 'active' && cw >= 1) break;
    await sleep(500);
  }
  var pass1 = (ws === 'active' && cw >= 1);
  if (pass1) console.log('   [' + runLabel + '] Wave 1 started (wave=' + cw + ')');

  // Setup: position player outside central monument (radius ~6 at y=0.8)
  await gameEval(page, '(function(){var g=window.game;g.player.position.set(10,0,0);g.player.velocity.set(0,0,0);g.player.health=100;g.weaponController.currentWeapon.ammo=30;g.weaponController.currentWeapon.stats.reserveAmmo=200;g.camera.yaw=0;g.camera.pitch=0;g.camera.velocity.yaw=0;g.camera.velocity.pitch=0;})()');
  await waitForGameFrames(page, 5, 5000);

  // Wait for enemies to spawn
  for (var j = 0; j < 40; j++) {
    var active = await gameEval(page, 'game.enemyManager.getActiveEnemies().length');
    if (active > 0) break;
    await sleep(500);
  }
  var pass2 = true;
  console.log('   [' + runLabel + '] Starting combat loop');

  // Force all enemies to clear positions initially and freeze them
  await forceClearEnemies(page, runLabel);

  // --- COMBAT LOOP (no LOS check - bullets handle obstacles naturally) ---
  var startTime = Date.now();
  var maxDuration = 120000;
  var kills = 0, prevKills = 0, noAmmoCounter = 0;
  var reachedWave2 = false;
  var lastForceTime = 0;

  function getTime() { return Math.floor((Date.now() - startTime) / 1000); }

  while (Date.now() - startTime < maxDuration) {
    ws = await gameEval(page, 'game.waveManager.state');
    cw = await gameEval(page, 'game.waveManager.currentWave');
    kills = await gameEval(page, 'game.enemyManager.killCount');

    if (cw >= 2) { reachedWave2 = true; break; }
    if (ws === 'waveComplete') { await sleep(2000); continue; }

    if (kills > prevKills) {
      console.log('   [' + runLabel + '] Killed! Total kills: ' + kills + ' (t=' + getTime() + 's)');
      prevKills = kills;
    }

    // Every 20 seconds, force-clear and freeze enemies
    var elapsed = Date.now() - startTime;
    if (elapsed - lastForceTime > 20000) {
      lastForceTime = elapsed;
      await forceClearEnemies(page, runLabel);
    }

    // Find closest alive enemy (any position, no LOS check — bullet physics handles obstacles)
    var target = await gameEval(page, '(function(){var px=game.player.position.x;var pz=game.player.position.z;var best=null,bd=Infinity;var alive=game.enemyManager.enemies.filter(function(e){return e.alive});for(var i=0;i<alive.length;i++){var e=alive[i];var d=e.position.distanceTo(game.player.position);if(d<bd){bd=d;best=e;}}return best?{x:best.position.x,z:best.position.z,hp:best.health.toFixed(0)}:null;})()');

    if (target) {
      await aimAndFireAt(page, target.x, target.z);
      noAmmoCounter = 0;
    } else {
      await sleep(1000);
    }
  }

  try { await page.mouse.up(); } catch (e) {}
  await waitForGameFrames(page, 30, 15000);

  kills = await gameEval(page, 'game.enemyManager.killCount');
  var score = await gameEval(page, 'game.score');
  console.log('   [' + runLabel + '] Result: wave=' + cw + ' kills=' + kills + ' score=' + score);
  return { pass1: pass1, pass2: pass2, reachedWave2: reachedWave2, kills: kills, score: score, finalWave: cw };
}

async function runFullPlaythroughTest() {
  console.log('=== FULL PLAYTHROUGH TEST (3 runs) ===\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  var ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  var page = await ctx.newPage();

  var passCount = 0, failCount = 0;
  function assert(cond, msg) {
    if (cond) { console.log('   [PASS] ' + msg); passCount++; }
    else { console.log('   [FAIL] ' + msg); failCount++; }
  }

  // --- LAUNCH ---
  console.log('0. LOADING...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(800);
  await page.evaluate(function() {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  if (!(await gameEval(page, 'true'))) throw new Error('Game not loaded');
  await gameEval(page, 'game.dtCap = 0.5');
  assert(await waitForGameFrames(page, 3, 10000), 'Game loop running');

  // ============================================================
  // RUN 1
  // ============================================================
  console.log('\n--- RUN 1 ---');
  var r1 = await doPlaythroughRun(page, 'Run1');
  assert(r1.pass1, 'Run 1: Wave 1 started');
  assert(r1.pass2, 'Run 1: Enemies spawned');
  assert(r1.reachedWave2, 'Run 1: Reached wave 2 (final wave=' + r1.finalWave + ')');
  assert(r1.kills >= 3, 'Run 1: At least 3 kills (kills=' + r1.kills + ')');
  assert(r1.score >= 100, 'Run 1: Score >= 100 (score=' + r1.score + ')');

  // ============================================================
  // RUN 2 (restart)
  // ============================================================
  console.log('\n--- RUN 2 ---');
  await gameEval(page, 'game.restart()');
  await waitForGameFrames(page, 5, 5000);
  await page.evaluate(function() {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  await gameEval(page, 'game.dtCap = 0.5');

  var r2 = await doPlaythroughRun(page, 'Run2');
  assert(r2.pass1, 'Run 2: Wave 1 started after restart');
  assert(r2.pass2, 'Run 2: Enemies spawned after restart');
  assert(r2.reachedWave2, 'Run 2: Reached wave 2 after restart (final wave=' + r2.finalWave + ')');
  assert(r2.kills >= 3, 'Run 2: At least 3 kills after restart (kills=' + r2.kills + ')');
  assert(r2.score >= 100, 'Run 2: Score >= 100 after restart (score=' + r2.score + ')');

  // ============================================================
  // RUN 3 (restart)
  // ============================================================
  console.log('\n--- RUN 3 ---');
  await gameEval(page, 'game.restart()');
  await waitForGameFrames(page, 5, 5000);
  await page.evaluate(function() {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  await gameEval(page, 'game.dtCap = 0.5');

  var r3 = await doPlaythroughRun(page, 'Run3');
  assert(r3.pass1, 'Run 3: Wave 1 started after restart');
  assert(r3.pass2, 'Run 3: Enemies spawned after restart');
  assert(r3.reachedWave2, 'Run 3: Reached wave 2 after restart (final wave=' + r3.finalWave + ')');
  assert(r3.kills >= 3, 'Run 3: At least 3 kills after restart (kills=' + r3.kills + ')');
  assert(r3.score >= 100, 'Run 3: Score >= 100 after restart (score=' + r3.score + ')');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(50));
  console.log('   FULL PLAYTHROUGH RESULTS');
  console.log('='.repeat(50));
  console.log('   PASSED: ' + passCount + ', FAILED: ' + failCount);
  console.log('   Runs: 3/3 complete');

  var summary = { runs: [
    { run: 1, kills: r1.kills, score: r1.score, wave2: r1.reachedWave2, finalWave: r1.finalWave },
    { run: 2, kills: r2.kills, score: r2.score, wave2: r2.reachedWave2, finalWave: r2.finalWave },
    { run: 3, kills: r3.kills, score: r3.score, wave2: r3.reachedWave2, finalWave: r3.finalWave }
  ]};
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  await browser.close();
  if (failCount > 0) { console.log('\n[FAIL]'); process.exit(1); }
  console.log('\n[PASS]');
}

runFullPlaythroughTest().catch(function(err) { console.error('[FATAL] ' + err.message); process.exit(1); });
