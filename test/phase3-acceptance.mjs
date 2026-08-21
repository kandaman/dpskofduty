import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// ─── SETUP ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:3005';
const RESULT_DIR = path.resolve(__dirname, 'results');

fs.mkdirSync(RESULT_DIR, { recursive: true });

var OVERALL_PASS = true;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSubprocess(name, cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(59)}`);
    console.log(`RUNNING: ${name}`);
    console.log(`${'='.repeat(59)}\n`);
    var proc = spawn('node', args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      timeout: timeoutMs || 300000,
      env: { ...process.env }
    });
    proc.on('close', function(code) {
      if (code === 0) {
        console.log(`\n   [SUB-PASS] ${name}\n`);
        resolve(true);
      } else {
        console.log(`\n   [SUB-FAIL] ${name} exit=${code}\n`);
        resolve(false);
      }
    });
    proc.on('error', function(err) {
      console.log(`\n   [SUB-ERROR] ${name}: ${err.message}\n`);
      resolve(false);
    });
  });
}

// ─── PLAYWRIGHT HELPERS ────────────────────────────────────────────────
async function gameEval(page, expr) {
  try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); }
  catch (e) { return "[ERR: " + e.message + "]"; }
}

async function waitForFrames(page, count, maxMs) {
  var last = 0;
  try { last = await page.evaluate("window.game && game.renderer ? game.renderer.renderer.info.render.frame : 0"); } catch (e) {}
  var seen = 0, deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await sleep(100);
    var cur = 0;
    try { cur = await page.evaluate("window.game && game.renderer ? game.renderer.renderer.info.render.frame : 0"); } catch (e) {}
    if (cur !== last) { seen++; last = cur; if (seen >= count) return true; }
  }
  return seen >= count;
}

function assert(cond, msg) {
  if (cond) { console.log('   [PASS] ' + msg); }
  else { console.log('   [FAIL] ' + msg); OVERALL_PASS = false; }
}

// ─── GAME STATE HELPERS ───────────────────────────────────────────────
async function lockPointer(page) {
  await page.evaluate(function() {
    var g = window.game;
    if (!g || !g.input) return;
    g.input.locked = true;
    // Detach pointerlockchange listener so it doesn't revert locked in headless
    document.removeEventListener('pointerlockchange', g.input._onPointerLockChange);
  });
}

async function setupPlayer(page) {
  await gameEval(page, '(function(){var g=window.game;if(!g)return;g.player.position.set(10,0,0);g.player.velocity.set(0,0,0);g.player.health=100;g.camera.yaw=0;g.camera.pitch=0;g.camera.velocity.yaw=0;g.camera.velocity.pitch=0;})()');
  await gameEval(page, '(function(){var wc=game.weaponController;if(!wc||!wc.currentWeapon)return;wc.currentWeapon.ammo=30;wc.currentWeapon.stats.reserveAmmo=1500;})()');
}

async function fireWeapon(page) {
  // Use programmatic fire via the internal method — this is the agent's
  // "shoot" action (allowed per Part E rules for the automated-agent suite)
  await gameEval(page, '(function(){var wc=game.weaponController;if(wc&&!wc.isReloading&&!wc.isSwitching&&!wc.isSprintBlocked)wc.fire();})()');
}

async function reloadWeapon(page) {
  // Hold 'r' so game sees it as down across at least one update cycle at 2fps
  await page.keyboard.down('r');
  await sleep(200);
  await page.keyboard.up('r');
}

async function hasLineOfSight(page, tx, tz) {
  // Use THREE.js raycaster to check if a direct line exists from player
  // camera to target position, avoiding obstacle meshes.
  return await gameEval(page, "(function(){var g=window.game;if(!g||!g.scene)return false;var origin=g.camera.position.clone();var dir=new THREE.Vector3(" + tx + "-origin.x," + tz + "-origin.z,0);if(dir.length()<1)return false;dir.z=dir.y;dir.y=0;dir.normalize();var raycaster=new THREE.Raycaster(origin,dir);var obstacles=[];g.scene.traverse(function(m){if(m.isMesh&&m.userData&&m.userData.isObstacle)obstacles.push(m);});var hits=raycaster.intersectObjects(obstacles,false);var dist=new THREE.Vector3(" + tx + "-origin.x,0," + tz + "-origin.z).length();for(var i=0;i<hits.length;i++){if(hits[i].distance<dist)return false;}return true;})()");
}

async function aimAt(page, tx, tz) {
  // Read player position AND set yaw/pitch in one synchronous call
  // for perfect consistency — no race with game loop.
  // yaw = atan2(dx, -dz) where dx=tx-px, dz=tz-pz, facing -Z by default.
  // Positive yaw rotates RIGHT (counter-clockwise from above).
  // CRITICAL: Also rebuild the camera quaternion so _fireRaycast() which reads
  // the quaternion (not raw yaw/pitch) uses the updated aim direction.
  var hit = await gameEval(page, '(function(){var px=game.player.position.x,pz=game.player.position.z;var dx=' + tx + '-px,dz=' + tz + '-pz;var dist=Math.sqrt(dx*dx+dz*dz);if(dist<0.5)return false;var yaw=-Math.atan2(dx,-dz);var pitch=Math.atan2(0.8-1.7,dist);var c=window.game.camera;c.yaw=yaw;c.pitch=pitch;c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(pitch, yaw, 0, "YXZ");c.camera.quaternion.setFromEuler(euler);return true;})()');
  if (hit === false) return;
}

async function findClosestEnemy(page) {
  return await gameEval(page, '(function(){var px=game.player.position.x;var pz=game.player.position.z;var best=null,bd=Infinity;var alive=game.enemyManager.enemies.filter(function(e){return e.alive});for(var i=0;i<alive.length;i++){var e=alive[i];var d=e.position.distanceTo(game.player.position);if(d<bd){bd=d;best=e;}}return best?{x:best.position.x,z:best.position.z,hp:best.health.toFixed(0),type:best.type,dist:bd.toFixed(1)}:null;})()');
}

async function findAmmoCrate(page) {
  return await gameEval(page, '(function(){var ap=game.ammoPickup;if(!ap||!ap.active||!ap.mesh)return null;var pp=game.player.position;var d=pp.distanceTo(ap.mesh.position);return{x:ap.mesh.position.x,z:ap.mesh.position.z,dist:d.toFixed(1)};})()');
}

async function walkDirection(page, angleRad, durationMs) {
  await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + angleRad + ';c.pitch=0;c.velocity.yaw=0;c.velocity.pitch=0;})()');
  await page.keyboard.down('w');
  await sleep(durationMs);
  await page.keyboard.up('w');
}

async function scanForEnemies(page) {
  // Rotate camera and immediately return — no wait needed because
  // findClosestEnemy only uses position, not camera direction.
  var yaw = await gameEval(page, 'game.camera.yaw');
  if (typeof yaw === 'number') {
    await gameEval(page, '(function(){window.game.camera.yaw=' + (yaw + 1.2) + ';window.game.camera.pitch=-0.15;window.game.camera.velocity.yaw=0;window.game.camera.velocity.pitch=0;})()');
  }
}

// ─── PLAYTHROUGH ──────────────────────────────────────────────────────
async function playThrough(page, runLabel, runIdx) {
  var metrics = {
    run: runIdx, label: runLabel,
    startTime: Date.now(), duration: 0,
    reachedVictory: false, deaths: 0,
    kills: 0, minPlayerHp: 100, damageReceived: 0,
    reloadCount: 0, ammoPickups: 0, crateAttempts: 0, lastCratePos: null,
    waveTimes: {}, wavesCompleted: 0,
    runtimeErrors: []
  };

  await lockPointer(page);
  await gameEval(page, 'game.dtCap = 0.5');

  await setupPlayer(page);
  await waitForFrames(page, 5, 10000);

  // Wait for wave 1
  var waveState, currentWave;
  for (var i = 0; i < 40; i++) {
    waveState = await gameEval(page, 'game.waveManager.state');
    currentWave = await gameEval(page, 'game.waveManager.currentWave');
    if (waveState === 'active' && currentWave >= 1) break;
    await sleep(500);
  }
  console.log('   [' + runLabel + '] Wave ' + (currentWave || '?') + ' started (state=' + (waveState || '?') + ')');

  if (waveState !== 'active') {
    console.log('   [' + runLabel + '] ERROR: Wave did not start!');
    return metrics;
  }

  var startTime = Date.now();
  var maxDuration = 15 * 60 * 1000; // PHASE 3: 15min for 32 enemies across 6 waves at 2fps
  var lastWave = 0;
  var prevKills = 0;
  var prevHp = 100;
  var stuckCounter = 0;
  var combatStrafeDir = -1;   // start strafing left
  var combatStrafeCount = 0;
  var combatStuckCount = 0;
  var strafeKeyHeld = null;   // track which strafe key is currently held
  var forwardKeyHeld = false; // track W key state
  var shiftKeyHeld = false;   // track Shift key state for sprint
  var lowHpTimer = 0;
  var crateBlacklist = {};    // crates we've failed to reach — keyed by position

  while (Date.now() - startTime < maxDuration) {
    var hp = await gameEval(page, 'game.player.health');
    var ammo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
    var reserve = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
    var kills = await gameEval(page, 'game.enemyManager.killCount');
    waveState = await gameEval(page, 'game.waveManager.state');
    currentWave = await gameEval(page, 'game.waveManager.currentWave');
    var victory = await gameEval(page, 'game.waveManager.victoryAchieved');
    var gameOver = await gameEval(page, 'game.gameOver');
    var pp = await gameEval(page, '({x:game.player.position.x,z:game.player.position.z})');
    var playerX = (pp && typeof pp.x === 'number') ? pp.x : 0;
    var playerZ = (pp && typeof pp.z === 'number') ? pp.z : 0;

    if (typeof hp === 'number') {
      metrics.minPlayerHp = Math.min(metrics.minPlayerHp, hp);
      if (hp < prevHp) metrics.damageReceived += (prevHp - hp);
      prevHp = hp;
    }
    if (typeof kills === 'number' && kills > prevKills) { prevKills = kills; metrics.kills = kills; }

    if (currentWave && currentWave !== lastWave) {
      lastWave = currentWave;
      metrics.waveTimes[currentWave] = { start: Date.now(), end: null, duration: null };
      console.log('   [' + runLabel + '] Wave ' + currentWave + ' active');
    }
    if (waveState === 'waveComplete' && currentWave && metrics.waveTimes[currentWave]) {
      if (!metrics.waveTimes[currentWave].end) {
        metrics.waveTimes[currentWave].end = Date.now();
        metrics.waveTimes[currentWave].duration = ((metrics.waveTimes[currentWave].end - metrics.waveTimes[currentWave].start) / 1000).toFixed(1);
        metrics.wavesCompleted = currentWave;
        console.log('   [' + runLabel + '] Wave ' + currentWave + ' complete (' + metrics.waveTimes[currentWave].duration + 's)');
      }
    }

    if (victory || waveState === 'victory') {
      metrics.reachedVictory = true;
      console.log('   [' + runLabel + '] VICTORY!');
      break;
    }

    if (gameOver || (typeof hp === 'number' && hp <= 0)) {
      metrics.deaths++;
      console.log('   [' + runLabel + '] Player died (wave ' + (currentWave || '?') + ')');
      break;
    }

    if (waveState === 'preparing' || waveState === 'waveComplete') {
      await sleep(200);
      continue;
    }
    if (waveState !== 'active') {
      await sleep(500);
      continue;
    }

    // ── COMBAT (strafe while firing — movement = survival) ──
    var target = await findClosestEnemy(page);

    if (target) {
      stuckCounter = 0;

      // Sprint toward distant targets to close the gap faster
      var dx = target.x - playerX;
      var dz = target.z - playerZ;
      var dist = Math.sqrt(dx*dx + dz*dz);

      if (dist > 15 && typeof hp === 'number' && hp > 30) {
        // Sprint toward far target — MUST press W to actually move!
        if (!shiftKeyHeld) {
          await page.keyboard.down('ShiftLeft');
          shiftKeyHeld = true;
        }
        if (!forwardKeyHeld) {
          await page.keyboard.down('w');
          forwardKeyHeld = true;
        }
        // Aim toward target while sprinting
        await aimAt(page, target.x, target.z);
        await waitForFrames(page, 1, 2000);
        continue;
      }

      // Release sprint before engaging — weapon cannot fire while sprint-blocked.
      // At ~2fps, one frame wait (~500ms) exceeds the 250ms sprint-out timer.
      if (shiftKeyHeld) {
        await page.keyboard.up('ShiftLeft');
        shiftKeyHeld = false;
        await waitForFrames(page, 1, 2000);
      }

      // Walk toward enemies to close distance faster and gain better LOS
      if (!forwardKeyHeld) {
        await page.keyboard.down('w');
        forwardKeyHeld = true;
      }

      // Strafe while advancing — press strafe key if not already held
      if (!strafeKeyHeld) {
        strafeKeyHeld = combatStrafeDir > 0 ? 'd' : 'a';
        await page.keyboard.down(strafeKeyHeld);
      }

      // Aim while moving (combined read+set for best accuracy)
      await aimAt(page, target.x, target.z);

      // Keep strafe key held (no direction toggle) for consistent movement


      // HP-aware behavior: retreat when low HP to avoid CombatDirector fullStop
      if (typeof hp === 'number' && hp < 30) {
        lowHpTimer++;
        if (lowHpTimer === 1) console.log('   [' + runLabel + '] Low HP (' + hp.toFixed(0) + '), retreating to regen');
        // Release all keys and sprint away for 3s to let regen kick in
        if (shiftKeyHeld) { await page.keyboard.up('ShiftLeft'); shiftKeyHeld = false; }
        if (forwardKeyHeld) { await page.keyboard.up('w'); forwardKeyHeld = false; }
        if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
        // Turn 180 degrees to flee
        var curYaw = await gameEval(page, 'game.camera.yaw');
        if (typeof curYaw === 'number') {
          await gameEval(page, '(function(){window.game.camera.yaw=' + (curYaw + Math.PI) + ';window.game.camera.pitch=-0.1;window.game.camera.velocity.yaw=0;window.game.camera.velocity.pitch=0;})()');
        }
        // Sprint away
        await page.keyboard.down('ShiftLeft'); shiftKeyHeld = true;
        await page.keyboard.down('w'); forwardKeyHeld = true;
        await sleep(2500);
        await page.keyboard.up('ShiftLeft'); shiftKeyHeld = false;
        await page.keyboard.up('w'); forwardKeyHeld = false;
        console.log('   [' + runLabel + '] Retreat done');
      } else {
        lowHpTimer = 0;
      }

      // Manage ammo — reload only when empty (reduced reloads = more kill time)
      if (typeof ammo === 'number' && ammo <= 0 && typeof reserve === 'number' && reserve > 0) {
        await page.keyboard.up('w');    // stop while reloading
        forwardKeyHeld = false;
        // Hold 'r' for 1.0s (2+ frames at 2fps) so input is detected reliably, then
        // release and wait for the actual reloadTimer (2100ms) to elapse.
                await page.keyboard.down('r');
        await waitForFrames(page, 2, 3000);
        await page.keyboard.up('r');
        // Wait 5 frames for reloadTimer (2100ms game time)
        await waitForFrames(page, 5, 5000);
        metrics.reloadCount++;metrics.crateAttempts = 0;       // reset crate attempts — we have ammo again
        ammo = 30;
        // Re-aim after reload (don't press W — enemies come to us)
        var targetAfterReload = await findClosestEnemy(page);
        if (targetAfterReload) await aimAt(page, targetAfterReload.x, targetAfterReload.z);
      }

      if (typeof ammo === 'number' && ammo <= 0 && typeof reserve === 'number' && reserve <= 0) {
        var crate = await findAmmoCrate(page);
        // Track crate position for blacklisting (do NOT reset attempts on change)
        if (crate) {
          var posKey = crate.x.toFixed(1) + ',' + crate.z.toFixed(1);
          if (!metrics.lastCratePos) metrics.lastCratePos = posKey;
        }
        // Skip crate if blacklisted (unreachable)
        if (crate && crateBlacklist[posKey]) {
          console.log('   [' + runLabel + '] Skipping blacklisted crate at ' + posKey);
          crate = null;
        }
        if (crate && metrics.crateAttempts < 3) {
          metrics.crateAttempts++;
          console.log('   [' + runLabel + '] Collecting ammo crate (attempt ' + metrics.crateAttempts + '/3)');
          if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
          if (forwardKeyHeld) { await page.keyboard.up('w'); forwardKeyHeld = false; }
          // Use actual player position for crate angle (was hardcoded to spawn (10,0))
          var pp = await gameEval(page, '({x:game.player.position.x,z:game.player.position.z})');
          if (pp && typeof pp.x === 'number') {
            var dx = crate.x - pp.x;
            var dz = crate.z - pp.z;
            var dist = Math.sqrt(dx*dx + dz*dz);
            var crAngle = -Math.atan2(dx, -dz);
            var walkMs = Math.min(12000, Math.max(3000, dist / 5 * 1000 * 1.3));
            console.log('   [' + runLabel + '] Moving to ammo crate at (' + crate.x.toFixed(1) + ',' + crate.z.toFixed(1) + ') from (' + pp.x.toFixed(1) + ',' + pp.z.toFixed(1) + ') dist=' + dist.toFixed(1) + ' walk=' + Math.round(walkMs) + 'ms');
            await walkDirection(page, crAngle, Math.round(walkMs));
            // After main walk, check distance and do a short approach if needed
            var afterWalk = await gameEval(page, '({x:game.player.position.x,z:game.player.position.z})');
            if (afterWalk && typeof afterWalk.x === 'number') {
              var dx2 = crate.x - afterWalk.x;
              var dz2 = crate.z - afterWalk.z;
              var dist2 = Math.sqrt(dx2*dx2 + dz2*dz2);
              if (dist2 > 1.0 && dist2 < 4.0) {
                var approachAngle = -Math.atan2(dx2, -dz2);
                await walkDirection(page, approachAngle, Math.max(500, Math.round(dist2 / 5 * 1000 * 1.3)));
              }
            }
          } else {
            console.log('   [' + runLabel + '] Cannot get player position for crate angle');
            await walkDirection(page, 0, 5000);
          }
          // Verify ammo was actually gained from crate walk
          var ammoAfter = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
          if (typeof ammoAfter === 'number' && ammoAfter > 0) {
            metrics.ammoPickups++;
          } else {
            console.log('   [' + runLabel + '] Crate walk did not yield ammo (ammo=' + ammoAfter + ')');
          }
          continue;
        }
        if (crate && metrics.crateAttempts >= 3) {
          console.log('   [' + runLabel + '] Ammo crate unreachable after 3 attempts, blacklisting');
          if (metrics.lastCratePos) crateBlacklist[metrics.lastCratePos] = true;
          // Reset so future crates can be attempted; walk in random direction
          // to change position — new crate may spawn closer or player finds a path
          metrics.crateAttempts = 0;
          metrics.lastCratePos = null;
          if (forwardKeyHeld) { await page.keyboard.up('w'); forwardKeyHeld = false; }
          if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
          var escapeAngle = (Math.random() - 0.5) * Math.PI;
          await walkDirection(page, escapeAngle, 3000);
          continue;
        }
        // No crate available — wander in search of a new one
        if (!forwardKeyHeld) { await page.keyboard.down('w'); forwardKeyHeld = true; }
        if (!shiftKeyHeld) { await page.keyboard.down('ShiftLeft'); shiftKeyHeld = true; }
        if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
        var escapeAngle = (Math.random() - 0.5) * Math.PI;
        await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + escapeAngle + ';c.pitch=-0.1;c.velocity.yaw=0;c.velocity.pitch=0;})()');
        await sleep(200);
        continue;
      }

      // Check line of sight before firing
      var hasLOS = await hasLineOfSight(page, target.x, target.z);
      if (!hasLOS) {
        combatStuckCount++;
        // Sprint toward enemy — eventually we'll find a path or the
        // enemy will move. The waitForFrames after firing gives the game
        // loop time to advance and process movement/collision.
        if (combatStuckCount >= 8) {
          // After 8 No-LOS cycles, give up on this enemy and search elsewhere.
          combatStuckCount = 0;
          // Release keys and enter search mode
          if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
          if (forwardKeyHeld) { await page.keyboard.up('w'); forwardKeyHeld = false; }
          if (shiftKeyHeld) { await page.keyboard.up('ShiftLeft'); shiftKeyHeld = false; }
          continue;
        }
        if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
        if (!shiftKeyHeld) { await page.keyboard.down("ShiftLeft"); shiftKeyHeld = true; }
        if (!forwardKeyHeld) { await page.keyboard.down("w"); forwardKeyHeld = true; }
        await aimAt(page, target.x, target.z);
        continue;
      }
      // Has LOS — reset stuck counter
      combatStuckCount = 0;

      // Fire 5-round burst — damage=100 means every hit kills. With quaternion fix,
      // each shot hits. 5 rounds is enough for multiple kills without wasting ammo.
      var safeAmmo = (typeof ammo === 'number') ? ammo : 30;
      var fireCount = Math.min(safeAmmo, 5);
      for (var fi = 0; fi < fireCount; fi++) {
        await fireWeapon(page);
        await sleep(30);
      }
      // Let game loop advance a frame so next iteration reads fresh state
      await waitForFrames(page, 1, 2000);

    } else {
      // Sprint-search with periodic cardinal-direction resets + camera
      // rotation for sweeping arc.
      if (!forwardKeyHeld) {
        await page.keyboard.down('w');
        forwardKeyHeld = true;
      }
      if (!shiftKeyHeld) {
        await page.keyboard.down('ShiftLeft');
        shiftKeyHeld = true;
      }
      if (strafeKeyHeld) { await page.keyboard.up(strafeKeyHeld); strafeKeyHeld = null; }
      stuckCounter++;
      if (stuckCounter > 32) stuckCounter = 1;
      // Every 8 cycles, reset to next cardinal direction
      if (stuckCounter % 8 === 0) {
        var dirIdx = Math.floor((stuckCounter / 8) - 1) % 4;
        var dirAngle = dirIdx * Math.PI / 2;
        await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + dirAngle + ';c.pitch=-0.1;c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(-0.1, ' + dirAngle + ', 0, "YXZ");c.camera.quaternion.setFromEuler(euler);})()');
      }
      // Rotate camera to sweep
      await scanForEnemies(page);

    }
  }

  metrics.duration = (Date.now() - startTime) / 1000;
  metrics.kills = prevKills;
  metrics.ammoLeft = ammo;
  metrics.reserveLeft = reserve;
  return metrics;
}

// ─── CLICK PLAY AGAIN ─────────────────────────────────────────────────
async function clickPlayAgain(page) {
  await sleep(1500);
  try {
    var clicked = await page.evaluate(function() {
      var btn = document.getElementById('victory-restart');
      if (!btn) btn = document.querySelector('.victory-btn');
      if (!btn) {
        var all = document.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) {
          if (all[i].textContent.includes('PLAY AGAIN')) { btn = all[i]; break; }
        }
      }
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) {
      await waitForFrames(page, 5, 5000);
      return true;
    }
  } catch (e) {}
  return false;
}

// ─── ERROR CAPTURE ────────────────────────────────────────────────────
async function setupErrorCapture(page) {
  var errors = [];
  page.on('pageerror', function(e) { errors.push('PAGE: ' + e.message); });
  page.on('console', function(msg) {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });
  await page.evaluate(function() {
    window.__p3_errors = [];
    window.addEventListener('unhandledrejection', function(e) {
      window.__p3_errors.push('PROMISE: ' + (e.reason ? e.reason.message : String(e.reason)));
    });
  });
  return errors;
}

async function collectErrors(page) {
  var captured = await gameEval(page, 'window.__p3_errors || []');
  if (!Array.isArray(captured)) return [];
  return captured;
}

// ─── VERIFY RESTART STATE ─────────────────────────────────────────────
async function verifyRestartState(page) {
  var score = await gameEval(page, 'game.score');
  var hp = await gameEval(page, 'game.player.health');
  var ammo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
  var reserve = await gameEval(page, 'game.weaponController.currentWeapon.stats.reserveAmmo');
  var enemies = await gameEval(page, 'game.enemyManager.enemies.length');
  var waveState = await gameEval(page, 'game.waveManager.state');

  assert(score === 0, 'Score reset to 0 (was ' + score + ')');
  assert(hp === 100, 'HP reset to 100 (was ' + hp + ')');
  assert(ammo === 30, 'Ammo reset to 30 (was ' + ammo + ')');
  assert(reserve === 1500, 'Reserve ammo reset to 1500 (was ' + reserve + ')');
  assert(enemies === 0, 'Old enemies cleared (count=' + enemies + ')');
  assert(waveState === 'preparing', 'Wave manager in preparing state (was ' + waveState + ')');
}

// ─── MAIN ────────────────────────────────────────────────────────────
async function runPhase3() {
  console.log('');
  console.log('╔' + '═'.repeat(57) + '╗');
  console.log('║     PHASE 3 FINAL ACCEPTANCE — zero false positives    ║');
  console.log('╚' + '═'.repeat(57) + '╝');

  // ── PART 1: Real input ──
  console.log('\n▔'.repeat(59));
  console.log('PART 1: REAL INPUT ACCEPTANCE');
  console.log('▁'.repeat(59));
  var realInputPass = await runSubprocess('real-input-test.mjs', 'node', ['test/real-input-test.mjs'], 600000);

  // ── PART 2: Behavioral ──
  console.log('\n▔'.repeat(59));
  console.log('PART 2: BEHAVIORAL (bullet occlusion, enemy LOS, collision)');
  console.log('▁'.repeat(59));
  var behavioralPass = await runSubprocess('behavioral-tests.mjs', 'node', ['test/behavioral-tests.mjs'], 600000);

  // ── PART 3: Full 6-wave playthrough × 3 ──
  console.log('\n▔'.repeat(59));
  console.log('PART 3: FULL SIX-WAVE PLAYTHROUGH (3 runs to Victory)');
  console.log('▁'.repeat(59));

  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  var ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  var page = await ctx.newPage();
  var allErrors = await setupErrorCapture(page);

  var runResults = [];

  for (var runIdx = 1; runIdx <= 3; runIdx++) {
    var runLabel = 'Run' + runIdx;
    console.log('\n' + '-'.repeat(55));
    console.log('  ' + runLabel + ' of 3');
    console.log('-'.repeat(55));

    if (runIdx === 1) {
      // Load game fresh
      console.log('   Loading game...');
      await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
      await sleep(500);
      await page.click('#start-btn');
      await sleep(1000);
      var hasGame = await gameEval(page, 'true');
      if (!hasGame) { console.log('   FATAL: Game not started'); OVERALL_PASS = false; break; }
      var framesOk = await waitForFrames(page, 3, 10000);
      console.log('   Game loaded, frames: ' + framesOk);
    } else {
      // Fresh page for clean state (close old, open new)
      console.log('   Opening fresh page for clean state...');
      await page.close();
      page = await ctx.newPage();
      allErrors = await setupErrorCapture(page);
      await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
      await sleep(500);
      await page.click('#start-btn');
      await sleep(1000);
      var hasGame = await gameEval(page, 'true');
      if (!hasGame) { console.log('   FATAL: Game not started'); OVERALL_PASS = false; break; }
      await lockPointer(page);
      await gameEval(page, 'game.dtCap = 0.5');
    }

    // Run the playthrough
    var result = await playThrough(page, runLabel, runIdx);
    runResults.push(result);

    // Print result
    console.log('\n   [' + runLabel + '] === RESULT ===');
    console.log('   Victory: ' + (result.reachedVictory ? 'YES' : 'NO'));
    console.log('   Waves completed: ' + result.wavesCompleted + '/6');
    console.log('   Kills: ' + result.kills + ', Deaths: ' + result.deaths);
    console.log('   Duration: ' + result.duration.toFixed(1) + 's');
    console.log('   Reloads: ' + result.reloadCount + ', Ammo pickups: ' + result.ammoPickups);
    console.log('   Min HP: ' + result.minPlayerHp + ', DMG taken: ' + result.damageReceived.toFixed(0));

    // Collect runtime errors
    var errs = await collectErrors(page);
    for (var ei = 0; ei < errs.length; ei++) allErrors.push(errs[ei]);

    // Write JSON result
    var resultPath = path.join(RESULT_DIR, 'phase3-run-' + runIdx + '.json');
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  }

  await browser.close();

  // ── FINAL REPORT ──
  console.log('\n' + '='.repeat(59));
  console.log('   PHASE 3 ACCEPTANCE RESULTS');
  console.log('='.repeat(59));

  console.log('\n   Sub-suites:');
  assert(realInputPass, 'Real input acceptance');
  assert(behavioralPass, 'Behavioral tests (occlusion, LOS, collision)');

  console.log('\n   Playthrough runs:');
  for (var ri = 0; ri < runResults.length; ri++) {
    var r = runResults[ri];
    assert(r.reachedVictory, 'Run ' + (ri + 1) + ': Reached Victory (waves=' + r.wavesCompleted + ', kills=' + r.kills + ')');
    assert(r.deaths === 0, 'Run ' + (ri + 1) + ': Zero deaths (had ' + r.deaths + ')');
  }

  console.log('\n   Runtime errors:');
  assert(allErrors.length === 0, 'Zero unexpected runtime errors (count=' + allErrors.length + ')');
  if (allErrors.length > 0) {
    allErrors.slice(0, 5).forEach(function(e) { console.log('     ' + e); });
  }

  console.log('\n   Summary table:');
  var gates = [
    ['Real input', realInputPass],
    ['Collision', behavioralPass],
    ['Player bullet occlusion', behavioralPass],
    ['Enemy LOS', behavioralPass]
  ];
  for (var rii = 0; rii < runResults.length; rii++) {
    gates.push(['Run ' + (rii + 1) + ' Victory', runResults[rii].reachedVictory]);
    gates.push(['Run ' + (rii + 1) + ' zero deaths', runResults[rii].deaths === 0]);
  }
  gates.push(['Runtime errors', allErrors.length === 0]);

  console.log('   | ' + 'Gate'.padEnd(30) + ' | Result |');
  console.log('   | ' + '-'.repeat(30) + ' | ------ |');
  for (var gi = 0; gi < gates.length; gi++) {
    var label = gates[gi][0], pass = gates[gi][1];
    console.log('   | ' + label.padEnd(30) + ' | ' + (pass ? 'PASS' : 'FAIL') + '   |');
  }

  console.log('\n   Wave timing:');
  for (var riii = 0; riii < runResults.length; riii++) {
    var rr = runResults[riii];
    console.log('   Run ' + (riii + 1) + ': ' + rr.duration.toFixed(1) + 's total, ' + rr.wavesCompleted + '/6 waves');
    if (rr.waveTimes) {
      var wn = Object.keys(rr.waveTimes).sort(function(a,b) { return parseInt(a) - parseInt(b); });
      for (var wi = 0; wi < wn.length; wi++) {
        var w = rr.waveTimes[wn[wi]];
        if (w.duration) console.log('     Wave ' + wn[wi] + ': ' + w.duration + 's');
      }
    }
  }

  if (OVERALL_PASS) {
    console.log('\n[PHASE 3 PASS] All acceptance gates passed.');
    process.exit(0);
  } else {
    console.log('\n[PHASE 3 FAIL] Some gates did not pass.');
    process.exit(1);
  }
}

runPhase3().catch(function(err) { console.error('[FATAL] ' + err.message); process.exit(1); });
