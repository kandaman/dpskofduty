// ─── KITE RUSHER DIAGNOSTIC ──────────────────────────────────────
// Runs the bot through Wave 1 into Wave 2 and diagnoses KITE_RUSHER
import { chromium } from 'playwright';
import { MovementController } from './movement-controller.mjs';
import { findBestEscapeHeading, DISTANCE_ZONES } from './threat-manager.mjs';

const URL = 'http://localhost:3005';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gameEval(page, expr) {
  try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); }
  catch (e) { return "[ERR: " + e.message + "]"; }
}

async function aimDirection(page, yaw, pitch) {
  await gameEval(page, '(function(){var c=window.game.camera;c.yaw=' + yaw + ';c.pitch=' + (pitch || 0) + ';var euler=new THREE.Euler(' + (pitch || 0) + ',' + yaw + ',0,"YXZ");c.camera.quaternion.setFromEuler(euler);})()');
}

async function aimAt(page, tx, tz) {
  var str = '(function(){var px=game.player.position.x,pz=game.player.position.z;var dx=' + tx + '-px,dz=' + tz + '-pz;var dist=Math.sqrt(dx*dx+dz*dz);if(dist<0.5)return false;var yaw=-Math.atan2(dx,-dz);var pitch=Math.atan2(1.3-1.7,dist);var c=window.game.camera;c.yaw=yaw;c.pitch=pitch;c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(pitch,yaw,0,"YXZ");c.camera.quaternion.setFromEuler(euler);return true;})()';
  return await gameEval(page, str);
}

async function main() {
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox','--use-gl=swiftshader']});
  const page = await browser.newPage();
  await page.setViewportSize({width: 800, height: 500});
  await page.goto(URL, {timeout: 30000});
  await page.click('#start-btn');
  await sleep(1500);
  await page.evaluate(() => { window.game.input.locked = true; });
  await page.evaluate('game.dtCap = 0.3');
  await sleep(500);

  // Wait for Wave 2
  var currentWave = 0;
  for (let i = 0; i < 120; i++) {
    var ws = await gameEval(page, 'game.waveManager.state');
    var cw = await gameEval(page, 'game.waveManager.currentWave');
    if (ws === 'active' && cw >= 1) currentWave = cw;
    if (cw >= 2 && ws === 'active') { console.log('Wave 2 active!'); break; }
    await sleep(500);
  }
  if (currentWave < 2) {
    console.log('Didnt reach Wave 2, running at Wave', currentWave);
  }

  const mc = new MovementController(page);

  // Find rusher
  for (let i = 0; i < 30; i++) {
    var enemies = await gameEval(page, '(function(){var ee=game.enemyManager.enemies;var out=[];for(var i=0;i<ee.length;i++){if(ee[i].alive)out.push({x:ee[i].position.x,z:ee[i].position.z,hp:ee[i].health,type:ee[i].type,dist:game.player.position.distanceTo(ee[i].position)});}return out;})()');
    var rusher = enemies ? enemies.find(e => e.type === 'rusher') : null;
    var player = await gameEval(page, '({x:game.player.position.x,z:game.player.position.z})');

    if (!rusher || !enemies) {
      console.log('No enemies, waiting...');
      await sleep(500);
      continue;
    }

    console.log('\n--- Bot iteration ' + i + ' ---');
    console.log('Player: (' + player.x.toFixed(1) + ', ' + player.z.toFixed(1) + ')');
    console.log('Rusher: (' + rusher.x.toFixed(1) + ', ' + rusher.z.toFixed(1) + ') d=' + rusher.dist.toFixed(1) + 'm');

    // If rusher is close, enter KITE_RUSHER
    if (rusher.dist < 12 && rusher.type === 'rusher') {
      console.log('KITE_RUSHER mode!');

      // Escape heading
      var heading = findBestEscapeHeading(
        {x: player.x, z: player.z},
        enemies,
        [],
        {xMin: -19, xMax: 19, zMin: -19, zMax: 19}
      );
      console.log('Escape heading: ' + (heading * 180 / Math.PI).toFixed(0) + '°');

      // Check wall distance
      var testX = player.x + Math.sin(heading) * 12;
      var testZ = player.z - Math.cos(heading) * 12;
      var distToEdgeX = Math.min(Math.abs(testX - (-19)), Math.abs(testX - 19));
      var distToEdgeZ = Math.min(Math.abs(testZ - (-19)), Math.abs(testZ - 19));
      console.log('Wall dist after 1.5s: X=' + distToEdgeX.toFixed(1) + 'm, Z=' + distToEdgeZ.toFixed(1) + 'm');

      if (distToEdgeX < 6 || distToEdgeZ < 6) {
        console.log('WALL DETECTED! Would collide within 6m.');
      }

      // Set heading and sprint
      await aimDirection(page, heading, 0);
      await mc.setMovement({ forward: true, sprint: true });

      await sleep(500);

      // Check velocity
      var vel = await gameEval(page, '({x:game.player.velocity.x,z:game.player.velocity.z})');
      var speed = Math.hypot(vel.x, vel.z);
      var isSprint = await gameEval(page, 'game.player.isSprinting');
      var player2 = await gameEval(page, '({x:game.player.position.x,z:game.player.position.z})');
      console.log('After 500ms sprint:');
      console.log('  pos=(' + player2.x.toFixed(1) + ',' + player2.z.toFixed(1) + ')');
      console.log('  speed=' + speed.toFixed(2) + ' sprint=' + isSprint);
      var distChange = Math.hypot(player2.x - rusher.x, player2.z - rusher.z) - rusher.dist;
      console.log('  dist change vs rusher: ' + (distChange > 0 ? '+' : '') + distChange.toFixed(1) + 'm');

      // Now fire phase - aim at target, keep forward, no sprint
      console.log('\nFire phase:');
      await mc.setMovement({ forward: true, sprint: false });
      await aimAt(page, rusher.x, rusher.z);
      await page.mouse.down();
      await sleep(60);
      await page.mouse.up();

      var ammo = await gameEval(page, 'game.weaponController.currentWeapon.ammo');
      console.log('Ammo after shot: ' + ammo);

      // Check if sprint-block cleared
      var sprintBlocked = await gameEval(page, 'game.weaponController ? game.weaponController.isSprintBlocked : false');
      console.log('isSprintBlocked: ' + sprintBlocked);

    } else {
      // Walk toward enemy
      var eHeading = Math.atan2(enemies[0].x - player.x, enemies[0].z - player.z);
      await aimDirection(page, eHeading, 0);
      await mc.setMovement({ forward: true });
      await sleep(500);
    }
  }

  await mc.releaseAll();
  await browser.close();
  console.log('\nDiagnostic complete');
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
