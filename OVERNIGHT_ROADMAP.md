# Neon City Racer — Overnight Autonomous Roadmap

This roadmap drives overnight / multi-phase work. Every phase is gated by `.cursor/rules/game-guardrails.mdc`. **Do not start the next phase until the current phase PASSes.**

Shared gate (Rule 5) for every phase:

- [ ] `npm run build` succeeds with **zero** TypeScript errors
- [ ] Playwright visual + console check passes for that phase’s acceptance screenshots
- [ ] No new procedural visual primitives introduced
- [ ] Compressed gameplay `.glb` total remains **&lt; 30 MB** (re-check after asset changes)

---

## Phase 1 — Blender Vehicle Repair & Verification

**Goal:** All purchasable + traffic cars are game-ready axis/wheel standards.

### Work

- Import each car via Blender MCP (Sketchfab / existing project GLBs that originated from Sketchfab).
- Enforce Rule 2: face `-Y`, tires on `Z = 0.0`, `Wheel_FL/FR/RL/RR` pivots centered without moving wheels out of arches.
- Export: `car_starter.glb`, `car_muscle.glb`, `car_super.glb`, `car_hyper.glb`, `traffic_sedan.glb`, `traffic_suv.glb`.
- Capture Blender viewport proof (three-quarter + side + top per car or batch).

### PASS

- [ ] Every listed car exports with `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` present
- [ ] Lowest tire point at Blender `Z ≈ 0` (not below ground)
- [ ] Car faces `-Y` in Blender; length ≈ 4.2–4.8 m after normalize
- [ ] Viewport screenshots saved / shown proving wheels stay in arches
- [ ] Shared Rule 5 gate green

### FAIL (block Phase 2)

- Wheels teleported outside arches, car sunk below `Z = 0`, missing wheel empties, or build/Playwright gate red

---

## Phase 2 — Game-Ready Coastal City Map & Empty Markers

**Goal:** Production `world_map.glb` with real Sketchfab/Poly Haven assets and marker empties only (no guessed coords).

### Work

- Assemble coastal / highway city from Sketchfab (Blender MCP); Poly Haven asphalt/HDRI as needed.
- Place empties snapped to road/sidewalk surfaces:
  - `Spawn_Player`
  - `Traffic_Lane_A_01`…`A_12`, `Traffic_Lane_B_01`…`B_12`
  - `Pedestrian_Path_01`…`Pedestrian_Path_10`
- Separate visual vs collision intent (`Visual_World` / `Collider_Road` / `Collider_Walls` naming or collections).
- Optimize with Draco + 1024 WebP; keep total GLB budget &lt; 30 MB.

### PASS

- [ ] `world_map.glb` contains all required Empty marker names (verify via glTF node list)
- [ ] Markers sit on road/sidewalk surfaces (viewport or ray-hit proof)
- [ ] No procedural city/track as the visible world
- [ ] Shared Rule 5 gate green

### FAIL (block Phase 3)

- Missing markers, inventing spawn coords in code, world over budget, or gate red

---

## Phase 3 — Rapier Raycast Physics, Drift & Water Shader

**Goal:** Driveable car on parsed spawn with arcade drift/nitro and coastal water.

### Work

- Spawn `activeCar` at parsed `Spawn_Player`; downward Rapier raycast for tire flush.
- Rapier raycast / DynamicRayCast vehicle suspension; Drift + Nitro juice (skids, smoke, FOV kick).
- `three-stdlib` `Water` (or equivalent coastal water) + HDRI / ACES / selective Bloom (off on low GPU).
- Honor DPR clamp + BakeShadows / Preload where applicable.

### PASS

- [ ] Car spawns from marker only; tires flush (Playwright gameplay screenshot)
- [ ] Drift + Nitro respond on keyboard/touch bindings without exploding physics
- [ ] Water visible on coastal edge; no TS errors
- [ ] Shared Rule 5 gate green

### FAIL (block Phase 4)

- Guessed spawn, jumping chassis, missing water, or gate red

---

## Phase 4 — 3D Car Dealership & Cash Progression

**Goal:** Single-car showroom + localStorage economy.

### Work

- Main-menu showroom: **only** currently selected car on reflective turntable.
- Stats (Top Speed, Acceleration, Drift Grip), paint picker, BUY / DRIVE.
- Earn cash from drift combos / near-miss / checkpoints; unlock all 4 Sketchfab cars via `localStorage`.

### PASS

- [ ] Exactly one car visible in showroom (no overlap)
- [ ] Buy/equip persists across reload
- [ ] Playwright: dealership desktop + mobile screenshots clean
- [ ] Shared Rule 5 gate green

### FAIL (block Phase 5)

- Multiple overlapping cars, broken economy, or gate red

---

## Phase 5 — Living Traffic, Pedestrians, Audio & Mobile Multi-Touch HUD

**Goal:** Living world + mobile controls + engine audio unlock.

### Work

- Traffic along `Traffic_Lane_*` with obstacle braking (`traffic_sedan` / `traffic_suv`).
- Pedestrians along `Pedestrian_Path_*` via `SkeletonUtils.clone()` + walk cycles.
- Multi-touch HUD (steer / gas / brake / drift / nitro) + `navigator.vibrate` where available.
- Unlock Web Audio on first user tap (iOS-safe).

### PASS

- [ ] Traffic/peds only use parsed empties
- [ ] Touch HUD usable in Playwright mobile landscape
- [ ] Audio starts after first tap without console spam
- [ ] Shared Rule 5 gate green

### FAIL (block Phase 6)

- Hardcoded lane coords, broken touch, or gate red

---

## Phase 6 — Final Offline PWA Build, Full E2E Playwright Audit & GitHub Push

**Goal:** Ship-ready offline PWA with full visual audit and remote push.

### Work

- Configure `vite-plugin-pwa` + landscape manifest; Workbox precache of GLBs/HDR/JS.
- Full E2E Playwright: desktop `1920×1080` + mobile `844×390` — dealership + gameplay.
- Fix any console/visual/physics regressions.
- Commit and `gh` push only after all gates green.

### PASS

- [ ] App loads and runs offline after first visit (SW precache verified)
- [ ] Desktop + mobile Playwright audits pass; zero critical console errors
- [ ] Total compressed gameplay GLBs &lt; 30 MB
- [ ] `npm run build` green; changes committed and pushed to GitHub

### FAIL (do not push)

- Offline broken, visual audit fail, budget blown, or build red — self-heal first

---

## Session commitment

All subsequent work in this project session **must** follow `.cursor/rules/game-guardrails.mdc` (`alwaysApply: true`). When ambiguous, prefer Sketchfab/Poly Haven assets, marker parsing, and gate verification over speed.
