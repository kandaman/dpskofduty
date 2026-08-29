import { chromium } from 'playwright';
const URL = 'http://localhost:3005';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ge(page, expr) { try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); } catch (e) { return "[ERR]"; } }

async function run() {
  console.log('═══ AIM PRECISION DIAGNOSTIC ═══\n');
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

  for (var testNum = 1; testNum <= 5; testNum++) {
    var enemies = await ge(page, 'game.enemyManager.getActiveEnemies().length');
    console.log('\n── Test ' + testNum + ': enemies=' + enemies + ' ──');

    // Get enemy position
    var enemy = await ge(page, '(function(){var ee=game.enemyManager.getActiveEnemies();if(!ee||ee.length===0)return null;var e=ee[0];return{x:e.position.x,z:e.position.z,hp:e.health,type:e.type};})()');
    if (!enemy) { console.log('   No enemies'); break; }

    var player = await ge(page, '({x:game.player.position.x,z:game.player.position.z})');
    var dx = enemy.x - player.x, dz = enemy.z - player.z;
    var dist = Math.hypot(dx, dz);

    // ═══ 1. Aim using the EXACT same code as acceptance test ═══
    var yaw = -Math.atan2(dx, -dz);
    var pitch = Math.atan2(0.8 - 1.7, dist); // torso aim

    await page.evaluate(function(args) {
      var c = window.game.camera;
      c.yaw = args.y;
      c.pitch = args.p;
      c.velocity.yaw = 0;
      c.velocity.pitch = 0;
      var euler = new THREE.Euler(args.p, args.y, 0, 'YXZ');
      c.camera.quaternion.setFromEuler(euler);
      window.game.input.locked = true;
    }, { y: yaw, p: pitch });

    // ═══ 2. Check camera direction matches enemy direction ═══
    var camDir = await ge(page, 'game.camera.getWorldDirection()');
    var expectedDir = await ge(page, '(function(){var dx=' + enemy.x + '-game.player.position.x;var dz=' + enemy.z + '-game.player.position.z;var d=Math.hypot(dx,dz);return{x:dx/d,y:0,z:dz/d};})()');
    if (camDir && expectedDir) {
      var dot = camDir.x * expectedDir.x + camDir.z * expectedDir.z;
      var angleDeg = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
      console.log('   Cam→enemy angle: ' + angleDeg.toFixed(2) + '°');
      if (angleDeg < 5) console.log('   ✓ Aim aligned with enemy');
      else console.log('   ✗ Aim MISALIGNED!');
    }

    // ═══ 3. Fire ONE shot with fresh aim ═══
    await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0,damageDealt:0}');
    await ge(page, 'game.weaponController.fire()');
    await sleep(200);

    var tel = await ge(page, 'game.weaponController.telemetry');
    var enemyAfter = await ge(page, '(function(){var ee=game.enemyManager.getActiveEnemies();if(!ee||ee.length===0)return null;var e=ee[0];return{x:e.position.x,z:e.position.z,hp:e.health,alive:e.alive};})()');
    console.log('   Shots: ' + tel.shotsFired + ', Hits: ' + tel.hits + ', Damage: ' + tel.damageDealt);
    console.log('   Enemy HP: ' + (enemyAfter ? enemyAfter.hp : 'dead') + ' alive=' + (enemyAfter ? enemyAfter.alive : false));

    if (tel.hits > 0) {
      console.log('   ✓ SHOT HIT!');
    } else {
      console.log('   ✗ SHOT MISSED!');

      // ═══ 4. If missed, check what the bullet hit ═══
      // Fire another shot with a raycast check
      var raycaster = await ge(page, '(function(){var g=window.game;var c=g.camera;var dir=new THREE.Vector3(0,0,-1).applyQuaternion(c.camera.quaternion);var ray=new THREE.Raycaster(c.camera.position,dir);var obs=[];g.scene.traverse(function(m){if(m.isMesh&&m.userData&&m.userData.isObstacle)obs.push(m);});var hits=ray.intersectObjects(obs,false);if(hits.length===0)return{hit:false};var first=hits[0];return{hit:true,d:first.distance.toFixed(2),name:first.object.name||first.object.geometry.type};})()');
      if (raycaster && raycaster.hit) {
        console.log('   Bullet hit: "' + raycaster.name + '" at ' + raycaster.d + 'm');
      } else {
        console.log('   Bullet hit nothing (no obstacles in path)');
      }

      // Check if enemy is even visible
      var los = await ge(page, '(function(){var g=window.game;var origin=g.camera.position.clone();var ee=g.enemyManager.getActiveEnemies();if(!ee||ee.length===0)return false;var e=ee[0];var dir=new THREE.Vector3(' + enemy.x + '-origin.x,' + enemy.z + '-origin.z,0);if(dir.length()<1)return false;dir.z=dir.y;dir.y=0;dir.normalize();var ray=new THREE.Raycaster(origin,dir);var obs=[];g.scene.traverse(function(m){if(m.isMesh&&m.userData&&m.userData.isObstacle)obs.push(m);});var hits=ray.intersectObjects(obs,false);var dist=Math.sqrt(' + dx + '*' + dx + '+' + dz + '*' + dz + ');for(var i=0;i<hits.length;i++){if(hits[i].distance<dist)return false;}return true;})()');
      console.log('   LOS to enemy: ' + (los ? 'CLEAR' : 'BLOCKED'));
    }
  }

  await browser.close();
  console.log('\nDone.');
}
run().catch(function(e) { console.error('ERR:', e.message); process.exit(1); });
