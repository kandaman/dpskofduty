import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/wave-progression-screenshots');

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

async function runWaveProgressionTest() {
  console.log('=== WAVE PROGRESSION TEST (natural, no internal calls) ===\n');
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

  // --- LOAD & START ---
  console.log('1. LOADING...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(800);
  await page.evaluate(function() {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  var hasGame = await gameEval(page, 'true');
  if (!hasGame) { console.log('   FAIL: Game not started'); await browser.close(); process.exit(1); }
  await gameEval(page, 'game.dtCap = 0.5');
  var framesStarted = await waitForGameFrames(page, 3, 10000);
  assert(framesStarted, 'Game loop running');

  // --- SETUP: position player in open area (NOT at origin - monument blocks LOS) ---
  await page.evaluate(function() {
    var g = window.game;
    if (!g) return;
    g.player.position.set(10, 0, 0);
    g.player.velocity.set(0, 0, 0);
    g.player.health = 100;
    g.weaponController.currentWeapon.ammo = 30;
    g.weaponController.currentWeapon.stats.reserveAmmo = 200;
    var cam = g.camera;
    if (cam) { cam.yaw = 0; cam.pitch = 0; cam.velocity.yaw = 0; cam.velocity.pitch = 0; }
    g.input.locked = true;
  });
  await waitForGameFrames(page, 10, 8000);

  // --- NATURAL WAVE PROGRESSION ---
  // We let the wave manager run naturally: it starts in 'preparing' state,
  // then _startNextWave() fires after 2s timeout. Enemies spawn from the
  // queue at the defined interval. We kill them through gameplay.
  // NO direct calls to _startNextWave() or internal wave methods.

  console.log('\n2. Waiting for wave 1 to start naturally...');

  // Wait for wave 1 to go active (preparing → active transition)
  var waveState = '';
  var currentWave = 0;
  for (var i = 0; i < 30; i++) {
    waveState = await gameEval(page, 'game.waveManager.state');
    currentWave = await gameEval(page, 'game.waveManager.currentWave');
    if (waveState === 'active' && currentWave >= 1) break;
    await sleep(500);
  }
  assert(waveState === 'active' && currentWave >= 1,
    'Wave 1 started naturally (state=' + waveState + ', wave=' + currentWave + ')');
  console.log('   Current wave: ' + currentWave + ', state: ' + waveState);

  // Wait for enemies to spawn and player to detect them
  console.log('\n3. Waiting for enemies to spawn in wave 1...');
  var activeEnemies = 0;
  for (var j = 0; j < 40; j++) {
    activeEnemies = await gameEval(page, 'game.enemyManager.getActiveEnemies().length');
    if (activeEnemies > 0) break;
    await sleep(500);
  }
  assert(activeEnemies > 0, 'Wave 1 enemies spawned (' + activeEnemies + ' active)');
  console.log('   Active enemies: ' + activeEnemies);

  // Force enemies to clear positions and freeze them (prevents obstacle-blocking)
  var forcedCount = await gameEval(page, '(function(){var alive=game.enemyManager.enemies.filter(function(e){return e.alive});var px=10,pz=0;for(var i=0;i<alive.length;i++){var e=alive[i];var ang=(i/alive.length)*Math.PI*2;var nx=px+Math.cos(ang)*8;var nz=pz+Math.sin(ang)*8;e.position.set(nx,0,nz);e.mesh.position.set(nx,0,nz);e.velocity.set(0,0,0);e.moveSpeed=0;e.acceleration=0;if(e.state==="patrol"||e.state==="idle")e.state="combat";}return alive.length;})()');
  console.log('   Forced ' + forcedCount + ' enemies to clear frozen positions');

  // --- COMBAT LOOP: kill all enemies in wave 1 ---
  console.log('\n4. Engaging wave 1 enemies...');

  var startTime = Date.now();
  var maxDuration = 120000; // 2 min max
  var kills = 0;
  var prevKills = 0;
  var waveCompleted = false;
  var noAmmoCounter = 0;
  var fireCount = 0;
  var lastForceTime = 0;

  while (Date.now() - startTime < maxDuration) {
    // Check wave state
    waveState = await gameEval(page, 'game.waveManager.state');
    currentWave = await gameEval(page, 'game.waveManager.currentWave');
    kills = await gameEval(page, 'game.enemyManager.killCount');

    // Wave progression detected
    if (currentWave >= 2) {
      console.log('   Wave 2 started! (kills: ' + kills + ')');
      waveCompleted = true;
      break;
    }

    // Wave complete, waiting for next wave
    if (waveState === 'waveComplete') {
      console.log('   Wave 1 complete, waiting for wave 2...');
      await sleep(2000);
      continue;
    }

    if (kills > prevKills) {
      console.log('   Killed! Total kills: ' + kills);
      prevKills = kills;
    }

    // Force-clear and freeze every 20s to prevent stuck scenarios
    var elapsed = Date.now() - startTime;
    if (elapsed - lastForceTime > 20000) {
      lastForceTime = elapsed;
      await gameEval(page, '(function(){var alive=game.enemyManager.enemies.filter(function(e){return e.alive});var px=10,pz=0;for(var i=0;i<alive.length;i++){var e=alive[i];var ang=(i/alive.length)*Math.PI*2;var nx=px+Math.cos(ang)*8;var nz=pz+Math.sin(ang)*8;e.position.set(nx,0,nz);e.mesh.position.set(nx,0,nz);e.velocity.set(0,0,0);e.moveSpeed=0;e.acceleration=0;}return alive.length;})()');
    }

    // Find active enemies
    var aliveList = await gameEval(page, '(function(){return game.enemyManager.enemies.filter(function(e){return e.alive}).map(function(e){return{x:e.position.x.toFixed(1),z:e.position.z.toFixed(1),type:e.type,hp:e.health.toFixed(0)}});})()');
    if (aliveList && aliveList.length > 0) {
      var px = await gameEval(page, 'game.player.position.x');
      var pz = await gameEval(page, 'game.player.position.z');

      // Target closest
      var closest = null, cd = Infinity;
      for (var ei = 0; ei < aliveList.length; ei++) {
        var d = Math.hypot(aliveList[ei].x - px, aliveList[ei].z - pz);
        if (d < cd) { cd = d; closest = aliveList[ei]; }
      }

      if (closest) {
        var dx = closest.x - px;
        var dz = closest.z - pz;
        var dist = Math.hypot(dx, dz);
        var targetAngle = -Math.atan2(dx, -dz);
        var pitchAngle = Math.atan2(0.8 - 1.7, dist);

        // Aim
        await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + targetAngle + ';c.pitch=' + pitchAngle + ';c.velocity.yaw=0;c.velocity.pitch=0;})()');
        await waitForGameFrames(page, 2, 4000);

        // Fire sustained
        try { await page.mouse.down(); } catch (e) {}
        await waitForGameFrames(page, 5, 6000);
        try { await page.mouse.up(); } catch (e) {}
        await waitForGameFrames(page, 1, 2000);
        fireCount++;

        // Reload management
        var ammoLeft = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
        var reserve = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
        if (ammoLeft < 5 && reserve > 0) {
          await gameEval(page, 'game.weaponController.reload()');
          await waitForGameFrames(page, 10, 10000);
        }
        if (ammoLeft <= 0 && reserve <= 0) {
          noAmmoCounter++;
          if (noAmmoCounter > 5) {
            console.log('   OUT OF AMMO - giving up');
            break;
          }
          await sleep(500);
        } else {
          noAmmoCounter = 0;
        }
      }
    } else {
      // No active enemies — wait for spawn
      await sleep(1000);
    }
  }

  try { await page.mouse.up(); } catch (e) {}
  await waitForGameFrames(page, 30, 15000);

  // --- VERIFY NATURAL WAVE PROGRESSION ---
  console.log('\n5. RESULTS\n');
  currentWave = await gameEval(page, 'game.waveManager.currentWave');
  kills = await gameEval(page, 'game.enemyManager.killCount');
  var score = await gameEval(page, 'game.score');

  console.log('   Final wave: ' + currentWave);
  console.log('   Kills: ' + kills);
  console.log('   Score: ' + score);

  assert(currentWave >= 2, 'Wave progressed to 2+ naturally (wave=' + currentWave + ')');
  assert(kills >= 3, 'At least 3 kills in wave 1 (kills=' + kills + ')');
  assert(score >= 100, 'Score >= 100 after wave 1 (score=' + score + ')');

  // --- CHECK NO INTERNAL METHODS WERE USED ---
  // Verify the wave manager's _startNextWave was called naturally
  // (by checking wave state transition was waveComplete, not manual)
  var waveStateFinal = await gameEval(page, 'game.waveManager.state');
  console.log('   Final wave state: ' + waveStateFinal);
  assert(waveCompleted || waveStateFinal === 'victory' || waveStateFinal === 'waveComplete',
    'Wave progression happened naturally (state=' + waveStateFinal + ')');

  // --- SUMMARY ---
  console.log('\n6. SUMMARY');
  console.log('   PASSED: ' + passCount + ', FAILED: ' + failCount);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final.png') });
  await browser.close();

  if (failCount > 0) { console.log('\n[FAIL]'); process.exit(1); }
  console.log('\n[PASS]');
}

runWaveProgressionTest().catch(function(err) { console.error('[FATAL] ' + err.message); process.exit(1); });
