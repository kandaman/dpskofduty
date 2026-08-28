/**
 * MaterialManager — central PBR material registry.
 *
 * All materials in the game get their textures from this manager, which
 * generates procedural PBR maps (albedo, normal, roughness, metalness, AO)
 * once and caches shared instances.
 *
 * When an envMap is added (via PMREMGenerator or CubeCamera), call
 * updateEnvMap(cubeTexture) to propagate it to all PBR materials.
 */
import * as THREE from 'three';
import {
  generateConcreteAlbedo,
  generateConcreteNormal,
  generateConcreteRoughness,
  generateAsphaltAlbedo,
  generateAsphaltNormal,
  generateAsphaltRoughness,
  generateMetalAlbedo,
  generateMetalNormal,
  generateMetalRoughness,
  generateMetalnessMap,
  generatePaintedMetalAlbedo,
  generatePaintedMetalNormal,
  generatePaintedMetalRoughness,
  generateFabricAlbedo,
  generateFabricNormal,
  generateFabricRoughness,
  generateWoodAlbedo,
  generateWoodNormal,
  generateDirtAlbedo,
  generateSandbagAlbedo,
  generateSandbagNormal,
  generateAOMap,
  generateRoughnessMap
} from './TextureGenerator.js';

export class MaterialManager {
  constructor() {
    this._cache = new Map();
    this._envMap = null;
    this._envMapIntensity = 0.8;
    this._textureSize = 512; // default, override per quality
    this._init();
  }

  _init() {
    // Generate all shared textures once
    this._tex = {
      concrete: {
        map: generateConcreteAlbedo(),
        normal: generateConcreteNormal(),
        roughness: generateConcreteRoughness(),
        ao: generateAOMap()
      },
      concreteDark: {
        map: this._darkenTexture(generateConcreteAlbedo()),
        normal: generateConcreteNormal(),
        roughness: generateConcreteRoughness(),
        ao: generateAOMap()
      },
      asphalt: {
        map: generateAsphaltAlbedo(),
        normal: generateAsphaltNormal(),
        roughness: generateAsphaltRoughness(),
        ao: generateAOMap()
      },
      metal: {
        map: generateMetalAlbedo(512, 0x888888),
        normal: generateMetalNormal(),
        roughness: generateMetalRoughness(512, 0.3),
        metalness: generateMetalnessMap(),
        ao: generateAOMap()
      },
      darkMetal: {
        map: generateMetalAlbedo(512, 0x333333),
        normal: generateMetalNormal(),
        roughness: generateMetalRoughness(512, 0.25),
        metalness: generateMetalnessMap(),
        ao: generateAOMap()
      },
      paintedMetal: {
        map: generatePaintedMetalAlbedo(512, 0x445566),
        normal: generatePaintedMetalNormal(),
        roughness: generatePaintedMetalRoughness(),
        metalness: generateMetalnessMap(),
        ao: generateAOMap()
      },
      paintedMetalDark: {
        map: generatePaintedMetalAlbedo(512, 0x2a2a2a),
        normal: generatePaintedMetalNormal(),
        roughness: generatePaintedMetalRoughness(),
        metalness: generateMetalnessMap(),
        ao: generateAOMap()
      },
      fabric: {
        map: generateFabricAlbedo(512, 0x556b2f),
        normal: generateFabricNormal(),
        roughness: generateFabricRoughness(),
        ao: generateAOMap()
      },
      fabricOlive: {
        map: generateFabricAlbedo(512, 0x4a5a3a),
        normal: generateFabricNormal(),
        roughness: generateFabricRoughness(),
        ao: generateAOMap()
      },
      fabricGrey: {
        map: generateFabricAlbedo(512, 0x666666),
        normal: generateFabricNormal(),
        roughness: generateFabricRoughness(),
        ao: generateAOMap()
      },
      wood: {
        map: generateWoodAlbedo(),
        normal: generateWoodNormal(),
        roughness: generateRoughnessMap(512, 0.7),
        ao: generateAOMap()
      },
      dirt: {
        map: generateDirtAlbedo(),
        roughness: generateRoughnessMap(512, 0.9),
        ao: generateAOMap()
      },
      sandbag: {
        map: generateSandbagAlbedo(),
        normal: generateSandbagNormal(),
        roughness: generateRoughnessMap(512, 0.85),
        ao: generateAOMap()
      },
      skin: {
        map: generateFabricAlbedo(512, 0xddaa88),
        roughness: generateRoughnessMap(512, 0.6),
        ao: generateAOMap()
      },
      plastic: {
        roughness: generateRoughnessMap(512, 0.5),
        ao: generateAOMap()
      },
      barrelMetal: {
        map: generateMetalAlbedo(1024, 0x222222),
        normal: generateMetalNormal(1024),
        roughness: generateMetalRoughness(1024, 0.15),
        metalness: generateMetalnessMap(1024),
        ao: generateAOMap(1024)
      },
      gripMaterial: {
        map: generateFabricAlbedo(512, 0x3d2b1f),
        normal: generateFabricNormal(),
        roughness: generateRoughnessMap(512, 0.8),
        ao: generateAOMap()
      }
    };
  }

