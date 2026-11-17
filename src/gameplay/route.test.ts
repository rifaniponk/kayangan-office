import { describe, expect, it } from "vitest";
import { createWorld } from "../world/index.js";
import { createCharacters } from "./index.js";

/**
 * Acceptance route regression: every character walks from its own spawn to
 * every anchor through the corridor waypoints (doorway gap centre, terrace
 * rail gate), the interact prompt must be visible on arrival, and exactly
 * one world.interact(id) call per key press.
 */
const FRAME = 1 / 60;
const names = ["cloud", "automaton", "courier", "guardian"];

function driveTo(sys: ReturnType<typeof createCharacters>, state: { axis: { x: number; z: number } }, tx: number, tz: number): void {
  const pos = sys.getActivePosition();
  let stuck = 0;
  let detour = 0;
  let sign = 1;
  let last = { x: pos.x, z: pos.z };
  for (let step = 0; step < 2000; step++) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.45) break;
    let axis = { x: dx / len, z: dz / len };
    if (detour > 0) {
      axis = { x: -axis.z * sign, z: axis.x * sign };
      detour -= 1;
      if (detour === 0) sign *= -1;
    }
    state.axis = axis;
    sys.update(FRAME);
    const next = sys.getActivePosition();
    const moved = Math.hypot(next.x - last.x, next.z - last.z);
    stuck = moved < 0.01 ? stuck + 1 : 0;
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

const door: [number, number] = [-5.95, -1.3];
const room: [number, number] = [-5.95, -6];
const aisleNorth: [number, number] = [0, 6];
const deskFront: [number, number] = [0, 7];
const terraceGate: [number, number] = [4.9, -2.5];
const terraceWest: [number, number] = [7.5, -8]; // standable west of the lookout prop

/** Corridor routes from each character's spawn to each anchor. */
const ROUTES: Record<string, Array<Array<[number, number]>>> = {
  "desk-monitor": [[deskFront], [deskFront], [deskFront], [deskFront]],
  "meeting-screen": [[door, room], [door, room], [door, room], [door, room]],
  "lounge-sofa": [[], [door, aisleNorth], [door, aisleNorth], [door, aisleNorth]],
  "terrace-lookout": [[terraceWest], [door, terraceGate, terraceWest], [door, terraceGate, terraceWest], [door, terraceGate, terraceWest]],
};

describe("route regression: every character reaches every anchor with prompt + one activation", () => {
  for (let index = 0; index < 4; index++) {
    for (const anchor of ["desk-monitor", "meeting-screen", "lounge-sofa", "terrace-lookout"]) {
      it(`${names[index]} walks to ${anchor}, sees the prompt, activates once`, () => {
        const world = createWorld();
        const state = { axis: { x: 0, z: 0 } };
        let interactCalls = 0;
        const realInteract = world.interact.bind(world);
        world.interact = (id: string) => {
          interactCalls += 1;
          return realInteract(id);
        };
        const input = {
          axis: () => state.axis,
          interactRequested: () => false,
          paused: () => false,
          cameraYaw: () => 0,
        };
        const sys = createCharacters(world, input);
        sys.select(index);
        const spawn = world.result.spawnPoints[index]!;
        driveTo(sys, state, spawn.x, spawn.z); // start from this character's spawn
        for (const [wx, wz] of ROUTES[anchor]![index]!) driveTo(sys, state, wx, wz);
        const target = world.result.interactables.find((a) => a.id === anchor)!;
        driveTo(sys, state, target.x, target.z);
        sys.update(FRAME);

        const pos = sys.getActivePosition();
        const distance = Math.hypot(pos.x - target.x, pos.z - target.z);
        console.log(`leg ${names[index]} -> ${anchor}: arrived at ${distance.toFixed(2)} m (r=${target.radius})`);
        expect(distance).toBeLessThanOrEqual(target.radius);
        expect(sys.getNearestInteractable?.()?.id).toBe(anchor);

        input.interactRequested = () => true;
        sys.update(FRAME);
        input.interactRequested = () => false;
        sys.update(FRAME);
        expect(interactCalls).toBe(1);
        expect(sys.getInteraction?.()?.label ?? sys.getInteraction?.()?.zone).toBeTruthy();
        sys.dispose();
      });
    }
  }
});
