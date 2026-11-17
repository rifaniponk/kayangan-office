# Kayangan Office: three-agent implementation loop

This is the handoff for building the **playable** Three.js office from the approved concept. The repository currently contains design assets, not an application. The loop is complete only when the running build meets the acceptance checks below. Do not stop after scaffolding or after a single attractive screenshot.

## 1. Source of truth and assets

| File | Role | Runtime use |
| --- | --- | --- |
| `design/kayangan-office-concept-v2.png` | Composition, furniture placement, atmosphere, four nonhuman characters | Reference only |
| `design/kayangan-characters-lineup.png` | Character silhouette, color, and material reference | Reference only; build actual 3D avatars |
| `design/kayangan-cloud-horizon.webp` | Distant sky and cloud sea | Use as a lightweight backdrop texture |
| `design/kayangan-cloud-horizon.png` | Lossless source of the backdrop | Do not load in the game unless needed |
| `design/kayangan-office-concept.png` | Superseded concept with humans | Historical reference only |

The concept images are targets, not pre-rendered scene backgrounds. The office, island, furniture, and four characters must be actual Three.js objects with depth, movement, and collision. The cloud backdrop may remain a 2D texture.

## 2. Product contract

Build a single-page, desktop-first, third-person 3D experience. The player can choose any of the four original nonhuman characters, move through the office, switch between them, and interact with the zones. A good result resembles the concept at the opening camera angle and remains readable as the camera moves.

### Required play loop

1. Load directly into the floating office with an obvious **Play** action and four-character selection.
2. Select Cloud, Automaton, Courier, or Guardian. Every character is separately controllable, retains its own position when switched away from, and has its own idle and move animation. Keys `1`–`4` switch characters; the selection UI works by mouse.
3. Move with `WASD` or arrows. Camera follows smoothly; mouse drag or right drag rotates camera and wheel zooms within safe limits. `E` interacts with the nearest marked object. Provide a short controls overlay.
4. Prevent walking through desks, sofas, walls, planters, glass partitions, railings, and the island edge. Keep all four characters on valid walkable surfaces. Spawn and switch positions must never be inside props.
5. Make at least one meaningful interaction in **each** zone: desk (activate monitor), meeting room (display changes), lounge (sit or emote), terrace (lookout / sky view). Interaction can be local and deterministic; no backend is needed.
6. Allow pause/restart and a graphics-quality selector. Preserve responsive controls after tab hide/show and browser resize.

“Each character is playable” means each can be selected, moved, animated, and used for interactions. Multiplayer and network synchronization are outside this first release.

### Visual contract

- Wide floating island above a cloud sea, with visible rock underside and a clear, level office floor. The island edge must read as a boundary.
- Four distinct zones: shared desks in front-left, glass meeting room in back-left, lounge in front-right, terrace in back-right. A central aisle connects them; no prop blocks the route.
- Realistic scale and materials with a restrained stylized finish: off-white stone and concrete, warm wood grain, bronze frames, teal upholstery, soft sky light. Keep glass subtle enough to see the rooms.
- Furniture needs recognizable construction details. Desks: slab top, frame, drawers, monitor, keyboard, lamp, cup/books. Chairs: seat, back, arms, pedestal/wheels. Meeting room: table, four chairs, screen, glass partitions, door opening. Lounge: sofa cushions, coffee table, bookcase, lamp, rug. Terrace: deck, railings, planter boxes, round table, two chairs. Repeat small props through shared geometry/materials.
- Characters remain visibly fictional. Cloud: blue puff body, curl, small limbs. Automaton: bronze round glowing face, antenna, jointed limbs. Courier: teal bird, crest, beak, folded wing-arms, yellow feet, satchel. Guardian: rounded stone sections, moss and leaves, sturdy limbs. Do not substitute humans or one recolored base model.
- Lighting should suggest warm morning sun with believable contact shadows. Avoid expensive cinematic effects that obscure gameplay or harm performance.

### Scene scale and navigation guide

Use meters as world units. Start from an approximately `36 × 24 m` walkable deck at `y=0`; visible rock underside extends about `4–6 m` below. Keep a central aisle at least `2.5 m` wide. Give ordinary doorways at least `1.8 m` clear width, and reserve about `0.55 m` radius per character for collision. These are guides; adjust based on visual and movement tests. Keep one connected walkable graph from all four spawn positions to every interaction.

