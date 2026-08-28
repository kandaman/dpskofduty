/**
 * AssetManager — GLTF/GLB model loader with caching and Three.js integration.
 *
 * Handles loading, caching, and material normalization for external 3D assets.
 * Assets are loaded from public/assets/ directory based on type.
 *
 * Usage:
 *   const assetManager = new AssetManager(renderer);
 *   const model = await assetManager.load('weapons/UltimateWeapons.glb');
 *   scene.add(model.scene);
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class AssetManager {
  constructor(renderer = null) {
    this._cache = new Map();
    this._textureCache = new Map();
    this._renderer = renderer;

    // GLTF loader with optional Draco support
    this._gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this._gltfLoader.setDRACOLoader(dracoLoader);

    // FBX loader
    this._fbxLoader = new FBXLoader();

    // RGBE/HDRI loader
    this._rgbeLoader = new RGBELoader();

    // Texture loader for generic paths
    this._textureLoader = new THREE.TextureLoader();

    // Active environment map
    this._envMap = null;
  }

  /**
   * Load a GLTF/GLB model from public/assets/
   * @param {string} path - relative path within public/assets/ (e.g. 'weapons/model.glb')
   * @returns {Promise<THREE.Group>} the loaded scene
   */
  async load(path) {
    if (this._cache.has(path)) {
      return this._cache.get(path);
    }

    const url = `/assets/${path}`;
    return new Promise((resolve, reject) => {
      this._gltfLoader.load(
        url,
        (gltf) => {
          const scene = gltf.scene || gltf.scenes?.[0];
          if (!scene) {
            reject(new Error(`No scene in GLTF: ${path}`));
            return;
          }

          // Apply environment map to all materials in the model
          if (this._envMap) {
            scene.traverse((child) => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                  mat.envMap = this._envMap;
                  mat.envMapIntensity = 1.0;
                  mat.needsUpdate = true;
                });
              }
            });
          }

          // Enable shadows on all meshes
          scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this._cache.set(path, scene);
          resolve(scene);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Load an FBX model from public/assets/
   * @param {string} path - relative path within public/assets/ (e.g. 'weapons/m4a1/M4A1.fbx')
   * @returns {Promise<THREE.Group>} the loaded scene
   */
  async loadFBX(path) {
    if (this._cache.has(path)) {
      return this._cache.get(path);
    }

    const url = `/assets/${path}`;
    return new Promise((resolve, reject) => {
      this._fbxLoader.load(
        url,
        (group) => {
          // Apply environment map to all materials in the model
          if (this._envMap) {
            group.traverse((child) => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                  mat.envMap = this._envMap;
                  mat.envMapIntensity = 1.0;
                  mat.needsUpdate = true;
                });
              }
            });
          }

          // Enable shadows on all meshes
          group.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this._cache.set(path, group);
          resolve(group);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Load a single texture from a full asset-relative path.
   * @param {string} path - path within public/assets/ (e.g. 'weapons/m4a1/M4A1_Base_Color.png')
   * @returns {Promise<THREE.Texture>}
   */
  async loadAssetTexture(path) {
    if (this._textureCache.has(path)) {
      return this._textureCache.get(path);
    }

    const url = `/assets/${path}`;
    return new Promise((resolve, reject) => {
      this._textureLoader.load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 4;
          this._textureCache.set(path, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load an HDRI environment map and set it as the scene environment.
   * @param {string} path - path within public/assets/hdri/
   * @param {THREE.Scene} scene - scene to apply envMap to
   * @param {THREE.WebGLRenderer} renderer - renderer for PMREMGenerator
   * @returns {Promise<THREE.Texture>} the environment map
   */
  async loadEnvironmentMap(path, scene, renderer) {
    const url = `/assets/hdri/${path}`;
    return new Promise((resolve, reject) => {
      this._rgbeLoader.load(
        url,
        (hdrTexture) => {
          const pmremGenerator = new THREE.PMREMGenerator(renderer);
          pmremGenerator.compileEquirectangularShader();

          const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
          this._envMap = envMap;
          scene.environment = envMap;

          // Update all cached models with new envMap
          for (const cachedScene of this._cache.values()) {
            cachedScene.traverse((child) => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                  mat.envMap = envMap;
                  mat.envMapIntensity = 1.0;
                  mat.needsUpdate = true;
                });
              }
            });
          }

          hdrTexture.dispose();
          pmremGenerator.dispose();

          resolve(envMap);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Load a single texture (JPG/PNG) from public/assets/textures/
   * @param {string} path - path within public/assets/textures/
   * @returns {Promise<THREE.Texture>}
   */
  async loadTexture(path) {
    if (this._textureCache.has(path)) {
      return this._textureCache.get(path);
    }

    const url = `/assets/textures/${path}`;
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = 4;
          this._textureCache.set(path, texture);
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Check if a model is already loaded and cached.
   */
  isLoaded(path) {
    return this._cache.has(path);
  }

  /**
   * Get the loaded model scene.
   */
  get(path) {
    return this._cache.get(path) || null;
  }

  /**
   * Update environment map for all cached models.
   */
  setEnvMap(envMap) {
    this._envMap = envMap;
    for (const cachedScene of this._cache.values()) {
      cachedScene.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            mat.envMap = envMap;
            mat.needsUpdate = true;
          });
        }
      });
    }
  }

  /**
   * Dispose all cached resources.
   */
  dispose() {
    for (const scene of this._cache.values()) {
      scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => m.dispose());
          }
        }
      });
    }
    this._cache.clear();
    this._textureCache.clear();
  }
}
