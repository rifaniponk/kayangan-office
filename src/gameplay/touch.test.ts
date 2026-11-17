import { describe, expect, it } from "vitest";
import { createWorld } from "../world/index.js";
import { createCharacters } from "./index.js";

/**
 * Keyboard-free playability: the whole loop must run through the
 * on-screen control surface only — select(), setMoveAxis() and the
 * interact path (the HUD button holds interactRequested, exactly like
 * C's overlay wiring). No keyboard input is ever touched.
 */
const FRAME = 1 / 60;
const names = ["cloud", "automaton", "courier", "guardian"];

function driveTouch(sys: ReturnType<typeof createCharacters>, tx: number, tz: number): void {
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
    sys.setMoveAxis(axis.x, axis.z); // on-screen pad: camera-relative axis
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
  sys.setMoveAxis(0, 0); // release the virtual pad
  sys.update(FRAME);
}

describe("playable with no keyboard at all", () => {
  const plans: Array<{ index: number; anchor: string; via: Array<[number, number]> }> = [
    { index: 0, anchor: "desk-monitor", via: [[0, 7]] },
    { index: 1, anchor: "meeting-screen", via: [[-5.95, -1.3], [-5.95, -6]] },
    { index: 2, anchor: "lounge-sofa", via: [[0, 6]] },
    { index: 3, anchor: "terrace-lookout", via: [[-5.95, -1.3], [4.9, -2.5], [7.5, -8]] },
  ];

  it.each(plans.map((p, i) => [names[i]!, p] as [string, (typeof plans)[number]]))(
    "%s reaches %s via on-screen controls only",
    (_name, plan) => {
      const world = createWorld();
      let pressed = false; // HUD Interact button state
      const input = {
        axis: () => ({ x: 0, z: 0 }), // keyboard untouched
        interactRequested: () => pressed,
        paused: () => false,
        cameraYaw: () => 0,
      };
      const sys = createCharacters(world, input);
      sys.select(plan.index);
      for (const [wx, wz] of plan.via) driveTouch(sys, wx, wz);
      const anchor = world.result.interactables.find((a) => a.id === plan.anchor)!;
      driveTouch(sys, anchor.x, anchor.z);
      sys.update(FRAME);

      const pos = sys.getActivePosition();
      const distance = Math.hypot(pos.x - anchor.x, pos.z - anchor.z);
      console.log(`${names[plan.index]} -> ${plan.anchor}: arrived at ${distance.toFixed(2)} m (r=${anchor.radius})`);
      expect(distance).toBeLessThanOrEqual(anchor.radius);

      const near = sys.getNearestInteractable?.();
      expect(near).not.toBeNull();
      expect(near!.id).toBe(plan.anchor);

      pressed = true;
      sys.update(FRAME);
      pressed = false;
      sys.update(FRAME);
      expect(sys.getInteraction?.()).not.toBeNull();
      expect(sys.getInteraction?.()?.detail ?? "").not.toBe("");
      expect(sys.getActiveState?.()).toBe("interact");
      sys.dispose();
    },
  );

  it("the pad at rest stops movement and selection keeps each position", () => {
    const world = createWorld();
    const input = {
      axis: () => ({ x: 0, z: 0 }),
      interactRequested: () => false,
      paused: () => false,
      cameraYaw: () => 0,
    };
    const sys = createCharacters(world, input);

    sys.select(0);
    sys.setMoveAxis(-1, 0);
    for (let s = 0; s < 30; s++) sys.update(FRAME);
    const moving = sys.getActivePosition().clone();
    sys.setMoveAxis(0, 0);
    for (let s = 0; s < 60; s++) sys.update(FRAME);
    expect(sys.getActivePosition().distanceTo(moving)).toBe(0); // pad released -> stopped

    const cloudPos = sys.getActivePosition().clone();
    sys.select(2); // courier keeps its own spot
    const courierPos = sys.getActivePosition().clone();
    sys.select(1); // automaton keeps its own spot
    const automatonPos = sys.getActivePosition().clone();
    sys.select(0);
    expect(sys.getActivePosition().distanceTo(cloudPos)).toBe(0);
    sys.select(2);
    expect(sys.getActivePosition().distanceTo(courierPos)).toBe(0);
    sys.select(1);
    expect(sys.getActivePosition().distanceTo(automatonPos)).toBe(0);
    sys.dispose();
  });
});
