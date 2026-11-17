import * as THREE from "three";
import type { QualityMode } from "./contracts.js";

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  setQuality(mode: QualityMode): void;
  /** Re-measure the canvas after CSS or window changes. */
  resize(): void;
  dispose(): void;
};

const DPR: Record<QualityMode, number> = { high: 1.5, low: 1.0 };

export function createStage(canvas: HTMLCanvasElement, mode: QualityMode = "high"): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: mode === "high",
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = mode === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0e1620);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe8f2, 42, 140);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.25, 240);

  let dpr = DPR[mode];

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function setQuality(next: QualityMode): void {
    dpr = DPR[next];
    renderer.antialias = next === "high";
    renderer.shadowMap.enabled = next === "high";
    resize();
  }

  function dispose(): void {
    renderer.dispose();
    scene.fog = null;
    scene.clear();
  }

  resize();

  return { renderer, scene, camera, setQuality, resize, dispose };
}

/** Bounds used by the camera rig so it stays above the deck and readable. */
export const CAMERA_BOUNDS = {
  minDistance: 5,
  maxDistance: 26,
  minPolar: 0.34,
  maxPolar: 1.32,
  minHeight: 1.4,
};
