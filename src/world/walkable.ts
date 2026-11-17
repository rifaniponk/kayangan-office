import type { Collider, Interactable } from "../core/contracts.js";

/**
 * Pure walkability audit over the world's own data (Agent A). Used by QA
 * tests: no prop blocks the central aisle, doorways stay ≥1.8 m clear, and
 * every spawn reaches every interaction anchor over walkable floor.
 */
export interface WalkabilityReport {
  aisleClear: boolean;
  doorways: Array<{ id: string; gapMeters: number }>;
  reachable: Array<{ spawnIndex: number; anchorId: string; ok: boolean }>;
}

const DECK = { halfX: 18, halfZ: 12 };
const RADIUS = 0.55;
const CELL = 0.4;
const AISLE_HALF = 2.5;

function blocked(x: number, z: number, colliders: Collider[]): boolean {
  if (Math.abs(x) > DECK.halfX - RADIUS || Math.abs(z) > DECK.halfZ - RADIUS) return true;
  return colliders.some((c) => {
    const cx = Math.max(c.x - c.width / 2, Math.min(c.x + c.width / 2, x));
    const cz = Math.max(c.z - c.depth / 2, Math.min(c.z + c.depth / 2, z));
    return (x - cx) ** 2 + (z - cz) ** 2 < RADIUS * RADIUS;
  });
}

/** Gap between the nearest collider edges on both sides of a doorway point. */
function gapAlongX(z: number, x: number, colliders: Collider[], leftFallback: number): number {
  let left = leftFallback;
  let right = Infinity;
  for (const c of colliders) {
    if (Math.abs(c.z - z) > c.depth / 2 + RADIUS) continue;
    if (c.x + c.width / 2 <= x) left = Math.max(left, c.x + c.width / 2);
    if (c.x - c.width / 2 >= x) right = Math.min(right, c.x - c.width / 2);
  }
  return right - left;
}

function bfsCells(spawn: { x: number; z: number }, colliders: Collider[]): {
  seen: Set<number>;
  cols: number;
  cellXY: (cx: number, cz: number) => { x: number; z: number };
} {
  const cols = Math.ceil((DECK.halfX * 2) / CELL);
  const rows = Math.ceil((DECK.halfZ * 2) / CELL);
  const idx = (cx: number, cz: number) => cz * cols + cx;
  const cellXY = (cx: number, cz: number) => ({
    x: cx * CELL - DECK.halfX + CELL / 2,
    z: cz * CELL - DECK.halfZ + CELL / 2,
  });

  const start = { cx: Math.round((spawn.x + DECK.halfX) / CELL), cz: Math.round((spawn.z + DECK.halfZ) / CELL) };
  const seen = new Set<number>([idx(start.cx, start.cz)]);
  const queue = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dz] of dirs) {
      const nx = cur.cx + dx;
      const nz = cur.cz + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const i = idx(nx, nz);
      if (seen.has(i)) continue;
      const { x, z } = cellXY(nx, nz);
      if (blocked(x, z, colliders)) continue;
      seen.add(i);
      queue.push({ cx: nx, cz: nz });
    }
  }
  return { seen, cols, cellXY };
}

/** Debug/QA helper: reachable walkable cells within `radius` of a point. */
export function reachableCellsNear(
  spawn: { x: number; z: number },
  colliders: Collider[],
  point: { x: number; z: number },
  radius: number,
): Array<{ x: number; z: number }> {
  const { seen, cols, cellXY } = bfsCells(spawn, colliders);
  const out: Array<{ x: number; z: number }> = [];
  for (const i of seen) {
    const { x, z } = cellXY(i % cols, Math.floor(i / cols));
    if (Math.hypot(x - point.x, z - point.z) <= radius) out.push({ x, z });
  }
  return out;
}

function reachableFrom(
  spawn: { x: number; z: number },
  colliders: Collider[],
  anchors: Interactable[],
): Array<{ anchorId: string; ok: boolean }> {
  const { seen, cols, cellXY } = bfsCells(spawn, colliders);
  return anchors.map((a) => {
    // Anchor may sit on a prop; any walkable cell inside its radius counts.
    const ok = seen.size > 0 && [...seen].some((i) => {
      const { x, z } = cellXY(i % cols, Math.floor(i / cols));
      return Math.hypot(x - a.x, z - a.z) <= a.radius + 0.05;
    });
    return { anchorId: a.id, ok };
  });
}

export function auditWalkability(
  colliders: Collider[],
  spawns: Array<{ x: number; z: number }>,
  anchors: Interactable[],
): WalkabilityReport {
  const aisleClear = !colliders.some(
    (c) =>
      Math.abs(c.x) - c.width / 2 < AISLE_HALF + RADIUS &&
      Math.abs(c.z) - c.depth / 2 < DECK.halfZ - RADIUS,
  );

  const doorways = [
    { id: "meeting-door", x: -6, z: -2, leftFallback: -7.0 }, // glass walls bound it
    { id: "terrace-opening", x: 4.9, z: -2.15, leftFallback: 4.0 }, // terrace deck edge
  ].map((d) => ({ id: d.id, gapMeters: gapAlongX(d.z, d.x, colliders, d.leftFallback) }));

  const reachable: WalkabilityReport["reachable"] = [];
  spawns.forEach((s, spawnIndex) => {
    for (const r of reachableFrom(s, colliders, anchors)) {
      reachable.push({ spawnIndex, anchorId: r.anchorId, ok: r.ok });
    }
  });

  return { aisleClear, doorways, reachable };
}
