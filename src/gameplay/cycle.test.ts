import { describe, expect, it } from "vitest";
import { createWorld } from "../world/index.js";
import { createCharacters } from "./index.js";

/**
 * Zone interaction cycling determinism: repeated E presses at one anchor
 * must walk the world's own cycle exactly (no skips, no drift), must not
 * advance other zones' cycles, and getInteraction() must mirror the last
 * world.interact() result verbatim.
 */
const FRAME = 1 / 60;
const door: [number, number] = [-5.95, -1.3];
const room: [number, number] = [-5.95, -6];
const deskFront: [number, number] = [0, 7];
const aisleNorth: [number, number] = [0, 6];
const terraceGate: [number, number] = [4.9, -2.5];
const terraceWest: [number, number] = [7.5, -8];

const PLANS = [
  { index: 0, anchor: "desk-monitor", via: [deskFront] },
  { index: 1, anchor: "meeting-screen", via: [door, room] },
  { index: 2, anchor: "lounge-sofa", via: [door, aisleNorth] },
  { index: 3, anchor: "terrace-lookout", via: [door, terraceGate, terraceWest] },
];

function driveTouch(sys: ReturnType<typeof createCharacters>, tx: number, tz: number): void {
  const pos = sys.getActivePosition();
  let stuck = 0;
  let detour = 0;
  let sign = 1;
  let last = { x: pos.x, z: pos.z };
  for (let step = 0; step < 2000; step++) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    if (Math.hypot(dx, dz) < 0.45) break;
    let axis = { x: dx / Math.hypot(dx, dz), z: dz / Math.hypot(dx, dz) };
    if (detour > 0) {
      axis = { x: -axis.z * sign, z: axis.x * sign };
      detour -= 1;
      if (detour === 0) sign *= -1;
    }
    sys.setMoveAxis(axis.x, axis.z);
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
  sys.setMoveAxis(0, 0);
  sys.update(FRAME);
}

describe("zone interaction cycling is deterministic", () => {
  for (const plan of PLANS) {
    it(`${plan.anchor}: 8 E presses follow the world cycle exactly`, () => {
      const world = createWorld();
      let pressed = false;
      const sys = createCharacters(world, {
        axis: () => ({ x: 0, z: 0 }),
        interactRequested: () => pressed,
        paused: () => false,
        cameraYaw: () => 0,
      });
      sys.select(plan.index);
      for (const [wx, wz] of plan.via) driveTouch(sys, wx, wz);
      const anchor = world.result.interactables.find((a) => a.id === plan.anchor)!;
      driveTouch(sys, anchor.x, anchor.z);
      sys.update(FRAME);

      const pressedResults: Array<{ zone: string; label: string; detail: string }> = [];
      const realInteract = world.interact.bind(world);
      world.interact = (id: string) => {
        const result = realInteract(id);
        expect(result).not.toBeNull();
        pressedResults.push(result!);
        return result;
      };

      let presses = 0;
      for (let p = 0; p < 8; p++) {
        pressed = true;
        sys.update(FRAME);
        pressed = false;
        sys.update(FRAME); // release latch for the next press
        sys.update(FRAME);
        presses += 1;
        expect(sys.getInteraction?.()).toEqual(pressedResults[pressedResults.length - 1]);
      }
      expect(presses).toBe(8);
      expect(pressedResults.length).toBe(8);

      // Ground truth: a fresh world's own cycle for the same anchor.
      const fresh = createWorld();
      const expected: string[] = [];
      for (let p = 0; p < 8; p++) expected.push(fresh.interact(plan.anchor)!.detail);
      const measured = pressedResults.map((r) => r.detail);
      console.log(`${plan.anchor} cycle: ${measured.map((d) => d.slice(0, 28)).join(" | ")}`);
      expect(measured).toEqual(expected);

      // Pressing this zone must not advance any other zone's cycle.
      for (const other of ["desk-monitor", "meeting-screen", "lounge-sofa", "terrace-lookout"]) {
        if (other === plan.anchor) continue;
        const freshOther = createWorld();
        expect(world.interact(other)!.detail).toBe(freshOther.interact(other)!.detail);
      }

      sys.dispose();
      fresh.result.dispose?.();
    });
  }
});
