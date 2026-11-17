import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWorld } from "../src/world/index.js";
import { CHARACTER_IDS } from "../src/core/contracts.js";

const DECK = { halfX: 18, halfZ: 12 };
const AISLE_HALF = 2.5;
const RADIUS = 0.55;

function overlaps(x: number, z: number, boxes: { x: number; z: number; width: number; depth: number }[], radius: number): boolean {
  return boxes.some((box) => {
    const cx = Math.max(box.x - box.width / 2, Math.min(box.x + box.width / 2, x));
    const cz = Math.max(box.z - box.depth / 2, Math.min(box.z + box.depth / 2, z));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
  });
}

describe("world contract", () => {
  const world = createWorld();

  it("exposes four anchors, one per zone", () => {
    expect(world.result.interactables.map((item) => item.id).sort()).toEqual([
      "desk-monitor",
      "lounge-sofa",
      "meeting-screen",
      "terrace-lookout",
    ]);
    for (const anchor of world.result.interactables) {
      expect(anchor.radius).toBeGreaterThan(RADIUS);
      expect(Math.abs(anchor.x)).toBeLessThan(DECK.halfX);
      expect(Math.abs(anchor.z)).toBeLessThan(DECK.halfZ);
    }
  });

  it("keeps every spawn point on the deck and clear of props", () => {
    expect(world.result.spawnPoints).toHaveLength(4);
    for (const point of world.result.spawnPoints) {
      expect(Math.abs(point.x)).toBeLessThan(DECK.halfX);
      expect(Math.abs(point.z)).toBeLessThan(DECK.halfZ);
      expect(point.y).toBeCloseTo(0, 3);
      expect(overlaps(point.x, point.z, world.result.colliders, RADIUS)).toBe(false);
    }
  });

  it("keeps the central aisle passable from front to back", () => {
    for (let z = -DECK.halfZ + 1; z <= DECK.halfZ - 1; z += 1) {
      expect(overlaps(0, z, world.result.colliders, RADIUS)).toBe(false);
    }
    for (const x of [-AISLE_HALF, AISLE_HALF]) {
      expect(overlaps(x, 0, world.result.colliders, RADIUS)).toBe(false);
    }
  });

  it("blocks the island rim so a character cannot walk off the deck", () => {
    for (const point of [
      new THREE.Vector3(DECK.halfX - 0.4, 0, 0),
      new THREE.Vector3(-(DECK.halfX - 0.4), 0, 0),
      new THREE.Vector3(0, 0, DECK.halfZ - 0.4),
      new THREE.Vector3(0, 0, -(DECK.halfZ - 0.4)),
    ]) {
      expect(overlaps(point.x, point.z, world.result.colliders, RADIUS)).toBe(true);
    }
  });

  it("stays inside the diagnostic geometry budget", () => {
    let meshes = 0;
    let triangles = 0;
    world.result.group.traverse((node) => {
      if (!(node instanceof THREE.Mesh && node.isMesh)) return;
      meshes += node instanceof THREE.InstancedMesh ? node.count : 1;
      const geometry = node.geometry;
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      triangles += (node instanceof THREE.InstancedMesh ? node.count : 1) * count / 3;
    });
    expect(meshes).toBeLessThanOrEqual(250);
    expect(triangles).toBeLessThanOrEqual(300_000);
  });

  it("activates every zone deterministically and cleans up", () => {
    const zones = new Set<string>();
    for (const anchor of world.result.interactables) {
      const first = world.interact(anchor.id);
      const second = world.interact(anchor.id);
      expect(first?.zone).toBeTruthy();
      expect(second?.detail).toBeTruthy();
      zones.add(first?.zone ?? "");
      anchor.activate();
    }
    expect([...zones].sort()).toEqual(["desk", "lounge", "meeting", "terrace"]);
    expect(CHARACTER_IDS).toHaveLength(4);

    const tracked = world.result.group.children.length;
    expect(tracked).toBeGreaterThan(0);
    world.result.dispose();
    expect(world.result.group.children.length).toBe(0);
  });

  it("applies both quality modes without throwing", () => {
    const fresh = createWorld();
    for (const mode of ["high", "low"] as const) {
      expect(() => fresh.setQuality(mode)).not.toThrow();
    }
    fresh.result.dispose();
  });
});
