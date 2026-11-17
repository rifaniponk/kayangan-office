import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWorld } from "../world/index.js";
import { createCharacters } from "./index.js";

/**
 * Restart and pause acceptance regressions on the real world:
 * restart rebuilds the system (C's main.ts restart()), so every piece of
 * character state must be back at its initial value (idle pose, no stored
 * interaction, exact spawn positions, camera target re-converged), and a
 * pause must freeze the simulation with no dt spike on resume.
 */
const FRAME = 1 / 60;
const SPEEDS = [3.2, 2.5, 3.6, 2.1];

function makeSys(world: ReturnType<typeof createWorld>, state: { axis: { x: number; z: number } }, paused: () => boolean = () => false) {
  return createCharacters(world, {
    axis: () => state.axis,
    interactRequested: () => false,
    paused,
    cameraYaw: () => 0,
  });
}

function poseSnapshot(sys: ReturnType<typeof createCharacters>): number[] {
  const root = sys.group.children[sys.activeIndex] as THREE.Group;
  const out: number[] = [];
  root.traverse((node) => {
    out.push(node.position.x, node.position.y, node.position.z, node.rotation.x, node.rotation.y, node.rotation.z);
  });
  return out;
}

describe("restart resets the whole character state", () => {
  it("idle state, null interaction, exact spawns, camera re-convergence within 1 s", () => {
    const world = createWorld();
    const state = { axis: { x: 0, z: 1 } };
    const first = makeSys(world, state);
    first.select(1); // automaton walks south off its spawn for 4 s (open floor)
    for (let s = 0; s < 240; s++) first.update(FRAME);
    const walked = first.getActivePosition();
    expect(Math.hypot(walked.x - world.result.spawnPoints[1]!.x, walked.z - world.result.spawnPoints[1]!.z)).toBeGreaterThan(1.5);
    first.dispose(); // main.ts restart(): dispose + createCharacters + select(index)

    state.axis = { x: 0, z: 0 }; // main.ts restart(): keys cleared on window blur/restart
    const second = makeSys(world, state);
    second.select(1);
    second.update(FRAME);
    expect(second.getActiveState?.()).toBe("idle");
    expect(second.getInteraction?.()).toBeNull();

    let worstSpawnDelta = 0;
    for (let i = 0; i < 4; i++) {
      second.select(i);
      const p = second.getActivePosition();
      const s = world.result.spawnPoints[i]!;
      worstSpawnDelta = Math.max(worstSpawnDelta, Math.hypot(p.x - s.x, p.z - s.z));
      expect(Math.hypot(p.x - s.x, p.z - s.z)).toBe(0);
    }
    console.log(`restart spawn deltas: worst ${worstSpawnDelta.toFixed(3)} m (must be 0)`);

    second.select(3); // guardian: furthest camera target from the old character
    second.update(FRAME);
    let frames = 0;
    let converged = false;
    for (frames = 0; frames < 60; frames++) {
      second.update(FRAME);
      const t = second.getCameraTarget!();
      const c = second.getActivePosition();
      if (Math.hypot(t.x - c.x, t.z - c.z) < 0.05) {
        converged = true;
        break;
      }
    }
    console.log(`restart camera convergence: ${(frames * FRAME).toFixed(2)} s`);
    expect(converged).toBe(true);
    expect(frames * FRAME).toBeLessThanOrEqual(1);
    second.dispose();
  });
});

describe("pause freezes the simulation and resume has no dt spike", () => {
  it("positions and animation phase are unchanged over 30 paused frames", () => {
    const world = createWorld();
    const state = { axis: { x: 1, z: 0 } };
    let paused = false;
    const sys = makeSys(world, state, () => paused);
    sys.select(2); // courier
    for (let s = 0; s < 30; s++) sys.update(FRAME);
    const beforePos = sys.getActivePosition().clone();
    const beforePose = poseSnapshot(sys);
    paused = true;
    for (let s = 0; s < 30; s++) sys.update(FRAME); // 0.5 s paused
    expect(sys.getActivePosition().distanceTo(beforePos)).toBe(0);
    const afterPose = poseSnapshot(sys);
    expect(afterPose.length).toBe(beforePose.length);
    for (let i = 0; i < beforePose.length; i++) expect(afterPose[i]).toBe(beforePose[i]);
    console.log(`pause freeze: 30 frames -> position delta 0.000 m, joint deltas 0 (${beforePose.length / 6} joints)`);
    sys.dispose();
  });

  it("resume never produces a paused-window step", () => {
    const world = createWorld();
    const state = { axis: { x: 1, z: 0 } };
    let paused = false;
    const sys = makeSys(world, state, () => paused);
    sys.select(3); // guardian 2.1 m/s
    sys.update(FRAME);
    const before = sys.getActivePosition().clone();
    paused = true;
    for (let s = 0; s < 120; s++) sys.update(0.0167); // 2 s of paused frames
    paused = false;
    sys.update(2.0); // pathological 2 s step must be clamped, not walked
    const step = sys.getActivePosition().distanceTo(before);
    console.log(`resume first frame after 2 s pause: requested dt 2.0 s -> walked ${step.toFixed(2)} m (cap 2.1*0.1 = 0.21 m)`);
    expect(step).toBeLessThanOrEqual(SPEEDS[3]! * 0.1 + 0.01);
    sys.dispose();
  });
});

describe("a rebuilt system is independent of the disposed one", () => {
  it("restart builds an independent character system", () => {
    const world = createWorld();
    const state = { axis: { x: 0, z: 1 } }; // south of the doorway posts: open floor
    const first = makeSys(world, state);
    first.update(FRAME);
    first.dispose();

    const second = makeSys(world, state);
    second.select(1);
    const before = second.getActivePosition().clone();
    for (let s = 0; s < 60; s++) second.update(FRAME);
    expect(second.getActivePosition().distanceTo(before)).toBeGreaterThan(1.5); // still walks
    expect(second.getCameraTarget!().y).toBeGreaterThanOrEqual(1.4); // still animates/frames
    second.dispose();
  });
});
