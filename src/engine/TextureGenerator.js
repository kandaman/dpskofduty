/**
 * TextureGenerator — procedural PBR texture generation via canvas.
 *
 * Generates albedo, normal, roughness, metalness, and AO maps at runtime
 * so the entire scene has PBR-quality surface detail without external assets.
 *
 * All textures are returned as THREE.DataTexture (or CanvasTexture for easier
 * debugging). Default resolution: 512×512 (weapon textures: 1024×1024).
 */
import * as THREE from 'three';

// ─── NOISE HELPERS ───────────────────────────────────────────────────────────

// Simple hash function for reproducible pseudo-random
function hash(x, y, seed) {
  let h = seed + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) & 0x7fffffff;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function smoothstep(t) { return t * t * (3 - 2 * t); }

// 2D value noise (single octave)
function valueNoise2D(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  const n00 = hash(ix, iy, seed) / 0x7fffffff;
  const n10 = hash(ix + 1, iy, seed) / 0x7fffffff;
  const n01 = hash(ix, iy + 1, seed) / 0x7fffffff;
  const n11 = hash(ix + 1, iy + 1, seed) / 0x7fffffff;
  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
}

// Fractal Brownian Motion noise
function fbm(x, y, octaves = 4, seed = 12345) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 7919);
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value / maxVal;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function createDataTexture(width, height, channels, data) {
  const texture = new THREE.DataTexture(data, width, height, channels);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ─── PUBLIC TEXTURE GENERATORS ──────────────────────────────────────────────

/**
 * Generate a grayscale height map (useful for normal map derivation).
 * @param {number} size - texture width/height (power of 2)
 * @param {number} seed - noise seed
 * @param {object} [opts]
 * @param {number} [opts.scale=8] - noise frequency scale
 * @param {number} [opts.octaves=4] - FBM octaves
 * @param {number} [opts.contrast=1] - contrast multiplier
 * @returns {THREE.DataTexture} single-channel (R) DataTexture
 */
export function generateHeightMap(size, seed = 12345, opts = {}) {
  const { scale = 8, octaves = 4, contrast = 1 } = opts;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / scale, y / scale, octaves, seed);
      const v = Math.max(0, Math.min(255, Math.floor((n * contrast) * 255)));
      data[y * size + x] = v;
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

/**
 * Generate a normal map from a height function.
 * Uses central differences to compute the normal at each texel.
 * @param {number} size
 * @param {function(number, number): number} heightFn - takes (u, v) in [0,1], returns height [0,1]
 * @param {number} [strength=2] - normal map strength (higher = more pronounced)
 * @returns {THREE.DataTexture} RGBA normal map (tangent-space)
 */
export function generateNormalMap(size, heightFn, strength = 2) {
  const data = new Uint8Array(size * size * 4);
  const step = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const hL = heightFn(u - step, v);
      const hR = heightFn(u + step, v);
      const hD = heightFn(u, v - step);
      const hU = heightFn(u, v + step);
      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;
      // Tangent-space normal: N = normalize(-dx, -dy, 1)
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = (-dx / len) * 0.5 + 0.5;
      const ny = (-dy / len) * 0.5 + 0.5;
      const nz = (1 / len) * 0.5 + 0.5;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(nx * 255);
      data[idx + 1] = Math.floor(ny * 255);
      data[idx + 2] = Math.floor(nz * 255);
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

// ─── CONCRETE ────────────────────────────────────────────────────────────────

function _concreteHeight(u, v) {
  // Concrete has fine surface noise + occasional larger cracks
  const fine = fbm(u * 12, v * 12, 3, 101) * 0.02;
  const crack = Math.pow(Math.max(0, fbm(u * 3, v * 3, 2, 202) - 0.6), 2) * 0.06;
  const stain = fbm(u * 2 + 0.5, v * 2 + 0.5, 2, 303) * 0.01;
  return Math.min(1, fine + crack + stain);
}

export function generateConcreteNormal(size = 512, strength = 2.5) {
  return generateNormalMap(size, _concreteHeight, strength);
}

export function generateConcreteAlbedo(size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 8, v * 8, 3, 101);
      const crackNoise = fbm(u * 3, v * 3, 2, 202);
      const stain = fbm(u * 2.5, v * 2.5, 2, 303);
      // Base concrete color (#8a8a80 range)
      const base = 0.5 + noise * 0.1;
      // Cracks are darker
      const crack = Math.max(0, crackNoise - 0.6) * 0.2;
      // Stains (darker patches)
      const stainDark = stain * 0.04;
      // Edge wear (lighter at edges)
      const edgeWear = (Math.abs(u - 0.5) + Math.abs(v - 0.5)) * 0.06;
      const val = Math.max(0, Math.min(1, base - crack - stainDark + edgeWear));
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(val * 200 + 55);     // R ~ 0.5-0.8
      data[idx + 1] = Math.floor(val * 195 + 55); // G ~ 0.5-0.78
      data[idx + 2] = Math.floor(val * 185 + 55); // B ~ 0.5-0.75
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateConcreteRoughness(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 10, v * 10, 3, 401);
      // Concrete is rough: 0.7-0.95
      const val = 0.7 + noise * 0.25;
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── ASPHALT ─────────────────────────────────────────────────────────────────

export function generateAsphaltAlbedo(size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fine = fbm(u * 20, v * 20, 3, 501) * 0.08;
      const aggregate = fbm(u * 8, v * 8, 2, 502) * 0.06;
      const patch = fbm(u * 3, v * 3, 2, 503) * 0.03;
      const base = 0.3 + fine;
      const val = Math.max(0.15, Math.min(0.5, base - aggregate + patch));
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(val * 200 + 30);
      data[idx + 1] = Math.floor(val * 195 + 30);
      data[idx + 2] = Math.floor(val * 190 + 30);
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateAsphaltNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    const fine = fbm(u * 20, v * 20, 3, 601) * 0.01;
    const aggregate = fbm(u * 10, v * 10, 2, 602) * 0.03;
    return fine + aggregate;
  }, 1.5);
}