## 3. Implementation architecture

Use Vite, TypeScript, and Three.js with no UI framework unless it clearly reduces total complexity. Use the current supported package versions at implementation time and commit the lockfile. Prefer simple geometry, merged static meshes where appropriate, instanced repeated details, low-cost materials, and a single animation loop. Do not use a physics engine for this static floor plan; a small 2D XZ collision/navigation layer is sufficient.

Suggested modules and ownership:

| Area | Agent | Owned files | Public boundary |
| --- | --- | --- | --- |
| World and art | A | `src/world/**`, world-only generated textures or models in `public/assets/world/**` | `createWorld(): WorldResult` |
| Characters and controls | B | `src/characters/**`, `src/gameplay/**` | `createCharacters(world): CharacterSystem` |
| App, integration, UI, QA | C | `index.html`, `package.json`, lockfile, `src/main.ts`, `src/core/**`, `src/ui/**`, `src/styles.css`, tests, build configuration | Wires A and B together |

Agent C defines shared TypeScript interfaces in `src/core/contracts.ts` during the first short bootstrap step. After that, C must announce the interface before A and B depend on it. A and B may build their modules in parallel before bootstrap using this contract as the guide:

```ts
type Collider = { x: number; z: number; width: number; depth: number };
type Interactable = {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  activate: () => void;
};
type WorldResult = {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  spawnPoints: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  dispose: () => void;
};
type CharacterSystem = {
  group: THREE.Group;
  activeIndex: number;
  select: (index: number) => void;
  update: (deltaSeconds: number) => void;
  getActivePosition: () => THREE.Vector3;
  dispose: () => void;
};
```

The exact signatures may change during bootstrap, but C must keep one written contract and communicate changes. A and B must not edit C-owned files. C must not replace A/B implementations with placeholders during integration.

### Rendering and asset rules

- Use `design/kayangan-cloud-horizon.webp` as the distant backdrop; place a few broad translucent cloud layers only if they improve depth. No volumetric cloud simulation.
- Build furniture from reusable parts and materials. Use texture detail for wood/stone variation; avoid sculpting every grain into geometry.
- Use one main directional light plus ambient/hemisphere light. If shadows are needed, limit casters and shadow-map resolution; bake or fake most static contact shading. Avoid SSAO, bloom, depth of field, and multiple real-time shadow lights in the first pass.
- Reuse geometries and materials; instance repeated desk accessories, plant pots, rails, and similar parts where beneficial. Measure draw calls rather than assuming instancing always helps.
- Character models may be procedural meshes or optimized glTF assets. Each needs a clear hierarchy and idle/walk/interact animation. Keep silhouettes and colors faithful to the lineup, while simplifying small details for performance.
- Dispose of geometries, materials, textures, listeners, and animation resources when a scene is rebuilt. Cap device pixel ratio by quality mode, initially at `1.5` for High and `1.0` for Low.
- Never ship the 2.3 MB concept or 1.8 MB lineup as runtime textures. The 22 KB WebP cloud image is the intended runtime art asset.

## 4. Performance budget and proof

The target is a smooth 60 fps at 1920×1080 on the implementation machine in a current Chromium browser, after a warm-up period. Record the machine, browser, graphics setting, and actual measurements in `IMPLEMENTATION_STATUS.md`; do not claim a universal 60 fps guarantee. If the machine cannot sustain the target, report that and keep optimizing within the visual contract.

Initial guardrails for the visible scene: approximately **≤250 draw calls**, **≤300k rendered triangles**, **≤64 MB estimated texture memory**, and no sustained per-frame heap growth. These are diagnostic targets, not permission to remove required detail. Use `renderer.info.render.calls` and `.triangles`, browser Performance tools, and an in-app debug HUD or log. Measure a two-minute route that visits all zones and switches through all four characters. Record median fps, 95th-percentile frame time, and memory trend. For a 60 fps pass, target median fps ≥59 and 95th-percentile frame time ≤16.7 ms on the recorded machine. Repeat at Low quality if High misses, then optimize the main bottleneck.

## 5. Three-agent work plan

