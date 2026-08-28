/**
 * PBR Texture Downloader — downloads complete PBR texture sets from Poly Haven (CC0).
 *
 * Usage: node scripts/download-assets.mjs
 *
 * Fetches full PBR map sets (diffuse, normal, roughness, AO)
 * from Poly Haven for concrete, asphalt, dirt, and metal surfaces.
 *
 * URL pattern: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/<asset>/<asset>_<map>_2k.jpg
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../public/assets/textures');

// Map type → filename suffix used in Poly Haven URLs
const MAP_FILE = {
  Diffuse:      'diff',
  nor_gl:       'nor_gl',
  Rough:        'rough',
  AO:           'ao',
  Displacement: 'disp',
};

const TEXTURE_SETS = [
  // Concrete / Floor
  { asset: 'brushed_concrete',       maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Brushed Concrete' },
  { asset: 'anti_slip_concrete',     maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Anti-Slip Concrete' },
  { asset: 'concrete_floor_02',      maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Concrete Floor 02' },
  { asset: 'concrete_floor_damaged_01', maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'], label: 'Damaged Concrete' },
  { asset: 'concrete_floor_worn_02', maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Worn Concrete Floor' },
  // Asphalt
  { asset: 'asphalt_floor',          maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Asphalt Floor' },
  { asset: 'asphalt_01',             maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Asphalt 01' },
  // Dirt / Ground
  { asset: 'dry_ground_01',          maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Dry Ground' },
  { asset: 'forest_ground_04',       maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Forest Ground' },
  { asset: 'burned_ground_01',       maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Burned Ground' },
  { asset: 'dirty_concrete',         maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Dirty Concrete' },
  // Metal
  { asset: 'metal_plate',            maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Metal Plate' },
  { asset: 'metal_plate_02',         maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Metal Plate 02' },
  { asset: 'blue_metal_plate',       maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Blue Metal Plate' },
  { asset: 'rusty_metal',            maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Rusty Metal' },
  { asset: 'rusted_iron',            maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Rusted Iron' },
  // Wood
  { asset: 'wood_floor',             maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Wood Floor' },
  { asset: 'wood_planks',            maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Wood Planks' },
  { asset: 'old_wooden_floor_01',    maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Old Wooden Floor' },
  { asset: 'wood_planks_dirt',       maps: ['Diffuse', 'nor_gl', 'Rough', 'AO'],  label: 'Wood Planks Dirt' },
];

const PH_BASE = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      resolve({ size: fs.statSync(dest).size, cached: true });
      return;
    }
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlink(dest, () => {});
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) process.stdout.write(`\r    ${Math.round((downloaded / total) * 100)}%`);
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        resolve({ size: fs.statSync(dest).size, cached: false });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('=== PBR Texture Downloader ===\n');
  console.log(`Target: ${ASSETS_DIR}\n`);

  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  let totalFiles = 0;
  let totalBytes = 0;

  for (const set of TEXTURE_SETS) {
    console.log(`\n--- ${set.label} ---`);

    for (const mapType of set.maps) {
      const mapSuffix = MAP_FILE[mapType];
      const filename = `${set.asset}_${mapSuffix}_2k.jpg`;
      const url = `${PH_BASE}/${set.asset}/${set.asset}_${mapSuffix}_2k.jpg`;
      const dest = path.join(ASSETS_DIR, filename);

      if (fs.existsSync(dest)) {
        const size = fs.statSync(dest).size;
        console.log(`  [HAVE] ${filename} (${(size / 1024).toFixed(0)}KB)`);
        totalBytes += size;
        totalFiles++;
        continue;
      }

      process.stdout.write(`  [DL]    ${filename}`);
      try {
        const result = await download(url, dest);
        totalFiles++;
        totalBytes += result.size;
        console.log(`  [OK] ${(result.size / 1024).toFixed(0)}KB`);
      } catch (err) {
        console.log(`  [FAIL] ${err.message}`);
      }
    }
  }

  console.log(`\n=== Done: ${totalFiles} files, ${(totalBytes / 1024 / 1024).toFixed(1)}MB ===`);
}

main().catch(console.error);
