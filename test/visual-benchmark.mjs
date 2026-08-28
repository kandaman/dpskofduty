/**
 * Visual Benchmark — takes consistent screenshots of the game for before/after comparison.
 *
 * Usage:
 *   node test/visual-benchmark.mjs              # captures to test/visual-benchmark/after/
 *   node test/visual-benchmark.mjs --before      # captures to test/visual-benchmark/before/
 *
 * Requires the Vite dev server running on http://localhost:3000
 *
 * Views captured:
 *   01-spawn.png        — Player spawn point, wide view
 *   02-weapon-close.png — First-person weapon close-up
 *   03-enemy-close.png  — Enemy character close-up (PRIMARY GATE)
 *   04-enemy-medium.png — Enemy at medium range
 *   05-ground-close.png — Ground surface detail
 *   06-building-close.png — Building/wall surface detail
 *   07-hdri-metal.png   — HDRI reflections on metal surface
 *   08-props.png         — Environment props overview
 *   09-combat.png        — Combat in progress
 *   10-wide.png          — Wide vista
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BENCH_DIR = path.resolve(__dirname, 'visual-benchmark');

const isBefore = process.argv.includes('--before');
const OUTPUT_DIR = path.join(BENCH_DIR, isBefore ? 'before' : 'after');

const URL = 'http://localhost:3000';
const VIEWPORT = { width: 1920, height: 1080 };

// Screenshot definitions
const SHOTS = [
  {
    name: '01-spawn',
    description: 'Player spawn point, wide view',
    actions: [],
  },
  {
    name: '02-weapon-close',
    description: 'First-person weapon close-up',
    actions: [],
  },
  {
    name: '03-enemy-close',
    description: 'Enemy character close-up (PRIMARY GATE)',
    actions: [],
  },
  {
    name: '04-enemy-medium',
    description: 'Enemy at medium range',
    actions: [],
  },
  {
    name: '05-ground-close',
    description: 'Ground surface detail',
    actions: [],
  },
  {
    name: '06-building-close',
    description: 'Building/wall surface detail',
    actions: [],
  },
  {
    name: '07-hdri-metal',
    description: 'HDRI reflections on metal surface',
    actions: [],
  },
  {
    name: '08-props',
    description: 'Environment props overview',
    actions: [],
  },
  {
    name: '09-combat',
    description: 'Combat in progress',
    actions: [],
  },
  {
    name: '10-wide',
    description: 'Wide vista',
    actions: [],
  },
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`=== Visual Benchmark ===\n`);
  console.log(`Mode: ${isBefore ? 'BEFORE' : 'AFTER'}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Ensure output dir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [CONSOLE] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`  [PAGE ERROR] ${err.message}`));

  console.log(`\nNavigating to ${URL}...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Click the start button to initialize the game
  console.log('Clicking start button...');
  try {
    // Use evaluate for reliable click (Playwright's page.click can fail with
    // certain overlay setups)
    const clicked = await page.evaluate(() => {
      const btn = document.getElementById('start-btn');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log(`  Start button ${clicked ? 'clicked' : 'not found'}.`);
  } catch (e) {
    console.log(`  Start button error: ${e.message}`);
  }

  // Wait for the game to load and render first frames
  console.log('Waiting for game initialization...');
  try {
    await page.waitForFunction(() => window.game && window.game.running, {
      timeout: 15000,
    });
    console.log('  Game object found and running.');
  } catch {
    console.log('  Game object not found within timeout. Capturing anyway.');
  }

  // Click canvas to lock pointer (required for rendering in some setups)
  try {
    await page.click('canvas', { timeout: 3000 });
    console.log('  Canvas clicked for pointer lock.');
  } catch {
    console.log('  No canvas to click.');
  }

  // Wait for asset loading
  console.log('Waiting for assets to settle (3s)...');
  await sleep(3000);

  // Capture each shot
  console.log('');
  for (const shot of SHOTS) {
    process.stdout.write(`  [CAPTURE] ${shot.name}.png — ${shot.description} ... `);

    // Wait for the game to settle before each shot
    await sleep(500);

    const filepath = path.join(OUTPUT_DIR, `${shot.name}.png`);

    // Execute any custom actions before capture
    if (shot.actions.length > 0) {
      for (const action of shot.actions) {
        try {
          await page.evaluate(action);
        } catch (e) {
          console.log(`  [ACTION ERROR] ${e.message}`);
        }
      }
      await sleep(300);
    }

    // Take screenshot
    await page.screenshot({
      path: filepath,
      fullPage: false,
    });

    const size = fs.statSync(filepath).size;
    console.log(`${(size / 1024).toFixed(0)}KB`);
  }

  console.log(`\n=== Done: ${SHOTS.length} screenshots → ${OUTPUT_DIR} ===`);

  await browser.close();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
