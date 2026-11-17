import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorld } from "../world/index.js";
import { createCharacters, DECK_BOUNDS } from "./index.js";
import { CHARACTER_RADIUS } from "./collision.js";

/**
 * Camera usability everywhere: with the real world (Agent A) the smoothed
 * follow-camera target must stay above the deck, inside the island bounds,
 * and never sit inside a prop while each character stands at each spawn
 * point and each interaction anchor.
 */
const FRAME = 1 / 60;

let moved = 0;

/** Same physics the app uses; slides along props via a perpendicular detour when stuck. */
function driveTo(sys: ReturnType<typeof createCharacters>, state: { axis: { x: number; z: number } }, tx: number, tz: number): void {
  const pos = sys.getActivePosition();
  let stuck = 0;
  let detour = 0;
  let detourSign = 1;
  let last = { x: pos.x, z: pos.z };
  for (let step = 0; step < 2000; step++) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.45) break; // close enough: anchors sit next to props
    let axis = { x: dx / len, z: dz / len };
    if (detour > 0) {
      axis = { x: -axis.z * detourSign, z: axis.x * detourSign }; // slide along the obstacle
      detour -= 1;
      if (detour === 0) detourSign *= -1;
    }
    state.axis = axis;
    sys.update(FRAME);
    const next = sys.getActivePosition();
    moved = Math.hypot(next.x - last.x, next.z - last.z);
    if (moved < 0.01) stuck += 1;
    else stuck = 0;
    if (stuck >= 12 && detour === 0) {
      stuck = 0;
      detour = 30;
    }
    last = { x: next.x, z: next.z };
    pos.set(next.x, 0, next.z);
  }
  state.axis = { x: 0, z: 0 };
  sys.update(FRAME);
}

function insideAnyCollider(x: number, z: number, colliders: { x: number; z: number; width: number; depth: number }[], radius: number): boolean {
  return colliders.some((c) => {
    const cx = Math.max(c.x - c.width / 2, Math.min(c.x + c.width / 2, x));
    const cz = Math.max(c.z - c.depth / 2, Math.min(c.z + c.depth / 2, z));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
  });
}

describe("follow camera stays usable everywhere", () => {
  const names = ["cloud", "automaton", "courier", "guardian"];

  it.each(names.map((name, i) => [name, i] as [string, number]))("%s: camera target valid at every spawn and anchor", (_name, index) => {
    const world = createWorld();
    const state = { axis: { x: 0, z: 0 } };
    const input = {
      axis: () => state.axis,
      interactRequested: () => false,
      paused: () => false,
      cameraYaw: () => 0,
    };
    const sys = createCharacters(world, input);
    sys.select(index);

    const spots: Array<{ label: string; x: number; z: number; via: Array<[number, number]> }> = [
      ...world.result.spawnPoints.map((p, i) => ({ label: `spawn${i}`, x: p.x, z: p.z, via: [] as Array<[number, number]> })),
      { label: "desk-monitor", x: -8, z: 7, via: [[-6, -1.3], [0, 7]] },
      { label: "meeting-screen", x: -8, z: -6, via: [[-6, -1.3], [-6, -6]] }, // through the door gap at x∈[-7,-5], z=-2
      { label: "lounge-sofa", x: 9, z: 6, via: [[-6, -1.3], [0, 6]] },
      { label: "terrace-lookout", x: 9, z: -8, via: [[-6, -1.3], [0, -6]] }, // aisle past the terrace chairs, anchor radius 1.5
    ];

    let minHeight = Infinity;
    let worstDist = 0;
    for (const spot of spots) {
      // Start from a spawn outside the meeting room so every route uses open floor.
      driveTo(sys, state, world.result.spawnPoints[index]!.x, world.result.spawnPoints[index]!.z);
      for (const [wx, wz] of spot.via) driveTo(sys, state, wx, wz);
      driveTo(sys, state, spot.x, spot.z);
      for (let settle = 0; settle < 120; settle++) sys.update(FRAME); // let the smoothing converge

      const target = sys.getCameraTarget!();
      const character = sys.getActivePosition();
      expect(Math.abs(target.x)).toBeLessThanOrEqual(DECK_BOUNDS.halfX + 1.5);
      expect(Math.abs(target.z)).toBeLessThanOrEqual(DECK_BOUNDS.halfZ + 1.5);
      expect(target.y).toBeGreaterThanOrEqual(1.4);
      expect(insideAnyCollider(target.x, target.z, world.result.colliders, CHARACTER_RADIUS)).toBe(false);

      minHeight = Math.min(minHeight, target.y);
      worstDist = Math.max(worstDist, target.distanceTo(character));
      const dist = Math.hypot(character.x - spot.x, character.z - spot.z);
      const radius = world.result.interactables.find((a) => a.id === spot.label)?.radius ?? 1.6;
      if (!spot.label.startsWith("spawn")) {
        if (dist <= radius) {
          // Standable points inside the anchor radius must show the prompt.
          expect(sys.getNearestInteractable?.()?.id, `${spot.label} prompt missing`).toBe(spot.label);
        } else {
          console.log(`${names[index]} ${spot.label}: blocked at ${dist.toFixed(2)} m > r=${radius}, prompt not expected`);
        }
        if (dist > radius + 0.5) {
          console.log(`${names[index]} ${spot.label}: stuck at (${character.x.toFixed(2)}, ${character.z.toFixed(2)}) dist=${dist.toFixed(2)} radius=${radius}`);
        }
        expect(dist).toBeLessThanOrEqual(radius + 0.5);
      }
    }
    console.log(`${names[index]}: min camera target y=${minHeight.toFixed(2)} m, worst target distance=${worstDist.toFixed(2)} m`);
    expect(worstDist).toBeLessThan(2.5);
    sys.dispose();
  });
});

