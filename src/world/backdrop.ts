import * as THREE from "three";
import type { MaterialKit } from "./materials.js";

/**
 * Backdrop: the 22 KB cloud-horizon WebP as a distant plane (camera looks
 * from +z toward -z, so the plane sits at -z) plus a few broad translucent
 * cloud depth layers. The "lookout" interaction lifts the cloud layers.
 */
export interface Backdrop {
  group: THREE.Group;
  setSkyView(on: boolean): void;
  setQuality(low: boolean): void;
  dispose(): void;
}

export function buildBackdrop(kit: MaterialKit): Backdrop {
  const group = new THREE.Group();
  group.name = "backdrop";

  // Sky plane + texture are browser-only; headless tests still get cloud layers.
  let map: THREE.Texture | null = null;
  let skyMat: THREE.MeshBasicMaterial | null = null;
  let sky: THREE.Mesh | null = null;
  if (typeof document !== "undefined") {
    const loader = new THREE.TextureLoader();
    map = loader.load("/assets/world/cloud-horizon.webp");
    map.colorSpace = THREE.SRGBColorSpace;
    skyMat = new THREE.MeshBasicMaterial({ map, toneMapped: false, color: 0xe2e6ea, fog: false }); // fog:false keeps the horizon art out of the fog wash
    sky = new THREE.Mesh(new THREE.PlaneGeometry(320, 86), skyMat);
    sky.position.set(0, 22, -120); // horizon + upper sky band; adds dark-sky contrast
    group.add(sky);
  }

  // One translucent cloud band for depth: a single quad keeps llvmpipe fill
  // cost down (three overlapping translucent quads measured ~47% of frame).
  const layers: THREE.Mesh[] = [];
  const layerDefs: Array<[number, number, number, number, number]> = [
    // [x, y, z, width, height]
    [0, -4, -60, 120, 12],
  ];
  const cloudMats: THREE.MeshBasicMaterial[] = [];
  for (const [x, y, z, w, h] of layerDefs) {
    const mat = kit.cloud.clone();
    mat.fog = false; // haze stays out of the fog wash
    cloudMats.push(mat);
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    layer.position.set(x, y, z);
    layer.receiveShadow = false;
    layers.push(layer);
    group.add(layer);
  }

  const setSkyView = (on: boolean): void => {
    for (const m of cloudMats) m.opacity = on ? 0.28 : 0.17;
    layers.forEach((l, i) => {
      l.position.y = layerDefs[i]![1] + (on ? 2.5 : 0);
    });
  };

  const setQuality = (low: boolean): void => {
    layers.forEach((l, i) => (l.visible = !low || i === 0));
  };

  return {
    group,
    setSkyView,
    setQuality,
    dispose() {
      map?.dispose();
      skyMat?.dispose();
      sky?.geometry.dispose();
      for (const l of layers) l.geometry.dispose();
      for (const m of cloudMats) m.dispose();
    },
  };
}
