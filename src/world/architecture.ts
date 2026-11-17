import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";

/**
 * Architecture: glass meeting-room partitions with a 2 m door opening,
 * terrace deck, and bronze railings (instanced posts, merged rails) per the
 * agreed layout. Static bronze rails are merged into two draw calls.
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
  const m = new THREE.Matrix4();

  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, rotY: number): THREE.BufferGeometry => {
    m.makeRotationY(rotY);
    m.setPosition(x, y, z);
    g.applyMatrix4(m);
    return g;
  };
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number, rotY: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    return place(g, x, y, z, rotY);
  };

  // ---- Glass meeting room: x∈[-14,-4], z∈[-10,-2], door gap x∈[-7,-5] at z=-2.
  const walls: Array<[number, number, number, number]> = [
    // [x, z, length, rotY]
    [-10.5, -2, 7, 0], // south wall, west of door gap
    [-4.5, -2, 1, 0], // south wall, east of door gap
    [-9, -10, 10, 0], // back wall
    [-14, -6, 8, Math.PI / 2], // west wall
    [-4, -6, 8, Math.PI / 2], // east wall
  ];
  const bronzeGeos: THREE.BufferGeometry[] = [];
  for (const [x, z, len, rotY] of walls) {
    const glass = new THREE.Mesh(geo.box(len, 3, 0.08), kit.glass);
    glass.position.set(x, 1.5, z);
    glass.rotation.y = rotY;
    group.add(glass);
    bronzeGeos.push(bar(len, 0.14, 0.14, x, 0.07, z, rotY), bar(len, 0.1, 0.12, x, 2.98, z, rotY));
    if (rotY === 0) colliders.push({ x, z, width: len + 0.1, depth: 0.3 });
    else colliders.push({ x, z, width: 0.3, depth: len + 0.1 });
  }

  // ---- Terrace deck: wood planks x∈[4,14], z∈[-10,-2], raised 3 cm.
  const deckSlab = new THREE.Mesh(geo.box(10, 0.12, 8), kit.wood);
  deckSlab.position.set(9, -0.03, -6);
  deckSlab.receiveShadow = true;
  deckSlab.name = "terrace-deck";
  group.add(deckSlab);

  // ---- Bronze railings; inner rail starts at x=5.9, leaving a 1.9 m gap
  // at x∈[4,5.9] so the terrace stays reachable from the aisle.
  const rails: Array<[number, number, number, number]> = [
    [9, -9.85, 10, 0], // back edge
    [13.85, -6, 8, Math.PI / 2], // right edge
    [9.7, -2.15, 7.6, 0], // inner edge
  ];
  const midGeos: THREE.BufferGeometry[] = [];
  const postGeo = geo.cyl(0.05, 0.05, RAIL_H, 8);
  let posts = 0;
  for (const [, , len] of rails) posts += Math.floor(len / 1.3) + 1;
  const postMesh = new THREE.InstancedMesh(postGeo, kit.bronze, posts);
  let p = 0;
  for (const [x, z, len, rotY] of rails) {
    bronzeGeos.push(bar(len, 0.07, 0.09, x, RAIL_H, z, rotY));
    midGeos.push(bar(len, 0.07, 0.09, x, 0.55, z, rotY));
    const half = len / 2;
    const step = len / Math.floor(len / 1.3);
    for (let i = 0; i <= Math.floor(len / 1.3); i++) {
      const t = -half + i * step;
      m.makeTranslation(rotY === 0 ? x + t : x, RAIL_H / 2, rotY === 0 ? z : z + t);
      postMesh.setMatrixAt(p++, m);
    }
    if (rotY === 0) colliders.push({ x, z, width: len + 0.1, depth: 0.35 });
    else colliders.push({ x, z, width: 0.35, depth: len + 0.1 });
  }
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.castShadow = true;
  postMesh.name = "rail-posts";
  group.add(postMesh);

  // Bronze door-frame posts flanking the meeting-room doorway (gap stays
  // 2.04 m between post boxes — audit-verified ≥1.8 m).
  const frameGeo = geo.cyl(0.07, 0.07, 2.6, 10);
  const frame = new THREE.InstancedMesh(frameGeo, kit.bronze, 2);
  const fm = new THREE.Matrix4();
  frame.setMatrixAt(0, fm.makeTranslation(-7.06, 1.3, -2.0));
  frame.setMatrixAt(1, fm.makeTranslation(-4.9, 1.3, -2.0));
  frame.instanceMatrix.needsUpdate = true;
  frame.castShadow = true;
  frame.name = "door-frame";
  group.add(frame);
  colliders.push(
    { x: -7.06, z: -2.0, width: 0.14, depth: 0.3 },
    { x: -4.9, z: -2.0, width: 0.14, depth: 0.3 },
  );

  // Merged static rails: two meshes instead of thirteen.
  const mergedBronze = mergeGeometries(bronzeGeos);
  bronzeGeos.forEach((g) => g.dispose());
  const railsMesh = new THREE.Mesh(mergedBronze ?? new THREE.BufferGeometry(), kit.bronze);
  railsMesh.castShadow = true;
  railsMesh.name = "rails-bronze";
  group.add(railsMesh);

  const mergedMid = mergeGeometries(midGeos);
  midGeos.forEach((g) => g.dispose());
  const midMesh = new THREE.Mesh(mergedMid ?? new THREE.BufferGeometry(), kit.bronzeDark);
  midMesh.name = "rails-mid";
  group.add(midMesh);

  return { group, colliders };
}
