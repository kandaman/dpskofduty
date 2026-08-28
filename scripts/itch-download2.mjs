/**
 * Itch.io download attempt v2 - handles the Itch.io payment-free download flow.
 * Usage: node scripts/itch-download2.mjs
 */
import { chromium } from 'playwright';
import https from 'https';
import fs from 'fs';

const ASSETS_DIR = 'public/assets';

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(fs.statSync(dest).size); });
    }).on('error', reject);
  });
}

async function downloadItchPack(name, pageUrl, destFile) {
  const dest = ASSETS_DIR + '/' + destFile;
  console.log('=== ' + name + ' ===');
  console.log('Dest: ' + dest);
  if (fs.existsSync(dest)) { console.log('Already exists, skipping'); return; }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let foundDownloadUrl = null;
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.includes('.zip') && url.includes('itch.io') && !url.includes('purchase')) {
      foundDownloadUrl = url;
      console.log('ZIP FOUND: ' + url.substring(0, 100));
    }
  });

  // Go to purchase page directly
  await page.goto(pageUrl + '/purchase', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('Purchase page: ' + (await page.title()));

  // Take screenshot to debug
  await page.screenshot({ path: 'itch-purchase.png' }).catch(() => {});

  // Try multiple ways to set price to 0 and submit
  const result = await page.evaluate(() => {
    // Method 1: Find and fill price input, then submit form
    const priceInput = document.querySelector('input[name="price"]');
    if (priceInput) {
      priceInput.value = '0';
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Method 2: Find the form and try to submit it
    const form = document.querySelector('form[action*="download"]') || document.querySelector('form');
    if (form) {
      // Try different submit methods
      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('button');
      if (submitBtn) { submitBtn.click(); return 'clicked submit'; }
      // Try form.submit()
      try { form.submit(); return 'form submitted'; } catch(e) { return 'form submit error'; }
    }

    return 'no form found: ' + document.body.innerHTML.substring(0, 500);
  });

  console.log('Form result: ' + result);
  await page.waitForTimeout(5000);

  if (foundDownloadUrl) {
    console.log('Downloading...');
    const size = await downloadFile(foundDownloadUrl, dest);
    console.log('Success: ' + size + ' bytes');
  } else {
    console.log('No download triggered. Check page screenshot.');
    console.log('Current URL: ' + page.url());
  }

  await browser.close();
  return foundDownloadUrl;
}

async function main() {
  // Download weapons
  await downloadItchPack(
    '50+ LowPoly Guns',
    'https://quaternius.itch.io/50-lowpoly-guns',
    'weapons/50_lowpoly_guns.zip'
  );

  // Download characters
  await downloadItchPack(
    'Universal Base Characters',
    'https://quaternius.itch.io/universal-base-characters',
    'characters/universal_base_characters.zip'
  );
}

main().catch(console.error);
