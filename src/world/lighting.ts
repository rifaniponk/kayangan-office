import * as THREE from "three";
import type { QualityMode } from "../core/contracts.js";
import { PALETTE } from "./palette.js";

/**
 * Lighting: one warm directional sun (upper-right morning light, matching the
 * cloud-horizon art direction) + one hemisphere fill. Shadows toggle by
 * quality mode; shadow map size is the world-side half of the DPR cap C applies.
 */
export interface Lighting {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  setQuality(mode: QualityMode): void;
}

export function buildLighting(sceneRoot: THREE.Group): Lighting {
  const group = new THREE.Group();
  group.name = "lighting";

  const hemi = new THREE.HemisphereLight(PALETTE.skySoft, PALETTE.groundWarm, 1.15);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(PALETTE.sunWarm, 2.7);
  sun.position.set(16, 26, 14); // upper-right (+x, +z is front), warm morning angle
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  sun.target.position.set(0, 0, 0);
  group.add(sun);
  group.add(sun.target);

  const setQuality = (mode: QualityMode): void => {
    const size = mode === "high" ? 1024 : 512; // shadow rasterisation dominates llvmpipe
    if (sun.shadow.mapSize.width !== size) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      sun.shadow.mapSize.set(size, size);
    }
    // Shadow casters are restricted to tall/large props (userData.casts) so
    // the per-frame shadow pass stays tiny during movement; the rim always
    // casts at any quality. Transparent materials never cast.
    sceneRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.Material;
        obj.castShadow =
          !mat.transparent && (mode === "high" ? obj.userData.casts === true || obj.name === "rim" : obj.name === "rim");
      }
    });
  };

  return { group, sun, setQuality };
}
