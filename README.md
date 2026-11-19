# Neon City Racer

AAA-style street racing / open-district driving game built with **Vite + React + TypeScript**, **React Three Fiber**, **Rapier**, and Blender-exported Draco/WebP `.glb` assets.

## Features

- Raycast vehicle physics (per-wheel suspension, drift, nitrous)
- Stage 1: Neon downtown circuit (`stage1_city.glb`)
- Stage 2: Mountain / coastal touge (`stage2_canyon.glb`)
- AI traffic + sidewalk pedestrians
- Free Drift multiplier & Time Attack modes
- HDRI lighting, ACES tone mapping, bloom HUD

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Drive |
| Space | Drift |
| Shift | Nitrous |
| C | Camera (chase / hood / cinematic) |

## Scripts

```bash
npm install
npm run dev
npm run optimize-models
npm run build
```

## Assets

Models live in `public/models/` (Blender → glTF → `gltf-transform optimize`). HDRI from Poly Haven in `public/hdri/`.
