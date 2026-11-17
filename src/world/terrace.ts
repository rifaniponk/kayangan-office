import * as THREE from "three";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";
import { instance } from "./desks.js";
import { seededRandom } from "./palette.js";

/**
 * Terrace x∈[4,14], z∈[-10,-2]: round table, two wood chairs, three planter
 * boxes with foliage. Deck/railings come from architecture.ts. Anchor
 * terrace-lookout at (9,-8).
 */
export interface TerraceZone {
  group: THREE.Group;
  colliders: Collider[];
  setQuality(low: boolean): void;
}

export function buildTerrace(kit: MaterialKit, geo: GeoCache): TerraceZone {
  const group = new THREE.Group();
  group.name = "terrace";
  const colliders: Collider[] = [];

  // Round table.
  const top = new THREE.Mesh(geo.cyl(0.62, 0.62, 0.06, 24), kit.wood);
  top.position.set(9, 0.76, -8);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  const pole = new THREE.Mesh(geo.cyl(0.12, 0.18, 0.72, 10), kit.bronzeDark);
  pole.position.set(9, 0.39, -8);
  pole.castShadow = true;
  group.add(pole);
  const foot = new THREE.Mesh(geo.cyl(0.42, 0.5, 0.05, 18), kit.bronzeDark);
  foot.position.set(9, 0.05, -8);
  group.add(foot);
  colliders.push({ x: 9, z: -8, width: 1.3, depth: 1.3 });

  // Two slatted wood chairs facing the table.
  const seatGeo = geo.box(0.46, 0.07, 0.46);
  const backGeo = geo.box(0.46, 0.52, 0.06);
  const legGeo = geo.cyl(0.04, 0.04, 0.44, 6);
  const spots: Array<[number, number, number]> = [
    [6.2, -7.2, Math.PI / 2], // west chair, faces +x
    [10.9, -8.6, -Math.PI / 2], // east chair, faces -x
  ];
  const seats: Array<[number, number, number, number]> = [];
  const backs: Array<[number, number, number, number]> = [];
  const legs: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of spots) {
    const fx = Math.sin(r);
    const fz = Math.cos(r);
    seats.push([x, 0.46, z, r]);
    backs.push([x - fx * 0.22, 0.72, z - fz * 0.22, r]);
    legs.push(
      [x + fx * 0.2, 0.23, z + fz * 0.2, r],
      [x - fx * 0.2, 0.23, z - fz * 0.2, r],
      [x + fx * 0.2, 0.23, z - fz * 0.2, r + Math.PI / 2],
      [x - fx * 0.2, 0.23, z - fz * 0.2, r + Math.PI / 2],
    );
    colliders.push({ x, z, width: 0.75, depth: 0.75 });
  }
  group.add(instance(seatGeo, kit.wood, seats, true));
  group.add(instance(backGeo, kit.woodDark, backs, true));
  group.add(instance(legGeo, kit.bronzeDark, legs));

  // Planters with foliage (instanced, density by quality).
  const planterSpots: Array<[number, number]> = [[6.4, -9.2], [12.6, -9.2], [12.6, -2.9]];
  group.add(
    instance(geo.box(0.85, 0.5, 0.85), kit.concrete, planterSpots.map(([x, z]) => [x, 0.25, z, 0]), true),
  );
  group.add(
    instance(geo.box(0.75, 0.06, 0.75), kit.soil, planterSpots.map(([x, z]) => [x, 0.52, z, 0])),
  );
  const rand = seededRandom(0x2f7c51);
  const foliage: Array<[number, number, number, number]> = [];
  for (const [x, z] of planterSpots) {
    for (let i = 0; i < 4; i++) {
      foliage.push([x + (rand() - 0.5) * 0.5, 0.7 + rand() * 0.28, z + (rand() - 0.5) * 0.5, rand() * Math.PI]);
    }
  }
  const leaves = instance(geo.sphere(0.22, 8, 6), kit.moss, foliage, true);
  group.add(leaves);
  for (const [x, z] of planterSpots) colliders.push({ x, z, width: 0.95, depth: 0.95 });

  return {
    group,
    colliders,
    setQuality(low: boolean) {
      leaves.count = low ? 6 : foliage.length;
    },
  };
}
