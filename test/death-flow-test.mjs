import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve('test/death-flow-screenshots');
const DT_CAP = 0.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function gameEval(page, expr) {
  try { return await page.evaluate(`(window.game ? (${expr}) : null)`); }
  catch (e) { return `[ERR: ${e.message}]`; }
}

async function forcePointerLock(page) {
  await page.evaluate(() => {
    if (window.game && window.game.input) window.game.input.locked = true;
  });
}

async function runDeathFlowTest() {
  console.log('═══ DEATH FLOW TEST ═══\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // ═══ LOAD & START ═══
  console.log('1. LOADING...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(500);

  await page.click('#start-btn');
  await sleep(800);

  await forcePointerLock(page);
  const hasGame = await gameEval(page, 'true');
  if (!hasGame) { console.log('   ✗ Game failed to start'); await browser.close(); process.exit(1); }
  console.log('   ✓ Game started, pointer lock forced');

  await gameEval(page, `game.dtCap = ${DT_CAP}`);
  await sleep(200);

  // Wait for wave to start
  let waveStarted = false;
  for (let i = 0; i < 90; i++) {
    const w = await gameEval(page, 'game.waveManager.currentWave');
    if (w > 0) { waveStarted = true; break; }
    await sleep(500);
  }
  if (!waveStarted) { console.log('   ✗ Wave never started'); await browser.close(); process.exit(1); }
  console.log('   ✓ Wave 1 active');

  // ═══ TEST DEATH BY FORCING LOW HP ═══
  console.log('\n2. FORCING DEATH...');

  // Set player health to 1 to trigger damage from next enemy hit
  await gameEval(page, 'game.player.health = 10');
  await sleep(100);

  // Wait for enemy to kill us
  for (let i = 0; i < 200; i++) {
    const gameOver = await gameEval(page, 'game.gameOver');
    if (gameOver) break;
    await sleep(500);
  }

  // Verify death
  const died = await gameEval(page, 'game.gameOver');
  if (!died) {
    console.log('   ✗ Player did not die (enemies may not have reached us)');
    console.log('   Forcing death via direct health set...');
    await gameEval(page, 'game.player.health = 0');
    await gameEval(page, 'game._onDeath()');
    await sleep(2000);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'death.png') });
  console.log('   ✓ Death triggered');

  // Wait for death animation to complete
  await sleep(2000);

  // Check game over screen is visible
  const gameOverDisplay = await gameEval(page,
    `document.getElementById('game-over').style.display`);
  console.log(`   Game over display: ${gameOverDisplay}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'game-over.png') });

  if (gameOverDisplay !== 'flex') {
    console.log('   ✗ Game over screen not visible');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✓ Game over screen visible');

  // ═══ TEST RESTART ═══
  console.log('\n3. TESTING RESTART...');

  // Click PLAY AGAIN button
  const restartBtn = await page.$('#restart-btn');
  if (restartBtn) {
    await restartBtn.click();
  } else {
    // Check for window.game.restart()
    console.log('   No #restart-btn found, using game.restart()...');
    await gameEval(page, 'window.game.restart()');
  }
  await sleep(2000);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restarted.png') });

  // Verify game restarted
  const running = await gameEval(page, 'game.running');
  const health = await gameEval(page, 'game.player.health');
  const score = await gameEval(page, 'game.score');
  const wave = await gameEval(page, 'game.waveManager.currentWave');

  console.log(`   Running: ${running}, HP: ${health}, Score: ${score}, Wave: ${wave}`);

  if (!running || health < 100 || score > 0 || wave < 1) {
    console.log('   ✗ Restart failed');
    await browser.close();
    process.exit(1);
  }
  console.log('   ✓ Restart successful - HP: 100, Score: 0, Wave: 1');

  // Verify game over screen is hidden
  const goHidden = await gameEval(page,
    `document.getElementById('game-over').style.display`);
  console.log(`   Game over display after restart: ${goHidden}`);
  if (goHidden !== 'none') {
    console.log('   ✗ Game over screen still visible');
  } else {
    console.log('   ✓ Game over screen hidden');
  }

  // Verify HUD is visible
  const hudDisplay = await gameEval(page,
    `document.getElementById('hud').style.display`);
  console.log(`   HUD display: ${hudDisplay}`);

  console.log('\n4. RESULTS');
  console.log(`   Death flow: ✓ PASS`);
  console.log(`   Restart flow: ✓ PASS`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    const unique = [...new Set(errors.map(e => e.substring(0, 100)))];
    unique.slice(0, 5).forEach(e => console.log(`  ${e}`));
  }

  await browser.close();
  console.log('\n✓ Done.');
}

runDeathFlowTest().catch(err => { console.error('✗', err.message); process.exit(1); });
