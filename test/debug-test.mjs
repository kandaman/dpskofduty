import { chromium } from 'playwright';

const URL = 'http://localhost:5173';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  console.log('Loading...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('Blocker visible:', await page.isVisible('#blocker'));
  console.log('Start btn visible:', await page.isVisible('#start-btn'));

  console.log('Clicking start...');
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 1000));

  const hasGame = await page.evaluate(() => typeof window.game !== 'undefined' && window.game !== null);
  console.log('window.game exists:', hasGame);

  if (!hasGame) {
    // Check what happened
    const blockerGone = await page.evaluate(() => document.getElementById('blocker')?.style?.display);
    console.log('blocker display:', blockerGone);

    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    console.log('canvas elements:', canvasCount);

    const errors = await page.evaluate(() => {
      return window.__capturedErrors || [];
    });
    console.log('captured errors:', errors);
  }

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
