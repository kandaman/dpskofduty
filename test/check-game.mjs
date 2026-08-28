import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));

  // Check what exists in the DOM
  const domInfo = await page.evaluate(() => ({
    blockerExists: !!document.getElementById('blocker'),
    startBtnExists: !!document.getElementById('start-btn'),
    startBtnVisible: document.getElementById('start-btn')?.offsetParent !== null,
    canvasCount: document.querySelectorAll('canvas').length,
  }));
  console.log('DOM:', JSON.stringify(domInfo));

  // Try clicking start button directly
  await page.evaluate(() => {
    const btn = document.getElementById('start-btn');
    if (btn) btn.click();
  });
  console.log('Clicked start-btn via evaluate');

  await new Promise(r => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game object' };
    return {
      running: g.running,
      envMap: !!g.assetManager?._envMap,
      fbxLoaded: g.weaponController?.currentWeapon?._fbxLoaded || false,
      enemies: g.enemyManager?.enemies?.length || 0,
    };
  });
  console.log('Game:', JSON.stringify(info));

  await page.screenshot({ path: 'test/screenshot-game-first.png' });
  const size = fs.statSync('test/screenshot-game-first.png').size;
  console.log('Screenshot:', (size / 1024).toFixed(0) + 'KB');
  await browser.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
