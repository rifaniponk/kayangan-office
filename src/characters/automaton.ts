import type { CharacterState } from "../core/contracts.js";
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { disposeTree, glow, mesh, pivot, sphere, standard, type Avatar, gestureArc } from "./parts.js";

const P = PALETTE.automaton;

/**
 * Automaton: warm-bronze office bot (~1.3 m). Round torso with glowing
 * face display, antenna with pulsing tip, visibly jointed arms and legs.
 * Idle = servo ticks + glow pulse; move = stepped mechanical gait;
 * interact = forward bow with face brightening.
 */
export function buildAutomaton(): Avatar {
  const root = new THREE.Group();
  root.name = "character-automaton";

  const shellMat = standard(P.shell, { metalness: 0.55, roughness: 0.45 });
  const shellDarkMat = standard(P.shellDark, { metalness: 0.5, roughness: 0.5 });
  const jointMat = standard(P.joint, { metalness: 0.6, roughness: 0.4 });
  const outlineMat = standard(P.outline, { metalness: 0.3, roughness: 0.6 });
  const faceMat = glow(P.faceGlow, 1.5);
  const tipMat = glow(P.antennaTip, 1.2);

  const torso = new THREE.Group();
  torso.position.y = 0.86;
  root.add(torso);

  const bodyMesh = mesh(torso, sphere(0.36, 24, 16), shellMat, 0, 0, 0, true);
  bodyMesh.scale.set(1, 0.92, 0.9);
  const hip = mesh(torso, new THREE.CylinderGeometry(0.2, 0.22, 0.14, 16), shellDarkMat, 0, -0.34, 0, true);
  const face = pivot(torso, 0, 0.02, 0.32);
  const facePlate = mesh(face, new THREE.CircleGeometry(0.24, 24), outlineMat, 0, 0, 0, true);
  mesh(face, new THREE.CircleGeometry(0.2, 24), faceMat, 0, 0, 0.012);
  mesh(face, sphere(0.05, 10, 6), outlineMat, -0.09, 0.05, 0.02);
  mesh(face, sphere(0.05, 10, 6), outlineMat, 0.09, 0.05, 0.02);

  const antenna = pivot(torso, 0, 0.33, -0.05);
  mesh(antenna, new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), jointMat, 0, 0.11, 0);
  const tip = mesh(antenna, sphere(0.05, 12, 8), tipMat, 0, 0.24, 0);

  const armL = pivot(torso, -0.42, 0.02, 0);
  const armR = pivot(torso, 0.42, 0.02, 0);
  for (const arm of [armL, armR]) {
    mesh(arm, sphere(0.1, 12, 8), jointMat, 0, 0, 0);
    mesh(arm, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), jointMat, 0, -0.14, 0);
    const elbow = pivot(arm, 0, -0.26, 0);
    mesh(elbow, sphere(0.07, 10, 8), jointMat, 0, 0, 0);
    mesh(elbow, new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), jointMat, 0, -0.11, 0);
    mesh(elbow, sphere(0.08, 12, 8), shellDarkMat, 0, -0.22, 0);
  }

  const hips = new THREE.Group();
  hips.position.y = 0.52;
  root.add(hips);
  mesh(hips, new THREE.CylinderGeometry(0.16, 0.18, 0.1, 14), jointMat, 0, 0.04, 0);
  const legL = pivot(hips, -0.16, 0, 0);
  const legR = pivot(hips, 0.16, 0, 0);
  for (const leg of [legL, legR]) {
    mesh(leg, new THREE.CylinderGeometry(0.07, 0.07, 0.24, 10), jointMat, 0, -0.13, 0);
    const knee = pivot(leg, 0, -0.26, 0);
    mesh(knee, sphere(0.08, 10, 8), jointMat, 0, 0, 0);
    mesh(knee, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), jointMat, 0, -0.11, 0);
    mesh(knee, new THREE.BoxGeometry(0.22, 0.08, 0.3), shellDarkMat, 0, -0.22, 0.06);
  }

  let servoTick = 0;
  let tickTarget = 0;

  return {
    id: "automaton",
    height: 1.3,
    root,
    animate(state: CharacterState, clock: number, dt: number, speedRatio: number, gesture: number): void {
      // Servo pauses: head snaps to a new tick angle every ~1.6 s when idle.
      if (state === "idle") {
        servoTick += dt;
        if (servoTick > 1.6) {
          servoTick = 0;
          tickTarget = (Math.sin(clock * 1.7) > 0 ? 0.35 : -0.35);
        }
        face.rotation.y += (tickTarget - face.rotation.y) * Math.min(1, dt * 14);
        faceMat.emissiveIntensity = 1.3 + Math.sin(clock * 2.2) * 0.4;
      } else {
        servoTick = 0;
        face.rotation.y += (0 - face.rotation.y) * Math.min(1, dt * 10);
        faceMat.emissiveIntensity = 1.5 + Math.sin(clock * 8) * 0.3 + gestureArc(gesture) * 1.6;
      }
      tipMat.emissiveIntensity = 1.2 + Math.sin(clock * 3.1) * 0.5;

      // Servo "salute": arms snap up, head tilts, antenna tips forward —
      // distinct from cloud's reach-up, courier's wing-spread, guardian's rustle.
      // Direct pose assignment while the gesture holds; idle damping resumes
      // the moment gesture hits 0, so the pose is fully idle by 1.1 s.
      const bow = gestureArc(gesture);
      antenna.rotation.z = Math.sin(clock * 2.6) * 0.14 + bow * 0.35;

      const cadence = clock * (3.4 + 2.2 * speedRatio);
      if (state === "move") {
        const swing = Math.sin(cadence) * 0.55 * (0.4 + 0.6 * speedRatio);
        legL.rotation.x = swing;
        legR.rotation.x = -swing;
        armL.rotation.x = -swing * 0.7;
        armR.rotation.x = swing * 0.7;
        torso.position.y = 0.86 + Math.abs(Math.sin(cadence)) * 0.035;
        torso.rotation.y = Math.sin(cadence * 0.5) * 0.06;
      } else {
        legL.rotation.x += (0 - legL.rotation.x) * Math.min(1, dt * 8);
        legR.rotation.x += (0 - legR.rotation.x) * Math.min(1, dt * 8);
        armL.rotation.x += (0 - armL.rotation.x) * Math.min(1, dt * 8);
        armR.rotation.x += (0 - armR.rotation.x) * Math.min(1, dt * 8);
        torso.position.y = 0.86 + Math.sin(clock * 1.3) * 0.03;
        torso.rotation.y = Math.sin(clock * 0.6) * 0.05;
        if (bow > 0) {
          armL.rotation.x = -bow * 0.9; // gesture overrides idle damping
          armR.rotation.x = bow * 0.9;
          face.rotation.y = bow * 0.5;
        }
      }
      torso.rotation.x = bow * 0.35 + (state === "move" ? 0.08 * speedRatio : 0);
      torso.scale.set(1 + bow * 0.06, 1 - bow * 0.05, 1);
      bodyMesh.position.z = bow * 0.05;
    },
    dispose(): void {
      disposeTree(root);
    },
  };
}
