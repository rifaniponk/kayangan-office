import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVATAR_BUILDERS } from "./index.js";
import type { Avatar } from "./parts.js";

/**
 * Sample a readable motion signature per avatar over 2 s of "move":
 * body-group height (float/hop/stomp) plus total joint rotation energy.
 */
function motionTrace(build: () => Avatar) {
  const avatar = build();
  const bodyY: number[] = [];
  const energy: number[] = [];
  for (let frame = 0; frame < 120; frame++) {
    const t = frame / 60;
    avatar.animate("move", t, 1 / 60, 1, 0);
    const body = avatar.root.children[0] as THREE.Group;
    bodyY.push(body.position.y);
    let sum = 0;
    avatar.root.traverse((node) => {
      if (node instanceof THREE.Group && node !== avatar.root) {
        // Bounded rotation energy: spinning parts (Cloud curl) accumulate
        // angle, so sample periodic magnitude instead of raw rotation.
        sum += Math.abs(Math.sin(node.rotation.x)) + Math.abs(Math.sin(node.rotation.y)) + Math.abs(Math.sin(node.rotation.z));
      }
    });
    energy.push(sum);
  }
  avatar.dispose();
  return { bodyY, energy };
}

const amplitude = (series: number[]) => Math.max(...series) - Math.min(...series);
const differs = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));
const crossings = (series: number[]) =>
  series.slice(1).filter((v, i) => (series[i]! - v) * (v - (series[i + 2] ?? v)) < 0).length;

function idleTrace(build: () => Avatar) {
  const avatar = build();
  const energy: number[] = [];
  for (let frame = 0; frame < 180; frame++) {
    avatar.animate("idle", frame / 60, 1 / 60, 0, 0);
    let sum = 0;
    avatar.root.traverse((node) => {
      if (node instanceof THREE.Group && node !== avatar.root) {
        // Bounded rotation energy: spinning parts (Cloud curl) accumulate
        // angle, so sample periodic magnitude instead of raw rotation.
        sum += Math.abs(Math.sin(node.rotation.x)) + Math.abs(Math.sin(node.rotation.y)) + Math.abs(Math.sin(node.rotation.z));
      }
    });
    energy.push(sum);
  }
  avatar.dispose();
  return energy;
}

describe("idle motion is alive but calm", () => {
  it.each(["cloud", "automaton", "courier", "guardian"].map((name, i) => [name, i] as [string, number]))(
    "%s idles visibly but calmly",
    (_name, i) => {
      const series = idleTrace(AVATAR_BUILDERS[i]!);
      expect(amplitude(series)).toBeGreaterThan(0.05); // clearly breathing
      expect(amplitude(series)).toBeLessThan(1.2); // calm, not walking (bounded rotation energy)
    },
  );
});

describe("avatar motion is distinct per character", () => {
  const traces = AVATAR_BUILDERS.map((build) => motionTrace(build));
  const names = ["cloud", "automaton", "courier", "guardian"];

  it.each(names.map((name, i) => [name, i] as [string, number]))("%s has real moving motion", (_name, i) => {
    const trace = traces[i]!;
    expect(amplitude(trace.energy)).toBeGreaterThan(0.2);
    expect(amplitude(trace.bodyY)).toBeGreaterThan(0.02);
  });

  it("no two characters share the same motion signature", () => {
    for (let a = 0; a < traces.length; a++) {
      for (let b = a + 1; b < traces.length; b++) {
        expect(differs(traces[a]!.energy, traces[b]!.energy)).toBeGreaterThan(0.2);
      }
    }
  });

  it("cloud floats, courier hops, automaton and guardian stay grounded", () => {
    expect(Math.min(...traces[0]!.bodyY)).toBeGreaterThan(0.3); // hovering puff
    expect(amplitude(traces[2]!.bodyY)).toBeGreaterThan(0.12); // birdlike hops
    expect(amplitude(traces[1]!.bodyY)).toBeLessThan(0.1); // small mechanical bob only
    expect(amplitude(traces[3]!.bodyY)).toBeLessThan(0.1); // heavy stomps, no jumping
  });

  it("courier cadence is quicker than guardian stomps", () => {
    expect(crossings(traces[2]!.energy)).toBeGreaterThan(crossings(traces[3]!.energy));
  });
});
