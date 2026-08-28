/**
 * Itch.io download v3 - directly downloads assets from Quaternius Itch.io.
 * Works by intercepting the Itch.io form submission and download redirect.
 */
import { chromium } from 'playwright';
import https from 'https';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = 'public/assets';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) process.stdout.write('\r  ' + Math.round(downloaded / total * 100) + '%');
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(fs.statSync(dest).size); });
    }).on('error', reject);
  });
}

async function downloadFromItch(name, pageUrl, destFile) {
  const dest = path.resolve(ASSETS_DIR, destFile);
  console.log('\n=== ' + name + ' ===');
  if (fs.existsSync(dest)) { console.log('Already exists'); return; }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Monitor all responses for the download URL
  const downloadUrls = [];
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.includes('.zip') || (url.includes('uploads.itch.io') && !url.includes('attachment'))) {
      const idx = downloadUrls.indexOf(url);
      if (idx === -1) {
        downloadUrls.push(url);
        console.log('\nFound download URL: ' + url.substring(0, 120));
        console.log('  Content-Type: ' + (resp.headers()['content-type'] || 'unknown'));
      }
    }
  });

  try {
    // Go to the purchase page
    console.log('Loading purchase page...');
    const resp = await page.goto(pageUrl + '/purchase', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    console.log('Status: ' + (resp ? resp.status() : 'no response'));
    await page.waitForTimeout(2000);

    // Dump page HTML to debug
    const html = await page.content();
    console.log('Page length: ' + html.length + ' chars');
    console.log('Page URL: ' + page.url());

    // Check for price input
    const hasPriceInput = html.includes('name="price"') || html.includes('price');
    console.log('Has price input: ' + hasPriceInput);

    // Check for form
    const hasForm = html.includes('form') || html.includes('submit');
    console.log('Has form: ' + hasForm);

    // Try to use the Itch.io download API directly
    // Itch.io uses POST to /api/1/.../purchase with { price: 0 }
    // Then returns a redirect to the download page

    // First, let's extract the game ID from the page
    const gameIdMatch = html.match(/game_id["\s:=]+\d+/);
    const gameIdMatch2 = html.match(/game_id["\s:=]+["']?(\d+)["']?/);
    console.log('Game ID match: ' + (gameIdMatch ? gameIdMatch[0] : 'not found'));

    // Look for the hidden form or API endpoint
    const apiMatch = html.match(/\/api\/1\/[^"']+/g) || [];
    if (apiMatch.length > 0) console.log('API endpoints: ' + JSON.stringify(apiMatch.slice(0, 5)));

    // Try to submit directly via Itch.io's API
    // The API pattern is: POST https://quaternius.itch.io/50-lowpoly-guns/purchase
    // with form data containing: price=0&download=1
    console.log('\nTrying direct API submission...');
    const formAction = page.url(); // Should be the purchase URL
    const result = await page.evaluate(async (url) => {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'price=0&download=1'
        });
        return { status: resp.status, url: resp.url, redirected: resp.redirected };
      } catch(e) {
        return { error: e.message };
      }
    }, formAction);
    console.log('Direct POST result: ' + JSON.stringify(result));
    await page.waitForTimeout(3000);

    // Also try the actual form submission using Playwright
    console.log('\nTrying form fill and submit...');
    await page.goto(formAction, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Type 0 into price input
    const input = await page.$('input[name="price"]');
    if (input) {
      await input.click();
      await input.fill('0');
      console.log('Filled price input with 0');
      await page.waitForTimeout(500);
    }

    // Click download button
    const btn = await page.$('button[type="submit"]');
    if (btn) {
      await btn.click();
      console.log('Clicked submit button');
    } else {
      // Try text selector
      try {
        await page.click('text=Download');
        console.log('Clicked text=Download');
      } catch(e) {
        console.log('No download button found');
        // Try all buttons
        const allBtns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button')).map(b => ({
            text: (b.textContent || '').trim().substring(0, 40),
            type: b.type,
            name: b.name
          }));
        });
        console.log('Available buttons: ' + JSON.stringify(allBtns));
      }
    }

    await page.waitForTimeout(8000);

  } catch(e) {
    console.log('Error: ' + e.message);
  }

  console.log('\nCaptured download URLs: ' + downloadUrls.length);
  for (const u of downloadUrls) {
    console.log('URL: ' + u.substring(0, 120));
  }

  // If we got a download URL, try to download it
  if (downloadUrls.length > 0) {
    const url = downloadUrls[0];
    console.log('\nDownloading from: ' + url.substring(0, 80));
    try {
      const size = await downloadFile(url, dest);
      console.log('Downloaded: ' + size + ' bytes');
    } catch(e) {
      console.log('Download failed: ' + e.message.substring(0, 60));
    }
  }

  await browser.close();
}

async function main() {
  // Download weapons
  await downloadFromItch(
    '50+ LowPoly Guns',
    'https://quaternius.itch.io/50-lowpoly-guns',
    'weapons/50_lowpoly_guns.zip'
  );

  // Download characters
  await downloadFromItch(
    'Universal Base Characters',
    'https://quaternius.itch.io/universal-base-characters',
    'characters/universal_base_characters.zip'
  );
}

main().catch(console.error);
