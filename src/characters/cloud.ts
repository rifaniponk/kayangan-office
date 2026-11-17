import type { CharacterState } from "../core/contracts.js";
import * as THREE from "three";
import { PALETTE } from "./palette.js";
import { disposeTree, glow, mesh, pivot, sphere, standard, type Avatar, gestureArc } from "./parts.js";

const P = PALETTE.cloud;

/**
 * Cloud: sky-blue puff creature (~1.1 m). Puffy multi-sphere body, curled
 * cloud tuft, dark eyes, tiny hands, two feet. Floats above the deck;
 * idle = slow bob + squish, move = faster bob with lean, interact = hop + curl spin.
 */
export function buildCloud(): Avatar {
  const root = new THREE.Group();
  root.name = "character-cloud";

  const puff = standard(P.body, { roughness: 0.9, metalness: 0 });
  const puffLight = standard(P.bodyLight, { roughness: 0.9, metalness: 0 });
  const puffShade = standard(P.bodyShade, { roughness: 0.9, metalness: 0 });
  const curlMat = standard(P.curl, { roughness: 0.9, metalness: 0 });
  const eyeMat = standard(P.eye, { roughness: 0.5 });
  const footMat = standard(P.feet, { roughness: 0.8, metalness: 0 });
  const handMat = glow(P.curl, 0.35);

  const body = new THREE.Group();
  body.position.y = 0.56; // hovers: feet clear of the deck
  root.add(body);

  const core = mesh(body, sphere(0.58, 24, 16), puff, 0, 0, 0, true);
  core.scale.set(1.05, 0.82, 0.95);
  const puffBig = mesh(body, sphere(0.38, 18, 12), puffLight, -0.34, 0.26, 0.05, true);
  mesh(body, sphere(0.26, 16, 12), puffLight, 0.34, 0.18, -0.02);
  mesh(body, sphere(0.18, 16, 12), puff, 0.05, 0.34, 0.12);
  mesh(body, sphere(0.22, 14, 10), puffShade, -0.13, -0.3, 0.16);
  mesh(body, sphere(0.22, 14, 10), puffShade, 0.2, -0.32, 0.12);

  const curl = new THREE.Group();
  curl.position.set(0.24, 0.42, 0.16);
  body.add(curl);
  const curlMesh = mesh(curl, new THREE.TorusGeometry(0.26, 0.09, 10, 16), curlMat, 0, 0, 0, true);
  curlMesh.rotation.x = Math.PI / 2;
  mesh(curl, sphere(0.09, 12, 8), curlMat, 0.12, 0.05, 0.05);

  mesh(body, sphere(0.075, 12, 8), eyeMat, -0.14, 0.12, 0.38);
  mesh(body, sphere(0.075, 12, 8), eyeMat, 0.14, 0.12, 0.38);

  const handL = pivot(body, -0.48, -0.02, 0.14);
  const handR = pivot(body, 0.5, -0.02, 0.14);
  mesh(handL, sphere(0.11, 12, 8), handMat, 0, 0, 0);
  mesh(handR, sphere(0.11, 12, 8), handMat, 0, 0, 0);

  const footL = pivot(body, -0.2, -0.42, 0.1);
  const footR = pivot(body, 0.2, -0.42, 0.1);
  const footLMesh = mesh(footL, sphere(0.12, 12, 8), footMat, 0, 0, 0);
  const footRMesh = mesh(footR, sphere(0.12, 12, 8), footMat, 0, 0, 0);
  footLMesh.scale.set(1.1, 0.7, 1.2);
  footRMesh.scale.set(1.1, 0.7, 1.2);

  let curlSpin = 0;

  return {
    id: "cloud",
    height: 1.14,
    root,
    animate(state: CharacterState, clock: number, dt: number, speedRatio: number, gesture: number): void {
      const float = state === "move" ? Math.sin(clock * 5.2) * 0.07 : Math.sin(clock * 1.6) * 0.05;
      const squish = 1 + Math.sin(clock * (state === "move" ? 5 : 1.9)) * 0.04;
      body.position.y = 0.56 + float + gestureArc(gesture) * 0.22;
      core.scale.set(1.05 * squish, 0.82 / squish, 0.95);
      body.rotation.x = state === "move" ? 0.16 * speedRatio : Math.sin(clock * 1.1) * 0.03;
      body.rotation.z = state === "move" ? Math.sin(clock * 5.2) * 0.05 : Math.sin(clock * 0.7) * 0.04;
      curlSpin += dt * (state === "interact" ? 4.5 : state === "move" ? 1.6 : 0.6);
      curl.rotation.z = curlSpin;
      footL.position.y = -0.42 + Math.sin(clock * (state === "move" ? 7 : 2)) * 0.04;
      footR.position.y = -0.42 + Math.sin(clock * (state === "move" ? 7 : 2) + 1.7) * 0.04;
      handL.position.y = -0.02 + Math.sin(clock * 2.4) * 0.04 + gestureArc(gesture) * 0.12;
      handR.position.y = -0.02 + Math.sin(clock * 2.4 + 2) * 0.04 + gestureArc(gesture) * 0.12;
      curl.scale.setScalar(1 + gestureArc(gesture) * 0.25);
    },
    dispose(): void {
      disposeTree(root);
    },
  };
}
