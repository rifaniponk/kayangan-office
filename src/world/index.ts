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
import { buildArchitecture } from "./architecture.js";
import { buildDesks } from "./desks.js";
import { buildMeeting } from "./meeting.js";
import { buildLounge } from "./lounge.js";
import { buildTerrace } from "./terrace.js";
import { buildBackdrop } from "./backdrop.js";

/**
 * Kayangan Office world (Agent A). Implements the shared `World` contract:
 * geometry, colliders, interactables, spawn points, deterministic per-zone
 * interactions, and quality modes.
 */
export function createWorld(): World {
  const group = new THREE.Group();
  group.name = "world";

  const kit = createMaterialKit();
  const geo = new GeoCache();

  group.add(buildIsland(kit, geo));
  const architecture = buildArchitecture(kit, geo);
  group.add(architecture.group);
  const desks = buildDesks(kit, geo);
  group.add(desks.group);
  const meeting = buildMeeting(kit, geo);
  group.add(meeting.group);
  const lounge = buildLounge(kit, geo);
  group.add(lounge.group);
  const terrace = buildTerrace(kit, geo);
  group.add(terrace.group);
  const backdrop = buildBackdrop(kit);
  group.add(backdrop.group);
  const lighting = buildLighting(group);
  group.add(lighting.group);

  const colliders = [
    ...deckRimColliders(),
    ...architecture.colliders,
    ...desks.colliders,
    ...meeting.colliders,
    ...lounge.colliders,
    ...terrace.colliders,
  ];

  // Deterministic local-only zone state.
  const state = {
    monitors: false,
    display: 0 as 0 | 1 | 2,
    seated: false,
    skyView: false,
  };

  function interact(id: string): WorldInteraction | null {
    switch (id) {
      case "desk-monitor": {
        state.monitors = !state.monitors;
        desks.setMonitors(state.monitors);
        return {
          zone: "desk",
          label: "Shared desk monitor",
          detail: state.monitors
            ? "Monitor on — dashboard shows the Kayangan launch roadmap."
            : "Monitor asleep — the pod screens dim.",
        };
      }
      case "meeting-screen": {
        state.display = ((state.display + 1) % 3) as 0 | 1 | 2;
        meeting.setDisplay(state.display);
        const detail =
          state.display === 1
            ? "Display: team chart — velocity bars rising."
            : state.display === 2
              ? "Display: launch plan — milestones slant upward."
              : "Display idle — the board dims.";
        return { zone: "meeting", label: "Meeting display", detail };
      }
      case "lounge-sofa": {
        state.seated = !state.seated;
        lounge.setSit(state.seated);
        return {
          zone: "lounge",
          label: "Lounge sofa",
          detail: state.seated
            ? "Settling into the teal sofa — cushions compress."
            : "Standing up — cushions spring back.",
        };
      }
      case "terrace-lookout": {
        state.skyView = !state.skyView;
        backdrop.setSkyView(state.skyView);
        return {
          zone: "terrace",
          label: "Terrace lookout",
          detail: state.skyView
            ? "Lookout opened — cloud layers lift for the sky view."
            : "Lookout closed — cloud layers settle down.",
        };
      }
      default:
        return null;
    }
  }

  const anchor = (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
  ): Interactable => ({
    id,
    label,
    x,
    z,
    radius,
    activate: () => {
      interact(id);
    },
  });

  const interactables: Interactable[] = [
    anchor("desk-monitor", "Shared desk monitor", -8, 7, 1.7),
    anchor("meeting-screen", "Meeting display", -8, -6, 1.5),
    anchor("lounge-sofa", "Lounge sofa", 9, 6, 1.2),
    anchor("terrace-lookout", "Terrace lookout", 9, -8, 1.4),
  ];

  const result: WorldResult = {
    group,
    colliders,
    interactables,
    spawnPoints: spawnPoints(),
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
        }
      });
      backdrop.dispose();
      geo.dispose();
      kit.dispose();
      group.clear();
    },
  };

  const applyQuality = (mode: QualityMode): void => {
    const low = mode === "low";
    lighting.setQuality(mode);
    desks.setQuality(low);
    lounge.setQuality(low);
    terrace.setQuality(low);
    backdrop.setQuality(low);
    kit.stone.flatShading = low;
    kit.stone.needsUpdate = true;
    kit.wood.flatShading = low;
    kit.wood.needsUpdate = true;
  };
  applyQuality("high");

  return {
    result,
    interact,
    setQuality: applyQuality,
  };
}
