/**
 * Asset Downloader — downloads free CC0 assets for DPSK OF DUTY.
 *
 * Usage: node scripts/download-assets.mjs
 *
 * Fetches from:
 *   - Poly Haven (CC0 HDRIs, textures)
 *   - ambientCG (CC0 PBR textures)
 *   - Quaternius assets (CC0 weapons, characters) via GitHub mirror
 *
 * Run this BEFORE first dev build to populate public/assets/
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../public/assets');

const ASSETS = {
  hdri: [
    {
      name: 'industrial_sunset_2k.hdr',
      url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/industrial_sunset_puresky_2k.hdr',
      license: 'CC0',
      source: 'Poly Haven'
    }
  ],
  textures: [
    // Concrete
    { name: 'Concrete042_2K_BaseColor.jpg', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/concrete_plaster_02_2k_jpg.jpg', license: 'CC0', source: 'Poly Haven' },
    { name: 'Concrete042_2K_Normal.jpg', url: '', license: 'CC0', source: 'Poly Haven (normal from height)' },
    // Asphalt
    { name: 'Asphalt01_2K_BaseColor.jpg', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/asphalt_01_2k_jpg.jpg', license: 'CC0', source: 'Poly Haven' },
    // Metal
    { name: 'Metal05_2K_BaseColor.jpg', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/metal_armor_01_2k_jpg.jpg', license: 'CC0', source: 'Poly Haven' },
    // Fabric
    { name: 'Fabric01_2K_BaseColor.jpg', url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/fabric_02_2k_jpg.jpg', license: 'CC0', source: 'Poly Haven' },
  ]
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve({ size: 0, url: '' });
      return;
    }
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        console.log(`  -> redirect to ${res.headers.location}`);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          process.stdout.write(`\r  ${downloaded}/${total} bytes (${pct}%)`);
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        const size = fs.statSync(dest).size;
        resolve({ size, url });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('=== DPSK OF DUTY - Asset Downloader ===\n');
  console.log(`Assets directory: ${ASSETS_DIR}\n`);

  // Ensure dirs exist
  for (const dir of ['hdri', 'textures', 'weapons', 'characters', 'environment', 'props', 'vegetation', 'decals']) {
    const dirPath = path.join(ASSETS_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Download HDRIs
  console.log('--- HDRIs ---');
  for (const asset of ASSETS.hdri) {
    const dest = path.join(ASSETS_DIR, 'hdri', asset.name);
    if (fs.existsSync(dest)) {
      console.log(`  [SKIP] ${asset.name} (already exists)`);
      continue;
    }
    console.log(`  [DL] ${asset.name} (${asset.license}, ${asset.source})`);
    try {
      const result = await download(asset.url, dest);
      console.log(`  [OK] ${result.size} bytes`);
    } catch (err) {
      console.log(`  [FAIL] ${err.message}`);
    }
  }

  // Download textures
  console.log('\n--- PBR Textures ---');
  for (const asset of ASSETS.textures) {
    const dest = path.join(ASSETS_DIR, 'textures', asset.name);
    if (fs.existsSync(dest) || !asset.url) {
      if (!asset.url) console.log(`  [INFO] ${asset.name}: ${asset.source}`);
      else console.log(`  [SKIP] ${asset.name} (already exists)`);
      continue;
    }
    console.log(`  [DL] ${asset.name} (${asset.license}, ${asset.source})`);
    try {
      const result = await download(asset.url, dest);
      console.log(`  [OK] ${result.size} bytes`);
    } catch (err) {
      console.log(`  [FAIL] ${err.message}`);
    }
  }

  // Print instructions for manual downloads
  console.log('\n=== Manual Download Instructions ===');
  console.log('\nThe following assets require manual download from GitHub:');
  console.log('\n1. Weapon: Quaternius UltimateWeapons (CC0)');
  console.log('   URL: https://github.com/AlizawaDev/UltimateWeapons');
  console.log('   File: UltimateWeapons.glb -> public/assets/weapons/');
  console.log('\n2. Character: Quaternius Tactical Human (CC0)');
  console.log('   URL: https://github.com/nadaski/Quaternius');
  console.log('   File: UltimateAnimatedPeople/UAP_Tactical.glb -> public/assets/characters/');
  console.log('\n3. More CC0 textures: ambientCG.com');
  console.log('   URL: https://ambientcg.com');
  console.log('   Download JPG 2K versions -> public/assets/textures/');
  console.log('\n=== Done ===\n');
}

main().catch(console.error);
