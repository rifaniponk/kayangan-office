import type * as THREE from "three";

/**
 * Shared contract between Agent A (world), Agent B (characters/gameplay) and
 * Agent C (app/integration/UI/QA). This file is owned by C.
 *
 * A and B must not edit it; request changes through C, who updates callers in
 * the same commit as the contract change.
 */

/** Axis-aligned XZ box used by the lightweight 2D collision layer. */
export type Collider = { x: number; z: number; width: number; depth: number };

/** A world object the player can activate with `E`. */
export type Interactable = {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  activate: () => void;
};

/** What Agent A hands to the app: geometry plus pure navigation data. */
export type WorldResult = {
  group: THREE.Group;
  colliders: Collider[];
  interactables: Interactable[];
  spawnPoints: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  dispose: () => void;
};

export type QualityMode = "high" | "low";
export type ZoneId = "desk" | "meeting" | "lounge" | "terrace";
export type CharacterId = "cloud" | "automaton" | "courier" | "guardian";
export type CharacterState = "idle" | "move" | "interact";

/** Deterministic, local-only result of activating an interactable. */
export type WorldInteraction = {
  zone: ZoneId;
  label: string;
  detail: string;
};

/** Agent A's public boundary. */
export interface World {
  result: WorldResult;
  /** Applies the state change for `id`; returns what the player should see. */
  interact(id: string): WorldInteraction | null;
  setQuality(mode: QualityMode): void;
}

/** Frame-rate-independent input state, supplied by the app. */
export interface InputSource {
  /** Normalised movement direction on the XZ plane, magnitude ≤ 1. */
  axis(): { x: number; z: number };
  /** True while the player holds `E` on the nearest interactable. */
  interactRequested(): boolean;
  /** True while the simulation is paused (tab hidden or `P`). */
  paused(): boolean;
  /** Camera drag turns the character, so movement is camera-relative. */
  cameraYaw(): number;
}

/** Agent B's public boundary. */
export interface CharacterSystem {
  group: THREE.Group;
  activeIndex: number;
  /** Index order is Cloud, Automaton, Courier, Guardian. */
  select(index: number): void;
  update(deltaSeconds: number): void;
  getActivePosition(): THREE.Vector3;
  /** Optional camera anchor; the app falls back to getActivePosition(). */
  getCameraTarget?(): THREE.Vector3;
  /** Nearest interactable within its radius, or null. */
  getNearestInteractable?(): Interactable | null;
  /** True when the active character just changed world state. */
  getActiveState?(): CharacterState;
  getActiveCharacter?(): CharacterId;
  dispose(): void;
}

/** Entry points agreed with A and B. */
export type CreateWorld = () => World;
export type CreateCharacters = (world: World, input: InputSource) => CharacterSystem;

export const CHARACTER_IDS: readonly CharacterId[] = [
  "cloud",
  "automaton",
  "courier",
  "guardian",
];

export const CHARACTER_NAMES: Record<CharacterId, string> = {
  cloud: "Cloud",
  automaton: "Automaton",
  courier: "Courier",
  guardian: "Guardian",
};

export const CHARACTER_HINTS: Record<CharacterId, string> = {
  cloud: "Blue puff body, curled cloud tuft, tiny limbs — floats and bobs.",
  automaton: "Warm bronze shell, round glowing face, antenna — mechanical steps.",
  courier: "Teal sky bird, swept crest, folded wing-arms, satchel — quick steps.",
  guardian: "Rounded stone sections, moss and leaves — heavy, sturdy steps.",
};