export function generateAsphaltRoughness(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 12, v * 12, 3, 701);
      const val = 0.75 + noise * 0.2;
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── METAL ───────────────────────────────────────────────────────────────────

export function generateMetalAlbedo(size = 512, baseColor = 0x888888) {
  const r = ((baseColor >> 16) & 0xff) / 255;
  const g = ((baseColor >> 8) & 0xff) / 255;
  const b = (baseColor & 0xff) / 255;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const scratch = Math.max(0, fbm(u * 40, v * 40, 1, 801) - 0.7) * 0.15;
      const wear = fbm(u * 5, v * 5, 2, 802) * 0.05;
      const dirt = fbm(u * 3, v * 3, 1, 803) * 0.03;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, (r - scratch - dirt + wear) * 255)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, (g - scratch - dirt + wear) * 255)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, (b - scratch - dirt + wear) * 255)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateMetalNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    return fbm(u * 30, v * 30, 2, 901) * 0.01;
  }, 0.8);
}

export function generateMetalRoughness(size = 512, baseRoughness = 0.3) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Metal is generally smooth but has wear patches
      const wear = fbm(u * 6, v * 6, 2, 1001);
      const scratch = Math.max(0, fbm(u * 50, v * 50, 1, 1002) - 0.8) * 0.3;
      const val = Math.max(0.05, Math.min(0.8, baseRoughness + wear * 0.3 + scratch));
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

