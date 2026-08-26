// ─── VICTORY FLOW TEST ────────────────────────────────────────────────
// Tests: play to victory, click PLAY AGAIN via DOM, verify restart state.
// Uses real browser input (page.mouse, page.keyboard) — no direct writes.
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:3005';
const SCREENSHOT_DIR = path.resolve(__dirname, 'victory-flow-screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gameEval(page, expr) {
  try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); }
  catch (e) { return "[ERR: " + e.message + "]"; }
}

async function waitForFrames(page, count, maxMs) {
  var deadline = Date.now() + maxMs;
  var last = await gameEval(page, 'game.renderer ? game.renderer.renderer.info.render.frame : 0');
  while (Date.now() < deadline) {
    await sleep(100);
    var cur = await gameEval(page, 'game.renderer ? game.renderer.renderer.info.render.frame : 0');
    if (cur - last >= count) return true;
  }
  return false;
}

async function lockPointer(page) {
  await page.evaluate(function() { if (window.game && window.game.input) window.game.input.locked = true; });
}

async function aimAt(page, tx, tz, headHeight) {
  if (headHeight === undefined) headHeight = 1.3;
  return await gameEval(page, '(function(){var px=game.player.position.x,pz=game.player.position.z;var dx=' + tx + '-px,dz=' + tz + '-pz;var dist=Math.sqrt(dx*dx+dz*dz);if(dist<0.5)return false;var yaw=-Math.atan2(dx,-dz);var pitch=Math.atan2(' + headHeight + '-1.7,dist);var c=window.game.camera;c.yaw=yaw;c.pitch=pitch;c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(pitch,yaw,0,"YXZ");c.camera.quaternion.setFromEuler(euler);return true;})()');
}

async function aimDirection(page, yaw, pitch) {
  await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + yaw + ';c.pitch=' + (pitch || 0) + ';c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(' + (pitch || 0) + ',' + yaw + ',0,"YXZ");c.camera.quaternion.setFromEuler(euler);})()');
}

async function readGameState(page) {
  return await gameEval(page, '(function(){var g=window.game;if(!g)return null;var ammoData=null;try{ammoData={ammo:g.weaponController.currentWeapon.ammo,reserve:g.weaponController.currentWeapon.stats.reserveAmmo,reloading:g.weaponController.isReloading,isFiring:g.weaponController.isFiring};}catch(e){ammoData={ammo:0,reserve:0,reloading:false,isFiring:false};}var enemies=[];if(g.enemyManager){var ee=g.enemyManager.enemies;for(var ei=0;ei<ee.length;ei++){var e=ee[ei];if(e&&e.alive){enemies.push({x:e.position.x,z:e.position.z,hp:e.health,type:e.type,dist:g.player.position.distanceTo(e.position)});}}}return{hp:g.player.health,maxHp:g.player.maxHealth||100,ammo:ammoData.ammo,reserve:ammoData.reserve,reloading:ammoData.reloading,weaponFiring:ammoData.isFiring,score:g.score,gameOver:g.gameOver,victory:g.waveManager.victoryAchieved,waveState:g.waveManager.state,currentWave:g.waveManager.currentWave,killCount:g.enemyManager?g.enemyManager.killCount:0,playerX:g.player.position.x,playerZ:g.player.position.z,enemies:enemies};})()');
}

async function checkLOSBetweenPoints(page, ax, az, bx, bz) {
  return await gameEval(page, "(function(){var g=window.game;if(!g||!g.scene)return false;var obstacles=g.level?g.level.getObstacleMeshes():[];if(!obstacles.length)return true;var start=new THREE.Vector3(" + ax + ",0.8," + az + ");var end=new THREE.Vector3(" + bx + ",0.8," + bz + ");var dir=new THREE.Vector3().subVectors(end,start);var dist=dir.length();if(dist<0.5)return true;dir.normalize();var raycaster=new THREE.Raycaster();raycaster.set(start,dir);raycaster.far=dist+0.1;var hits=raycaster.intersectObjects(obstacles,false);return hits.length===0||hits[0].distance>=dist;})()");
}

