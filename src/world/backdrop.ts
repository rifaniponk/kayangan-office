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
    skyMat = new THREE.MeshBasicMaterial({ map, toneMapped: false, color: 0xe3e3e7 });
    sky = new THREE.Mesh(new THREE.PlaneGeometry(300, 150), skyMat);
    sky.position.set(0, 34, -120); // faces +z toward the camera
    group.add(sky);
  }

  // Broad translucent cloud layers for depth (no volumetric simulation).
  const layers: THREE.Mesh[] = [];
  const layerDefs: Array<[number, number, number, number, number]> = [
    // [x, y, z, width, height]
    [0, -6.5, -46, 130, 16],
    [-30, -2.5, -72, 150, 20],
    [34, 2.5, -92, 170, 22],
  ];
  for (const [x, y, z, w, h] of layerDefs) {
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(w, h), kit.cloud);
    layer.position.set(x, y, z);
    layer.receiveShadow = false;
    layers.push(layer);
    group.add(layer);
  }

  const setSkyView = (on: boolean): void => {
    kit.cloud.opacity = on ? 0.3 : 0.16;
    layers.forEach((l, i) => {
      l.position.y = layerDefs[i]![1] + (on ? 2.5 + i : 0);
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
    },
  };
}
