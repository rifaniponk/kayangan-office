# Kayangan Office

A lightweight, desktop-first third-person 3D office floating above a cloud sea, built with
Three.js, Vite and TypeScript. Four original nonhuman characters — **Cloud**, **Automaton**,
**Courier** and **Guardian** — are individually selectable, movable, animated, and able to
activate every zone. No backend, no physics engine, no UI framework.

Built by three cooperating agents under [`AGENTIC_LOOP.md`](AGENTIC_LOOP.md); progress, measured
metrics and commit evidence live in [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

## Run it

```bash
npm install --include=dev      # this shell exports NODE_ENV=production
npm run dev                    # http://127.0.0.1:5173
npm run build && npm run preview   # built app on http://127.0.0.1:4173
npm run typecheck
npm run test                   # vitest: world contract, collision, perf meter
```

## Playing

| Action | Keyboard | On-screen |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrow keys | ▲ ▼ ◀ ▶ pad, bottom-left (hold to walk) |
| Switch character | `1` `2` `3` `4` | picker buttons |
| Interact with nearest marked object | `E` | Interact button, bottom-right (hold) |
| Orbit camera | drag (left or right button) | drag on the canvas |
| Zoom | mouse wheel, clamped 5–26 m | pinch-free: wheel only |
| Pause / resume | `P` | Pause button (also pauses on hidden tab) |
| Restart run | `R` | Restart button (everyone returns to their spawn) |
| Graphics quality | — | High / Low selector (High: antialias, shadows, DPR ≤ 1.5; Low: no shadows, DPR ≤ 1.0) |
| Stats panel | `H` | Stats button |

Click **Play** to enter the office. The HUD shows the active character, the zone you are standing
in, and the current interaction prompt.

## Scene layout (metres)

Walkable deck 36 × 24 at `y = 0`, rock underside below, cloud sea behind.

| Zone | Where | Anchor activated by `E` |
| --- | --- | --- |
| Shared desks | front-left, x −14…−4, z 2…10 | `desk-monitor` (-8, 7) |
| Glass meeting room | back-left, x −14…−4, z −10…−2 | `meeting-screen` (-8, -6) |
| Lounge | front-right, x 4…14, z 2…10 | `lounge-sofa` (9, 6) |
| Terrace | back-right, x 4…14, z −10…−2 | `terrace-lookout` (9, -8) |

The central aisle (|x| ≤ 2.5) stays clear, doorways are ≥ 1.8 m wide, and characters use a 0.55 m
collision radius against world colliders, so desks, sofas, walls, partitions, railings and the
island rim are solid.

## Code map

| Path | Owner | Role |
| --- | --- | --- |
| `src/core/contracts.ts` | C | Shared `World` / `CharacterSystem` / `InputSource` types |
| `src/world/**` | A | Island, architecture, four furnished zones, backdrop, lighting, colliders, anchors, spawns |
| `src/characters/**`, `src/gameplay/**` | B | Four avatars, animation states, movement, collision slide, camera anchor, zone interaction |
| `src/main.ts`, `src/core/**`, `src/ui/**`, `src/styles.css`, `index.html` | C | Renderer lifecycle, camera rig, input, UI, pause/restart, quality modes |
| `tests/**` | C | Integration tests over A's world data and B's navigation math |
| `qa/**` | C | Headless Chromium harness: render, route measurement, palette/frame sampling |

## QA harness

This machine has no working GPU (`llvmpipe` software rasterisation) and the agents' model cannot
open image files, so QA is numeric:

```bash
node qa/render.mjs "http://127.0.0.1:4173/?autoplay=1" qa/art/gameplay.png high 5000
node qa/route.mjs "http://127.0.0.1:4173/?autoplay=1" high qa/art/route-high.json
node qa/perf.mjs high 30 "http://127.0.0.1:4173/?autoplay=1"   # movement-only fps + gc heap
node qa/inspect.mjs qa/art/gameplay.png      # colour spread, bright fraction, luminance bands
node qa/compare.mjs design/kayangan-office-concept-v2.png qa/art/gameplay.png
node qa/pixel-probe.mjs design/kayangan-office-concept-v2.png 6   # sampled design palette
node qa/smoke.mjs "http://127.0.0.1:4173/?autoplay=0" high         # 20 behavioural checks
```

`qa/route.mjs` drives all four characters to all four anchors in real Chromium (legs route through
the door gaps and rail gate) and reports wall-clock duration, average and median fps, p95 frame
time, draw calls, triangles, gc-forced heap trend and console errors. The follow rig scales with
viewport height so avatars stay ≥60 px tall on small windows.

## Runtime assets

Only `public/assets/world/cloud-horizon.webp` (~22 KB) is shipped as a texture. The concept and
lineup PNGs stay in `design/` as references, per `AGENTIC_LOOP.md` §3.

## Known limits

- Frame-rate claims are scoped to the recorded machine and browser (see `IMPLEMENTATION_STATUS.md`);
  this box renders through SwiftShader/llvmpipe, not a GPU.
- No multiplayer or network sync in this release; interactions are local and deterministic.
- The agent models in this profile have no image input, so visual fidelity is verified with pixel
  sampling and screenshot inspection rather than direct image viewing.
