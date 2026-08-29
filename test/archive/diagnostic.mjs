import { chromium } from 'playwright';
import { spawn } from 'child_process';

const URL = 'http://localhost:3005';

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  var browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  var ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  var page = await ctx.newPage();

  page.on('pageerror', function(e) { console.log('[PAGE ERROR] ' + e.message); });
  page.on('console', function(msg) {
    if (msg.type() === 'error') console.log('[CONSOLE ERROR] ' + msg.text());
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await sleep(500);
  await page.click('#start-btn');
  await sleep(1000);

  var hasGame = await gameEval(page, 'true');
  console.log('Game loaded: ' + hasGame);

  // Set dtCap
  await gameEval(page, 'game.dtCap = 0.5');

  // Lock pointer
  await page.evaluate(function() {
    var g = window.game;
    if (!g || !g.input) return;
    g.input.locked = true;
    document.removeEventListener('pointerlockchange', g.input._onPointerLockChange);
  });

  // Wait for wave 1
  for (var i = 0; i < 40; i++) {
    var waveState = await gameEval(page, 'game.waveManager.state');
    var currentWave = await gameEval(page, 'game.waveManager.currentWave');
    if (waveState === 'active' && currentWave >= 1) {
      console.log('Wave 1 active (iteration ' + i + ')');
      break;
    }
    await sleep(500);
  }

  // Setup player
  await gameEval(page, '(function(){var g=window.game;if(!g)return;g.player.position.set(10,0,0);g.player.velocity.set(0,0,0);g.player.health=100;g.camera.yaw=0;g.camera.pitch=0;g.camera.velocity.yaw=0;g.camera.velocity.pitch=0;})()');
  await gameEval(page, '(function(){var wc=game.weaponController;if(!wc||!wc.currentWeapon)return;wc.currentWeapon.ammo=30;wc.currentWeapon.stats.reserveAmmo=1500;})()');
  await waitForFrames(page, 5, 10000);

  // Diagnose every 2 seconds for 20 seconds
  for (var diag = 0; diag < 10; diag++) {
    var info = await gameEval(page, '(function(){var g=window.game;if(!g)return{err:"no game"};var em=g.enemyManager;var en=em?em.enemies.length:0;var al=em?em.enemies.filter(function(e){return e.alive}).length:0;var sq=em?g.waveManager.spawnQueue.length:"?";var er=g.waveManager.enemiesRemaining;var hp=g.player.health;var pp=g.player.position;var yaw=g.camera.yaw;var combatDir=g.combatDirector?g.combatDirector.playerLowHealthCount:0;var wm=g.waveManager;return{enemies:en,alive:al,queue:sq,remain:er,hp:hp,px:pp.x.toFixed(1),pz:pp.z.toFixed(1),yaw:yaw.toFixed(2),lowHpCount:combatDir.toFixed(1),state:wm.state,wave:wm.currentWave};})()');
    console.log('DIAG ' + diag + ': ' + JSON.stringify(info));
    await sleep(2000);
  }

  await browser.close();
}

main().catch(function(err) { console.error('[FATAL] ' + err.message); process.exit(1); });
