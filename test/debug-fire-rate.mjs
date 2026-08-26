import { chromium } from 'playwright';
const URL = 'http://localhost:3005';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ge(page, expr) { try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); } catch (e) { return "[ERR]"; } }

async function run() {
  console.log('═══ FIRE RATE DIAGNOSTIC ═══\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(1500);
  await ge(page, 'game.dtCap = 0.5');

  // Wait for enemies
  for (var i = 0; i < 200; i++) {
    var c = await ge(page, 'game.enemyManager.getActiveEnemies().length');
    if (c > 0) break;
    await sleep(200);
  }

  // Reset telemetry
  await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0,damageDealt:0}');
  await ge(page, 'window.__fireLog = []');

  // Test 1: Continuous fire for 2 seconds, check shots
  console.log('Test 1: buttons[0]=1 for 2000ms with periodic re-aim...');
  await page.evaluate(function() {
    window.game.input.locked = true;
    window.game.input.mouse.buttons[0] = 1;
  });
  await sleep(2000);
  var t1 = await ge(page, 'game.weaponController.telemetry');
  console.log('   After 2s hold: ' + t1.shotsFired + ' shots, ' + t1.hits + ' hits');

  // Test 2: Release, then 1 second hold (no aim)
  await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0}');
  await page.evaluate(function() { window.game.input.mouse.buttons[0] = 0; });
  await sleep(200);
  await page.evaluate(function() { window.game.input.mouse.buttons[0] = 1; });
  await sleep(1000);
  var t2 = await ge(page, 'game.weaponController.telemetry');
  console.log('   After 1s hold: ' + t2.shotsFired + ' shots, ' + t2.hits + ' hits');

  // Test 3: Check what locked is during combat
  var state = await ge(page, '({locked:game.input.locked, btn0:game.input.mouse.buttons[0]})');
  console.log('   Input state: locked=' + state.locked + ' btn0=' + state.btn0);

  // Test 4: Burst fire (our actual pattern)
  await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0}');
  var totalShots = 0;
  var start = Date.now();
  for (var c = 0; c < 10; c++) {
    // Find closest enemy
    await page.evaluate(function() {
      var g = window.game;
      if (!g || !g.enemyManager) return;
      var ee = g.enemyManager.getActiveEnemies();
      if (!ee || ee.length === 0) return;
      var px = g.player.position.x, pz = g.player.position.z;
      var closest = null, minDist = Infinity;
      for (var i = 0; i < ee.length; i++) {
        var e = ee[i];
        if (!e.alive) continue;
        var d = Math.hypot(e.position.x - px, e.position.z - pz);
        if (d < minDist) { minDist = d; closest = e; }
      }
      if (!closest) return;
      var dx = closest.position.x - px;
      var dz = closest.position.z - pz;
      var dist = Math.hypot(dx, dz);
      var camH = g.camera.camera.position.y;
      var yaw = -Math.atan2(dx, -dz);
      var pitch = Math.atan2(1.3 - camH, dist);
      g.camera.yaw = yaw;
      g.camera.pitch = pitch;
      g.camera.velocity.yaw = 0;
      g.camera.velocity.pitch = 0;
      g.input.locked = true;
      g.input.mouse.buttons[0] = 1;
    });
    await sleep(250);
  }
  var elapsed = (Date.now() - start) / 1000;
  var t4 = await ge(page, 'game.weaponController.telemetry');
  console.log('\nTest 4: 10 cycles × 250ms hold');
  console.log('   Elapsed: ' + elapsed.toFixed(1) + 's');
  console.log('   Total shots: ' + t4.shotsFired);
  console.log('   Fire rate: ' + (t4.shotsFired / elapsed).toFixed(1) + ' shots/sec');

  // Test 5: Manual burst (release between each)
  await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0}');
  var start2 = Date.now();
  for (var c = 0; c < 10; c++) {
    await page.evaluate(function() {
      var g = window.game;
      if (!g || !g.enemyManager) return;
      var ee = g.enemyManager.getActiveEnemies();
      if (!ee || ee.length === 0) return;
      var px = g.player.position.x, pz = g.player.position.z;
      var closest = null, minDist = Infinity;
      for (var i = 0; i < ee.length; i++) {
        var e = ee[i];
        if (!e.alive) continue;
        var d = Math.hypot(e.position.x - px, e.position.z - pz);
        if (d < minDist) { minDist = d; closest = e; }
      }
      if (!closest) return;
      var dx = closest.position.x - px;
      var dz = closest.position.z - pz;
      var dist = Math.hypot(dx, dz);
      var camH = g.camera.camera.position.y;
      var yaw = -Math.atan2(dx, -dz);
      var pitch = Math.atan2(1.3 - camH, dist);
      g.camera.yaw = yaw;
      g.camera.pitch = pitch;
      g.camera.velocity.yaw = 0;
      g.camera.velocity.pitch = 0;
      g.input.locked = true;
      g.input.mouse.buttons[0] = 1;
    });
    await sleep(100);
    await page.evaluate(function() { window.game.input.mouse.buttons[0] = 0; });
    await sleep(20); // tiny gap between bursts
  }
  var elapsed2 = (Date.now() - start2) / 1000;
  var t5 = await ge(page, 'game.weaponController.telemetry');
  console.log('\nTest 5: 10 bursts × 100ms hold (release between)');
  console.log('   Elapsed: ' + elapsed2.toFixed(1) + 's');
  console.log('   Total shots: ' + t5.shotsFired);
  console.log('   Fire rate: ' + (t5.shotsFired / elapsed2).toFixed(1) + ' shots/sec');

  await browser.close();
  console.log('\nDone.');
}
run().catch(function(e) { console.error('ERR:', e.message); process.exit(1); });
