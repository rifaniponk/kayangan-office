import * as THREE from "three";
import type { Collider } from "../core/contracts.js";

/**
 * Static collision layout for the agreed plan (36×24 deck at y=0).
 * Island rim colliders keep characters (radius 0.55 m) on the deck.
 */
export function deckRimColliders(): Collider[] {
  return [
    { x: 0, z: 12.5, width: 38, depth: 1 }, // front edge (+z)
    { x: 0, z: -12.5, width: 38, depth: 1 }, // back edge (-z)
    { x: 18.5, z: 0, width: 1, depth: 25 }, // right edge
    { x: -18.5, z: 0, width: 1, depth: 25 }, // left edge
  ];
}

/** Spawn order = Cloud, Automaton, Courier, Guardian (agreed layout). */
export function spawnPoints(): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  return [
    new THREE.Vector3(-3, 0, 6),
    new THREE.Vector3(-6, 0, -1.5),
    new THREE.Vector3(3.5, 0, 6),
    new THREE.Vector3(3, 0, -1.5),
  ];
}

/** True if a point is at least `clearance` away from every spawn point. */
export function clearOfSpawns(x: number, z: number, clearance = 0.75): boolean {
  return spawnPoints().every((p) => Math.hypot(p.x - x, p.z - z) >= clearance);
}
