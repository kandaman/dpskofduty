import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/gameplay-metrics-screenshots');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ge(page, expr) {
  try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); }
  catch (e) { return "[ERR: " + e.message + "]"; }
}

async function waitFrames(page, count, maxMs) {
  var last = await ge(page, 'game.renderer.renderer.info.render.frame');
  var seen = 0, deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(100);
    var cur = await ge(page, 'game.renderer.renderer.info.render.frame');
    if (cur !== last) { seen++; last = cur; if (seen >= count) return true; }
  }
  return seen >= count;
}

async function runGameplayMetricsTest() {
  console.log('=== GAMEPLAY METRICS + SMOKE TEST ===\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  var ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function(e) { errors.push(e.message); });
  page.on('console', function(msg) {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // --- LOAD & START ---
  console.log('1. LOADING...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(800);
  await page.evaluate(function() {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
  if (!(await ge(page, 'true'))) { console.log('   FAIL'); await browser.close(); process.exit(1); }
  console.log('   Game started');
  await waitFrames(page, 10, 10000);
  console.log('   Game loop running\n');

  // Setup clear combat scenario in the SOUTHWEST quadrant
  // where there are minimal obstacles (away from monument at 0,0)
  await page.evaluate(function() {
    var g = window.game;
    if (!g) return;
    // Position player in open area — south-west quadrant, clear of obstacles
    g.player.position.set(-15, 0, -15);
    g.player.velocity.set(0, 0, 0);
    g.player.health = 100;
    g.player.isGrounded = true;
    // Camera facing +X (east, toward enemy positions)
    var cam = g.camera;
    if (cam) { cam.yaw = -Math.PI / 2; cam.pitch = 0; cam.velocity.yaw = 0; cam.velocity.pitch = 0; }
    // Input clean
    var inp = g.input;
    if (inp) { inp.mouse.dx = 0; inp.mouse.dy = 0; inp.locked = true; inp.keys = {}; }
    // Give full ammo
    var wc = g.weaponController;
    if (wc && wc.currentWeapon) { wc.currentWeapon.ammo = 30; wc.currentWeapon.stats.reserveAmmo = 200; }
  });
  await waitFrames(page, 5, 3000);

  // Spawn 3 riflemen further east, same latitude — clear LOS
  console.log('2. Spawning 3 riflemen...\n');
  await ge(page, 'game.enemyManager.spawnEnemyAt(-8, -15, "rifleman")');
  await ge(page, 'game.enemyManager.spawnEnemyAt(-5, -13, "rifleman")');
  await ge(page, 'game.enemyManager.spawnEnemyAt(-10, -17, "rifleman")');
  await waitFrames(page, 5, 3000);

  var enemyCheck = await ge(page, 'game.enemyManager.getActiveEnemies().length');
  console.log('   Active enemies: ' + enemyCheck);

  // DEBUG: full camera+raycast diagnostic
  console.log('   Running diagnostic...');
  var diag = await ge(page, '(function(){var g=window.game;if(!g)return"no game";var pc=g.camera;var eulerRot={x:pc.camera.rotation.x.toFixed(3),y:pc.camera.rotation.y.toFixed(3),order:pc.camera.rotation.order};var camPos={x:pc.camera.position.x.toFixed(1),y:pc.camera.position.y.toFixed(1),z:pc.camera.position.z.toFixed(1)};var dir=new THREE.Vector3(0,0,-1);var euler=new THREE.Euler(pc.camera.rotation.x,pc.camera.rotation.y,pc.camera.rotation.z,pc.camera.rotation.order);dir.applyEuler(euler);var enemies=g.enemyManager.enemies;var enemyPositions=enemies.filter(function(e){return e.alive}).map(function(e){return{x:e.position.x.toFixed(1),z:e.position.z.toFixed(1)}});var emeshes=[];for(var i=0;i<enemies.length;i++){enemies[i].mesh.traverse(function(c){if(c.isMesh)emeshes.push(c);});}var obs=g.level?g.level.getObstacleMeshes():[];var rc=new THREE.Raycaster();rc.set(pc.camera.position,dir);var hits=rc.intersectObjects(emeshes.concat(obs),false);var firstHit=hits.length>0?{dist:hits[0].distance.toFixed(1),type:hits[0].object.type}:null;return JSON.stringify({eulerRot:eulerRot,camPos:camPos,dir:{x:dir.x.toFixed(3),y:dir.y.toFixed(3),z:dir.z.toFixed(3)},enemies:enemyPositions,enemyMeshCount:emeshes.length,hitCount:hits.length,firstHit:firstHit});})()');
  console.log('   DIAG: ' + diag + '\n');

  // --- COMBAT LOOP ---
  console.log('3. COMBAT TEST\n');

  var startTime = Date.now();
  var maxDuration = 60000; // 1 min max
  var killed = 0;
  var ammoUsed = 0;
  var lastAmmo = 30;
  var minHp = 100;
  var tick = 0;

  while (Date.now() - startTime < maxDuration) {
    tick++;

    var state = await ge(page, '({hp:game.player.health, ammo:game.weaponController.currentWeapon.ammo, kills:game.enemyManager.killCount, aliveCount:game.enemyManager.getActiveEnemies().length, alive:game.enemyManager.enemies.filter(function(e){return e.alive}).map(function(e){return {x:e.position.x,z:e.position.z,type:e.type}}), px:game.player.position.x, pz:game.player.position.z, gameOver:game.gameOver, reloading:game.weaponController.isReloading, reserve:game.weaponController.currentWeapon.stats.reserveAmmo, score:game.score})');
    if (!state) { await sleep(16); continue; }

    // Track ammo
    if (state.ammo < lastAmmo) ammoUsed += (lastAmmo - state.ammo);
    lastAmmo = state.ammo;

    // Track HP
    if (state.hp < minHp) minHp = state.hp;

    if (state.gameOver) {
      console.log('   DIED at t=' + ((Date.now() - startTime) / 1000).toFixed(1) + 's, kills=' + state.kills + ', alive=' + state.aliveCount);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
      killed = state.kills;
      break;
    }

    // All enemies killed
    if (state.aliveCount === 0 && state.kills >= 3) {
      console.log('   ALL ENEMIES KILLED at t=' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
      killed = state.kills;
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'all-killed.png') });
      break;
    }
    // All enemies killed (partial)
    if (state.aliveCount === 0 && state.kills > 0) {
      console.log('   All active enemies dead at t=' + ((Date.now() - startTime) / 1000).toFixed(1) + 's, kills=' + state.kills);
      killed = state.kills;
      break;
    }

    var aliveList = state.alive || [];
    if (aliveList.length > 0) {
      // Find closest
      var closest = null, cd = Infinity;
      for (var ei = 0; ei < aliveList.length; ei++) {
        var d = Math.hypot(aliveList[ei].x - state.px, aliveList[ei].z - state.pz);
        if (d < cd) { cd = d; closest = aliveList[ei]; }
      }

      // Prioritize rushers
      var rusher = aliveList.find(function(e) { return e.type === 'rusher'; });
      var target = rusher || closest;

      var dx = target.x - state.px;
      var dz = target.z - state.pz;
      var targetAngle = -Math.atan2(dx, -dz);
      var pitchAngle = Math.atan2(0.4 - 1.7, Math.hypot(dx, dz));

      // Batch camera + movement
      await page.evaluate(function(args) {
        var g = window.game;
        if (!g) return;
        if (g.camera) { g.camera.yaw = args.y; g.camera.pitch = args.p; g.camera.velocity.yaw = 0; g.camera.velocity.pitch = 0; }
        if (g.input) { g.input.mouse.dx = 0; g.input.mouse.dy = 0; g.input.keys['KeyW'] = false; g.input.keys['KeyS'] = true; g.input.keys['KeyA'] = args.sl; g.input.keys['KeyD'] = !args.sl; g.input.keys['ShiftLeft'] = false; }
      }, { y: targetAngle, p: pitchAngle, sl: tick % 20 < 10 });

      // Fire (real mouse)
      if (!state.reloading && state.ammo > 0) {
        try { await page.mouse.down(); } catch (e) {}
      } else {
        try { await page.mouse.up(); } catch (e) {}
      }

      if ((state.ammo < 10 || state.ammo === 0) && state.reserve > 0 && !state.reloading) {
        await ge(page, 'game.weaponController.reload()');
      }
    } else {
      try { await page.mouse.up(); } catch (e) {}
      await page.evaluate(function() {
        var inp = window.game.input;
        if (!inp) return;
        inp.keys['KeyW'] = false; inp.keys['KeyS'] = false; inp.keys['KeyA'] = false; inp.keys['KeyD'] = false;
      });
    }

    await sleep(16);
  }

  try { await page.mouse.up(); } catch (e) {}

  // Wait for death animations to complete so killCount updates
  await waitFrames(page, 120, 10000); // ~2 seconds at 60 FPS for death anim

  var final = await ge(page, '({kills:game.enemyManager.killCount, score:game.score, hp:game.player.health, ammo:game.weaponController.currentWeapon.ammo})');
  try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final.png'), timeout: 3000 }); } catch (e) {}

  // --- REPORT ---
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  var fk = final ? final.kills : killed;
  var fs2 = final ? final.score : 0;

  console.log('\n4. RESULTS\n');
  console.log('   Duration: ' + elapsed + 's');
  console.log('   Kills:    ' + fk);
  console.log('   Score:    ' + fs2);
  console.log('   Ammo:     ' + ammoUsed + ' rounds');
  console.log('   Min HP:   ' + minHp);

  var pass = 0, fail = 0;
  function a(cond, msg) {
    if (cond) { console.log('   [PASS] ' + msg); pass++; }
    else { console.log('   [FAIL] ' + msg); fail++; }
  }

  console.log('\n5. ASSERTIONS\n');
  a(ammoUsed > 0, 'Weapon fired and consumed ammo (' + ammoUsed + ' rounds)');
  a(ammoUsed >= 20, 'Substantial ammo consumption (' + ammoUsed + ' rounds)');
  a(fk >= 1 || fs2 >= 100, 'At least 1 kill confirmed (score=' + fs2 + ', kills=' + fk + ')');
  a(fs2 >= 50, 'Score >= 50 (' + fs2 + ')');
  a(errors.length < 3, 'Fewer than 3 runtime errors (' + errors.length + ')');

  // --- WAVE PROGRESSION CHECK ---
  console.log('\n6. WAVE PROGRESSION\n');
  await page.evaluate(function() { if (window.game) window.game.waveManager._startNextWave(); });
  await sleep(5000);
  var w = await ge(page, 'game.waveManager.currentWave');
  a(w >= 2, 'Wave progression works (wave ' + w + ')');

  // --- RESTART CHECK ---
  console.log('\n7. RESTART\n');
  await page.evaluate(function() { if (window.game) window.game.input.locked = true; });
  await ge(page, 'window.game.restart()');
  await waitFrames(page, 5, 5000);
  await page.evaluate(function() { if (window.game && window.game.input) window.game.input.locked = true; });
  var running = await ge(page, 'game.running');
  var hp2 = await ge(page, 'game.player.health');
  var sc2 = await ge(page, 'game.score');
  a(running === true, 'Game runs after restart (' + running + ')');
  a(hp2 === 100, 'HP reset (' + hp2 + ')');
  a(sc2 === 0, 'Score reset (' + sc2 + ')');

  console.log('\n8. SUMMARY');
  console.log('   PASSED: ' + pass + ', FAILED: ' + fail);
  if (errors.length > 0) {
    console.log('\nErrors:');
    var ue = [...new Set(errors.map(function(e) { return e.substring(0, 100); }))];
    ue.slice(0, 3).forEach(function(e) { console.log('  ' + e); });
  }

  await browser.close();
  if (fail > 0) { console.log('\n[FAIL]'); process.exit(1); }
  console.log('\n[PASS]');
}

runGameplayMetricsTest().catch(function(err) { console.error('[FATAL] ' + err.message); process.exit(1); });
