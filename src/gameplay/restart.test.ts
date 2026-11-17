import { describe, expect, it } from "vitest";
import { createWorld } from "../world/index.js";
import { createCharacters } from "./index.js";

/**
 * restart() disposes the old system and builds a new one against the same
 * world; avatars must own their geometry/materials so disposing one system
 * cannot break the next.
 */
describe("systems are independent", () => {
  it("a disposed system does not disable a freshly built one", () => {
    const world = createWorld();
    const state = { axis: { x: 0, z: 1 } }; // south of the doorway posts: open floor
    const input = { axis: () => state.axis, interactRequested: () => false, paused: () => false, cameraYaw: () => 0 };
    const first = createCharacters(world, input);
    first.update(1 / 60);
    first.dispose();

    const second = createCharacters(world, input);
    second.select(1);
    const before = second.getActivePosition().clone();
    for (let s = 0; s < 60; s++) second.update(1 / 60);
    expect(second.getActivePosition().distanceTo(before)).toBeGreaterThan(1.5); // still walks
    expect(second.getCameraTarget!().y).toBeGreaterThanOrEqual(1.4); // still animates/frames
    second.dispose();
  });
});