Run **exactly three agents total throughout implementation**: A for world/art, B for characters/gameplay, and C for app/integration/UI/QA. Agent C is also the coordinator and must keep doing implementation/verification work, not merely supervise. The primary dsh-tui session can be C and spawn A/B as subagents if the installed DSH profile exposes them; otherwise use three separate TUI sessions. Start all three at the beginning. A/B can inspect references and build independent owned modules while C bootstraps the app and publishes the shared contract. Once a worker finishes a slice, assign its next useful slice immediately; do not leave an agent idle while acceptance checks remain. Honor file ownership in a shared checkout.

### Agent A — World and art

1. Create island base, floor, walls, terrace, glass partitions, and railings at coherent scale.
2. Build all four zone furniture sets and repeated small details from modular meshes. Ensure the central aisle and doorways remain clear.
3. Add backdrop, lighting, material palette, simple cloud depth, colliders, interaction anchors, and safe spawn points.
4. Check the scene from the starting angle and at camera orbit extremes; fix floating objects, z-fighting, obvious gaps, and poor silhouettes.
5. Export the agreed `WorldResult`; document object counts and known gaps. Continue refining until the visual contract is met.

### Agent B — Playable characters and navigation

1. Build four different 3D models from `design/kayangan-characters-lineup.png`, using lightweight mesh hierarchy or optimized glTF. Never implement them as static billboard sprites.
2. Give each idle, moving, and interacting states. Distinguish their motion: Cloud bobs, Automaton has mechanical steps, Courier makes quick birdlike steps, Guardian has heavier steps. Keep movement responsive and readable.
3. Implement selection, movement, collision sliding, interaction proximity, safe spawn/switch behavior, and camera-follow target. Include reset if a character somehow leaves the valid surface.
4. Ensure every character reaches and activates each of the four interaction anchors. Make input independent of frame rate and pause correctly on hidden tab.
5. Export the agreed `CharacterSystem`; provide manual control/collision test notes.

### Agent C — App, integration, UI, quality

1. Bootstrap Vite + TypeScript + Three.js, scripts (`dev`, `build`, `typecheck`, `test` where useful), `src/core/contracts.ts`, scene lifecycle, responsive canvas, resize handler, and error state. Share the interface promptly.
2. Build start/selection UI, controls help, interaction prompt, graphics settings, pause/restart, and a small debug performance panel that can be hidden.
3. Integrate A/B modules without taking ownership of their implementation. Resolve type and runtime issues with the owning agents.
4. Add focused automated tests for pure collision/selection logic and a browser smoke route if tooling is available. Do not write tests that merely mirror implementation details.
5. Run build, inspect the running scene in a real browser, capture screenshots, measure performance, and file concrete fixes back to A/B. Keep `IMPLEMENTATION_STATUS.md` accurate.

### Coordination protocol

- C owns shared files and integration. A/B own their directories. The coordinator keeps a short status table: task, owner, state, evidence, next action.
- Communicate interface changes before editing callers. Send concrete blockers with file paths and observed behavior.
- If using one shared checkout, agents must stage only their own files and avoid concurrent package installation. C alone edits dependencies. If using separate worktrees, initialize the Git repository and baseline commit first, then create one branch/worktree per worker; integrate branches only after each worker passes its local checks.
- At each integration checkpoint, C runs typecheck/build and opens the actual page. A/B stay active on fixes, detail, interactions, or performance work rather than waiting idle. If a worker is blocked by another's interface, it picks an independent task in its own area and reports the dependency.
- Preserve existing design assets. Save generated or hand-authored replacements under new names, and document their license/source if external assets are introduced.

### Git identity and meaningful commits

The current folder has no valid Git history. At startup, C initializes Git if needed and makes a baseline commit containing the existing design assets and this document. If Git already exists when work starts, preserve its current history and uncommitted user changes. Set the repository identity before **any** commit:

```bash
git config user.name "rifaniponk"
git config user.email "rifaniponk@users.noreply.github.com"
```

Every agent must commit each meaningful, verified change under the author **`rifaniponk <rifaniponk@users.noreply.github.com>`**. A meaningful change is a coherent feature or fix, such as the island shell, desk set, one playable character, collision handling, UI selection, integration, or a measured performance optimization. Commit after the relevant local check passes, not only at the end. Avoid empty, cosmetic-only, or giant mixed commits. Use scoped messages such as `feat(world): build meeting room furniture` or `fix(gameplay): prevent edge escape`.

