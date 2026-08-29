import { chromium } from 'playwright';
const URL = 'http://localhost:3005';

async function main() {
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox','--use-gl=swiftshader']});
  const page = await browser.newPage();
  await page.setViewportSize({width: 800, height: 600});
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  await page.goto(URL, {timeout: 15000});
  await page.waitForSelector('#start-btn', {timeout: 10000});
  await page.click('#start-btn');
  await page.waitForTimeout(1000);
  await page.evaluate('game.dtCap = 0.5');
  await page.evaluate('window.game.input.locked = true');

  for (let i = 0; i < 50; i++) {
    var alive = await page.evaluate(() => {
      try { var g = window.game; var c = 0; for (var j=0;j<g.enemyManager.enemies.length;j++) { if (g.enemyManager.enemies[j].alive) c++; } return c; } catch(e) { return -1; }
    });
    if (alive > 0) break;
    await new Promise(r => setTimeout(r, 200));
  }

  var prevShots = 0, prevHits = 0;
  var t0 = await page.evaluate('window.game.weaponController.telemetry');
  if (t0) { prevShots = t0.shotsFired || 0; prevHits = t0.hits || 0; }

  for (var si = 0; si < 10; si++) {
    var target = await page.evaluate(() => {
      try {
        var g = window.game;
        var es = g.enemyManager.enemies;
        var p = g.player.position;
        var best = null, bd = Infinity;
        for (var j = 0; j < es.length; j++) {
          if (!es[j].alive) continue;
          var d = Math.hypot(es[j].mesh.position.x - p.x, es[j].mesh.position.z - p.z);
          if (d < bd) { bd = d; best = es[j]; }
        }
        if (!best) return null;
        return { x: best.mesh.position.x, z: best.mesh.position.z, type: best.type, dist: bd };
      } catch(e) { return null; }
    });

    if (!target) { console.log('No target at shot', si); break; }

    await page.evaluate(function(args) {
      try {
        var g = window.game;
        var px = g.player.position.x, pz = g.player.position.z;
        var dx = args.x - px, dz = args.z - pz;
        var d = Math.hypot(dx, dz);
        if (d < 0.5) return;
        var y = -Math.atan2(dx, -dz);
        var p = Math.atan2(1.25 - 1.7, d);
        var c = g.camera;
        c.yaw = y; c.pitch = p;
        c.velocity.yaw = 0; c.velocity.pitch = 0;
        c.shakeAmount = 0;
        c.shakeOffset.set(0, 0, 0);
        c.camera.quaternion.setFromEuler(new THREE.Euler(p, y, 0, 'YXZ'));
      } catch(e) { console.error('aim err:', e.message); }
    }, { x: target.x, z: target.z });

    await page.mouse.down();
    await new Promise(r => setTimeout(r, 30));
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 70));

    var telem = await page.evaluate('window.game.weaponController.telemetry');
    if (telem) {
      var sDiff = telem.shotsFired - prevShots;
      var hDiff = telem.hits - prevHits;
      console.log('Shot ' + (si+1) + ': ' + (sDiff > 0 ? (hDiff > 0 ? 'HIT' : 'MISS') : 'NOFIRE') + ' target=' + target.type + '@' + target.dist.toFixed(1) + 'm');
      prevShots = telem.shotsFired;
      prevHits = telem.hits;
    }
  }

  console.log('\nTotal: ' + (prevShots - (t0 ? t0.shotsFired || 0 : 0)) + ' shots, ' +
    (prevHits - (t0 ? t0.hits || 0 : 0)) + ' hits');
  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
