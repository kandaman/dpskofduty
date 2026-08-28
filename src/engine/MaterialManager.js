/**
 * MaterialManager — central PBR material registry.
 *
 * All materials in the game get their textures from this manager, which
 * generates procedural PBR maps (albedo, normal, roughness, metalness, AO)
 * once and caches shared instances.
 *
 * When real PBR textures are available (from public/assets/textures/), they
 * replace the procedural versions automatically.
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
    this._textureSize = 512;
    this._realTextures = {}; // populated by _loadRealTextures
    this._realTexturesReady = false;

    this._init(); // procedural textures
    this._loadRealTextures(); // async real PBR textures (silent fallback)
  }

  // ─── PROCEDURAL TEXTURES (fallback) ────────────────────────────────

  _init() {
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

  // ─── REAL PBR TEXTURES (from Poly Haven / ambientCG) ──────────────

  /**
   * Async load real PBR textures from public/assets/textures/.
   * Falls back silently to procedural if textures don't exist.
   */
  async _loadRealTextures() {
    const loader = new THREE.TextureLoader();
    const texDir = '/assets/textures/';

    const sets = {
      // Concrete
      concretePlaster: {
        base: 'brushed_concrete',
        surface: 'concrete_plaster',
      },
      concreteFloor: {
        base: 'concrete_floor_02',
        surface: 'concrete_floor',
      },
      concreteWorn: {
        base: 'concrete_floor_worn_02',
        surface: 'concrete_worn',
      },
      concreteDamaged: {
        base: 'concrete_floor_damaged_01',
        surface: 'concrete_damaged',
      },
      concreteAntiSlip: {
        base: 'anti_slip_concrete',
        surface: 'concrete_anti_slip',
      },
      // Asphalt
      asphaltFloor: {
        base: 'asphalt_floor',
        surface: 'asphalt',
      },
      asphalt: {
        base: 'asphalt_01',
        surface: 'asphalt_alt',
      },
      // Dirt
      dryGround: {
        base: 'dry_ground_01',
        surface: 'dirt',
      },
      forestGround: {
        base: 'forest_ground_04',
        surface: 'forest_ground',
      },
      burnedGround: {
        base: 'burned_ground_01',
        surface: 'burned_ground',
      },
      dirtyConcrete: {
        base: 'dirty_concrete',
        surface: 'dirty_concrete',
      },
      // Metal
      metalPlate: {
        base: 'metal_plate',
        surface: 'metal',
      },
      metalPlate02: {
        base: 'metal_plate_02',
        surface: 'metal_plate',
      },
      blueMetalPlate: {
        base: 'blue_metal_plate',
        surface: 'blue_metal',
      },
      rustyMetal: {
        base: 'rusty_metal',
        surface: 'rusty_metal',
      },
      // Wood
      woodFloor: {
        base: 'wood_floor',
        surface: 'wood',
      },
      woodPlanks: {
        base: 'wood_planks',
        surface: 'wood_planks',
      },
      oldWoodFloor: {
        base: 'old_wooden_floor_01',
        surface: 'old_wood',
      },
    };

    const loaded = {};
    let loadCount = 0;

    for (const [setKey, set] of Object.entries(sets)) {
      const maps = {
        map: `${set.base}_diff_2k.jpg`,
        normal: `${set.base}_nor_gl_2k.jpg`,
        roughness: `${set.base}_rough_2k.jpg`,
        ao: `${set.base}_ao_2k.jpg`,
      };

      const textures = {};
      let hasAll = true;

      for (const [mapKey, filename] of Object.entries(maps)) {
        try {
          const tex = await this._loadTexture(loader, texDir + filename);
          textures[mapKey] = tex;
          loadCount++;
        } catch {
          hasAll = false;
          break;
        }
      }

      if (hasAll) {
        loaded[set.surface] = textures;
      }
    }

    this._realTextures = loaded;
    this._realTexturesReady = true;

    if (loadCount > 0) {
      console.log(`MaterialManager: loaded ${loadCount} real PBR textures (${Object.keys(loaded).length} sets)`);
    }
  }

  _loadTexture(loader, url) {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          tex.colorSpace = THREE.NoColorSpace;
          resolve(tex);
        },
        undefined,
        () => reject(new Error(`Failed to load ${url}`))
      );
    });
  }

  /**
   * Check if real textures are available for a surface type.
   */
  _hasReal(surfaceType) {
    return this._realTexturesReady && !!this._realTextures[surfaceType];
  }

  /**
   * Build a material from real PBR textures.
   */
  _buildRealMaterial(surfaceType, overrides = {}) {
    const tex = this._realTextures[surfaceType];
    if (!tex) return null;

    const matOpts = {
      map: tex.map,
      normalMap: tex.normal,
      roughnessMap: tex.roughness,
      aoMap: tex.ao,
      roughness: overrides.roughness ?? 0.8,
      metalness: overrides.metalness ?? 0.0,
      color: overrides.color ?? 0xffffff,
      envMap: this._envMap || undefined,
      envMapIntensity: this._envMapIntensity,
      ...overrides,
    };

    return new THREE.MeshStandardMaterial(matOpts);
  }

  _darkenTexture(tex) {
    return tex;
  }

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
    // Prefer real textures
    if (variant === 'standard' && this._hasReal('concrete_plaster')) {
      const mKey = `real_concrete_plaster`;
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('concrete_plaster', {
          roughness: 0.85, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (variant === 'worn' && this._hasReal('concrete_worn')) {
      const mKey = `real_concrete_worn`;
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('concrete_worn', {
          roughness: 0.9, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (variant === 'damaged' && this._hasReal('concrete_damaged')) {
      const mKey = `real_concrete_damaged`;
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('concrete_damaged', {
          roughness: 0.9, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (variant === 'anti_slip' && this._hasReal('concrete_anti_slip')) {
      const mKey = `real_concrete_anti_slip`;
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('concrete_anti_slip', {
          roughness: 0.85, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    // Procedural fallback
    if (!this._cache.has(key)) {
      const texName = variant === 'dark' ? 'concreteDark' : 'concrete';
      this._cache.set(key, this._buildMaterial(texName, {
        roughness: 0.85, metalness: 0.0, color: 0xcccccc, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getAsphalt(overrides = {}) {
    const key = 'asphalt';
    if (this._hasReal('asphalt')) {
      const mKey = 'real_asphalt';
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('asphalt', {
          roughness: 0.85, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('asphalt', {
        roughness: 0.85, metalness: 0.0, color: 0x999999, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getBareMetal(color = 0x888888, roughness = 0.3, overrides = {}) {
    const key = `metal_${color}_${roughness}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('metal', {
        roughness, metalness: 0.9, color, envMapIntensity: 1.0, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getDarkMetal(overrides = {}) {
    const key = 'darkMetal';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.25, metalness: 0.9, color: 0x555555, envMapIntensity: 1.0, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPaintedMetal(color = 0x445566, overrides = {}) {
    const key = `painted_${color}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetal', {
        roughness: 0.4, metalness: 0.6, color, envMapIntensity: 0.8, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPaintedMetalDark(overrides = {}) {
    const key = 'paintedDark';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.4, metalness: 0.6, color: 0x555555, envMapIntensity: 0.8, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabric(color = 0x556b2f, overrides = {}) {
    const key = `fabric_${color}`;
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabric', {
        roughness: 0.8, metalness: 0.0, color, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabricOlive(overrides = {}) {
    const key = 'fabricOlive';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabricOlive', {
        roughness: 0.8, metalness: 0.0, color: 0x8a9a6a, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getFabricGrey(overrides = {}) {
    const key = 'fabricGrey';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('fabricGrey', {
        roughness: 0.8, metalness: 0.0, color: 0xaaaaaa, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWood(overrides = {}) {
    const key = 'wood';
    if (this._hasReal('wood')) {
      const mKey = 'real_wood';
      if (!this._cache.has(mKey)) {
        this._cache.set(mKey, this._buildRealMaterial('wood', {
          roughness: 0.8, metalness: 0.0, color: 0xffffff, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('wood', {
        roughness: 0.8, metalness: 0.0, color: 0xbbaa88, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getDirt(overrides = {}) {
    const key = 'dirt';
    if (this._hasReal('dirt')) {
      const mKey = 'real_dirt';
      if (!this._cache.has(mKey)) {
        const tex = this._realTextures.dirt;
        this._cache.set(mKey, this._buildRealMaterial('dirt', {
          roughness: 0.95, metalness: 0.0, ...overrides
        }));
      }
      return this._cache.get(mKey);
    }
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('dirt', {
        roughness: 0.95, metalness: 0.0, color: 0x998877, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getSandbag(overrides = {}) {
    const key = 'sandbag';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('sandbag', {
        roughness: 0.85, metalness: 0.0, color: 0xccbb99, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getSkin(overrides = {}) {
    const key = 'skin';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('skin', {
        roughness: 0.6, metalness: 0.0, color: 0xeeccaa, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getPlastic(overrides = {}) {
    const key = 'plastic';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('plastic', {
        roughness: 0.5, metalness: 0.0, color: 0x888888, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  // ─── WEAPON-SPECIFIC MATERIALS ──────────────────────────────────────────

  getWeaponBody(overrides = {}) {
    const key = 'weaponBody';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.35, metalness: 0.7, color: 0x555555, envMapIntensity: 0.9, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponBarrel(overrides = {}) {
    const key = 'weaponBarrel';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('barrelMetal', {
        roughness: 0.15, metalness: 0.95, color: 0x444444, envMapIntensity: 1.0, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponGrip(overrides = {}) {
    const key = 'weaponGrip';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('gripMaterial', {
        roughness: 0.85, metalness: 0.0, color: 0x6d4b3f, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponRail(overrides = {}) {
    const key = 'weaponRail';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.4, metalness: 0.7, color: 0x444444, envMapIntensity: 0.7, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponSight(overrides = {}) {
    const key = 'weaponSight';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('darkMetal', {
        roughness: 0.3, metalness: 0.6, color: 0x333333, envMapIntensity: 0.5, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponMagazine(overrides = {}) {
    const key = 'weaponMag';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('paintedMetalDark', {
        roughness: 0.4, metalness: 0.7, color: 0x555555, envMapIntensity: 0.8, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  getWeaponStock(overrides = {}) {
    const key = 'weaponStock';
    if (!this._cache.has(key)) {
      this._cache.set(key, this._buildMaterial('gripMaterial', {
        roughness: 0.8, metalness: 0.0, color: 0x5d4b3f, ...overrides
      }));
    }
    return this._cache.get(key);
  }

  // ─── ENVIRONMENT MAP ────────────────────────────────────────────────────

  setEnvMap(envMap) {
    this._envMap = envMap;
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

  setTextureSize(size) {
    if (size === this._textureSize) return;
    this._textureSize = size;
    this._cache.clear();
    this._init();
  }

  dispose() {
    for (const mat of this._cache.values()) {
      mat.dispose();
    }
    this._cache.clear();
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