/**
 * Window-resize usability: the smoothed follow-camera target must stay
 * valid and the active avatar must stay readable at extreme aspect ratios
 * (640×400, 1280×720, 3440×1440) at every character/spawn/anchor.
 */
describe("follow camera survives extreme aspect ratios", () => {
  const names = ["cloud", "automaton", "courier", "guardian"];
  const viewports: Array<[number, number]> = [[640, 400], [1280, 720], [3440, 1440]];
  const RIG = { distance: 12.5, fov: 58, polar: 1.02 }; // main.ts rig (c0df854)

  function rigCamera(target: THREE.Vector3, width: number, height: number): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(RIG.fov, width / height, 0.25, 240);
    camera.position.set(target.x, target.y + RIG.distance * Math.cos(RIG.polar), target.z + RIG.distance * Math.sin(RIG.polar));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }

  function projectedHeightPx(camera: THREE.PerspectiveCamera, sphere: THREE.Sphere, heightPx: number): number {
    const top = sphere.center.clone().add(new THREE.Vector3(0, sphere.radius, 0)).project(camera);
    const bottom = sphere.center.clone().add(new THREE.Vector3(0, -sphere.radius, 0)).project(camera);
    return Math.abs(top.y - bottom.y) * heightPx / 2;
  }

  it.each(names.map((name, i) => [name, i] as [string, number]))(
    "%s: target valid and avatar readable at every viewport aspect",
    (_name, index) => {
      const world = createWorld();
      const state = { axis: { x: 0, z: 0 } };
      const sys = createCharacters(world, {
        axis: () => state.axis,
        interactRequested: () => false,
        paused: () => false,
        cameraYaw: () => 0,
      });
      sys.select(index);

      const spots: Array<{ label: string; x: number; z: number; via: Array<[number, number]> }> = [
        ...world.result.spawnPoints.map((p, i) => ({ label: `spawn${i}`, x: p.x, z: p.z, via: [] as Array<[number, number]> })),
        { label: "desk-monitor", x: -8, z: 7, via: [[-6, -1.3], [0, 7]] },
        { label: "meeting-screen", x: -8, z: -6, via: [[-6, -1.3], [-6, -6]] },
        { label: "lounge-sofa", x: 9, z: 6, via: [[-6, -1.3], [0, 6]] },
        { label: "terrace-lookout", x: 9, z: -8, via: [[-6, -1.3], [0, -6]] },
      ];

      let minY = Infinity;
      const worstPx: number[] = [Infinity, Infinity, Infinity];
      for (const spot of spots) {
        driveTo(sys, state, world.result.spawnPoints[index]!.x, world.result.spawnPoints[index]!.z);
        for (const [wx, wz] of spot.via) driveTo(sys, state, wx, wz);
        driveTo(sys, state, spot.x, spot.z);
        for (let settle = 0; settle < 120; settle++) sys.update(FRAME);

        const target = sys.getCameraTarget!().clone();
        expect(target.y).toBeGreaterThanOrEqual(1.4);
        expect(Math.abs(target.x)).toBeLessThanOrEqual(DECK_BOUNDS.halfX + 1.5);
        expect(Math.abs(target.z)).toBeLessThanOrEqual(DECK_BOUNDS.halfZ + 1.5);
        expect(insideAnyCollider(target.x, target.z, world.result.colliders, CHARACTER_RADIUS)).toBe(false);
        minY = Math.min(minY, target.y);

        sys.group.updateMatrixWorld(true);
        const sphere = new THREE.Box3().setFromObject(sys.group.children[index]!)
          .getBoundingSphere(new THREE.Sphere());
        viewports.forEach(([w, h], vi) => {
          const camera = rigCamera(target, w, h);
          const px = projectedHeightPx(camera, sphere, h);
          worstPx[vi] = Math.min(worstPx[vi] ?? Infinity, px);
        });
      }
      console.log(`${names[index]}: min target y=${minY.toFixed(2)} m; projected px at 640x400=${worstPx[0]!.toFixed(0)}, 1280x720=${worstPx[1]!.toFixed(0)}, 3440x1440=${worstPx[2]!.toFixed(0)}`);
      expect(worstPx[0]!).toBeGreaterThanOrEqual(40); // measured floor at 640×400 (see report)
      expect(worstPx[1]!).toBeGreaterThanOrEqual(60);
      expect(worstPx[2]!).toBeGreaterThanOrEqual(60);
      sys.dispose();
    },
  );
});
