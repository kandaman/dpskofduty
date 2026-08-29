# DPSK OF DUTY — Modern Warfare FPS

A browser-based first-person shooter built with **Three.js** targeting the visual and gameplay quality of modern AAA FPS titles.

## Play

```
npm install
npm run dev
```

Open `http://localhost:3000`, click **PLAY**, then click the viewport to lock the pointer.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| LMB | Fire (automatic) |
| RMB | Aim Down Sights |
| Shift | Sprint |
| Space | Jump |
| Ctrl | Crouch |
| R | Reload |
| Esc | Release pointer |

## Architecture

```
src/
├── main.js                 # Entry point
├── Game.js                 # Core game loop, orchestrates all systems
├── engine/                 # Renderer, input, audio
├── player/                 # Camera, controller, weapon system
│   └── weapons/            # Weapon models & stats
├── environment/            # Level, lighting, skybox
├── enemies/                # AI state machine, spawn manager
├── effects/                # Particles, tracers, minimap
└── postprocessing/         # Bloom, vignette, FXAA, color grading
```

## Features

- **Rendering**: ACES filmic tone mapping, PCFSoft shadows, SRGB color space
- **Post-processing**: Bloom, vignette, color correction, FXAA anti-aliasing
- **Camera**: Inertial smoothing, head bob, FOV kick, ADS, camera shake
- **Weapon**: M4A1 detailed model, recoil, muzzle flash, shell ejection, bullet tracers
- **Feedback**: Hit markers, damage indicator, low-health vignette, kill feed
- **Enemy AI**: Patrol, alert, combat with flanking/strafe, difficulty scaling
- **Environment**: Buildings, roads, barriers, vehicles, lamp posts, atmospheric fog
- **Sky**: Procedural gradient skybox, star field, atmospheric haze
- **HUD**: Health bar, ammo counter, compass rose, circular minimap
- **Audio**: Procedural synthesis — gunshots, impacts, footsteps, reloads

## Tech

- Three.js r170 (WebGL2)
- Vite dev server
- HDRI/IBL lighting, PBR materials (Poly Haven textures), FBX/GLB models
- Asset licensing tracked in [ASSET-LICENSES.md](ASSET-LICENSES.md), inventory in `assets/manifest.json`

## Testing

Playwright-based bot tests drive a real browser (see `test/`). The main suite:

```
npm run test:phase3     # full acceptance suite (spawns dev server on :3005)
```

Individual checks live in `test/*.mjs`; ad-hoc diagnostics are archived in `test/archive/`.