  /**
   * Create a darker version of a texture by reducing brightness
   */
  _darkenTexture(tex) {
    // For simplicity, we just return the same texture with a color multiplier
    // applied through material color. This avoids duplicating texture memory.
    return tex;
  }

  /**
   * Build a MeshStandardMaterial from a texture set.
   * @param {string} texName - key in this._tex
   * @param {object} [overrides] - material property overrides (color, roughness, metalness, etc.)
   * @returns {THREE.MeshStandardMaterial}
   */
  _buildMaterial(texName, overrides = {}) {
    const tex = this._tex[texName];
    if (!tex) {
      console.warn(`MaterialManager: unknown texture set "${texName}"`);
      return new THREE.MeshStandardMaterial(overrides);
    }
    const matOpts = {
      roughness: overrides.roughness ?? 0.5,
      metalness: overrides.metalness ?? 0.0,
      color: overrides.color ?? 0xffffff,
      emissive: overrides.emissive ?? 0x000000,
      emissiveIntensity: overrides.emissiveIntensity ?? 0,
      envMapIntensity: this._envMapIntensity,
      ...overrides
    };
    // Only set texture properties when defined (avoids Three.js warnings)
    if (tex.map) matOpts.map = tex.map;
    if (tex.normal) matOpts.normalMap = tex.normal;
    if (tex.roughness) matOpts.roughnessMap = tex.roughness;
    if (tex.metalness) matOpts.metalnessMap = tex.metalness;
    if (tex.ao) matOpts.aoMap = tex.ao;
    if (this._envMap) matOpts.envMap = this._envMap;

    const mat = new THREE.MeshStandardMaterial(matOpts);
    return mat;
  }

  // ─── PUBLIC API ──────────────────────────────────────────────────────────

