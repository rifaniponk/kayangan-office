import type { CharacterState } from "../core/contracts.js";
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { disposeTree, mesh, pivot, sphere, standard, type Avatar, gestureArc } from "./parts.js";

const P = PALETTE.courier;

/**
 * Courier: teal sky bird (~1.25 m). Ellipsoid body, swept crest, beak,
 * folded wing-arms, yellow feet, side satchel with strap.
 * Idle = gentle sway + wing flutter; move = quick birdlike hops with wing flap;
 * interact = wings spread open with a bow.
 */
export function buildCourier(): Avatar {
  const root = new THREE.Group();
  root.name = "character-courier";

  const bodyMat = standard(P.body, { roughness: 0.65, metalness: 0.05 });
  const bodyDarkMat = standard(P.bodyDark, { roughness: 0.7, metalness: 0.05 });
  const crestMat = standard(P.crest, { roughness: 0.55, metalness: 0.08 });
  const outlineMat = standard(P.outline, { roughness: 0.5 });
  const feetMat = standard(P.feet, { roughness: 0.6 });
  const satchelMat = standard(P.satchel, { roughness: 0.8 });
  const beakMat = standard(P.beak, { roughness: 0.5, metalness: 0.1 });

  const body = new THREE.Group();
  body.position.y = 0.6;
  root.add(body);

  const torso = mesh(body, sphere(0.34, 24, 16), bodyMat, 0, 0, 0, true);
  torso.scale.set(0.9, 1.15, 1.05);
  const tail = mesh(body, sphere(0.24, 18, 12), bodyDarkMat, 0, 0.02, -0.22, true).scale.set(0.8, 1, 0.7); // tail
  const head = pivot(body, 0, 0.42, 0.14);
  mesh(head, sphere(0.22, 20, 14), bodyMat, 0, 0, 0);
  const crest = mesh(head, new THREE.ConeGeometry(0.12, 0.34, 10), crestMat, 0, 0.14, -0.08);
  crest.rotation.x = -Math.PI / 2.4; // swept back
  const beak = mesh(head, new THREE.ConeGeometry(0.08, 0.2, 8), beakMat, 0, -0.02, 0.26);
  beak.rotation.x = Math.PI / 2;
  mesh(head, sphere(0.045, 10, 6), outlineMat, -0.12, 0.06, 0.19);
  mesh(head, sphere(0.045, 10, 6), outlineMat, 0.12, 0.06, 0.19);

  const wingL = pivot(body, -0.32, 0.06, 0);
  const wingR = pivot(body, 0.32, 0.06, 0);
  for (const wing of [wingL, wingR]) {
    const feather = mesh(wing, sphere(0.26, 16, 10), bodyDarkMat, 0, 0, 0, true);
    feather.scale.set(0.35, 0.14, 0.62);
    feather.rotation.x = -0.25;
  }

  const legL = pivot(root, -0.12, 0.3, 0.04);
  const legR = pivot(root, 0.12, 0.3, 0.04);
  for (const leg of [legL, legR]) {
    mesh(leg, new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8), feetMat, 0, -0.12, 0);
    mesh(leg, new THREE.BoxGeometry(0.14, 0.05, 0.22), feetMat, 0, -0.25, 0.05);
  }

  const satchel = pivot(body, 0.3, -0.12, 0.08);
  mesh(satchel, new THREE.BoxGeometry(0.24, 0.2, 0.12), satchelMat, 0.06, 0, 0);
  const strap = mesh(body, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), satchelMat, 0.24, 0.14, 0.06);
  strap.rotation.z = 1.15;

  return {
    id: "courier",
    height: 1.24,
    root,
    animate(state: CharacterState, clock: number, dt: number, speedRatio: number, gesture: number): void {
      const hop = state === "move" ? Math.max(0, Math.sin(clock * (7 + 3 * speedRatio))) * 0.16 : 0;
      body.position.y = 0.6 + hop + Math.sin(clock * 2) * 0.02;
      const flap = state === "move" ? Math.sin(clock * (8 + 3 * speedRatio)) * 0.5 : Math.sin(clock * 2.2) * 0.07;
      const spread = gestureArc(gesture) * 0.9;
      wingL.rotation.z = -flap - spread - 0.1;
      wingR.rotation.z = flap + spread + 0.1;
      wingL.position.y = 0.06 + flap * 0.06;
      wingR.position.y = 0.06 - flap * 0.06;
      const step = clock * (9 + 4 * speedRatio);
      legL.position.y = 0.3 - (state === "move" ? Math.max(0, Math.sin(step)) * 0.08 : 0);
      legR.position.y = 0.3 - (state === "move" ? Math.max(0, Math.sin(step + Math.PI)) * 0.08 : 0);
      head.rotation.x = gestureArc(gesture) * 0.4 + Math.sin(clock * 1.3) * 0.04;
      head.rotation.y = Math.sin(clock * 0.9) * 0.12;
      body.rotation.z = Math.sin(clock * (state === "move" ? 8 : 2)) * 0.05;
      torso.scale.set(0.9, 1.15, 1.05 + gestureArc(gesture) * 0.08);
    },
    dispose(): void {
      disposeTree(root);
    },
  };
}
