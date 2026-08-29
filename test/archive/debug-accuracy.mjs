import { chromium } from 'playwright';
const URL = 'http://localhost:3005';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function ge(page, expr) { try { return await page.evaluate("(window.game ? (" + expr + ") : null)"); } catch (e) { return "[ERR]"; } }

async function run() {
  console.log('═══ STATIONARY COMBAT TEST ═══\n');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(1500);
  await ge(page, 'game.dtCap = 0.5');
  await page.evaluate(function() { window.game.input.locked = true; });

  // Wait for enemies
  for (var i = 0; i < 200; i++) {
    var c = await ge(page, 'game.enemyManager.getActiveEnemies().length');
    if (c > 0) break;
    await sleep(200);
  }

  // Check initial bob
  var init = await ge(page, '({bobY:game.camera.bobOffset.y,bobSpeed:game.camera.bobSpeed,px:game.player.position.x,pz:game.player.position.z})');
  console.log('Initial: ' + JSON.stringify(init));

  // Reset telemetry
  await ge(page, 'game.weaponController.telemetry={shotsFired:0,hits:0,headshots:0,damageDealt:0}');

  // Test: NEVER move. Just aim and fire.
  var cycle = 0;
  while (true) {
    var s = await ge(page, '(function(){var g=window.game;var ee=g.enemyManager.getActiveEnemies();if(!ee||!ee[0])return null;var e=ee[0];return{tx:e.position.x,tz:e.position.z,px:g.player.position.x,pz:g.player.position.z};})()');
    if (!s) { var killed = await ge(page, 'game.enemyManager.killCount'); if (killed > 0) { console.log('\nAll enemies killed!'); } else { console.log('\nNo enemies'); } break; }

    // Aim at head (NO movement keys ever pressed)
    var dx = s.tx - s.px, dz = s.tz - s.pz;
    var dist = Math.hypot(dx, dz);
    var yaw = -Math.atan2(dx, -dz);
    var pitch = Math.atan2(1.3 - 1.7, dist);
    await ge(page, '(function(){var c=window.game.camera;c.yaw=' + yaw + ';c.pitch=' + pitch + ';c.velocity.yaw=0;c.velocity.pitch=0;var euler=new THREE.Euler(' + pitch + ',' + yaw + ',0,"YXZ");c.camera.quaternion.setFromEuler(euler);return true;})()');

    // Fire via direct input
    await page.evaluate(function() { window.game.input.mouse.buttons[0] = 1; window.game.input.mouse.buttons[2] = 1; window.game.input.locked = true; });
    await sleep(120);
    await page.evaluate(function() { window.game.input.mouse.buttons[0] = 0; window.game.input.mouse.buttons[2] = 0; });

    cycle++;
    var tel = await ge(page, 'game.weaponController.telemetry');
    var bob = await ge(page, '({bobY:game.camera.bobOffset.y,bobSpeed:game.camera.bobSpeed})');
    var hp = await ge(page, 'game.player.health');
    process.stdout.write('\r   Cycle ' + cycle + ': ' + tel.shotsFired + ' shots, ' + tel.hits + ' hits, HP=' + hp + ' bob=' + bob.bobY + ' ');

    if (hp <= 0 || cycle > 60) break;
  }

  var tel = await ge(page, 'game.weaponController.telemetry');
  var ps = await ge(page, '({px:game.player.position.x,pz:game.player.position.z,hp:game.player.health,ak:game.enemyManager.killCount})');
  console.log('\n\n=== RESULTS ===');
  console.log('Final: ' + JSON.stringify(tel) + ' state=' + JSON.stringify(ps));
  if (tel.shotsFired > 0) console.log('Accuracy: ' + (tel.hits / tel.shotsFired * 100).toFixed(1) + '%');
  console.log('Cycles: ' + cycle + ' Kills: ' + ps.ak);
  await browser.close();
  console.log('\nDone.');
}
run().catch(function(e) { console.error('ERR:', e.message); process.exit(1); });