  getConcrete(variant = 'standard', overrides = {}) {
    const key = `concrete_${variant}`;
    if (!this._cache.has(key)) {
      const texName = variant === 'dark' ? 'concreteDark' : 'concrete';
      this._cache.set(key, this._buildMaterial(texName, {
        roughness: 0.85,
        metalness: 0.0,
        color: 0xcccccc,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getAsphalt(overrides = {}) {
    const key = 'asphalt';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('asphalt', {
        roughness: 0.85,
        metalness: 0.0,
        color: 0x999999,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getBareMetal(color = 0x888888, roughness = 0.3, overrides = {}) {
    const key = `metal_${color}_${roughness}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('metal', {
        roughness,
        metalness: 0.9,
        color,
        envMapIntensity: 1.0,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getDarkMetal(overrides = {}) {
    const key = 'darkMetal';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.25,
        metalness: 0.9,
        color: 0x555555,
        envMapIntensity: 1.0,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPaintedMetal(color = 0x445566, overrides = {}) {
    const key = `painted_${color}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetal', {
        roughness: 0.4,
        metalness: 0.6,
        color,
        envMapIntensity: 0.8,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPaintedMetalDark(overrides = {}) {
    const key = 'paintedDark';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.4,
        metalness: 0.6,
        color: 0x555555,
        envMapIntensity: 0.8,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabric(color = 0x556b2f, overrides = {}) {
    const key = `fabric_${color}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabric', {
        roughness: 0.8,
        metalness: 0.0,
        color,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabricOlive(overrides = {}) {
    const key = 'fabricOlive';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabricOlive', {
        roughness: 0.8,
        metalness: 0.0,
        color: 0x8a9a6a,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabricGrey(overrides = {}) {
    const key = 'fabricGrey';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabricGrey', {
        roughness: 0.8,
        metalness: 0.0,
        color: 0xaaaaaa,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWood(overrides = {}) {
    const key = 'wood';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('wood', {
        roughness: 0.8,
        metalness: 0.0,
        color: 0xbbaa88,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getDirt(overrides = {}) {
    const key = 'dirt';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('dirt', {
        roughness: 0.95,
        metalness: 0.0,
        color: 0x998877,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getSandbag(overrides = {}) {
    const key = 'sandbag';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('sandbag', {
        roughness: 0.85,
        metalness: 0.0,
        color: 0xccbb99,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getSkin(overrides = {}) {
    const key = 'skin';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('skin', {
        roughness: 0.6,
        metalness: 0.0,
        color: 0xeeccaa,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPlastic(overrides = {}) {
    const key = 'plastic';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('plastic', {
        roughness: 0.5,
        metalness: 0.0,
        color: 0x888888,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  // ─── WEAPON-SPECIFIC MATERIALS ──────────────────────────────────────────

  getWeaponBody(overrides = {}) {
    const key = 'weaponBody';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.35,
        metalness: 0.7,
        color: 0x555555,
        envMapIntensity: 0.9,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponBarrel(overrides = {}) {
    const key = 'weaponBarrel';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('barrelMetal', {
        roughness: 0.15,
        metalness: 0.95,
        color: 0x444444,
        envMapIntensity: 1.0,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponGrip(overrides = {}) {
    const key = 'weaponGrip';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('gripMaterial', {
        roughness: 0.85,
        metalness: 0.0,
        color: 0x6d4b3f,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponRail(overrides = {}) {
    const key = 'weaponRail';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.4,
        metalness: 0.7,
        color: 0x444444,
        envMapIntensity: 0.7,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponSight(overrides = {}) {
    const key = 'weaponSight';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.3,
        metalness: 0.6,
        color: 0x333333,
        envMapIntensity: 0.5,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponMagazine(overrides = {}) {
    const key = 'weaponMag';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.4,
        metalness: 0.7,
        color: 0x555555,
        envMapIntensity: 0.8,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponStock(overrides = {}) {
    const key = 'weaponStock';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('gripMaterial', {
        roughness: 0.8,
        metalness: 0.0,
        color: 0x5d4b3f,
        ...overrides
      }));
    }
    return this._cache.get(key);
  }

  // ─── ENVIRONMENT MAP ────────────────────────────────────────────────────

  setEnvMap(envMap) {
    this._envMap = envMap;
    // Propagate to all cached materials
    for (const mat of this._cache.values()) {
      mat.envMap = envMap;
      mat.needsUpdate = true;
    }
  }

  setEnvMapIntensity(intensity) {
    this._envMapIntensity = intensity;
    for (const mat of this._cache.values()) {
      mat.envMapIntensity = intensity;
    }
  }

  /**
   * Set texture resolution quality (call before first material request for best results).
   * @param {number} size - texture size (256, 512, 1024, etc.)
   */
  setTextureSize(size) {
    if (size === this._textureSize) return;
    this._textureSize = size;
    // Clear cache so textures regenerate at new size on next request
    this._cache.clear();
    this._init();
  }

  /**
   * Dispose all materials and textures
   */
  dispose() {
    for (const mat of this._cache.values()) {
      mat.dispose();
    }
    this._cache.clear();
    // Dispose generated textures
    for (const key in this._tex) {
      const set = this._tex[key];
      for (const tkey in set) {
        if (set[tkey] instanceof THREE.Texture) {
          set[tkey].dispose();
        }
      }
    }
  }
}
