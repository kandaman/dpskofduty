# VISUAL OVERHAUL PHASE 2 — Handoff Document

## Current State

Phase 2 (free-asset photorealistic replacement) is in progress. Infrastructure and initial asset acquisition complete. Model integration pending.

## What Has Been Done

### Asset Infrastructure
- `src/engine/AssetManager.js` — GLTF/GLB loader with Draco support, RGBELoader for HDRI, PMREMGenerator for IBL, auto envMap propagation to materials, texture caching
- `scripts/download-assets.mjs` — downloads CC0 HDRIs (Poly Haven) and PBR textures
- `scripts/itch-download.mjs` / `itch-download2.mjs` / `itch-download3.mjs` — attempts to automate Itch.io free downloads (Quaternius assets require manual browser download — Itch.io anti-automation blocks headless browsers)
- `start-dev.cmd` — launches Vite without npm (uses Playwright's bundled node.exe)
- `ASSET-LICENSES.md` — complete license tracking for all 15+ external assets
- `assets/manifest.json` — structured asset inventory

### HDRI/IBL (Integrated and Working)
- `public/assets/hdri/industrial_sunset_2k.hdr` — Poly Haven CC0, 4.2MB 2K
- Game.js: async `_loadEnvironmentMap()` loads HDRI via RGBELoader → PMREMGenerator → sets `scene.environment`
- MaterialManager: `setEnvMap()` propagates envMap to all cached PBR materials
- **Verification**: `scene.environment != null` and `materialEnvMap == true` confirmed in Playwright test

### Assets Downloaded (All CC0)

| Asset | Source | Format | Quality |
|-------|--------|--------|---------|
| M4A1 Rifle | OpenGameArt | FBX + Base Color, Normal, Metallic, Roughness, Height PBR textures | **Primary weapon candidate** |
| Low-Poly M4A1 | OpenGameArt | FBX + Diffuse texture | Fallback |
| Various Small Arms | OpenGameArt | .blend (M4, AK47, L85, G3A3 etc.) | Backup |
| CesiumMan (rigged human) | Khronos glTF | GLTF-Binary, 490KB | **Primary character candidate** |
| Fox, RiggedFigure | Khronos glTF | GLB | Animation test references |
| DamagedHelmet (PBR) | Khronos glTF | GLB, 3.7MB | High-quality PBR reference |
| Buggy, MilkTruck | Khronos glTF | GLB | Vehicle props |
| AntiqueCamera, Lantern, WaterBottle, ToyCar | Khronos glTF | GLB | Environment props |
| BoomBox | Khronos glTF | GLB, 10.9MB | Radio/environment prop |
| Industrial Sunset HDRI | Poly Haven | HDR 2K, 4.2MB | **IBL active** |

### What Remains

#### 1. Integrate M4A1 FBX Model (Highest Priority)
The procedural `AssaultRifle.js` (`_createWeaponModel()`) must be replaced with the FBX model.

**Approach:**
- Modify `AssaultRifle.js` to accept `game` and use `game.assetManager` to load `weapons/m4a1/M4A1.fbx` via `FBXLoader`
- Three.js FBXLoader is available at `three/examples/jsm/loaders/FBXLoader.js`
- Import path: `import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'`
- On load: position/scale the model to match first-person camera (~0.55 scale, position at +0.3, -0.25, -0.5)
- Set up textures manually: load Base_Color, Normal, Metallic, Roughness as `MeshStandardMaterial` maps
- Keep shellEjectPoint, muzzlePoint as `Object3D` children attached to the FBX scene

**Files to modify:**
- `src/player/weapons/AssaultRifle.js` — replace `_createWeaponModel()` with async loader
- Possibly `src/player/WeaponController.js` — adjust for async weapon loading

**FBX model details:**
- FBX path: `public/assets/weapons/m4a1/M4A1.fbx` (278KB)
- Textures (in same directory):
  - `M4A1_Base_Color.png` (518KB) — sRGB
  - `M4A1_Normal.png` (973KB) — linear
  - `M4A1_Metallic.png` (308KB) — linear
  - `M4A1_Roughness.png` (1.6MB) — linear
  - `M4A1_Height.png` (11KB) — for parallax/displacement if needed
  - `M4A1Diffuse.png` (595KB) — fallback from lowpoly pack

#### 2. Integrate CesiumMan as Enemy Character (High Priority)
Replace procedural `Enemy._createMesh()` with CesiumMan.glb loaded via AssetManager.

**Approach:**
- Load `characters/CesiumMan.glb` in `EnemyManager` or `Enemy` constructor
- Position/scale to match enemy placement
- Apply environment map from game's HDRI
- Keep existing AI/logic/collision separate from visual mesh
- Add tactical equipment (vest, helmet, pouches) as separate meshes on top if desired

**Files to modify:**
- `src/enemies/Enemy.js` — replace `_createMesh()` with GLTF loading
- `src/enemies/EnemyManager.js` — load model once, instance per enemy

#### 3. Improve Post-Processing
- Fix GTAOPass (currently disabled — need to verify it works)
- Tune bloom/color grading after visual assets are in place
- Consider SAOPass as alternative if GTAO has issues

#### 4. Convert FBX to GLTF (Optional but Recommended)
If FBX loading is problematic, convert the M4A1 to GLTF using:
- Blender (free) — import FBX, export as GLTF with textures embedded
- Online FBX-to-GLTF converter

#### 5. Download More PBR Textures
Run `node scripts/download-assets.mjs` (requires working npm or node) to get:
- Concrete, asphalt, metal, fabric PBR textures from Poly Haven

## Key Architectural Decisions

- **AssetManager** is the single entry point for all external models — provides loading, caching, envMap propagation, shadow enablement
- **MaterialManager** handles procedural PBR materials — `setEnvMap()` propagates envMap to all cached materials
- **HDRI loading** is async and non-blocking; materials fall back to procedural generation if HDRI is unavailable
- **Gameplay freeze** — no AI, balance, or system changes during visual overhaul

## Build & Run

```bash
# Without npm:
double-click start-dev.cmd
# Or:
C:\Users\taiji\AppData\Local\ms-playwright-go\1.57.0\node.exe node_modules/vite/bin/vite.js

# With npm:
npm install
npm run dev

# Open http://localhost:3000
```

## Asset Download Instructions (Remaining)

Quaternius assets (50+ LowPoly Guns, Universal Base Characters) require manual download:
1. Open https://quaternius.itch.io in browser
2. Navigate to pack page, click "Download Now"
3. Set price to $0 and download
4. Extract ZIP contents to `public/assets/weapons/` or `public/assets/characters/`

## Debugging

Playwright screenshot tests:
```bash
node -e "const { chromium } = require('playwright'); ... "
```

Key diagnostics:
- `window.game.scene.environment != null` — HDRI loaded
- `window.game.materials._envMap != null` — materials receiving envMap
- `window.game.assetManager.isLoaded(path)` — model cached

## Commits

```
14fbfa6 PHASE 2c — M4A1 rifle with PBR textures from OpenGameArt (CC0)
49bf741 PHASE 2b — CC0 asset library (12 free models + HDRI) and IBL integration
fc94c62 VISUAL OVERHAUL PHASE 2 — HDRI/IBL pipeline, asset infrastructure
eb7b36e VISUAL OVERHAUL — photorealistic military FPS rendering, materials, lighting
```
