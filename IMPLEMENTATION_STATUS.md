# Kayangan Office — implementation status

Coordinator: **Agent C** (root agent `lead`) — app, integration, UI, QA.
Workers: **Agent A** (`agent-a`, world/art), **Agent B** (`agent-b`, characters/gameplay).
Exactly three agents are active; A and B run as DSH subagents in this profile.

## Environment actually measured

| Item | Value |
| --- | --- |
| Machine | Debian GNU/Linux, 32 CPU threads, ~92 GB RAM, Node 24.22.3, npm 9.2.0 |
| Graphics | No usable GPU device: `amdgpu_device_initialize failed`, GLX reports `llvmpipe (LLVM 21.1.8, 256 bits)` → software rasterisation |
| Browser | Google Chrome 156.0.8078.47, headless, viewport 1920×1080, WebGL through SwiftShader/llvmpipe |
| Packages | three 0.180.0, @types/three 0.187.0, vite 7.3.8, typescript 5.9.3, vitest 3.2.7 (committed in `package-lock.json`) |
| Notes | `NODE_ENV=production` is set in this shell, so `npm install` needs `--include=dev` |

Because the machine has no working GPU path, the 60 fps target is measured on software
rasterisation and reported honestly rather than claimed as a universal guarantee.

## Visual-reference limitation

This profile's model (`gyro/qwen3.8-flash-next-gyro-gyro-s`) declares **no image input**, so no
agent can open the PNG/WebP files directly. `qa/pixel-probe.mjs` samples the design assets through
a real Chromium canvas instead; results are committed in `qa/art/probe-concept.json` and
`qa/art/probe-lineup.json`. Palette decisions below cite those numbers.

## Status table

| Task | Owner | State | Evidence | Next action |
| --- | --- | --- | --- | --- |
| Git baseline + identity | C | done | `9817c73`; all 15 commits authored `rifaniponk <rifaniponk@users.noreply.github.com>` | — |
| Scaffold, contracts, UI, QA harness, README | C | done | `03a1c3d`, `3227e6b`, `539fc73`, `863cdb9`, `d1a1490`, `b2a50be` | keep tests green |
| Island shell, four furnished zones, backdrop, interactions, quality modes | A | done (slice 2) | `755a9c0`, `a58b10e`; live page renders with 0 console errors | cut 273 renderable objects to ≤250, raise detail |
| Walkability audit (aisle, doorways, routes) | A | in progress | `src/world/walkable.ts` (untracked) | prove with `npm run test` |
| Four avatars + animation states | B | done (slice 2) | `95b00a6`, `9921b9d` | distinct idle/move/interact motion |
| Movement, collision slide, camera follow, reset, regression tests | B | in progress | `7b25126`, `4b2c94b` | drive the live route, report anchor reach |
| Integration tests + route harness | C | done | `f46933a`; 17 tests pass, 1 fails on A's draw-call budget | keep regression tests honest |
| Browser render + frame measurement | C | in progress | see Measured results | full four-character route (running) |
| Pause/restart/visibility/resize behaviour | C | done | `b2a50be` fixed rAF binding and tab resume | re-verify in Chromium |
| Final acceptance checklist | C | pending | — | run after A/B slices land |

## Contract (published by C in `src/core/contracts.ts`)

`WorldResult`, `Collider`, `Interactable`, `World.createWorld()`, `CharacterSystem.createCharacters(world, input)`
as in `AGENTIC_LOOP.md` §3, extended during bootstrap with: `QualityMode`, `ZoneId`, `CharacterId`,
`CharacterState`, `WorldInteraction`, `InputSource`, and optional `getCameraTarget`,
`getNearestInteractable`, `getActiveState`, `getActiveCharacter` on `CharacterSystem`. Both workers
were notified of the full text before depending on it.

## Layout agreed with A and B (metres)

Deck 36×24 at `y=0`; central aisle clear for |x| ≤ 2.5.
Desks (-14..-4, 2..10) anchor `desk-monitor` (-8, 7); meeting room (-14..-4, -10..-2) anchor
`meeting-screen` (-8, -6); lounge (4..14, 2..10) anchor `lounge-sofa` (9, 6); terrace (4..14, -10..-2)
anchor `terrace-lookout` (9, -8). Spawns: Cloud (-3, 6), Automaton (-6, -1.5), Courier (3.5, 6),
Guardian (3, -1.5). Character collision radius 0.55 m.

## Palette sampled from the design assets

Concept (`probe-concept.json`, 1672×941, average `#a29692`): sky band `#afbdda`/`#dddae6`,
warm interior `#957e6a`/`#b5a097`/`#bdaa9d`, shaded rock underside `#6d6700`/`#777174`.
Lineup (`probe-lineup.json`, 1774×887, average `#c1bdb4`), per character column:
Cloud `#bed2e8`/`#a5bdd9`, Automaton `#a67f62`/`#a48470`, Courier `#4e988d`/`#477467`,
Guardian stone `#816c56`/`#8a7b5f` with moss `#95953f`.

