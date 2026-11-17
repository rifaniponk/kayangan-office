/**
 * Pure XZ navigation math for Agent B. No Three.js imports so the logic is
 * unit-testable under Node directly. Axis-aligned collider boxes plus a
 * circle radius per character; movement resolves axis-by-axis for sliding.
 */

export type Box = { x: number; z: number; width: number; depth: number };
export type Vec2 = { x: number; z: number };
export type DeckBounds = { halfX: number; halfZ: number; inset: number };

/** Contract-agreed character collision radius (meters). */
export const CHARACTER_RADIUS = 0.55;

/** True when the character circle at (px, pz) overlaps any collider box. */
export function overlapsAny(px: number, pz: number, boxes: readonly Box[], radius: number): boolean {
  for (const box of boxes) {
    const halfX = box.width / 2;
    const halfZ = box.depth / 2;
    const cx = Math.max(box.x - halfX, Math.min(box.x + halfX, px));
    const cz = Math.max(box.z - halfZ, Math.min(box.z + halfZ, pz));
    const dx = px - cx;
    const dz = pz - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/** Keep the character on the deck; inset accounts for the collision radius. */
export function clampToDeck(px: number, pz: number, bounds: DeckBounds): Vec2 {
  const limX = bounds.halfX - bounds.inset;
  const limZ = bounds.halfZ - bounds.inset;
  return {
    x: Math.max(-limX, Math.min(limX, px)),
    z: Math.max(-limZ, Math.min(limZ, pz)),
  };
}

export function outsideDeck(px: number, pz: number, bounds: DeckBounds): boolean {
  return Math.abs(px) > bounds.halfX - bounds.inset + 0.001 || Math.abs(pz) > bounds.halfZ - bounds.inset + 0.001;
}

/**
 * Safety net: if a character somehow ends up off the walkable surface
 * (world rebuilt with new rim colliders, debug teleport, etc.), snap it
 * back to its spawn point so the run stays playable.
 */
export function ensureOnDeck(px: number, pz: number, bounds: DeckBounds, spawn: Vec2): Vec2 {
  if (outsideDeck(px, pz, bounds)) return { x: spawn.x, z: spawn.z };
  return { x: px, z: pz };
}

/**
 * Move by (dx, dz) with slide resolution: try both axes, then each axis
 * alone, then stay put. Result is always deck-clamped. Displacement is
 * frame-rate independent because callers scale dx/dz by deltaSeconds.
 */
export function slideMove(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  boxes: readonly Box[],
  radius: number,
  bounds: DeckBounds,
): Vec2 {
  // Sweep check: a step is accepted only when the midpoint AND endpoint are
  // free, so a thin prop (door post blocked band 1.24 m) can never be
  // tunnelled through in one frame even at the largest dt.
  const pathClear = (nx: number, nz: number): boolean =>
    !overlapsAny((px + nx) / 2, (pz + nz) / 2, boxes, radius) &&
    !overlapsAny(nx, nz, boxes, radius);

  const clamped = clampToDeck(px + dx, pz + dz, bounds);
  if (pathClear(clamped.x, clamped.z)) return clamped;

  const slideX = clampToDeck(px + dx, pz, bounds);
  if (pathClear(slideX.x, slideX.z)) return slideX;

  const slideZ = clampToDeck(px, pz + dz, bounds);
  if (pathClear(slideZ.x, slideZ.z)) return slideZ;

  return clampToDeck(px, pz, bounds);
}

/**
 * Nudge a spawn/switch point out of props. Searches a ring at
 * radius+0.35 m; falls back to a wider ring so a spawn is never inside a prop.
 */
export function resolveSafeSpawn(px: number, pz: number, boxes: readonly Box[], radius: number, bounds: DeckBounds): Vec2 {
  let point = clampToDeck(px, pz, bounds);
  if (!overlapsAny(point.x, point.z, boxes, radius)) return point;
  const ring = radius + 0.35;
  for (const ringRadius of [ring, ring * 2, ring * 3]) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const candidate = clampToDeck(px + Math.cos(angle) * ringRadius, pz + Math.sin(angle) * ringRadius, bounds);
      if (!overlapsAny(candidate.x, candidate.z, boxes, radius)) return candidate;
    }
  }
  return point;
}

/** Nearest interactable whose radius circle contains the character. */
export function nearestInteractable<T extends { x: number; z: number; radius: number }>(
  px: number,
  pz: number,
  items: readonly T[],
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    const dx = px - item.x;
    const dz = pz - item.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= item.radius && dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Rotate a screen-space input axis into world XZ for a camera orbiting the
 * character at `cameraYaw` (three.js convention: camera sits at
 * target + (sin yaw, h, cos yaw)·distance, so screen-forward is (-sin,-cos)).
 * Input axis: x = screen right, z = screen forward-negative (W sets z = -1).
 */
export function cameraRelativeAxis(axis: Vec2, cameraYaw: number): Vec2 {
  const len = Math.hypot(axis.x, axis.z);
  if (len === 0) return { x: 0, z: 0 };
  const scale = len > 1 ? 1 / len : 1;
  const ax = axis.x * scale;
  const az = axis.z * scale;
  const c = Math.cos(cameraYaw);
  const s = Math.sin(cameraYaw);
  return { x: ax * c + az * s, z: -ax * s + az * c };
}

/** Shortest-arc angle interpolation, frame-rate independent. Output wraps to (-π, π]. */
export function lerpAngle(from: number, to: number, alpha: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const result = from + diff * Math.min(1, Math.max(0, alpha));
  return ((result + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
