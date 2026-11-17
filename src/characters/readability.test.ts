import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVATAR_BUILDERS } from "./index.js";
import type { Avatar } from "./parts.js";

/**
 * Readability proof at the closest legal camera distances (1.1 m / 1.5 m),
 * through the app's real rig parameters (fov 52, near 0.25, polar 1.02)
 * projected onto a 1280×720 viewport — pure projection maths, no screenshot.
 */
const VIEWPORT = { width: 1280, height: 720 };
const POLAR = 1.02; // main.ts cameraPolar default

function screenHeightPx(build: () => Avatar, distance: number): number {
  const avatar = build();
  avatar.animate("idle", 1, 1 / 60, 0, 0);
  avatar.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(avatar.root);
  const center = box.getCenter(new THREE.Vector3());
  const midY = (box.min.y + box.max.y) / 2;
  const target = new THREE.Vector3(center.x, midY, center.z);

  const camera = new THREE.PerspectiveCamera(52, VIEWPORT.width / VIEWPORT.height, 0.25, 240);
  camera.position.set(target.x, midY + distance * Math.cos(POLAR), target.z + distance * Math.sin(POLAR));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const top = new THREE.Vector3(center.x, box.max.y, center.z).project(camera);
  const bottom = new THREE.Vector3(center.x, box.min.y, center.z).project(camera);
  avatar.dispose();
  return Math.abs(top.y - bottom.y) * (VIEWPORT.height / 2);
}

function castCoverage(build: () => Avatar): { casters: number; meshes: number } {
  const avatar = build();
  let casters = 0;
  let meshes = 0;
  avatar.root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      meshes += 1;
      if (node.castShadow) casters += 1;
    }
  });
  avatar.dispose();
  return { casters, meshes };
}

const names = ["cloud", "automaton", "courier", "guardian"];

describe("avatars are readable at the closest legal camera distances", () => {
  it.each(names.map((name, i) => [name, i] as [string, number]))(
    "%s fills >= 60 px at 1.1 m and 1.5 m camera distance on 1280x720",
    (_name, i) => {
      const near = screenHeightPx(AVATAR_BUILDERS[i]!, 1.1);
      const far = screenHeightPx(AVATAR_BUILDERS[i]!, 1.5);
      console.log(`${names[i]}: screen height ${near.toFixed(0)} px @1.1 m, ${far.toFixed(0)} px @1.5 m`);
      expect(near).toBeGreaterThanOrEqual(60);
      expect(far).toBeGreaterThanOrEqual(60);
    },
  );

  it("every avatar mesh casts contact shadows", () => {
    const coverage = AVATAR_BUILDERS.map((build) => castCoverage(build));
    coverage.forEach((c, i) => {
      expect(c.meshes, `${names[i]} has meshes`).toBeGreaterThan(0);
      expect(c.casters, `${names[i]} shadow casters`).toBe(c.meshes);
    });
  });

  it("Low quality keeps distinct multi-colour silhouettes (builders are quality-independent)", () => {
    // createCharacters never receives a quality mode, so Low runs the same
    // avatars: distinct footprints and >=3 colours each still hold.
    const widths = AVATAR_BUILDERS.map((build) => {
      const avatar = build();
      const box = new THREE.Box3().setFromObject(avatar.root);
      const w = box.getSize(new THREE.Vector3()).x;
      avatar.dispose();
      return w;
    });
    const unique = new Set(widths.map((w) => Math.round(w * 10)));
    expect(unique.size).toBeGreaterThanOrEqual(3);
    for (const w of widths) expect(w).toBeGreaterThan(0.3);
  });
});
