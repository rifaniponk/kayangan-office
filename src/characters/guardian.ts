import type { CharacterState } from "../core/contracts.js";
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { disposeTree, mesh, pivot, sphere, standard, type Avatar, gestureArc } from "./parts.js";

const P = PALETTE.guardian;

/**
 * Guardian: moss-and-stone guardian (~1.5 m). Rounded stone body segments,
 * mossy head cap, small leaves, thick sturdy limbs.
 * Idle = slow sway + leaf rustle; move = heavy alternating stomps;
 * interact = deep crouch-and-rise.
 */
export function buildGuardian(): Avatar {
  const root = new THREE.Group();
  root.name = "character-guardian";
  root.scale.setScalar(0.8); // measured silhouette 1.83 m -> ~1.46 m per 1.1-1.5 m contract

  const stoneMat = standard(P.stone, { roughness: 0.95, metalness: 0.02 });
  const stoneLightMat = standard(P.stoneLight, { roughness: 0.95, metalness: 0.02 });
  const stoneDarkMat = standard(P.stoneDark, { roughness: 0.9, metalness: 0.02 });
  const mossMat = standard(P.moss, { roughness: 1, metalness: 0 });
  const leafMat = standard(P.leaf, { roughness: 0.8, metalness: 0.02 });
  const eyeMat = standard(P.eye, { roughness: 0.5 });

  const body = new THREE.Group();
  root.add(body);

  const lower = mesh(body, sphere(0.48, 24, 16), stoneMat, 0, 0.42, 0);
  lower.scale.set(1.1, 0.85, 0.95);
  const chest = mesh(body, sphere(0.4, 22, 14), stoneLightMat, 0, 0.92, 0);
  chest.scale.set(1.05, 0.85, 0.9);
  const head = pivot(body, 0, 1.32, 0.02);
  const headMesh = mesh(head, sphere(0.3, 22, 14), stoneMat, 0, 0, 0);
  headMesh.scale.set(1, 0.88, 0.95);
  const mossCap = mesh(head, sphere(0.32, 22, 12), mossMat, 0, 0.12, 0.02);
  mossCap.scale.set(0.95, 0.5, 0.95);
  mesh(head, sphere(0.055, 10, 6), eyeMat, -0.12, 0.02, 0.26);
  mesh(head, sphere(0.055, 10, 6), eyeMat, 0.12, 0.02, 0.26);
  const leaves: THREE.Mesh[] = [];
  const leafSpots: { x: number; y: number; z: number; tilt: number }[] = [
    { x: -0.22, y: 0.2, z: 0.1, tilt: 0.5 },
    { x: 0.2, y: 0.24, z: -0.06, tilt: -0.6 },
    { x: 0.02, y: 0.32, z: -0.16, tilt: 0.2 },
  ];
  for (const spot of leafSpots) {
    const leaf = mesh(head, new THREE.ConeGeometry(0.08, 0.22, 8), leafMat, spot.x, spot.y, spot.z);
    leaf.rotation.set(spot.tilt, spot.tilt * 0.6, spot.tilt);
    leaves.push(leaf);
  }

  const armL = pivot(body, -0.5, 0.98, 0);
  const armR = pivot(body, 0.5, 0.98, 0);
  for (const arm of [armL, armR]) {
    mesh(arm, sphere(0.14, 12, 8), stoneDarkMat, 0, 0, 0);
    mesh(arm, new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10), stoneMat, 0, -0.22, 0);
    mesh(arm, sphere(0.15, 12, 8), stoneDarkMat, 0, -0.42, 0);
  }

  const legL = pivot(root, -0.22, 0.3, 0.02);
  const legR = pivot(root, 0.22, 0.3, 0.02);
  const footMeshes: THREE.Mesh[] = [];
  for (const leg of [legL, legR]) {
    mesh(leg, new THREE.CylinderGeometry(0.14, 0.14, 0.26, 10), stoneDarkMat, 0, -0.14, 0);
    const foot = mesh(leg, new THREE.BoxGeometry(0.32, 0.14, 0.44), stoneMat, 0, -0.28, 0.08);
    footMeshes.push(foot);
  }
  const sideLeaf = mesh(body, new THREE.ConeGeometry(0.1, 0.26, 8), leafMat, -0.42, 0.62, 0.18);
  sideLeaf.rotation.z = 0.9;
  const sideLeaf2 = mesh(body, new THREE.ConeGeometry(0.1, 0.26, 8), leafMat, 0.44, 0.56, -0.14);
  sideLeaf2.rotation.z = -0.9;

  return {
    id: "guardian",
    height: 1.46,
    root,
    animate(state: CharacterState, clock: number, dt: number, speedRatio: number, gesture: number): void {
      const crouch = gestureArc(gesture);
      body.position.y = -crouch * 0.22 + (state === "move" ? Math.abs(Math.sin(clock * (2.6 + 1.4 * speedRatio))) * 0.05 : 0);
      body.rotation.z = Math.sin(clock * (state === "move" ? 2.6 : 0.8)) * (state === "move" ? 0.06 : 0.03);
      chest.rotation.y = Math.sin(clock * 0.55) * 0.04;
      head.rotation.x = crouch * 0.3 + Math.sin(clock * 0.7) * 0.03;
      head.rotation.y = Math.sin(clock * 0.4) * 0.1;
      for (const leaf of leaves) leaf.rotation.z += Math.sin(clock * 1.4 + leaf.position.x) * 0.02 * dt * 60;
      sideLeaf.rotation.z = 0.9 + Math.sin(clock * 1.2) * 0.07;
      sideLeaf2.rotation.z = -0.9 + Math.sin(clock * 1.2 + 2) * 0.07;
      const cadence = clock * (2.4 + 1.2 * speedRatio);
      if (state === "move") {
        const liftL = Math.max(0, Math.sin(cadence)) * 0.16 * (0.5 + 0.5 * speedRatio);
        const liftR = Math.max(0, Math.sin(cadence + Math.PI)) * 0.16 * (0.5 + 0.5 * speedRatio);
        legL.position.y = 0.3 + liftL;
        legR.position.y = 0.3 + liftR;
        legL.rotation.x = Math.sin(cadence) * 0.35;
        legR.rotation.x = Math.sin(cadence + Math.PI) * 0.35;
        armL.rotation.x = Math.sin(cadence + Math.PI) * 0.3;
        armR.rotation.x = Math.sin(cadence) * 0.3;
      } else {
        legL.position.y = 0.3 - crouch * 0.05;
        legR.position.y = 0.3 - crouch * 0.05;
        legL.rotation.x = 0;
        legR.rotation.x = 0;
        armL.rotation.x = Math.sin(clock * 0.9) * 0.08 + crouch * 0.5;
        armR.rotation.x = Math.sin(clock * 0.9 + 1.5) * 0.08 + crouch * 0.5;
      }
      footMeshes[0]!.scale.x = 1 + (state === "move" ? Math.abs(Math.sin(cadence)) * 0.1 : 0);
      footMeshes[1]!.scale.x = 1 + (state === "move" ? Math.abs(Math.sin(cadence + Math.PI)) * 0.1 : 0);
    },
    dispose(): void {
      disposeTree(root);
    },
  };
}
