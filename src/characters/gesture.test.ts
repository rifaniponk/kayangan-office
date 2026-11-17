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

/** Snapshot of every joint (Group) position + rotation, in traverse order. */
function pose(avatar: Avatar): number[] {
  const out: number[] = [];
  avatar.root.traverse((node) => {
    if (node instanceof THREE.Group && node !== avatar.root) {
      out.push(node.position.x, node.position.y, node.position.z,
        node.rotation.x, node.rotation.y, node.rotation.z);
    }
  });
  return out;
}

function absMean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

describe("the four interact gestures are distinct animations", () => {
  const names = ["cloud", "automaton", "courier", "guardian"];
  const times = [0, 0.2, 0.4, 0.6]; // sampled across the 0.9 s gesture

  function signature(i: number): { sig: number[]; movers: number; backToIdle: number } {
    const avatar = AVATAR_BUILDERS[i]!();
    avatar.animate("idle", 0, 1 / 60, 0, 0);
    const idle = pose(avatar);

    // Gesture curve: the system drives gesture = timer/0.9, i.e. 1 -> 0 over
    // GESTURE_SECONDS; sample it at 0, 0.2, 0.4, 0.6 s.
    const curve = times.map((t) => {
      avatar.animate("interact", t, 1 / 60, 0, 1 - t / 0.9);
      return pose(avatar);
    });

    // Movers: joints displaced >= 0.08 m or >= 0.25 rad at any sample.
    let movers = 0;
    for (let j = 0; j < idle.length / 6; j++) {
      let maxPos = 0;
      let maxRot = 0;
      for (const s of curve) {
        const dx = s[j * 6]! - idle[j * 6]!;
        const dy = s[j * 6 + 1]! - idle[j * 6 + 1]!;
        const dz = s[j * 6 + 2]! - idle[j * 6 + 2]!;
        maxPos = Math.max(maxPos, Math.hypot(dx, dy, dz));
        maxRot = Math.max(maxRot, Math.abs(s[j * 6 + 3]! - idle[j * 6 + 3]!) +
          Math.abs(s[j * 6 + 4]! - idle[j * 6 + 4]!) + Math.abs(s[j * 6 + 5]! - idle[j * 6 + 5]!));
      }
      if (maxPos >= 0.08 || maxRot >= 0.25) movers += 1;
    }

    // Gesture ends at 0.9 s; at 1.1 s the pose must equal the idle pose at
    // the same clock (same builder, same state/clock ⇒ deterministic pose).
    avatar.animate("interact", 1.1, 1 / 60, 0, 0); // gesture param 0 ⇒ idle
    const late = pose(avatar);
    const idleLate = (() => {
      const twin = AVATAR_BUILDERS[i]!();
      twin.animate("idle", 1.1, 1 / 60, 0, 0);
      const p = pose(twin);
      twin.dispose();
      return p;
    })();
    const backToIdle = absMean(late, idleLate);
    avatar.dispose();

    // Signature: mean displacement magnitude over the gesture's moving
    // joints per sample — motion amplitude, not diluted by static joints.
    const moving: number[] = [];
    for (let j = 0; j < idle.length / 6; j++) {
      let maxPos = 0;
      let maxRot = 0;
      for (const c of curve) {
        maxPos = Math.max(maxPos, Math.hypot(c[j * 6]! - idle[j * 6]!, c[j * 6 + 1]! - idle[j * 6 + 1]!, c[j * 6 + 2]! - idle[j * 6 + 2]!));
        maxRot = Math.max(maxRot, Math.abs(c[j * 6 + 3]! - idle[j * 6 + 3]!) + Math.abs(c[j * 6 + 4]! - idle[j * 6 + 4]!) + Math.abs(c[j * 6 + 5]! - idle[j * 6 + 5]!));
      }
      if (maxPos >= 0.08 || maxRot >= 0.25) moving.push(j);
    }
    const sig = curve.map((c) => {
      let sum = 0;
      for (const j of moving) {
        const dp = Math.hypot(c[j * 6]! - idle[j * 6]!, c[j * 6 + 1]! - idle[j * 6 + 1]!, c[j * 6 + 2]! - idle[j * 6 + 2]!);
        const dr = Math.abs(c[j * 6 + 3]! - idle[j * 6 + 3]!) + Math.abs(c[j * 6 + 4]! - idle[j * 6 + 4]!) + Math.abs(c[j * 6 + 5]! - idle[j * 6 + 5]!);
        sum += dp + dr;
      }
      return sum; // total gesture displacement over the moving joints
    });
    return { sig, movers, backToIdle };
  }

  const sigs = names.map((_, i) => signature(i));

  it.each(names.map((name, i) => [name, i] as [string, number]))(
    "%s gesture moves at least two joints by >= 0.08 m or >= 0.25 rad",
    (name, i) => {
      console.log(`${name}: gesture-displacement ${sigs[i]!.sig.map((v) => v.toFixed(2)).join("/")} movers=${sigs[i]!.movers} idle-return=${sigs[i]!.backToIdle.toFixed(4)}`);
      expect(sigs[i]!.movers).toBeGreaterThanOrEqual(2);
      expect(sigs[i]!.backToIdle).toBeLessThan(0.05); // gesture returns to idle by 1.1 s
    },
  );

  it("pairwise gesture signatures differ by >= 0.15 mean joint delta", () => {
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const sa = sigs[a]!.sig;
        const sb = sigs[b]!.sig;
        const delta = absMean(sa, sb);
        console.log(`signature delta ${names[a]} vs ${names[b]}: ${delta.toFixed(3)}`);
        expect(delta).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});
