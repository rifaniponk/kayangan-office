import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Interactable, World } from "../core/contracts.js";
import { createCharacters, DECK_BOUNDS } from "./index.js";
import { CHARACTER_RADIUS } from "./collision.js";

function makeWorld() {
  const interactables: Interactable[] = [
    { id: "desk-monitor", label: "Monitor", x: -8, z: 7, radius: 1.6, activate: () => {} },
    { id: "meeting-screen", label: "Screen", x: -8, z: -6, radius: 1.6, activate: () => {} },
    { id: "lounge-sofa", label: "Sofa", x: 9, z: 6, radius: 1.6, activate: () => {} },
    { id: "terrace-lookout", label: "Lookout", x: 9, z: -8, radius: 1.6, activate: () => {} },
  ];
  const colliders = [
    { x: -8, z: 7.7, width: 2.4, depth: 1.2 },
    { x: -8, z: -6.8, width: 3.2, depth: 2.2 },
    { x: 9.8, z: 6, width: 2.6, depth: 1.2 },
    { x: 9, z: -8.8, width: 1.6, depth: 1.6 },
    { x: -1.6, z: -4, width: 0.2, depth: 12 },
  ];
  const interact = vi.fn((id: string) => ({ zone: "desk" as const, label: id, detail: id }));
  const world: World = {
    result: {
      group: new THREE.Group(),
      colliders,
      interactables,
      spawnPoints: [
        new THREE.Vector3(-3, 0, 6),
        new THREE.Vector3(-6, 0, -1.5),
        new THREE.Vector3(3.5, 0, 6),
        new THREE.Vector3(3, 0, -1.5),
      ],
      dispose: () => {},
    },
    interact,
    setQuality: () => {},
  };
  return { world, interact };
}

function makeInput(opts: { axis?: () => { x: number; z: number }; held?: () => boolean; paused?: () => boolean; yaw?: () => number }) {
  return {
    axis: opts.axis ?? (() => ({ x: 0, z: 0 })),
    interactRequested: opts.held ?? (() => false),
    paused: opts.paused ?? (() => false),
    cameraYaw: opts.yaw ?? (() => 0),
  };
}

const step = (sys: ReturnType<typeof createCharacters>, n: number, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) sys.update(dt);
};

describe("character system", () => {
  it("blocks movement into props and clamps to the deck", () => {
    const { world } = makeWorld();
    const ref: { sys: ReturnType<typeof createCharacters> | null } = { sys: null };
    const sys = createCharacters(world, makeInput({
      axis: () => {
        const pos = ref.sys?.getActivePosition();
        if (!pos) return { x: 0, z: 0 };
        const dx = -8 - pos.x;
        const dz = 6.2 - pos.z;
        const len = Math.hypot(dx, dz);
        return len < 0.25 ? { x: 0, z: 0 } : { x: dx / len, z: dz / len };
      },
    }));
    ref.sys = sys;
    step(sys, 900); // walk spawn (-3,6) toward desk rim (-8,~6.55)
    const pos = sys.getActivePosition();
    expect(pos.z).toBeLessThan(7.1 - CHARACTER_RADIUS + 0.05); // desk rim at z=7.1
    expect(pos.z).toBeGreaterThan(5.8); // actually walked to the rim, not stuck
    sys.select(2);
    step(sys, 4000);
    const edge = sys.getActivePosition();
    expect(Math.abs(edge.x)).toBeLessThanOrEqual(DECK_BOUNDS.halfX - DECK_BOUNDS.inset);
    expect(Math.abs(edge.z)).toBeLessThanOrEqual(DECK_BOUNDS.halfZ - DECK_BOUNDS.inset);
    sys.dispose();
  });

  it("activates once per key press and reports the nearest anchor", () => {
    const { world, interact } = makeWorld();
    let held = false;
    const ref: { sys: ReturnType<typeof createCharacters> | null } = { sys: null };
    const input = makeInput({
      axis: () => {
        const pos = ref.sys?.getActivePosition();
        if (!pos) return { x: 0, z: 0 };
        const dx = -8 - pos.x;
        const dz = 6.2 - pos.z;
        const len = Math.hypot(dx, dz);
        return len < 0.25 ? { x: 0, z: 0 } : { x: dx / len, z: dz / len };
      },
      held: () => held,
    });
    const sys = createCharacters(world, input);
    ref.sys = sys;
    sys.select(0);
    step(sys, 900); // walk from spawn (-3,6) to the desk rim
    const near = sys.getNearestInteractable?.();
    expect(near?.id).toBe("desk-monitor");
    held = true;
    step(sys, 30);
    expect(interact).toHaveBeenCalledTimes(1);
    expect(sys.getActiveState?.()).toBe("interact");
    held = false;
    step(sys, 60);
    held = true;
    step(sys, 10);
    expect(interact).toHaveBeenCalledTimes(2);
    sys.dispose();
  });

  it("retains each character's position across switches", () => {
    const { world } = makeWorld();
    const sys = createCharacters(world, makeInput({ axis: () => ({ x: -0.6, z: -0.8 }) }));
    step(sys, 60); // cloud walks
    const cloud = sys.getActivePosition().clone();
    sys.select(2);
    step(sys, 60); // courier walks
    const courier = sys.getActivePosition().clone();
    sys.select(0);
    expect(sys.getActivePosition().distanceTo(cloud)).toBeCloseTo(0, 9);
    sys.select(2);
    expect(sys.getActivePosition().distanceTo(courier)).toBeCloseTo(0, 9);
    sys.dispose();
  });

  it("freezes on pause and resumes cleanly", () => {
    const { world } = makeWorld();
    let paused = false;
    const sys = createCharacters(world, makeInput({ axis: () => ({ x: 1, z: 0 }), paused: () => paused }));
    step(sys, 60);
    const before = sys.getActivePosition().clone();
    paused = true;
    step(sys, 600);
    expect(sys.getActivePosition().distanceTo(before)).toBeCloseTo(0, 9);
    paused = false;
    step(sys, 60);
    expect(sys.getActivePosition().distanceTo(before)).toBeGreaterThan(0.5);
    sys.dispose();
  });

  it("movement distance is frame-rate independent", () => {
    const { world } = makeWorld();
    const sys = createCharacters(world, makeInput({ axis: () => ({ x: 0.6, z: -0.8 }) }));
    step(sys, 20, 0.1);
    const slow = sys.getActivePosition().clone();
    sys.dispose();
    const sys2 = createCharacters(world, makeInput({ axis: () => ({ x: 0.6, z: -0.8 }) }));
    for (let i = 0; i < 120; i++) sys2.update(1 / 60);
    const fast = sys2.getActivePosition();
    expect(slow.distanceTo(fast)).toBeLessThan(0.05);
    sys2.dispose();
  });
});