export function generateMetalnessMap(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Mostly metallic with some non-metal wear spots
      const wear = fbm(u * 6, v * 6, 2, 1101);
      const val = 0.9 - wear * 0.3;
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── PAINTED METAL ───────────────────────────────────────────────────────────

export function generatePaintedMetalAlbedo(size = 512, paintColor = 0x445566) {
  const pr = ((paintColor >> 16) & 0xff) / 255;
  const pg = ((paintColor >> 8) & 0xff) / 255;
  const pb = (paintColor & 0xff) / 255;
  // Exposed metal color (darker, more metallic)
  const mr = 0.4, mg = 0.4, mb = 0.4;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const chip = fbm(u * 10, v * 10, 3, 1201);
      // Chipped areas expose bare metal
      const mask = Math.max(0, Math.min(1, (chip - 0.45) * 4));
      const dirty = fbm(u * 4, v * 4, 2, 1202) * 0.05;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, (lerp(pr, mr, mask) - dirty) * 255)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, (lerp(pg, mg, mask) - dirty) * 255)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, (lerp(pb, mb, mask) - dirty) * 255)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generatePaintedMetalNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    const paint = fbm(u * 8, v * 8, 2, 1301) * 0.008;
    const chip = Math.max(0, fbm(u * 12, v * 12, 2, 1302) - 0.5) * 0.02;
    return paint + chip;
  }, 1.2);
}

export function generatePaintedMetalRoughness(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const chip = fbm(u * 10, v * 10, 3, 1401);
      const mask = Math.max(0, Math.min(1, (chip - 0.45) * 4));
      // Paint is rough (0.5), bare metal is smooth (0.2)
      const val = lerp(0.5, 0.2, mask) + fbm(u * 3, v * 3, 1, 1402) * 0.1;
      data[y * size + x] = Math.floor(Math.max(0, Math.min(255, val * 255)));
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── FABRIC / CLOTH ──────────────────────────────────────────────────────────

export function generateFabricAlbedo(size = 512, color = 0x556b2f) {
  const cr = ((color >> 16) & 0xff) / 255;
  const cg = ((color >> 8) & 0xff) / 255;
  const cb = (color & 0xff) / 255;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Woven fabric pattern
      const weave = (Math.sin(u * 80) * Math.sin(v * 80)) * 0.03;
      const noise = fbm(u * 5, v * 5, 2, 1501) * 0.04;
      const dirt = fbm(u * 3, v * 3, 1, 1502) * 0.05;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, (cr + weave + noise - dirt) * 255)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, (cg + weave + noise - dirt) * 255)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, (cb + weave + noise - dirt) * 255)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateFabricNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    const weave = Math.sin(u * 80) * Math.sin(v * 80) * 0.005;
    const fine = fbm(u * 12, v * 12, 2, 1601) * 0.005;
    return weave + fine;
  }, 3);
}

export function generateFabricRoughness(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 8, v * 8, 2, 1701);
      const val = 0.7 + noise * 0.25;
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── WOOD ────────────────────────────────────────────────────────────────────

export function generateWoodAlbedo(size = 512, baseColor = 0x8B7355) {
  const cr = ((baseColor >> 16) & 0xff) / 255;
  const cg = ((baseColor >> 8) & 0xff) / 255;
  const cb = (baseColor & 0xff) / 255;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Wood grain lines
      const grain = Math.abs(Math.sin(u * 60 + fbm(u * 3, v * 3, 2, 1801) * 5)) * 0.08;
      const knot = Math.exp(-((u - 0.3) ** 2 + (v - 0.5) ** 2) * 100) * 0.1;
      const noise = fbm(u * 4, v * 4, 2, 1802) * 0.03;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, (cr + grain + knot + noise) * 255)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, (cg + grain * 0.5 + knot * 0.5 + noise) * 255)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, (cb + noise) * 255)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateWoodNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    const grain = Math.abs(Math.sin(u * 60 + fbm(u * 3, v * 3, 2, 1901) * 5)) * 0.03;
    const knot = Math.exp(-((u - 0.3) ** 2 + (v - 0.5) ** 2) * 100) * 0.02;
    return grain + knot + fbm(u * 6, v * 6, 2, 1902) * 0.005;
  }, 2.5);
}

// ─── DIRT / GROUND ───────────────────────────────────────────────────────────