Before committing, inspect `git status`, stage only files owned by that agent, inspect `git diff --cached`, and run `git diff --cached --check`. Do not accidentally stage another agent's in-progress files. Verify the resulting author with `git log -1 --format='%an <%ae>'`; if it differs from the required identity, correct the commit before proceeding. In separate worktrees, configure the identity in the shared repository before creating branches; C uses the same author for integration commits. Record commit hashes with the associated validation in `IMPLEMENTATION_STATUS.md`. Keep three agents active while commits and integration happen: A/B continue independent work while C integrates, and C resumes implementation/QA immediately after each merge.

## 6. Agentic loop: repeat until finished

At each cycle, the coordinator reads the current status and performs this sequence:

1. **Observe:** run the application, compare the current scene with the concept and character lineup, test each character and zone, and inspect build/performance evidence.
2. **Prioritize:** choose the highest-impact unmet acceptance checks. Assign independent fixes to A, B, and C simultaneously according to ownership.
3. **Implement and commit:** each agent makes a small coherent change, verifies it locally, commits it with the required author, and reports commit hash, changed files, and visible or measured result. Do not return a plan as a substitute for code.
4. **Integrate:** C checks all changes together. Resolve broken imports/interfaces immediately. Keep the app runnable at the end of every cycle.
5. **Verify:** repeat the full playable route, check the four character controls and interactions, build/typecheck, visual comparison, and performance sample. Add only necessary regression tests.
6. **Record:** update `IMPLEMENTATION_STATUS.md` with pass/fail evidence, remaining gaps, metrics, commit hashes, and next assigned actions. Keep all three agents assigned useful work and start another cycle whenever any required item fails.

Stop only when all acceptance checks pass, the final build opens without errors, and the status file contains measured evidence. If external credentials, unavailable hardware, or a genuinely missing requirement blocks a check, document the exact blocker and complete every other check first.

## 7. Final acceptance checklist

- [ ] `npm install`, `npm run typecheck`, and `npm run build` succeed from a clean checkout.
- [ ] The office appears as actual navigable 3D geometry above clouds and matches the concept’s four-zone composition.
- [ ] Every listed furniture group has recognizable construction details; no large zone is empty or represented by a flat image.
- [ ] All four characters are nonhuman, visually distinct, 3D, individually selectable and controllable, animated, and able to interact in all four zones.
- [ ] Collision prevents walking through major furniture, walls, railings, and off the island. The camera stays useful throughout the playable area.
- [ ] Selection, movement, interaction, camera, pause/restart, and quality controls work with visible UI guidance.
- [ ] No console errors, missing assets, persistent frame-time spikes, or sustained memory growth on the measured route.
- [ ] Performance result is recorded with device/browser/settings and meets the 60 fps target on that machine, or the unmet target is explicitly reported with bottleneck evidence.
- [ ] `IMPLEMENTATION_STATUS.md` includes a final screenshot, test commands/results, measured metrics, and any remaining limitations.
- [ ] Git history contains meaningful incremental commits authored `rifaniponk <rifaniponk@users.noreply.github.com>`; the status file names the commits for completed slices.
- [ ] A, B, and C remained active throughout implementation, with no worker dismissed or left idle while required work remained.

## 8. Paste-ready coordinator prompt for dsh-tui

Paste the following in the project directory after the TUI profile is available. It is intentionally independent of a particular subagent command syntax.

```text
Implement the Kayangan Office game in this repository. Read AGENTIC_LOOP.md and every design asset it names before coding. The goal is a finished, playable, lightweight Three.js virtual office above clouds with four original nonhuman playable characters.

Act as Agent C and coordinator. Start exactly two implementation subagents immediately and concurrently, Agent A for world/art and Agent B for characters/gameplay; together with you, that is exactly three active agents. Follow the file ownership and contracts in AGENTIC_LOOP.md. Keep all three working on useful tasks until completion; reassign the next slice as soon as one finishes. If subagents are unavailable in this profile, tell me immediately and provide the three session prompts from section 9 so I can start three TUI sessions; do not pretend workers are running.

Initialize Git if needed, preserve existing work, configure every commit author as rifaniponk <rifaniponk@users.noreply.github.com>, and make meaningful incremental commits after local verification. Record commit hashes. C should establish the minimal app and shared contracts promptly while A/B work on independent owned tasks, then keep A/B/C working in parallel. Iterate using section 6 until the final acceptance checklist passes. Integrate, open the running app in a browser, test every character and zone, measure performance on the current machine, optimize bottlenecks, and maintain IMPLEMENTATION_STATUS.md. Make routine design/implementation decisions yourself. Do not stop at plans, scaffolding, or an untested screenshot. Report completion only with build/test results, a screenshot, commit history, and measured frame-rate evidence. If truly blocked, identify the exact blocker and finish independent work.
```

