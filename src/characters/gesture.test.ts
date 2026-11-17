import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVATAR_BUILDERS } from "./index.js";
import type { Avatar } from "./parts.js";

/**
 * The interact gesture must read at 1.1–1.5 m scale: mid-gesture (0.5) must
 * move visible joints noticeably more than the idle baseline.
 */
function gestureDelta(build: () => Avatar): number {
  const avatar = build();
  // Baseline pose at gesture 0 (idle-like frame), then mid-gesture frame.
  avatar.animate("idle", 0.5, 1 / 60, 0, 0);
  avatar.root.updateMatrixWorld(true);
  const snapshot = () => {
    const parts: { pos: THREE.Vector3; rot: THREE.Euler }[] = [];
    avatar.root.traverse((node) => {
      if (node instanceof THREE.Group && node !== avatar.root) {
        parts.push({ pos: node.position.clone(), rot: node.rotation.clone() });
      }
    });
    return parts;
  };
  const before = snapshot();
  avatar.animate("interact", 0.5, 1 / 60, 0, 0.5);
  avatar.root.updateMatrixWorld(true);
  const after = snapshot();
  avatar.dispose();
  let max = 0;
  for (let i = 0; i < before.length; i++) {
    const b = before[i]!;
    const a = after[i]!;
    const rotationDelta =
      Math.abs(b.rot.x - a.rot.x) + Math.abs(b.rot.y - a.rot.y) + Math.abs(b.rot.z - a.rot.z);
    max = Math.max(max, b.pos.distanceTo(a.pos) + rotationDelta);
  }
  return max;
}

describe("interact gestures read clearly", () => {
  const names = ["cloud", "automaton", "courier", "guardian"];
  it.each(names.map((name, i) => [name, i] as [string, number]))(
    "%s gesture moves joints by >= 0.1 m at mid-gesture",
    (_name, i) => {
      expect(gestureDelta(AVATAR_BUILDERS[i]!)).toBeGreaterThanOrEqual(0.1);
    },
  );
});
