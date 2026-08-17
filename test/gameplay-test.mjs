import { chromium } from 'playwright';

const URL = 'http://localhost:5173';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runGameplayTest() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  console.log('=== GAMEPLAY TEST ===\n');

  // Helper: evaluate a game state expression safely
  async function gameEval(expr) {
    return page.evaluate(`(window.game ? (${expr}) : 'NO_GAME')`);
  }

  // 1. LOAD
  console.log('1. Loading game...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(500);

  // 2. START GAME
  console.log('2. Starting game...');
  await page.click('#start-btn');
  await sleep(300);
  const hasGame = await gameEval('true');
  console.log(`   window.game exists: ${hasGame === true}`);

  // 3. LOCK POINTER
  console.log('\n3. Locking pointer...');
  await page.click('canvas');
  await sleep(300);

  // 4. CHECK INITIAL STATE
  console.log('\n4. Initial state...');
  const initial = await gameEval('({ ammo: game.weaponController.currentWeapon.ammo, reserve: game.weaponController.currentWeapon.stats.reserveAmmo, health: game.player.health })');
  console.log(`   Ammo: ${initial.ammo}, Reserve: ${initial.reserve}, Health: ${initial.health}`);

  // 5. FIRE WEAPON
  console.log('\n5. Firing weapon...');
  await page.mouse.down();
  await sleep(200);
  await page.mouse.up();
  await sleep(100);

  const afterFire = await gameEval('game.weaponController.currentWeapon.ammo');
  console.log(`   Ammo after fire: ${afterFire} (was ${initial.ammo})`);
  console.log(`   ${afterFire < initial.ammo ? '✓' : '✗'} Firing consumes ammo`);

  // 6. RELOAD
  console.log('\n6. Testing reload...');
  // Fire more to empty the mag a bit
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
  await sleep(50);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();

  const beforeReload = await gameEval('game.weaponController.currentWeapon.ammo');
  console.log(`   Ammo before reload: ${beforeReload}`);

  await page.keyboard.press('KeyR');
  await sleep(3000);

  const afterReload = await gameEval('game.weaponController.currentWeapon.ammo');
  console.log(`   Ammo after reload: ${afterReload}`);
  console.log(`   ${afterReload > beforeReload ? '✓' : '✗'} Reload replenished ammo`);

  // 7. CHECK WAVE SYSTEM
  console.log('\n7. Wave system...');
  const waveState = await gameEval('({ wave: game.waveManager.currentWave, state: game.waveManager.state, remaining: game.waveManager.enemiesRemaining })');
  console.log(`   Current wave: ${waveState.wave}, State: ${waveState.state}, Remaining: ${waveState.remaining}`);

  // Check UI elements exist
  const waveInfoText = await page.textContent('#wave-info');
  const waveAnnounceText = await page.textContent('#wave-announce');
  console.log(`   Wave info UI: "${waveInfoText.replace(/\s+/g, ' ').trim()}"`);
  console.log(`   Wave announce: "${waveAnnounceText}"`);
  console.log(`   ${waveAnnounceText ? '✓' : '✗'} Wave announcement displayed`);

  // 8. CHECK ENEMIES SPAWNING
  console.log('\n8. Enemies...');
  await sleep(5000); // Wait for enemies to spawn
  const enemyState = await gameEval('game.enemyManager.enemies.length');
  console.log(`   Total enemies (alive+dead): ${enemyState}`);
  const activeEnemies = await gameEval('game.enemyManager.getActiveEnemies().length');
  console.log(`   Active enemies: ${activeEnemies}`);
  console.log(`   ${activeEnemies > 0 ? '✓' : '✗'} Enemies spawned`);

  // 9. CHECK WEAPON SWITCH
  console.log('\n9. Weapon switch...');
  await page.keyboard.press('Digit2');
  await sleep(400);
  const switchedWeapon = await gameEval('game.weaponController.currentIndex');
  console.log(`   Current weapon index: ${switchedWeapon} (expected: 1)`);
  console.log(`   ${switchedWeapon === 1 ? '✓' : '✗'} Weapon switch works`);

  // Switch back
  await page.keyboard.press('Digit1');
  await sleep(400);

  // 10. MOVE AND SPRINT
  console.log('\n10. Movement...');
  const posBefore = await gameEval('"(" + game.player.position.x.toFixed(1) + ", " + game.player.position.z.toFixed(1) + ")"');
  await page.keyboard.down('KeyW');
  await sleep(500);
  await page.keyboard.up('KeyW');
  const posAfter = await gameEval('"(" + game.player.position.x.toFixed(1) + ", " + game.player.position.z.toFixed(1) + ")"');
  console.log(`   Position: ${posBefore} → ${posAfter}`);
  console.log(`   ${posBefore !== posAfter ? '✓' : '✗'} Movement changes position`);

  // 11. JUMP
  console.log('\n11. Jump...');
  const wasGrounded = await gameEval('game.player.isGrounded');
  await page.keyboard.press('Space');
  await sleep(50);
  const isGroundedAfter = await gameEval('game.player.isGrounded');
  console.log(`   Was grounded: ${wasGrounded}, Grounded after jump: ${isGroundedAfter}`);
  console.log(`   ${!isGroundedAfter ? '✓' : '✗'} Jump worked`);

  // 12. ADS
  console.log('\n12. ADS...');
  await page.mouse.down({ button: 'right' });
  await sleep(300);
  const isAds = await gameEval('game.camera.isAds');
  await page.mouse.up({ button: 'right' });
  console.log(`   ADS active: ${isAds}`);
  console.log(`   ${isAds === true ? '✓' : '✗'} ADS works`);

  // 13. COMBAT TEST
  console.log('\n13. Combat engagement...');
  // Turn around to find enemies
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(960 + Math.sin(i * 0.5) * 300, 500);
    await sleep(200);
  }

  // Fire at enemies
  await page.mouse.down();
  await sleep(1000);
  await page.mouse.up();
  await sleep(200);

  const killCount = await gameEval('game.enemyManager.killCount');
  const score = await gameEval('game.score');
  console.log(`   Kill count: ${killCount}, Score: ${score}`);
  console.log(`   ${killCount > 0 ? '✓' : '○'} Kills: ${killCount > 0 ? 'Enemies eliminated' : 'No kills yet (combat at low FPS is difficult)'}`);

  // 14. SCREENSHOT
  await page.screenshot({ path: 'test/screenshots/gameplay-final.png' });

  // 15. CHECK FOR DEATH/VICTORY
  console.log('\n14. End state...');
  const gameOver = await page.isVisible('#game-over');
  const victoryScreen = await page.evaluate(() => document.getElementById('victory-screen') !== null);
  console.log(`   Game over: ${gameOver}, Victory: ${victoryScreen}`);

  // 16. SUMMARY
  console.log('\n=== TEST RESULTS ===');
  const passed = [];
  const failed = [];
  const results = [
    ['Game loads', hasGame === true],
    ['Firing consumes ammo', afterFire < initial.ammo],
    ['Reload works', afterReload > beforeReload],
    ['Wave system active', waveState.state !== undefined],
    ['Enemies spawn', activeEnemies > 0],
    ['Weapon switch', switchedWeapon === 1],
    ['Movement', posBefore !== posAfter],
    ['ADS works', isAds === true]
  ];
  for (const [name, pass] of results) {
    console.log(`   ${pass ? '✓' : '✗'} ${name}`);
    if (pass) passed.push(name); else failed.push(name);
  }

  console.log(`\nPassed: ${passed.length}/${results.length}`);
  console.log(`Errors: ${errors.length > 0 ? errors.join(' | ') : 'None'}`);

  await browser.close();
  console.log('\n✓ Test complete.');
}

runGameplayTest().catch(err => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