## 9. Manual three-session prompts

If the DSH profile does not expose subagents, open three TUI sessions in the project. Give each its own prompt. In a shared checkout, use the file ownership table and let C finish the short bootstrap before A/B import its contract. In separate worktrees, have C publish the contract first and merge changes under coordinator control.

**Session A:**

```text
Read AGENTIC_LOOP.md and the design images. You are Agent A, owner of src/world/** and public/assets/world/** only. Build the floating island, office architecture, all four furnished zones, materials, cloud backdrop, lighting, colliders, interaction anchors, and spawn points. Follow the WorldResult contract, coordinate any interface change with Agent C, and keep refining against the concept until every world/art acceptance check passes. Do not edit files owned by B or C. Keep taking the next useful world task while work remains. Commit each meaningful verified change as rifaniponk <rifaniponk@users.noreply.github.com>. Report commit hash, changed files, visual evidence, and remaining gaps after each cycle.
```

**Session B:**

```text
Read AGENTIC_LOOP.md and design/kayangan-characters-lineup.png. You are Agent B, owner of src/characters/** and src/gameplay/** only. Build four distinct nonhuman 3D playable characters, their idle/move/interact animation, character switching, movement, collision, camera target, and zone interactions. Follow the CharacterSystem contract and coordinate with Agent C. Test all four characters in all zones and keep fixing issues until every character/gameplay acceptance check passes. Do not edit files owned by A or C. Keep taking the next useful gameplay task while work remains. Commit each meaningful verified change as rifaniponk <rifaniponk@users.noreply.github.com>. Report commit hash, changed files, control tests, and remaining gaps after each cycle.
```

**Session C:**

```text
Read AGENTIC_LOOP.md and the design images. You are Agent C and coordinator, owner of the scaffold, src/core/**, src/ui/**, src/main.ts, src/styles.css, tests, package and build files, and integration. Keep A and B active on their next useful tasks while you implement and verify your own. Initialize Git if needed, configure author rifaniponk <rifaniponk@users.noreply.github.com>, and make a baseline commit. Bootstrap Vite + TypeScript + Three.js and publish src/core/contracts.ts promptly to A/B. Build selection/help/settings/pause UI, integrate their modules, run build/typecheck, inspect the app in a real browser, test the complete route, measure fps/draw calls, and coordinate concrete fixes. Commit each meaningful verified change and maintain IMPLEMENTATION_STATUS.md with commit hashes. Continue the loop until the full final acceptance checklist passes. Do not overwrite A/B-owned implementations.
```

## 10. DSH setup note

On 2026-11-17, this machine has the `@deepseek-harness-tui/dsh-tui` **0.20.1** profile and a matching user-level launcher at `/home/rifan/.local/bin/dsh-tui`. Its private stack uses DSH **0.2.2-rc.3** and Node **24.22.3**. Launch from this directory with:

```bash
cd /home/rifan/project/kayangan-office
dsh-tui
```

The matching launcher and profile reached the interactive screen in a terminal. `dsh-tui doctor` still reports no `DEEPSEEK_API_KEY`; this profile is configured for a local `gyro` provider, so model connectivity must be checked during the first real agent turn. The [dsh-TUI getting-started guide](https://github.com/ccch1mneyyy/dsh-TUI/blob/main/docs/getting-started.en.md) covers its update and launcher workflow. If your installed TUI differs, use its normal session and agent controls, then paste the coordinator or manual prompts above. The current project directory lacks a valid Git repository, so initialize Git before choosing a worktree-based coordination strategy.

## References

- [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html): reduces draw calls for repeated geometry/materials.
- [Three.js `WebGLRenderer.info`](https://threejs.org/docs/pages/WebGLRenderer): render calls, triangles, and resource counts for measurement.
- [Three.js `AnimationMixer`](https://threejs.org/docs/pages/AnimationMixer.html): option for separately animated characters.
- [Vite getting started](https://vite.dev/guide/): current TypeScript scaffold and development workflow.
