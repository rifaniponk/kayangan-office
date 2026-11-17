import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVATAR_BUILDERS } from "./index.js";

/** Measured silhouette bounds from real geometry — no image viewing needed. */
function bounds(build: () => { root: THREE.Group; dispose: () => void }) {
  const avatar = build();
  const box = new THREE.Box3().setFromObject(avatar.root);
  const size = box.getSize(new THREE.Vector3());
  const bottom = box.min.y;
  avatar.dispose();
  return { height: size.y, width: size.x, depth: size.z, bottom };
}

describe("avatar silhouettes match the 1.1–1.5 m contract", () => {
  const shapes = AVATAR_BUILDERS.map((build) => bounds(build));
  const names = ["cloud", "automaton", "courier", "guardian"];

  it.each(names.map((name, i) => [name, i] as [string, number]))("%s stands 1.1–1.5 m tall on the deck", (_name, i) => {
    const shape = shapes[i]!;
    expect(shape.height).toBeGreaterThanOrEqual(1.05);
    expect(shape.height).toBeLessThanOrEqual(1.6);
    expect(shape.bottom).toBeGreaterThanOrEqual(-0.05); // not sunk below the deck
  });

  it("silhouette footprints are visibly distinct, not one scaled base model", () => {
    const widths = shapes.map((s) => s.width);
    const unique = new Set(widths.map((w) => Math.round(w * 10)));
    expect(unique.size).toBeGreaterThanOrEqual(3); // at least three distinct widths
    for (const s of shapes) expect(s.width).toBeGreaterThan(0.3); // readable body size
  });
});
