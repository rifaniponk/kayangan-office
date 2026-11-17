import * as THREE from "three";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";
import { instance } from "./desks.js";

/**
 * Lounge x∈[4,14], z∈[2,10]: sofa with cushions, coffee table, bookcase,
 * floor lamp, rug. Anchor lounge-sofa at (9,6).
 */
export interface LoungeZone {
  group: THREE.Group;
  colliders: Collider[];
  /** 0 = idle, 1 = seated (cushions compress). */
  setSit(seated: boolean): void;
  setQuality(low: boolean): void;
}

export function buildLounge(kit: MaterialKit, geo: GeoCache): LoungeZone {
  const group = new THREE.Group();
  group.name = "lounge";
  const colliders: Collider[] = [];

  // Rug under the seating area (flat, no collider).
  const rug = new THREE.Mesh(geo.box(3.4, 0.03, 2.6), kit.tealDeep);
  rug.position.set(9.4, 0.016, 6.4);
  rug.receiveShadow = true;
  group.add(rug);

  // Sofa facing -z toward the room centre.
  const sofa = new THREE.Group();
  sofa.position.set(9.4, 0, 8.4);
  sofa.rotation.y = Math.PI;
  const base = new THREE.Mesh(geo.box(2.2, 0.42, 0.95), kit.tealDeep);
  base.position.y = 0.21;
  base.castShadow = true;
  sofa.add(base);
  const back = new THREE.Mesh(geo.box(2.2, 0.6, 0.2), kit.teal);
  back.position.set(0, 0.72, -0.38);
  back.castShadow = true;
  sofa.add(back);
  const armGeo = geo.box(0.22, 0.5, 0.95);
  const armL = new THREE.Mesh(armGeo, kit.tealDeep);
  armL.position.set(-1.1, 0.45, 0);
  armL.castShadow = true;
  sofa.add(armL);
  const armR = armL.clone();
  armR.position.x = 1.1;
  sofa.add(armR);
  const cushionGeo = geo.box(0.62, 0.16, 0.72);
  const cushions = instance(cushionGeo, kit.teal, [
    [-0.68, 0.5, 0.05, 0],
    [0, 0.5, 0.05, 0],
    [0.68, 0.5, 0.05, 0],
  ], true);
  sofa.add(cushions);
  group.add(sofa);
  colliders.push({ x: 9.4, z: 8.4, width: 2.6, depth: 1.25 });

  // Coffee table with cup + book detail.
  const table = new THREE.Group();
  table.position.set(9.4, 0, 6.3);
  const tTop = new THREE.Mesh(geo.box(1.2, 0.05, 0.7), kit.wood);
  tTop.position.y = 0.44;
  tTop.castShadow = true;
  table.add(tTop);
  table.add(
    instance(geo.box(0.06, 0.42, 0.06), kit.bronze, [
      [-0.5, 0.22, -0.28, 0],
      [0.5, 0.22, -0.28, 0],
      [-0.5, 0.22, 0.28, 0],
      [0.5, 0.22, 0.28, 0],
    ]),
  );
  const cup = new THREE.Mesh(geo.cyl(0.06, 0.05, 0.13, 8), kit.stone);
  cup.position.set(-0.3, 0.53, 0.1);
  cup.castShadow = true;
  table.add(cup);
  const book = new THREE.Mesh(geo.box(0.24, 0.05, 0.17), kit.woodDark);
  book.position.set(0.32, 0.49, -0.08);
  book.rotation.y = 0.5;
  table.add(book);
  group.add(table);
  colliders.push({ x: 9.4, z: 6.3, width: 1.35, depth: 0.85 });

  // Bookcase against the right edge.
  const shelf = new THREE.Group();
  shelf.position.set(13.1, 0, 4.6);
  shelf.rotation.y = -Math.PI / 2;
  const frame = new THREE.Mesh(geo.box(1.1, 1.8, 0.42), kit.woodDark);
  frame.position.y = 0.9;
  frame.castShadow = true;
  shelf.add(frame);
  shelf.add(
    instance(geo.box(1.0, 0.04, 0.34), kit.wood, [
      [0, 0.45, 0.03, 0],
      [0, 0.95, 0.03, 0],
      [0, 1.45, 0.03, 0],
    ]),
  );
  const shelfBooks: Array<[number, number, number, number]> = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5; i++) {
      shelfBooks.push([-0.4 + i * 0.18, 0.5 + row * 0.5, 0.03, 0]);
    }
  }
  const booksMesh = instance(geo.box(0.12, 0.3, 0.22), kit.teal, shelfBooks, true);
  shelf.add(booksMesh);
  group.add(shelf);
  colliders.push({ x: 13.1, z: 4.6, width: 0.62, depth: 1.3 });

  // Floor lamp.
  const lamp = new THREE.Group();
  lamp.position.set(12.4, 0, 8.8);
  const pole = new THREE.Mesh(geo.cyl(0.03, 0.03, 1.4, 6), kit.bronze);
  pole.position.y = 0.7;
  lamp.add(pole);
  const shade = new THREE.Mesh(geo.cyl(0.16, 0.24, 0.22, 8), kit.stone);
  shade.position.y = 1.45;
  shade.castShadow = true;
  lamp.add(shade);
  group.add(lamp);
  colliders.push({ x: 12.4, z: 8.8, width: 0.5, depth: 0.5 });

  return {
    group,
    colliders,
    setSit(seated: boolean) {
      cushions.scale.set(1, seated ? 0.72 : 1, 1);
      base.scale.set(1, seated ? 0.92 : 1, 1);
    },
    setQuality(low: boolean) {
      booksMesh.count = low ? 8 : shelfBooks.length;
      cushions.count = low ? 2 : 3;
    },
  };
}
