import * as THREE from "three";
import type { MaterialKit } from "./materials.js";
import { GeoCache } from "./materials.js";
import { PALETTE, seededRandom } from "./palette.js";

/**
 * Floating island: level walkable deck (36×24 m at y=0), visible concrete rim,
 * rock underside extending ~4–6 m below the deck, plus hanging rock roots.
 */
export function buildIsland(kit: MaterialKit, geo: GeoCache): THREE.Group {
  const group = new THREE.Group();
  group.name = "island";

  // Level office floor: slab top face exactly at y = 0.
  const deck = new THREE.Mesh(geo.box(36, 0.5, 24), kit.stone);
  deck.position.y = -0.25;
  deck.receiveShadow = true;
  deck.name = "deck";
  group.add(deck);

  // Concrete rim slightly wider than the deck so the edge reads as a boundary.
  const rim = new THREE.Mesh(geo.box(37.8, 0.42, 25.8), kit.concrete);
  rim.position.y = -0.71;
  rim.castShadow = true;
  rim.receiveShadow = true;
  rim.name = "rim";
  group.add(rim);

  // Main rock underside: tapered mass below the deck, jittered silhouette.
  const underside = new THREE.CylinderGeometry(17.2, 6.5, 5.4, 26, 3);
  const rand = seededRandom(0x4b1f2e);
  const pos = underside.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.6) {
      const s = 1 + (rand() - 0.5) * 0.2;
      pos.setXYZ(i, x * s, pos.getY(i) + (rand() - 0.5) * 0.5, z * s);
    }
  }
  underside.computeVertexNormals();
  const undersideMesh = new THREE.Mesh(underside, kit.rock);
  undersideMesh.position.y = -3.66; // top ≈ -0.96 just under the rim, tip ≈ -6.36
  undersideMesh.castShadow = true;
  undersideMesh.name = "rock-underside";
  group.add(undersideMesh);

  // Hanging rock roots below the deck for silhouette depth.
  const rootGeo = geo.cyl(0.15, 3.1, 4.6, 10); // narrow tip downward after rotation
  const roots: Array<[number, number, number, number]> = [
    [-8.5, -7.6, 4.5, 0.3],
    [7.5, -7.2, -6.0, 1.1],
    [0.5, -7.9, -10.0, 2.2],
  ];
  for (const [x, y, z, rot] of roots) {
    const root = new THREE.Mesh(rootGeo, kit.rock);
    root.position.set(x, y, z);
    root.rotation.set(Math.PI, rot, 0); // point the narrow tip down
    root.castShadow = true;
    group.add(root);
  }

  // Central bulge under the deck so the underside reads as one rock mass.
  const bulge = new THREE.Mesh(geo.sphere(3, 12, 8), kit.rock);
  bulge.scale.set(2.4, 1.6, 2.2);
  bulge.position.y = -6.2;
  group.add(bulge);

  return group;
}

/** Deterministic palette guard used by tests/QA: palette must stay warm-neutral. */
export const ISLAND_COLORS = {
  deck: PALETTE.deckStone,
  rim: PALETTE.concreteEdge,
  rock: PALETTE.rock,
};
