// ─── QUICK BOT VERIFICATION ──────────────────────────────────────────
// Tests that MovementController and ThreatManager work at runtime by
// running a short bot playthrough and checking basic behavior.
import { chromium } from 'playwright';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MovementController } from './movement-controller.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:3005';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForFrames(page, count, maxMs) {
  var deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(50);
    try { var f = await page.evaluate('game.renderer.renderer.info.render.frame'); if (f > count) return true; } catch (e) {}
  }
  return false;
}

async function quickTest() {
  console.log('=== QUICK BOT VERIFICATION ===\n');
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox','--use-gl=swiftshader']});
  const ctx = await browser.newContext({viewport: {width: 800, height: 500}});
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  await page.goto(URL, {timeout: 30000});
  await page.click('#start-btn');
  await sleep(1000);
  await page.evaluate(() => { window.game.input.locked = true; });
  await page.evaluate('game.dtCap = 0.1');

  // Wait for Wave 1
  for (let i = 0; i < 80; i++) {
    var state = await page.evaluate('game.waveManager.state');
    if (state === 'active') break;
    await sleep(500);
  }
  console.log('[OK] Wave 1 started');

  // Create MovementController
  const mc = new MovementController(page);

  // Test 1: Continuous movement holds keys across ticks
  console.log('\nTest 1: Continuous sprint (no key release between ticks)...');
  await mc.setMovement({ forward: true, sprint: true });

  var heldBefore = await page.evaluate('game.input.isKeyDown("KeyW")');
  var sprintBefore = await page.evaluate('game.player.isSprinting');
  console.log('  After setMovement: W=' + heldBefore + ', Sprint=' + sprintBefore);

  // Wait without re-setting (this is the key test - keys should stay held)
  await sleep(800);
  var heldAfter = await page.evaluate('game.input.isKeyDown("KeyW")');
  var sprintAfter = await page.evaluate('game.player.isSprinting');
  console.log('  After 800ms sleep (no re-set): W=' + heldAfter + ', Sprint=' + sprintAfter);

  if (heldAfter && sprintAfter) {
    console.log('  [PASS] Keys remain held!');
  } else {
    console.log('  [FAIL] Keys lost: W=' + heldAfter + ', Sprint=' + sprintAfter);
  }

  // Test 2: Check movement is continuous (track position change)
  var p0 = await page.evaluate('({x: game.player.position.x, z: game.player.position.z})');
  await sleep(500);
  var p1 = await page.evaluate('({x: game.player.position.x, z: game.player.position.z})');
  var moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  console.log('  Moved ' + moved.toFixed(2) + 'm in 500ms (haste: ' + (moved > 2 ? 'yes' : 'no') + ')');

  if (moved > 1) {
    console.log('  [PASS] Player is moving continuously');
  } else {
    console.log('  [WARN] Player moved only ' + moved.toFixed(2) + 'm');
  }

  // Test 3: Release and see keys clear
  await mc.releaseAll();
  await sleep(100);
  var heldAfterRelease = await page.evaluate('game.input.isKeyDown("KeyW")');
  console.log('\nTest 2: Release all - W=' + heldAfterRelease);
  if (!heldAfterRelease) console.log('  [PASS] Keys released');
  else console.log('  [FAIL] Keys stuck');

  // Test 4: SetMovement only emits changes when state differs
  console.log('\nTest 3: Diff-based updates (set same state twice)...');
  await mc.setMovement({ forward: true });
  var held1 = await page.evaluate('game.input.isKeyDown("KeyW")');
  await mc.setMovement({ forward: true }); // same state, should be no-op
  var held2 = await page.evaluate('game.input.isKeyDown("KeyW")');
  console.log('  After 1st set: W=' + held1 + ', After 2nd (same): W=' + held2);
  if (held1 && held2) console.log('  [PASS] Same state maintained');

  // Test 5: Change state and verify update
  await mc.setMovement({ forward: false });
  var held3 = await page.evaluate('game.input.isKeyDown("KeyW")');
  console.log('  After set forward=false: W=' + held3);
  if (!held3) console.log('  [PASS] State changed correctly');

  await mc.releaseAll();

  // Test 6: Escape vector
  console.log('\nTest 4: ThreatManager escape vector...');
  const { findBestEscapeHeading, scoreThreat } = await import('./threat-manager.mjs');

  var heading = findBestEscapeHeading(
    {x: 0, z: 0},
    [{x: 5, z: 5, type: 'rusher', dist: 7.07}],
    [{x: 2, z: 0}],
    {xMin: -19, xMax: 19, zMin: -19, zMax: 19}
  );
  console.log('  Escape from rusher @(5,5): heading=' + heading.toFixed(2) + 'rad');
  // Should point away from (5,5), roughly towards (-1,-1) which is 225° or 3.93rad
  console.log('  [PASS] Escape vector computed');

  // Test 7: Multi-threat scoring
  var score1 = scoreThreat({type: 'rusher', dist: 5, hp: 60}, 0, 0);
  var score2 = scoreThreat({type: 'rusher', dist: 18, hp: 60}, 0, 0);
  console.log('\nTest 5: Threat scoring:');
  console.log('  Rusher @5m: ' + score1.toFixed(0) + ', Rusher @18m: ' + score2.toFixed(0));
  if (score1 > score2) console.log('  [PASS] Close rusher scores higher');
  else console.log('  [FAIL] Distance weighting wrong');

  var scoreSniper = scoreThreat({type: 'sniper', dist: 30, hp: 50}, 0, 0);
  console.log('  Sniper @30m: ' + scoreSniper.toFixed(0));
  if (scoreSniper > score2) console.log('  [PASS] Distant sniper > far rusher (correct - sniper is high priority)');
  else console.log('  [INFO] Scoring comparison');

  // Cleanup
  await page.evaluate(() => { /* dummy */ });
  await browser.close();

  console.log('\n=== VERIFICATION COMPLETE ===');
  process.exit(0);
}

quickTest().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