## Commands

```bash
npm install --include=dev   # NODE_ENV=production is set here
npm run typecheck
npm run test
npm run build
npm run preview            # serves dist/ on :4173
node qa/render.mjs http://127.0.0.1:4173/?autoplay=1 qa/art/gameplay.png high 4000
node qa/route.mjs  http://127.0.0.1:4173/?autoplay=1 high qa/art/route.json
```

## Commit log

Every commit is authored `rifaniponk <rifaniponk@users.noreply.github.com>` (verified with
`git log --format='%an <%ae>'`; 30 commits at the time of this update).

| Owner | Hash | Slice |
| --- | --- | --- |
| C | `9817c73` | repo baseline (design assets + loop doc) |
| C | `03a1c3d` | Vite/TS/Three scaffold, shared contracts, UI, QA harness |
| C | `3227e6b` | pixel probe driven through CDP |
| C | `f46933a` | integration tests (world contract, collision, perf meter) |
| C | `539fc73` | numeric screenshot inspection |
| C | `1289eca`, `b2a50be` | status log, README, animation-loop binding + tab resume |
| C | `95db333` | toast typing fix, `@types/three` |
| C | `863cdb9`, `d1a1490` | renderer rebuild on quality change, canvas stretch |
| C | `92ddd09` | browser smoke route (keys, zones, pause, resize, quality) |
| C | `2fc1c9b` | walkability audit assertion, single-origin QA serving |
| C | `5172c62` | digit-key selection fix, route through frame loop, interaction narration |
| C | `2f7b298`, `e70a08d` | simulated walks, hidden-tab frame guard |
| C | `332f671`, `9305176`, `471f687` | walk trace, prop-sliding steer, polled async evals |
| C | `2379d9d`, `e9da3f5`, `8dcb709`, `fa5ff5f`, `e0f702a`, `907404b` | two-minute route, concept comparison, camera-control checks |
| A | `755a9c0` | island shell, deck, rim, lighting, rim colliders, spawns |
| A | `a58b10e` | four furnished zones, backdrop, zone interactions, quality modes |
| A | `96dc5ea`, `a617f08`, `53731ba` | rail merging, instancing, tessellation density (273→236 renderable objects) |
| A | `d2aa0e1` | walkability audit (`src/world/walkable.ts`) |
| A | `fc26d33`, `bcb0573`, `71846ad`, `a90127b`, `42f150c`, `6aff109`, `a2a9417`, `92a9346` | palette, floor detail, pergola, lamps, doorway frame, lighting balance |
| B | `95b00a6`, `9921b9d` | four distinct procedural avatars, palette alignment, entry point |
| B | `7b25126`, `c9e6568`, `4b2c94b`, `602580d` | movement/collision/camera, activation via `Interactable.activate()`, regression tests, interaction narration |

## Measured results

All numbers below were produced on this machine by the committed QA scripts; nothing is asserted
without a measurement behind it.

| Check | Command | Result |
| --- | --- | --- |
| Install / build / types | `npm install --include=dev`, `npm run typecheck`, `npm run build` | clean; 536.8 kB JS (gzip 140.0 kB), 3.0 kB HTML, 2.75 kB CSS |
| Unit/integration tests | `npm run test` | 11 files, 38 tests, all pass |
| Play-loop behaviour in Chromium | `node qa/smoke.mjs "http://127.0.0.1:4173/?autoplay=0" high` | **18/18 pass**: play button, key selection + retained positions, movement (~3 m/s), rim containment, all four zone walks + activations with narration, drag rotate (yaw 0.00→-2.16), wheel zoom (11.0→5.0, clamped 5–26), pause freeze, restart to spawn, hidden/visible tab handling, resize (canvas 1920×937), High/Low switch, 0 console errors |
| Scene cost | `node qa/render.mjs "http://127.0.0.1:4173/?autoplay=1" qa/art/gameplay.png high 5000` | 79 draw calls, 8272 triangles, median 59.88 fps, 0 errors; budget test proxy 236 ≤ 250 objects |
| Frame sanity | `node qa/inspect.mjs qa/art/gameplay.png` | 419 distinct colours, 2.7% dark, 20.5% bright, bands [0.81 sky, ~0.42 floor] |
| Concept comparison | `node qa/compare.mjs design/kayangan-office-concept-v2.png qa/art/gameplay.png` | meanDelta 68.8, worst 179.9; interior rows darker than the concept (0.42–0.52 vs 0.55–0.59) — open slice for A |
| Navigation geometry | `auditWalkability` via `tests/world-contract.test.ts` | aisle clear, doorways 2.04 m / 1.85 m, 16/16 spawn→anchor routes reachable |
| Two-minute route, High and Low | `node qa/route.mjs ...` | running; results will be recorded here when the sample completes |

## Remaining limitations

- Software rasterisation only; frame-rate claims are scoped to this machine/browser.
- No image-capable model in this profile; visual fidelity is judged with numeric sampling plus
  screenshots reviewed by a vision-capable reviewer if one becomes available.