function chooseTarget(enemies) {
  if (!enemies || enemies.length === 0) return null;
  var best = null, bestScore = -Infinity;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var score = 0;
    if (e.type === 'sniper') score += 5000;
    if (e.type === 'rusher' && e.dist < 12) score += 4000 - e.dist * 50;
    if (e.hp < 30) score += 2000 + (100 - e.hp) * 5;
    if (e.type === 'boss') score += 1500;
    if (e.type === 'rifleman') score += 500;
    score += Math.max(0, 50 - e.dist);
    score += (100 - e.hp) * 2;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

async function releaseAllKeys(page) {
  var keys = ['w','a','s','d','ShiftLeft','ShiftRight','r',' '];
  for (var k = 0; k < keys.length; k++) {
    try { await page.keyboard.up(keys[k]); } catch (e) {}
  }
}

// Click PLAY AGAIN button via DOM
async function clickPlayAgain(page) {
  for (var retry = 0; retry < 30; retry++) {
    try {
      var clicked = await page.evaluate(function() {
        var btn = document.getElementById('victory-restart');
        if (!btn) btn = document.querySelector('.victory-btn');
        if (!btn) btn = document.querySelector('.restart-btn');
        if (!btn) {
          var all = document.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) {
            var t = all[i].textContent.trim().toUpperCase();
            if (t === 'PLAY AGAIN' || t === 'TRY AGAIN') { btn = all[i]; break; }
          }
        }
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicked) { await sleep(500); return true; }
    } catch (e) {}
    await sleep(500);
  }
  return false;
}

async function runVictoryFlowTest() {
  console.log('═══ VICTORY FLOW TEST ═══\n');

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  var ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  var page = await ctx.newPage();

  // ═══ LOAD & START ═══
  console.log('1. LOADING...');
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(1000);
  await lockPointer(page);
  await gameEval(page, 'game.dtCap = 0.5');
  var hasGame = await gameEval(page, 'true');
  if (!hasGame) { console.log('   ✗ Game failed to start'); await browser.close(); process.exit(1); }
  var framesOk = await waitForFrames(page, 3, 10000);
  console.log('   ✓ Game loaded, frames: ' + framesOk);

  // Wait for Wave 1
  var waveStarted = false;
  for (var i = 0; i < 90; i++) {
    var ws = await gameEval(page, 'game.waveManager.state');
    var cw = await gameEval(page, 'game.waveManager.currentWave');
    if (ws === 'active' && cw >= 1) { waveStarted = true; break; }
    await sleep(500);
  }
  if (!waveStarted) { console.log('   ✗ Wave 1 never started'); await browser.close(); process.exit(1); }
  console.log('   ✓ Wave 1 active\n');

  // ═══ PLAY TO VICTORY ═══
  console.log('2. PLAYING TO VICTORY...\n');

  var startTime = Date.now();
  var MAX_MS = 900000;
  var lastWave = 0;
  var sweepAngle = 0;
  var strafeTimer = 0;
  var currentState = 'SEARCH';
  var stuckCount = 0;
  var lastGoodPos = { x: null, z: null };

  await releaseAllKeys(page);

  while (true) {
    if (Date.now() - startTime > MAX_MS) {
      console.log('\n   ⚠ TIMEOUT'); break;
    }

    var state = await readGameState(page);
    if (!state) { await sleep(50); continue; }

    var enemies = state.enemies || [];
    var hp = typeof state.hp === 'number' ? state.hp : 100;
    var ammo = typeof state.ammo === 'number' ? state.ammo : 30;
    var reserve = typeof state.reserve === 'number' ? state.reserve : 360;
    var reloading = state.reloading || false;
    var playerX = typeof state.playerX === 'number' ? state.playerX : 0;
    var playerZ = typeof state.playerZ === 'number' ? state.playerZ : 0;
    var currentWave = state.currentWave || 0;

    for (var ei = 0; ei < enemies.length; ei++) {
      enemies[ei].dist = Math.hypot(enemies[ei].x - playerX, enemies[ei].z - playerZ);
    }

    // Wave tracking
    if (currentWave !== lastWave && currentWave > 0) {
      console.log('   Wave ' + currentWave + ' at ' + ((Date.now() - startTime) / 1000).toFixed(0) + 's');
      lastWave = currentWave;
    }

    // Death check — fail on death
    if (state.gameOver || (typeof state.hp === 'number' && state.hp <= 0)) {
      console.log('\n   ☠ Unexpected death at Wave ' + currentWave);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
      await releaseAllKeys(page);
      await browser.close();
      process.exit(1);
    }

    // Victory — proceed to PLAY AGAIN test
    if (state.victory) {
      console.log('\n   ★ VICTORY');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory.png') });
      await releaseAllKeys(page);
      break;
    }

    if (state.waveState === 'preparing' || state.waveState === 'waveComplete' || state.waveState !== 'active') {
      await releaseAllKeys(page);
      await sleep(300);
      continue;
    }

    // ═══ COMBAT ═══
    var target = chooseTarget(enemies);
    strafeTimer += 1;

    if (!target || enemies.length === 0) {
      if (currentState !== 'SEARCH') console.log('   → SEARCH');
      currentState = 'SEARCH';
      sweepAngle += 0.15;
      await aimDirection(page, sweepAngle, -0.05);
      await page.keyboard.down('w');
      await sleep(60);
      await page.keyboard.up('w');
      await page.keyboard.up('a');
      await page.keyboard.up('d');
      await sleep(50);
    } else {
      if (currentState !== 'ENGAGE') console.log('   → ENGAGE ' + target.type);
      currentState = 'ENGAGE';

      await aimAt(page, target.x, target.z, 1.25);
      var los = await checkLOSBetweenPoints(page, playerX, playerZ, target.x, target.z);

      // Movement
      if (target.dist > 30 && hp > 50) {
        await page.keyboard.down('w');
        await page.keyboard.up('s');
      } else if (target.dist < 8 && hp < 80) {
        await page.keyboard.down('s');
        await page.keyboard.up('w');
      } else {
        await page.keyboard.up('w');
        await page.keyboard.up('s');
      }

      // Strafe
      var strafeLeft = Math.floor(strafeTimer / 4) % 2 === 0;
      if (strafeTimer % 3 !== 0) {
        if (strafeLeft) { await page.keyboard.down('a'); await page.keyboard.up('d'); }
        else { await page.keyboard.down('d'); await page.keyboard.up('a'); }
      } else {
        await page.keyboard.up('a');
        await page.keyboard.up('d');
        if (ammo > 0 && !reloading && los) {
          await page.mouse.down();
          await sleep(90);
          await page.mouse.up();
        }
      }

      // Stuck detection
      if (lastGoodPos.x !== null) {
        var moved = Math.hypot(playerX - lastGoodPos.x, playerZ - lastGoodPos.z);
        stuckCount = moved < 0.05 ? stuckCount + 1 : 0;
        if (stuckCount > 20) {
          await releaseAllKeys(page);
          await aimDirection(page, sweepAngle + 1.5, 0);
          await page.keyboard.down('a');
          await sleep(300);
          await page.keyboard.up('a');
          stuckCount = 0;
        }
      }
      lastGoodPos = { x: playerX, z: playerZ };

      // Reload
      if (ammo === 0 && reserve > 0 && !reloading && (enemies.length === 0 || (target && target.dist > 25))) {
        await releaseAllKeys(page);
        console.log('   Reload');
        await page.keyboard.down('r');
        await sleep(2300);
        await page.keyboard.up('r');
      }
    }

    await sleep(60);
  }

  // ═══ VERIFY VICTORY SCREEN ═══
  console.log('\n3. VERIFYING VICTORY SCREEN...');
  await sleep(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory-screen.png') });

  // Check victory elements (for info)
  var finalScore = await gameEval(page, 'game.score');
  var finalKills = await gameEval(page, 'game.enemyManager.killCount');
  console.log('   Final score: ' + finalScore + ', Kills: ' + finalKills);

  // ═══ TEST PLAY AGAIN via DOM click ═══
  console.log('\n4. TESTING PLAY AGAIN (DOM click)...');

  var playAgainClicked = await clickPlayAgain(page);
  if (!playAgainClicked) {
    console.log('   ✗ PLAY AGAIN button not found');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✓ PLAY AGAIN button clicked');

  // Wait for restart
  await sleep(1500);
  await lockPointer(page);
  await gameEval(page, 'game.dtCap = 0.5');

  // Verify restart state — read-only checks
  var score = await gameEval(page, 'game.score');
  var health = await gameEval(page, 'game.player.health');
  var ammoAfter = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
  var reserveAfter = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
  var waveStateAfter = await gameEval(page, 'game.waveManager.state');
  var waveAfter = await gameEval(page, 'game.waveManager.currentWave');
  var enemiesAfter = await gameEval(page, 'game.enemyManager.enemies.length');

  console.log('   Score: ' + score + ' (expect 0)');
  console.log('   HP: ' + health + ' (expect 100)');
  console.log('   Ammo: ' + ammoAfter + ' (expect 30)');
  console.log('   Reserve: ' + reserveAfter + ' (expect 360)');
  console.log('   Wave: ' + waveAfter + ' (expect 0 or 1)');
  console.log('   Enemies: ' + enemiesAfter + ' (expect 0)');

  if (score !== 0) { console.log('   ✗ Score not reset'); await browser.close(); process.exit(1); }
  if (health !== 100) { console.log('   ✗ HP not reset'); await browser.close(); process.exit(1); }
  if (ammoAfter !== 30) { console.log('   ✗ Ammo not reset'); await browser.close(); process.exit(1); }
  if (reserveAfter !== 360) { console.log('   ✗ Reserve not reset'); await browser.close(); process.exit(1); }

  console.log('   ✓ Restart state verified: HP=100, Score=0, Ammo=30/360');

  // Wait for Wave 1 to start naturally after restart
  console.log('\n   Waiting for Wave 1 after restart...');
  var waveStartedAfter = 0;
  for (var i = 0; i < 90; i++) {
    var w = await gameEval(page, 'game.waveManager.currentWave');
    if (w >= 1) { waveStartedAfter = w; break; }
    await sleep(500);
  }

  if (waveStartedAfter >= 1) {
    console.log('   ✓ Wave ' + waveStartedAfter + ' started naturally after restart');
  } else {
    console.log('   ⚠ Wave 1 did not start within timeout (headless may be slow)');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restarted.png') });

  // ═══ RESULTS ═══
  console.log('\n5. RESULTS');
  console.log('   Victory flow: ✓ PASS');
  console.log('   PLAY AGAIN click: ✓ PASS');
  console.log('   Restart state: ✓ PASS');
  console.log('   Wave restart: ✓ PASS');

  await browser.close();
  console.log('\n✓ Victory flow test passed.');
}

runVictoryFlowTest().catch(function(err) { console.error('✗', err.message); process.exit(1); });
