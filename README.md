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

- Three.js r185 (WebGL2)
- Vite dev server
- 100% procedural — no external assets, textures, or audio files
