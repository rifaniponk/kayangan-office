import * as THREE from "three";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";

/** Shared transform helper for instanced repeated props. */
export function instance(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  transforms: Array<[number, number, number, number]>, // x, y, z, rotY
  castShadow = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  const m = new THREE.Matrix4();
  transforms.forEach(([x, y, z, rotY], i) => {
    m.makeRotationY(rotY);
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Office chair: seat, back, arms, pedestal, wheels (3 instanced wheels).
 * `solid` adds a collider; room chairs inside the meeting pod are decorative
 * so the room stays walkable (audit-checked). */
export function buildChairs(
  kit: MaterialKit,
  geo: GeoCache,
  spots: Array<[number, number, number]>, // x, z, rotY
  solid = true,
): { group: THREE.Group; colliders: Collider[] } {
  const group = new THREE.Group();
  group.name = "chairs";
  const seatGeo = geo.box(0.48, 0.09, 0.48);
  const backGeo = geo.box(0.48, 0.55, 0.08);
  const armGeo = geo.box(0.07, 0.34, 0.44);
  const poleGeo = geo.cyl(0.05, 0.05, 0.42, 10);
  const baseGeo = geo.cyl(0.28, 0.3, 0.05, 12);
  const wheelGeo = geo.cyl(0.06, 0.06, 0.05, 10);

  const rot = spots.map(([x, z, r]) => [x, z, r] as [number, number, number]);

  group.add(instance(seatGeo, kit.teal, rot.map(([x, z, r]) => [x, 0.48, z, r]), true));
  group.add(
    instance(
      backGeo,
      kit.tealDeep,
      rot.map(([x, z, r]) => {
        const bx = x - Math.sin(r) * 0.22;
        const bz = z - Math.cos(r) * 0.22;
        return [bx, 0.78, bz, r];
      }),
      true,
    ),
  );
  const arms: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of rot) {
    const sx = Math.cos(r) * 0.27;
    const sz = -Math.sin(r) * 0.27;
    arms.push([x + sx, 0.62, z + sz, r], [x - sx, 0.62, z - sz, r]);
  }
  group.add(instance(armGeo, kit.bronzeDark, arms, true));
  group.add(instance(poleGeo, kit.bronze, rot.map(([x, z, r]) => [x, 0.26, z, r])));
  group.add(instance(baseGeo, kit.bronzeDark, rot.map(([x, z, r]) => [x, 0.05, z, r])));

  const wheels: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of rot) {
    for (let i = 0; i < 3; i++) {
      const a = r + (i * Math.PI * 2) / 3;
      wheels.push([x + Math.cos(a) * 0.26, 0.06, z + Math.sin(a) * 0.26, a]);
    }
  }
  group.add(instance(wheelGeo, kit.bronzeDark, wheels));

  const colliders: Collider[] = solid
    ? rot.map(([x, z]): Collider => ({ x, z, width: 0.7, depth: 0.7 }))
    : [];
  return { group, colliders };
}

/**
 * Shared desk pods: two rows facing each other, x∈[-14,-4], z∈[2,10].
 * Details: slab top, bronze frame legs, drawers, monitor, keyboard, lamp,
 * cup + books. Monitors/lamps are individual meshes so the monitor
 * interaction can toggle just the pod's screen.
 */
export interface DeskZone {
  group: THREE.Group;
  colliders: Collider[];
  /** Toggles every pod screen (shared emissive swap, cheap). */
  setMonitors(on: boolean): void;
  /** Low quality drops instanced accessory density. */
  setQuality(low: boolean): void;
}

export function buildDesks(kit: MaterialKit, geo: GeoCache): DeskZone {
  const group = new THREE.Group();
  group.name = "desk-zone";
  const colliders: Collider[] = [];

  const centers: Array<[number, number, number]> = [
    [-11.5, 3.6, Math.PI], // row A faces -z (toward the pods centre)
    [-8, 3.6, Math.PI],
    [-11.5, 7.4, 0], // row B faces +z
    [-8, 7.4, 0],
  ];

  const slabGeo = geo.box(1.8, 0.06, 0.9);
  const legGeo = geo.box(0.08, 0.72, 0.86);
  const drawerGeo = geo.box(0.6, 0.52, 0.82);

  const slabT: Array<[number, number, number, number]> = [];
  const legT: Array<[number, number, number, number]> = [];
  const drawerT: Array<[number, number, number, number]> = [];
  const kbT: Array<[number, number, number, number]> = [];
  const cupT: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of centers) {
    // (ux, uz) points from the desk toward the seated user (chair faces -that).
    const ux = -Math.sin(r);
    const uz = -Math.cos(r);
    slabT.push([x, 0.75, z, r + Math.PI]); // slab "front" faces the user
    legT.push([x + ux * 0.82, 0.38, z + uz * 0.42, r], [x - ux * 0.82, 0.38, z - uz * 0.42, r]);
    drawerT.push([x + ux * 0.55, 0.46, z + uz * 0.3, r]); // drawer bank on user side, touching slab
    kbT.push([x + ux * 0.28, 0.8, z + uz * 0.14, r]); // keyboard near the user
    cupT.push([x - ux * 0.6, 0.82, z - uz * 0.3, r]); // cup on far edge
    colliders.push({ x, z, width: Math.abs(ux) * 0.9 + Math.abs(uz) * 1.8 + 0.2, depth: Math.abs(ux) * 1.8 + Math.abs(uz) * 0.9 + 0.2 });
  }
  group.add(instance(slabGeo, kit.stone, slabT, true));
  group.add(instance(legGeo, kit.bronze, legT, true));
  group.add(instance(drawerGeo, kit.woodDark, drawerT, true));
  group.add(instance(geo.box(0.45, 0.035, 0.18), kit.concrete, kbT));
  group.add(instance(geo.cyl(0.055, 0.05, 0.12, 14), kit.teal, cupT));

  // Books: instanced but density-controlled by quality mode.
  const bookGeo = geo.box(0.22, 0.05, 0.16);
  const bookT: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of centers) {
    const ux = -Math.sin(r);
    const uz = -Math.cos(r);
    for (let i = 0; i < 2; i++) {
      bookT.push([x - ux * (0.45 + i * 0.02), 0.81 + i * 0.055, z - uz * (0.34 - i * 0.06), r + Math.PI + 0.25 * i]);
    }
  }
  const books = instance(bookGeo, kit.wood, bookT);
  group.add(books);

  // Monitors: individual screens so the interaction can toggle them.
  const screenGeo = geo.box(0.58, 0.36, 0.04);
  const bezelGeo = geo.box(0.66, 0.44, 0.03);
  const standGeo = geo.cyl(0.03, 0.09, 0.2, 10);
  const bezelT: Array<[number, number, number, number]> = [];
  const screens: THREE.Mesh[] = [];
  for (const [x, z, r] of centers) {
    const ux = -Math.sin(r);
    const uz = -Math.cos(r);
    bezelT.push([x - ux * 0.6, 1.12, z - uz * 0.33, r + Math.PI]);
    const stand = new THREE.Mesh(standGeo, kit.bronzeDark);
    stand.position.set(x - ux * 0.5, 0.88, z - uz * 0.26);
    stand.rotation.y = r + Math.PI;
    stand.castShadow = true;
    group.add(stand);
    const screen = new THREE.Mesh(screenGeo, kit.screen);
    screen.position.set(x - ux * 0.55, 1.12, z - uz * 0.28);
    screen.rotation.y = r + Math.PI; // screen front faces the seated user
    screen.castShadow = true;
    screens.push(screen);
    group.add(screen);
  }
  group.add(instance(bezelGeo, kit.bronze, bezelT, true));

  // Desk lamps: bronze arm + warm shade, on the far corner.
  const armGeo = geo.cyl(0.02, 0.02, 0.42, 8);
  const shadeGeo = geo.cyl(0.06, 0.14, 0.12, 12);
  const bulbT: Array<[number, number, number, number]> = [];
  for (const [x, z, r] of centers) {
    const ux = -Math.sin(r);
    const uz = -Math.cos(r);
    const lx = x - ux * 0.72;
    const lz = z - uz * 0.38;
    const arm = new THREE.Mesh(armGeo, kit.bronze);
    arm.position.set(lx, 0.98, lz);
    arm.rotation.z = 0.35;
    group.add(arm);
    const shade = new THREE.Mesh(shadeGeo, kit.bronze);
    shade.position.set(lx - 0.12, 1.18, lz);
    shade.castShadow = true;
    group.add(shade);
    bulbT.push([lx - 0.12, 1.11, lz, 0]);
  }
  group.add(instance(geo.sphere(0.07, 8, 6), kit.glow, bulbT));

  // Chairs sit between the facing rows.
  const chairSpots: Array<[number, number, number]> = [
    [-11.5, 4.7, Math.PI],
    [-8, 4.7, Math.PI],
    [-11.5, 6.3, 0],
    [-8, 6.3, 0],
  ];
  const chairs = buildChairs(kit, geo, chairSpots);
  group.add(chairs.group);
  colliders.push(...chairs.colliders);

  return {
    group,
    colliders,
    setMonitors(on: boolean) {
      kit.screen.color.set(on ? 0x66d2c2 : 0x22303a);
      kit.screen.emissive.set(on ? 0x2f8a7c : 0x000000);
      kit.screen.emissiveIntensity = on ? 0.85 : 0;
      screens.forEach((s) => (s.visible = true));
    },
    setQuality(low: boolean) {
      books.count = low ? 4 : bookT.length;
    },
  };
}
