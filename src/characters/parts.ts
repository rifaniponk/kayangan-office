import type { CharacterState } from "../core/contracts.js";
import * as THREE from "three";

/** A procedural avatar: hierarchy, animation hook, and disposal. */
export interface Avatar {
  readonly id: string;
  readonly height: number;
  readonly root: THREE.Group;
  /**
   * Advance the avatar's animation.
   * `clock` is monotonic seconds; `speedRatio` is current speed / max speed;
   * `gesture` is interact-progress 0→1 (0 when not interacting).
   */
  animate(state: CharacterState, clock: number, deltaSeconds: number, speedRatio: number, gesture: number): void;
  dispose(): void;
}

export function mesh(parent: THREE.Group, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function pivot(parent: THREE.Group, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function standard(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...extra });
}

export function glow(color: number, intensity = 1.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.2 });
}

export function sphere(r: number, ws = 22, hs = 14): THREE.SphereGeometry {
  return new THREE.SphereGeometry(r, ws, hs);
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const material = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((mat) => mat.dispose());
    else if (material) material.dispose();
  });
}

export type AvatarBuilder = (id: string) => Avatar;
export type GestureCurve = (gesture: number) => number;

/** 0→1→0 arc for a one-shot interaction gesture. */
export const gestureArc: GestureCurve = (g) => Math.sin(Math.min(1, Math.max(0, g)) * Math.PI);
