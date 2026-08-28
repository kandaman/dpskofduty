/**
 * Download assets from Quaternius Itch.io page.
 * Usage: node scripts/itch-download.mjs
 */
import { chromium } from 'playwright';
import https from 'https';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve('public/assets');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(fs.statSync(dest).size); });
    }).on('error', reject);
  });
}

async function downloadItchPack(name, pageUrl, destFile) {
  const dest = path.resolve(ASSETS_DIR, destFile);
  console.log(`\n=== ${name} ===`);
  console.log(`URL: ${pageUrl}`);
  console.log(`Dest: ${dest}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Track download
  let downloadUrl = null;
  page.on('response', (resp) => {
    const url = resp.url();
    if (url.includes('.zip') && url.includes('itch.io')) {
      downloadUrl = url;
      console.log('GOT ZIP URL:', url.substring(0, 120));
    }
  });

  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('Page loaded:', await page.title());

  // Click the first "Download Now" link
  const link = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const l of links) {
      if (l.textContent.includes('Download Now')) return l.href;
    }
    return null;
  });

  if (link) {
    console.log('Download link:', link);
    await page.goto(link, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    console.log('Purchase page loaded');

    // Set price to 0
    await page.evaluate(() => {
      const input = document.querySelector('input[name="price"]');
      if (input) {
        input.value = '0';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log('Set price to 0');
    await page.waitForTimeout(500);

    // Click download
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('Clicked download:', clicked);

    await page.waitForTimeout(5000);

    // Check if download URL was captured
    if (downloadUrl) {
      console.log(`Downloading ${name}...`);
      const size = await downloadFile(downloadUrl, dest);
      console.log(`Success: ${size} bytes`);
    } else {
      console.log('No download URL captured. Checking page...');
      const url = page.url();
      console.log('Current URL:', url);
      const title = await page.title();
      console.log('Title:', title);
    }
  }

  await browser.close();
  return downloadUrl;
}

async function main() {
  // Download Universal Base Characters
  await downloadItchPack(
    'Universal Base Characters',
    'https://quaternius.itch.io/universal-base-characters',
    'characters/universal_base_characters.zip'
  );

  // Try to find and download weapon packs
  console.log('\n\n=== Searching for weapon packs ===');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://quaternius.itch.io', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});

  const allItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 80),
      href: a.href
    })).filter(l => l.href.includes('itch.io') && l.href.includes('quaternius') && !l.href.includes('twitter'));
  });

  console.log('All Quaternius items:');
  const unique = new Map();
  allItems.forEach(i => unique.set(i.href, i.text));
  for (const [url, text] of unique) {
    if (url.includes('/profile/')) continue;
    console.log(`  ${text.substring(0,50)} -> ${url}`);
  }

  await browser.close();
}

main().catch(console.error);
