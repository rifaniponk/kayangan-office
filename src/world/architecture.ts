import * as THREE from "three";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";

/**
 * Architecture: glass meeting-room partitions with a 2 m door opening,
 * terrace deck, and bronze railings (instanced posts) per the agreed layout.
 */
export interface Architecture {
  group: THREE.Group;
  colliders: Collider[];
}

const RAIL_H = 1.05;

export function buildArchitecture(kit: MaterialKit, geo: GeoCache): Architecture {
  const group = new THREE.Group();
  group.name = "architecture";
  const colliders: Collider[] = [];

  const glassPanel = (len: number): THREE.BufferGeometry => geo.box(len, 3, 0.08);
  const railGeo = (len: number): THREE.BufferGeometry => geo.box(len, 0.07, 0.09);

  // ---- Glass meeting room: x∈[-14,-4], z∈[-10,-2], door gap x∈[-7,-5] at z=-2.
  const walls: Array<[number, number, number, number]> = [
    // [x, z, length, rotY]
    [-10.5, -2, 7, 0], // south wall, west of door gap
    [-4.5, -2, 1, 0], // south wall, east of door gap
    [-9, -10, 10, 0], // back wall
    [-14, -6, 8, Math.PI / 2], // west wall
    [-4, -6, 8, Math.PI / 2], // east wall
  ];
  for (const [x, z, len, rotY] of walls) {
    const wall = new THREE.Group();
    const glass = new THREE.Mesh(glassPanel(len), kit.glass);
    glass.position.y = 1.5;
    wall.add(glass);
    const base = new THREE.Mesh(geo.box(len, 0.14, 0.14), kit.bronze);
    base.position.y = 0.07;
    base.castShadow = true;
    wall.add(base);
    const top = new THREE.Mesh(geo.box(len, 0.1, 0.12), kit.bronze);
    top.position.y = 2.98;
    wall.add(top);
    wall.position.set(x, 0, z);
    wall.rotation.y = rotY;
    group.add(wall);
    if (rotY === 0) colliders.push({ x, z, width: len + 0.3, depth: 0.3 });
    else colliders.push({ x, z, width: 0.3, depth: len + 0.3 });
  }

  // ---- Terrace deck: wood planks x∈[4,14], z∈[-10,-2], raised 3 cm.
  const deckSlab = new THREE.Mesh(geo.box(10, 0.12, 8), kit.wood);
  deckSlab.position.set(9, -0.03, -6);
  deckSlab.receiveShadow = true;
  deckSlab.name = "terrace-deck";
  group.add(deckSlab);

  // ---- Bronze railings: back edge, right edge, inner edge with a 1.8 m gap
  // at x∈[4,5.8] so the terrace stays reachable from the aisle.
  const rails: Array<[number, number, number, number]> = [
    [9, -9.85, 10, 0], // back edge
    [13.85, -6, 8, Math.PI / 2], // right edge
    [9.65, -2.15, 7.7, 0], // inner edge (starts at x=5.8; gap x∈[4,5.8])
  ];
  const postGeo = geo.cyl(0.05, 0.05, RAIL_H, 6);
  let posts = 0;
  for (const [, , len] of rails) posts += Math.floor(len / 1.3) + 1;
  const postMesh = new THREE.InstancedMesh(postGeo, kit.bronze, posts);
  const m = new THREE.Matrix4();
  let p = 0;
  for (const [x, z, len, rotY] of rails) {
    const rail = new THREE.Mesh(railGeo(len), kit.bronze);
    rail.position.set(x, RAIL_H, z);
    rail.rotation.y = rotY;
    rail.castShadow = true;
    group.add(rail);
    const midRail = new THREE.Mesh(railGeo(len), kit.bronzeDark);
    midRail.position.set(x, 0.55, z);
    midRail.rotation.y = rotY;
    group.add(midRail);
    const half = len / 2;
    const step = len / (Math.floor(len / 1.3));
    for (let i = 0; i <= Math.floor(len / 1.3); i++) {
      const t = -half + i * step;
      const px = rotY === 0 ? x + t : x;
      const pz = rotY === 0 ? z : z + t;
      m.makeTranslation(px, RAIL_H / 2, pz);
      postMesh.setMatrixAt(p++, m);
    }
    if (rotY === 0) colliders.push({ x, z, width: len + 0.3, depth: 0.35 });
    else colliders.push({ x, z, width: 0.35, depth: len + 0.3 });
  }
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.castShadow = true;
  postMesh.name = "rail-posts";
  group.add(postMesh);

  return { group, colliders };
}
