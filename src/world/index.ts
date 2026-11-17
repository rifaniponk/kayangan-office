import * as THREE from "three";
import type {
  Interactable,
  QualityMode,
  World,
  WorldInteraction,
  WorldResult,
} from "../core/contracts.js";
import { buildIsland } from "./island.js";
import { buildLighting } from "./lighting.js";
import { createMaterialKit, GeoCache } from "./materials.js";
import { deckRimColliders, spawnPoints } from "./collision.js";

/**
 * Kayangan Office world (Agent A). Implements the shared `World` contract.
 * This slice: island shell, rock underside, level deck, rim, lighting,
 * rim colliders, and spawn points. Zones land in the next slices.
 */
export function createWorld(): World {
  const group = new THREE.Group();
  group.name = "world";

  const kit = createMaterialKit();
  const geo = new GeoCache();

  group.add(buildIsland(kit, geo));
  const lighting = buildLighting(group);
  group.add(lighting.group);

  const interactables: Interactable[] = [];

  const result: WorldResult = {
    group,
    colliders: deckRimColliders(),
    interactables,
    spawnPoints: spawnPoints(),
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
        }
      });
      geo.dispose();
      kit.dispose();
      group.clear();
    },
  };

  const applyQuality = (mode: QualityMode): void => {
    const low = mode === "low";
    lighting.setQuality(mode);
    kit.stone.flatShading = low;
    kit.stone.needsUpdate = true;
    kit.wood.flatShading = low;
    kit.wood.needsUpdate = true;
  };
  applyQuality("high");

  return {
    result,
    interact(_id: string): WorldInteraction | null {
      // Zone interactions land with the zone slices; contract allows null.
      return null;
    },
    setQuality: applyQuality,
  };
}
