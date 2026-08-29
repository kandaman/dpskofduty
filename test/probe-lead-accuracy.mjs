/**
 * Lead-aim accuracy probe — measures per-shot hit rate for lead=0 vs lead=0.15
 * against live wave-1 enemies. Runs its own dev server on :3005.
 *
 *   node test/probe-lead-accuracy.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URL = 'http://localhost:3005';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureServer() {
  try { await fetch(URL, { signal: AbortSignal.timeout(2000) }); return null; } catch (e) {}
  const proc = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '3005', '--strictPort', '--no-open'], { cwd: ROOT, stdio: 'ignore' });
  for (var i = 0; i < 60; i++) {
    try { await fetch(URL, { signal: AbortSignal.timeout(1000) }); return proc; } catch (e) { await sleep(500); }
  }
  throw new Error('server failed to start');
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({
    headless: false, // match the WATCH=1 acceptance regime (real GPU, 60fps)
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  // Fake pointer lock (see real-input-test.mjs — real lock fails under
  // automation and resets input.locked, which blocks firing)
  await ctx.addInitScript(function() {
    if (Element.prototype.requestPointerLock) Element.prototype.requestPointerLock = function() {};
  });
  const page = await ctx.newPage();

  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1000);
  await page.evaluate(() => document.getElementById('start-btn')?.click());
  await page.waitForFunction(() => window.game?.running, { timeout: 15000 });
  await sleep(2000); // level build
  await page.evaluate(() => { game.dtCap = 0.3; game.input.locked = true; });

  // Wait for wave 1
  for (var i = 0; i < 60; i++) {
    var w = await page.evaluate('game.waveManager.currentWave');
    if (w > 0) break;
    await sleep(500);
  }
  console.log('Wave active:', await page.evaluate('game.waveManager.currentWave'));

  // Wait for enemies to actually spawn
  for (var i = 0; i < 40; i++) {
    var n = await page.evaluate('game.enemyManager.enemies.filter(e=>e.alive).length');
    if (n > 0) break;
    await sleep(500);
  }
  console.log('alive enemies:', await page.evaluate('game.enemyManager.enemies.filter(e=>e.alive).length'));

  // Give the player a big HP pool so the test can run long
  await page.evaluate(() => { game.player.maxHealth = 100000; game.player.health = 100000; });

  var variants = { 'lead0': { hits: 0, shots: 0 }, 'lead005': { hits: 0, shots: 0 }, 'lead010': { hits: 0, shots: 0 } };
  var lastHits = await page.evaluate('(function(){var k=0;var ee=game.enemyManager.enemies;for(var i=0;i<ee.length;i++){if(ee[i].telemetry)k+=ee[i].telemetry.hits;}return k;})()');
  console.log('starting total enemy hits:', lastHits);

  var order = [];
  for (var s = 0; s < 60; s++) order.push(['lead0','lead005','lead010'][s % 3]);

  for (var s = 0; s < order.length; s++) {
    var v = order[s];
    var lead = v === 'lead0' ? 0 : (v === 'lead005' ? 0.05 : 0.1);

    // Read nearest alive enemy with velocity + its health (hit = HP drop)
    var live = await page.evaluate('(function(){var g=window.game;var pp=g.player.position;var best=null,bd=Infinity;var ee=g.enemyManager.enemies;for(var i=0;i<ee.length;i++){var e=ee[i];if(e&&e.alive){var d=pp.distanceTo(e.position);if(d<bd){bd=d;best={x:e.position.x,z:e.position.z,vx:e.velocity.x,vz:e.velocity.z,hp:e.health};}}}return best;})()');
    if (!live) { console.log('no enemies — stopping at shot', s); break; }

    // Aim with lead
    await page.evaluate('(function(){var g=window.game;var px=g.player.position.x,pz=g.player.position.z;var tx=' + (live.x + live.vx * lead) + ',tz=' + (live.z + live.vz * lead) + ';var dx=tx-px,dz=tz-pz;var dist=Math.sqrt(dx*dx+dz*dz);if(dist<0.5)return;var yaw=-Math.atan2(dx,-dz);var pitch=Math.atan2(1.25-1.7,dist);var c=g.camera;c.yaw=yaw;c.pitch=pitch;c.velocity.yaw=0;c.velocity.pitch=0;c.shakeAmount=0;c.shakeOffset.set(0,0,0);c.rollAmount=0;c.bobOffset.set(0,0,0);c.bobSpeed=0;var e=new THREE.Euler(pitch,yaw,0,"YXZ");c.camera.quaternion.setFromEuler(e);})()');
    await sleep(30);

    var before = await page.evaluate('(function(){var g=window.game;var ee=g.enemyManager.enemies;var best=null,bd=Infinity;var pp=g.player.position;for(var i=0;i<ee.length;i++){var e=ee[i];if(e&&e.alive){var d=pp.distanceTo(e.position);if(d<bd){bd=d;best=e.health;}}}return best;})()');
    await page.mouse.down();
    await sleep(30);
    await page.mouse.up();
    await sleep(120); // fireCooldown 80ms + margin

    var after = await page.evaluate('(function(){var g=window.game;var ee=g.enemyManager.enemies;var best=null,bd=Infinity;var pp=g.player.position;for(var i=0;i<ee.length;i++){var e=ee[i];if(e&&e.alive){var d=pp.distanceTo(e.position);if(d<bd){bd=d;best=e.health;}}}return best;})()');
    var hit = (after < before) ? 1 : 0;
    if (after === null) hit = 1; // enemy died from the shot — counts as a hit
    variants[v].shots++;
    variants[v].hits += hit;

    var dist = await page.evaluate('game.player.position.distanceTo(game.enemyManager.enemies.filter(e=>e.alive)[0]?.position || game.player.position)');
    console.log('shot', s, v, 'hit=' + hit, 'dist=' + dist.toFixed(1));

    // Keep HP topped up
    await page.evaluate(() => { game.player.health = game.player.maxHealth; });
    await sleep(200);
  }

  console.log('\n=== LEAD ACCURACY PROBE ===');
  for (var k in variants) {
    var r = variants[k];
    console.log(k + ': ' + r.hits + ' hits / ' + r.shots + ' shots = ' + (r.shots ? (r.hits / r.shots * 100).toFixed(1) : '0') + '%');
  }

  await browser.close();
  if (server) server.kill();
  process.exit(0);
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
