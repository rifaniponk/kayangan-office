import * as THREE from "three";
import type { Collider } from "../core/contracts.js";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";
import { buildChairs, instance } from "./desks.js";

/**
 * Glass meeting room x∈[-14,-4], z∈[-10,-2]: table, four chairs, mobile
 * display board at the agreed anchor (-8,-6). Walls/railings live in
 * architecture.ts.
 */
export interface MeetingZone {
  group: THREE.Group;
  colliders: Collider[];
  /** 0 = idle, 1 = team chart, 2 = launch plan (deterministic cycle). */
  setDisplay(state: 0 | 1 | 2): void;
}

export function buildMeeting(kit: MaterialKit, geo: GeoCache): MeetingZone {
  const group = new THREE.Group();
  group.name = "meeting-room";
  const colliders: Collider[] = [];

  // Conference table centred in the room.
  const tableX = -9;
  const tableZ = -6;
  const top = new THREE.Mesh(geo.box(2.4, 0.07, 1.3), kit.wood);
  top.position.set(tableX, 0.76, tableZ);
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  const pedestal = new THREE.Mesh(geo.box(1.2, 0.66, 0.5), kit.bronzeDark);
  pedestal.position.set(tableX, 0.38, tableZ);
  pedestal.castShadow = true;
  group.add(pedestal);
  colliders.push({ x: tableX, z: tableZ, width: 2.4, depth: 1.3 });

  // Four chairs at the long ends of the table, facing the tabletop, leaving
  // walkable corridors on every side (audit-verified).
  const chairSpots: Array<[number, number]> = [
    [tableX - 1.3, tableZ + 1.8], // NW
    [tableX + 1.3, tableZ + 1.8], // NE
    [tableX - 1.3, tableZ - 1.8], // SW
    [tableX + 1.3, tableZ - 1.8], // SE
  ];
  const chairs = buildChairs(
    kit,
    geo,
    chairSpots.map(([x, z]) => [x, z, Math.atan2(tableX - x, tableZ - z)]),
    false, // decorative chairs keep the room walkable
  );
  group.add(chairs.group);
  colliders.push(...chairs.colliders);

  // Mobile display board on casters, front of the room (anchor (-8,-6)).
  const boardX = -8;
  const boardZ = -7.4;
  const stand = new THREE.Mesh(geo.box(0.08, 1.5, 0.08), kit.bronzeDark);
  stand.position.set(boardX, 0.75, boardZ);
  group.add(stand);
  const base = new THREE.Mesh(geo.cyl(0.3, 0.34, 0.06, 16), kit.bronzeDark);
  base.position.set(boardX, 0.05, boardZ);
  group.add(base);
  const board = new THREE.Mesh(geo.box(1.5, 0.95, 0.05), kit.screenBoard);
  board.position.set(boardX, 1.35, boardZ);
  board.castShadow = true;
  group.add(board);
  colliders.push({ x: boardX, z: boardZ, width: 1.3, depth: 0.5 });

  // Two deterministic display states: bars (chart) and slanted bars (plan).
  const chartGeo = geo.box(0.22, 0.5, 0.04);
  const chart = new THREE.Group();
  const chartMat = kit.teal;
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(chartGeo, chartMat);
    bar.position.set(boardX - 0.45 + i * 0.45, 1.12 + i * 0.12, boardZ + 0.05);
    chart.add(bar);
  }
  chart.visible = false;
  group.add(chart);
  const plan = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(geo.box(0.5, 0.08, 0.04), kit.bronze);
    bar.position.set(boardX - 0.4 + i * 0.42, 1.18 + i * 0.16, boardZ + 0.05);
    bar.rotation.z = -0.28;
    plan.add(bar);
  }
  plan.visible = false;
  group.add(plan);

  const setDisplay = (state: 0 | 1 | 2): void => {
    chart.visible = state === 1;
    plan.visible = state === 2;
    kit.screenBoard.color.set(state === 0 ? 0x22303a : 0x31424d);
    kit.screenBoard.emissive.set(state === 0 ? 0x000000 : 0x1d4a55);
    kit.screenBoard.emissiveIntensity = state === 0 ? 0 : 0.5;
  };

  return { group, colliders, setDisplay };
}
