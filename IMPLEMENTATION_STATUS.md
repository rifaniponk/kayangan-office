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

Every commit is authored `rifaniponk <rifaniponk@users.noreply.github.com>` (verified per commit
with `git log --format='%an <%ae>'`). Use `git log --oneline` for the full list; notable hashes:

| Owner | Hash | Slice |
| --- | --- | --- |
| C | `9817c73`, `03a1c3d` | baseline, Vite/TS/Three scaffold, shared contracts, UI, QA harness |
| C | `f46933a`, `539fc73`, `92ddd09`, `2fc1c9b`, `332f671`, `9305176`, `471f687` | tests, numeric screenshot inspection, browser smoke route, walk trace, prop-sliding steer |
| C | `5172c62`, `2f7b298`, `e70a08d`, `95db333`, `863cdb9`, `d1a1490`, `b2a50be` | digit-key selection, walk direction, hidden-tab guard, toast typing, renderer rebuild, canvas stretch, README |
| C | `2379d9d`, `e9da3f5`, `8dcb709`, `e0f702a`, `2379d9d`, `b5e64af`, `a3b1def`, `a4cb14c`, `23bfd44`, `52d32ba` | two-minute route, concept comparison, camera checks, wall-clock fps, corridor waypoints |
| C | `5c01997`, `9a322b6`, `0231481`, `c4a0267`, `627561b` | pid-derived QA ports, probe sky/fog, dt cap, heap sampling |
| C | `dbb1d56`, `411f12f`, `9ad087a` | on-screen movement pad + Interact button, QA position hook, allocation-free frame loop |
| A | `755a9c0` … `7c10c79`, `962401f`, `125b643` (integrated by C) | island, zones, backdrop, lighting, walkability audit, doorway bands, cheaper backdrop |
| B | `95b00a6` … `1903a9d`, `99bbe40`, `a617c88` | four avatars, movement/collision, activation, narration, camera usability, `setMoveAxis`, keyboard-free playability, allocation-free `update()` |

## Measured results

Numbers produced on this machine by the committed QA scripts. Browser: headless Chromium 156 over
CDP, viewport 1920x1080. There is no GPU here (llvmpipe / SwiftShader software rasterisation), so
absolute frame rates are machine-bound; see the attribution table.

| Check | Command | Result |
| --- | --- | --- |
| Build / types | `npm run typecheck`, `npm run build` | clean; 540.1 kB JS (gzip 141.1 kB) |
| Tests | `npm run test` | 21 files, 101 tests, all pass |
| Browser behaviour | `node qa/smoke.mjs "http://127.0.0.1:4173/?autoplay=0" high` | **20/20 pass**: play, key selection, retained positions, movement ~3 m/s, rim containment, four zone walks + activations with narration, on-screen pad movement (-3.00 to +0.89 m), on-screen Interact button activation, drag rotate, wheel zoom (clamped 5-26 m), pause freeze, restart to spawn (delta 0.00 m), hidden/visible tab, resize, High/Low switch, 0 console errors |
| Route, High | `node qa/route.mjs ... high` | wall 140.7 s (>2 min), **16/16 legs arrived**, 16 activations, heap 6.3 MB (+0.28 MB), average 17.9 fps, p95 117 ms, 0 console errors |
| Route, Low | `node qa/route.mjs ... low` | wall 123.4 s, 16/16 legs arrived, 16 activations, heap 6.2 MB (+0.26 MB), average 28.7 fps, p95 83 ms, 0 console errors |
| Heap over movement | `node qa/perf.mjs high 30 ...` (gc forced every 500 ms) | 6.2376 MB to 6.2327 MB, **delta -4.8 KB** — memory flat, no leak |
| Scene cost | `node qa/render.mjs ...` | 82 draw calls, 8496 triangles, idle median 59.88 fps; budget test proxy 247 objects <= 250 |
| Frame sanity | `node qa/inspect.mjs qa/art/gameplay.png` | 535 distinct colours, bright 26.3%, bands [0.698, 0.656, 0.59, 0.543, 0.552]; gates: colours >= 400, bright <= 0.30, band spread >= 0.15 |
| Concept comparison | `node qa/compare.mjs design/... qa/art/gameplay.png` | meanDelta 55.9 (from 68.8), worst row 81.1 (bottom-band hue, open world slice) |
| Navigation | `tests/world-contract.test.ts` + `src/world/walkable.ts` | aisle clear, doorway standable bands 1.26 m / 1.55 m, 16/16 routes reachable, standable distance within every anchor radius |

### Frame-rate attribution (no GPU on this machine)

| Measurement | Value |
| --- | --- |
| Idle scene, High | median 59.88 fps |
| Walking, High, 1920x1080 | 10.87 fps before the backdrop fix, **15.5-17.2 fps** after |
| Walking, Low, 1920x1080 | 17.9-25.2 fps |
| Walking, Low, 640x400 viewport | 24.0 fps -> fill-rate bound, not draw-call bound |
| High with `backdrop` hidden | 16.0 fps (+47%) -> backdrop overdraw was the dominant cost; fixed in `7c10c79` |

60 fps median while characters move is not reachable on this software-rasterised machine; the
measured best is ~17 fps moving at High and ~25 fps at Low, with a 59.9 fps median while idle.
That limitation is recorded honestly rather than claimed as met.

## Remaining limitations

- Software rasterisation only; frame-rate claims are scoped to this machine/browser.
- No image-capable model in this profile; visual fidelity is judged with numeric sampling plus
  screenshots reviewed by a vision-capable reviewer if one becomes available.
