// ─── PLAYTHROUGH TEST ─────────────────────────────────────────────────
// Rewritten: delegates to phase3-acceptance.mjs for a single playthrough
// with the full combat state machine and real browser input.
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:3005';
const SCREENSHOT_DIR = path.resolve(__dirname, 'playthrough-screenshots');
const RESULT_DIR = path.resolve(__dirname, 'results');

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

async function fireBurst(page) {
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

async function runPlaythrough() {
  console.log('═══ PLAYTHROUGH TEST ═══\n');

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

  // ═══ PLAY LOOP ═══
  var startTime = Date.now();
  var MAX_MS = 900000;
  var lastWave = 0;
  var sweepAngle = 0;
  var strafeTimer = 0;
  var loopCount = 0;
  var prevHp = 100;
  var prevAmmo = 30;
  var prevKills = 0;
  var shotsFired = 0, hits = 0, headshots = 0, damageDealt = 0;
  var deaths = 0;
  var ammoPickups = 0;
  var reloadCount = 0;
  var latestDecision = {};
  var stuckCount = 0;
  var lastGoodPos = { x: null, z: null };

  // Combat state
  var currentState = 'SEARCH';

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

    // Validate distances
    for (var ei = 0; ei < enemies.length; ei++) {
      enemies[ei].dist = Math.hypot(enemies[ei].x - playerX, enemies[ei].z - playerZ);
    }

    // Track metrics
    if (typeof state.hp === 'number' && state.hp < prevHp) { prevHp = state.hp; }
    if (state.killCount > prevKills) prevKills = state.killCount;
    if (typeof state.ammo === 'number' && state.ammo < prevAmmo) { shotsFired += (prevAmmo - state.ammo); }
    prevAmmo = state.ammo;

    var telemetry = await gameEval(page, 'game.weaponController.telemetry');
    if (telemetry) {
      shotsFired = Math.max(shotsFired, telemetry.shotsFired || 0);
      hits = Math.max(hits, telemetry.hits || 0);
      headshots = Math.max(headshots, telemetry.headshots || 0);
      damageDealt = Math.max(damageDealt, telemetry.damageDealt || 0);
    }

    // Wave tracking
    if (currentWave !== lastWave && currentWave > 0) {
      console.log('   Wave ' + currentWave + ' at ' + ((Date.now() - startTime) / 1000).toFixed(0) + 's (HP=' + hp + ')');
      lastWave = currentWave;
      if (currentWave <= 6) {
        try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'wave' + currentWave + '.png'), timeout: 5000 }); } catch (e) {}
      }
    }

    // Death/victory checks
    if (state.gameOver || (typeof state.hp === 'number' && state.hp <= 0)) {
      deaths++;
      console.log('\n   ☠ KIA (Wave ' + currentWave + ')');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
      await releaseAllKeys(page);
      break;
    }
    if (state.victory) {
      console.log('\n   ★ VICTORY');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'victory.png') });
      await releaseAllKeys(page);
      break;
    }

    // Between waves: pause
    if (state.waveState === 'preparing' || state.waveState === 'waveComplete') {
      await releaseAllKeys(page);
      await sleep(300);
      continue;
    }
    if (state.waveState !== 'active') { await sleep(300); continue; }

    // ═══ TARGET SELECTION ═══
    var target = chooseTarget(enemies);
    strafeTimer += 1;

    if (!target || enemies.length === 0) {
      // SEARCH state: sweep and walk
      if (currentState !== 'SEARCH') console.log('   → SEARCH (no targets)');
      currentState = 'SEARCH';
      sweepAngle += 0.15;
      await aimDirection(page, sweepAngle, -0.05);
      await page.keyboard.down('w');
      await sleep(80);
      await page.keyboard.up('w');
      await page.keyboard.up('a');
      await page.keyboard.up('d');
      await sleep(50);
      latestDecision = { t: ((Date.now() - startTime) / 1000).toFixed(0), wave: currentWave, hp: hp, state: 'SEARCH', target: 'none' };
    } else {
      // ENGAGE
      if (currentState !== 'ENGAGE') console.log('   → ENGAGE ' + target.type + ' @ ' + target.dist.toFixed(0) + 'm');
      currentState = 'ENGAGE';

      // Aim at target
      await aimAt(page, target.x, target.z, 1.25);

      // LOS check
      var los = await checkLOSBetweenPoints(page, playerX, playerZ, target.x, target.z);

      // Movement pattern: strafe with occasional approach/backpedal
      var shouldStrafe = strafeTimer % 3 !== 0;
      var strafeLeft = Math.floor(strafeTimer / 4) % 2 === 0;

      if (target.dist > 30 && hp > 50) {
        // Too far, approach
        await page.keyboard.down('w');
        await page.keyboard.up('s');
      } else if (target.dist < 8 && hp < 80) {
        // Too close, backpedal
        await page.keyboard.down('s');
        await page.keyboard.up('w');
      } else {
        await page.keyboard.up('w');
        await page.keyboard.up('s');
      }

      if (shouldStrafe) {
        if (strafeLeft) { await page.keyboard.down('a'); await page.keyboard.up('d'); }
        else { await page.keyboard.down('d'); await page.keyboard.up('a'); }
      } else {
        await page.keyboard.up('a');
        await page.keyboard.up('d');
        // Fire burst when stopped
        if (ammo > 0 && !reloading && los) {
          await fireBurst(page);
        }
      }

      // Stuck detection
      if (lastGoodPos.x !== null) {
        var moved = Math.hypot(playerX - lastGoodPos.x, playerZ - lastGoodPos.z);
        if (moved < 0.05) { stuckCount++; } else { stuckCount = 0; }
        if (stuckCount > 20) {
          console.log('   Stuck at (' + playerX.toFixed(1) + ',' + playerZ.toFixed(1) + '), rotating...');
          await releaseAllKeys(page);
          await aimDirection(page, sweepAngle + 1.5, 0);
          await page.keyboard.down('a');
          await sleep(300);
          await page.keyboard.up('a');
          stuckCount = 0;
        }
      }
      lastGoodPos = { x: playerX, z: playerZ };

      // Reload safely
      if (ammo === 0 && reserve > 0 && !reloading && (enemies.length === 0 || target.dist > 25)) {
        await releaseAllKeys(page);
        console.log('   Reload (ammo=' + ammo + ', reserve=' + reserve + ')');
        await page.keyboard.down('r');
        await sleep(2300);
        await page.keyboard.up('r');
        reloadCount++;
      }

      latestDecision = { t: ((Date.now() - startTime) / 1000).toFixed(0), wave: currentWave, hp: hp, state: 'ENGAGE', target: target.type, dist: target.dist.toFixed(0), ammo: ammo, los: los };
    }

    loopCount++;

    await sleep(60);
  }

  // ═══ REPORT ═══
  console.log('\n=== PLAYTHROUGH RESULT ===');
  console.log('Victory: ' + (state && state.victory ? 'YES' : 'NO'));
  console.log('Waves: ' + lastWave + '/6');
  console.log('Kills: ' + prevKills + ', Deaths: ' + deaths);
  console.log('Duration: ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');
  console.log('Shots: ' + shotsFired + ', Hits: ' + hits + ', Headshots: ' + headshots);
  console.log('Damage: ' + damageDealt);
  console.log('Reloads: ' + reloadCount + ', Pickups: ' + ammoPickups);

  // Write result
  var result = {
    victory: state && state.victory,
    wavesCompleted: lastWave,
    kills: prevKills,
    deaths: deaths,
    duration: ((Date.now() - startTime) / 1000).toFixed(1),
    shotsFired: shotsFired,
    hits: hits,
    headshots: headshots,
    damageDealt: damageDealt,
    reloadCount: reloadCount,
    ammoPickups: ammoPickups
  };
  fs.writeFileSync(path.join(RESULT_DIR, 'playthrough-result.json'), JSON.stringify(result, null, 2));

  await browser.close();
  console.log('\n✓ Done.');
}

runPlaythrough().catch(function(err) { console.error('✗', err.message); process.exit(1); });