export function generateDirtAlbedo(size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 6, v * 6, 4, 2001);
      const gravel = fbm(u * 20, v * 20, 2, 2002) * 0.05;
      const val = 0.25 + noise * 0.15 + gravel;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, val * 180 + 40)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, val * 160 + 35)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, val * 140 + 30)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

// ─── SAND / SANDBAG ──────────────────────────────────────────────────────────

export function generateSandbagAlbedo(size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 8, v * 8, 3, 2101);
      // Burlap/tan color
      const val = 0.4 + noise * 0.1;
      const idx = (y * size + x) * 4;
      data[idx] = Math.floor(Math.max(0, Math.min(255, val * 210 + 40)));
      data[idx + 1] = Math.floor(Math.max(0, Math.min(255, val * 185 + 35)));
      data[idx + 2] = Math.floor(Math.max(0, Math.min(255, val * 165 + 30)));
      data[idx + 3] = 255;
    }
  }
  return createDataTexture(size, size, THREE.RGBAFormat, data);
}

export function generateSandbagNormal(size = 512) {
  return generateNormalMap(size, (u, v) => {
    return fbm(u * 10, v * 10, 3, 2201) * 0.04;
  }, 2);
}

// ─── GENERIC ROUGHNESS MAP ──────────────────────────────────────────────────

export function generateRoughnessMap(size = 512, baseRoughness = 0.7) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const noise = fbm(u * 6, v * 6, 3, 2301);
      const val = Math.max(0, Math.min(1, baseRoughness + noise * 0.2));
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── GENERIC AO MAP ──────────────────────────────────────────────────────────

export function generateAOMap(size = 512) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Cavities/crevices are darker
      const cavity = 1 - fbm(u * 8, v * 8, 3, 2401) * 0.3;
      const val = Math.max(0.5, Math.min(1, cavity));
      data[y * size + x] = Math.floor(val * 255);
    }
  }
  return createDataTexture(size, size, THREE.RedFormat, data);
}

// ─── MUZZLE FLASH SPRITE ─────────────────────────────────────────────────────

export function generateMuzzleFlashTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.1, 'rgba(255,200,100,1)');
  gradient.addColorStop(0.3, 'rgba(255,150,50,0.6)');
  gradient.addColorStop(0.6, 'rgba(255,100,20,0.15)');
  gradient.addColorStop(1, 'rgba(255,50,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── BULLET HOLE DECAL TEXTURE ───────────────────────────────────────────────

export function generateBulletHoleTexture(size = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Small dark circle with lighter edge
  const cx = size / 2, cy = size / 2;
  const r = size * 0.3;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, 'rgba(20,20,20,0.9)');
  gradient.addColorStop(0.6, 'rgba(30,30,30,0.7)');
  gradient.addColorStop(0.85, 'rgba(60,60,60,0.4)');
  gradient.addColorStop(1, 'rgba(80,80,80,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Crack lines
  ctx.strokeStyle = 'rgba(40,40,40,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const angle = Math.random() * Math.PI * 2;
    const len = r * (0.5 + Math.random() * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── BLOOD SPLAT TEXTURE ─────────────────────────────────────────────────────

export function generateBloodSplatTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  // Irregular organic shape
  ctx.fillStyle = 'rgba(80,0,0,0.8)';
  ctx.beginPath();
  const points = 8 + Math.floor(Math.random() * 4);
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = size * 0.2 + Math.random() * size * 0.15;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // Secondary splatter drops
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = size * (0.25 + Math.random() * 0.3);
    const r = 2 + Math.random() * 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(60,0,0,${0.3 + Math.random() * 0.4})`;
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── DECAL TEXTURE (generic round hole) ──────────────────────────────────────

export function generateRoundDecalTexture(size = 32, color = [30, 30, 30]) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const r = size * 0.4;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.8)`);
  gradient.addColorStop(0.8, `rgba(${color[0]},${color[1]},${color[2]},0.4)`);
  gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
