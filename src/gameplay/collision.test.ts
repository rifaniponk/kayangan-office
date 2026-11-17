import { describe, expect, it } from "vitest";
import {
  CHARACTER_RADIUS,
  cameraRelativeAxis,
  clampToDeck,
  ensureOnDeck,
  lerpAngle,
  nearestInteractable,
  overlapsAny,
  outsideDeck,
  resolveSafeSpawn,
  slideMove,
  type Box,
  type DeckBounds,
} from "./collision.js";

const bounds: DeckBounds = { halfX: 18, halfZ: 12, inset: CHARACTER_RADIUS + 0.35 };
const desk: Box = { x: -8, z: 7, width: 2.4, depth: 1.2 };

describe("collision", () => {
  it("blocks movement straight into a desk", () => {
    const p = slideMove(-8, 9.5, 0, -1.4, [desk], CHARACTER_RADIUS, bounds);
    expect(p.z).toBeGreaterThanOrEqual(7 + 0.6 + CHARACTER_RADIUS - 0.01);
    expect(overlapsAny(p.x, p.z, [desk], CHARACTER_RADIUS)).toBe(false);
  });

  it("slides along a wall instead of stopping", () => {
    const wall: Box = { x: -6, z: 0, width: 12, depth: 0.3 };
    const p = slideMove(-6, 1.3, 3.5, -1.2, [wall], CHARACTER_RADIUS, bounds);
    expect(p.x).toBeCloseTo(-2.5, 6); // slid sideways along the wall
    expect(p.z).toBeCloseTo(1.3, 6); // blocked toward the wall
  });

  it("keeps characters inside the deck", () => {
    const p = clampToDeck(100, -100, bounds);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(bounds.halfX - bounds.inset);
    expect(Math.abs(p.z)).toBeLessThanOrEqual(bounds.halfZ - bounds.inset);
    expect(outsideDeck(p.x, p.z, bounds)).toBe(false);
  });

  it("slides through the doorway band and wedges outside it", () => {
    // A's door posts: faces at x=-6.99 and x=-4.97 -> standable centre band (-6.44, -5.52).
    const posts = [
      { x: -7.06, z: -2.0, width: 0.14, depth: 0.3 },
      { x: -4.9, z: -2.0, width: 0.14, depth: 0.3 },
    ];
    let through = { x: -6, z: -3.5 };
    for (let i = 0; i < 12; i++) through = slideMove(through.x, through.z, 0, 0.2, posts, CHARACTER_RADIUS, bounds);
    expect(through.z).toBeGreaterThan(-1.2); // centre at x=-6 passes the gap
    let wedged = { x: -5.3, z: -3.5 };
    for (let i = 0; i < 12; i++) wedged = slideMove(wedged.x, wedged.z, 0, 0.2, posts, CHARACTER_RADIUS, bounds);
    expect(wedged.z).toBeLessThan(-1.3); // centre outside the band stays blocked
  });

  it("snaps an escaped character back to its spawn", () => {
    const spawn = { x: -3, z: 6 };
    expect(ensureOnDeck(100, 100, bounds, spawn)).toEqual({ x: -3, z: 6 });
    expect(ensureOnDeck(0, 0, bounds, spawn)).toEqual({ x: 0, z: 0 });
  });

  it("pushes a spawn inside a prop out to free space", () => {
    const p = resolveSafeSpawn(-8, 7, [desk], CHARACTER_RADIUS, bounds);
    expect(overlapsAny(p.x, p.z, [desk], CHARACTER_RADIUS)).toBe(false);
    expect(outsideDeck(p.x, p.z, bounds)).toBe(false);
  });

  it("movement is frame-rate independent", () => {
    const boxes: Box[] = [];
    const one = slideMove(0, 0, 3.2 * 0.05, 0, boxes, CHARACTER_RADIUS, bounds);
    let x = 0;
    let z = 0;
    for (let i = 0; i < 12; i++) {
      const step = slideMove(x, z, 3.2 * (0.05 / 12), 0, boxes, CHARACTER_RADIUS, bounds);
      x = step.x;
      z = step.z;
    }
    expect(one.x).toBeCloseTo(x, 6);
    expect(one.z).toBeCloseTo(z, 6);
  });

  it("picks the nearest interactable within radius only", () => {
    const items = [
      { id: "desk-monitor", x: -8, z: 7, radius: 1.6 },
      { id: "terrace-lookout", x: 9, z: -8, radius: 1.6 },
    ];
    expect(nearestInteractable(-8, 7.8, items)?.id).toBe("desk-monitor");
    expect(nearestInteractable(0, 0, items)).toBeNull();
  });

  it("camera-relative axis maps forward to view direction", () => {
    const front = cameraRelativeAxis({ x: 0, z: -1 }, 0);
    expect(front.x).toBeCloseTo(0, 6);
    expect(front.z).toBeCloseTo(-1, 6);
    const right = cameraRelativeAxis({ x: 1, z: 0 }, 0);
    expect(right.x).toBeCloseTo(1, 6);
    expect(right.z).toBeCloseTo(0, 6);
    const yawFront = cameraRelativeAxis({ x: 0, z: -1 }, Math.PI / 2);
    expect(yawFront.x).toBeCloseTo(-1, 6); // camera at yaw 90° faces -x
  });

  it("lerpAngle takes the shortest arc", () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 1)).toBeCloseTo(-Math.PI + 0.1, 5);
  });
});
