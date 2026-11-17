import * as THREE from "three";
import type { CharacterId, CharacterState, CharacterSystem, InputSource, Interactable, World, WorldInteraction } from "../core/contracts.js";
import { CHARACTER_IDS } from "../core/contracts.js";
import { buildAvatar, type Avatar } from "../characters/index.js";
import {
  CHARACTER_RADIUS,
  cameraRelativeAxis,
  ensureOnDeck,
  lerpAngle,
  nearestInteractable,
  resolveSafeSpawn,
  slideMove,
  type Vec2,
} from "./collision.js";

export const DECK_BOUNDS = { halfX: 18, halfZ: 12, inset: CHARACTER_RADIUS + 0.35 };
const SPEEDS: Record<CharacterId, number> = { cloud: 3.2, automaton: 2.5, courier: 3.6, guardian: 2.1 };
const MAX_DT = 0.1;
const GESTURE_SECONDS = 0.9;
const CAMERA_SMOOTHING = 6;

/**
 * Implements CharacterSystem: four retained positions, camera-relative
 * movement, collider sliding, deck containment, nearest-interactable
 * prompt, one-shot `E` activation via world.interact, smoothed camera
 * target + facing yaw, and reset-to-spawn if a character leaves the deck.
 */
export function createCharacters(world: World, input: InputSource): CharacterSystem {
  const group = new THREE.Group();
  group.name = "characters";
  const colliders = world.result.colliders;
  const interactables = world.result.interactables;

  const avatars: Avatar[] = CHARACTER_IDS.map((id) => buildAvatar(id));
  const positions: Vec2[] = world.result.spawnPoints.map((spawn, i) =>
    resolveSafeSpawn(spawn.x, spawn.z, colliders, CHARACTER_RADIUS, DECK_BOUNDS),
  );
  const spawns: Vec2[] = positions.map((p) => ({ x: p.x, z: p.z }));
  const facingYaw: number[] = CHARACTER_IDS.map(() => 0);
  avatars.forEach((avatar, i) => {
    avatar.root.position.set(positions[i]!.x, 0, positions[i]!.z);
    group.add(avatar.root);
    avatar.root.visible = i === 0;
  });

  let activeIndex = 0;
  let clock = 0;
  let gestureTimer = 0;
  let interactHeld = false;
  let nearest: Interactable | null = null;
  let state: CharacterState = "idle";
  let lastInteraction: WorldInteraction | null = null;
  const cameraTarget = new THREE.Vector3(positions[0]!.x, avatars[0]!.height * 0.8, positions[0]!.z);
  const desiredTarget = new THREE.Vector3();
  let cameraYawSmoothed = 0;

  const activeId = (): CharacterId => CHARACTER_IDS[activeIndex]!;

  return {
    group,
    get activeIndex(): number {
      return activeIndex;
    },
    select(index: number): void {
      const next = Math.max(0, Math.min(CHARACTER_IDS.length - 1, Math.floor(index)));
      if (next === activeIndex) return;
      activeIndex = next;
      avatars.forEach((avatar, i) => {
        avatar.root.visible = i === next;
      });
      // Retained position is re-validated against current props (props may
      // have moved between switches); never place a character inside a prop.
      const safe = resolveSafeSpawn(positions[next]!.x, positions[next]!.z, colliders, CHARACTER_RADIUS, DECK_BOUNDS);
      positions[next] = safe;
      avatarPlace(next);
      cameraTarget.set(safe.x, avatars[next]!.height * 0.8, safe.z);
      cameraYawSmoothed = facingYaw[next]!;
      gestureTimer = 0;
      interactHeld = false;
    },
    update(deltaSeconds: number): void {
      if (input.paused() || deltaSeconds <= 0) return;
      const dt = Math.min(deltaSeconds, MAX_DT);
      clock += dt;

      const id = activeId();
      const avatar = avatars[activeIndex]!;
      const pos = positions[activeIndex]!;

      const axis = input.axis();
      const dir = cameraRelativeAxis(axis, input.cameraYaw());
      const speed = SPEEDS[id]!;
      const moving = dir.x !== 0 || dir.z !== 0;

      if (moving) {
        const moved = slideMove(pos.x, pos.z, dir.x * speed * dt, dir.z * speed * dt, colliders, CHARACTER_RADIUS, DECK_BOUNDS);
        const safe = ensureOnDeck(moved.x, moved.z, DECK_BOUNDS, spawns[activeIndex]!);
        pos.x = safe.x;
        pos.z = safe.z;
        facingYaw[activeIndex] = lerpAngle(facingYaw[activeIndex]!, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 12));
      }

      avatar.root.position.set(pos.x, 0, pos.z);
      avatar.root.rotation.y = facingYaw[activeIndex]!;

      nearest = nearestInteractable(pos.x, pos.z, interactables);
      const requested = input.interactRequested();
      if (requested && nearest && !interactHeld) {
        lastInteraction = world.interact(nearest.id);
        gestureTimer = GESTURE_SECONDS;
        interactHeld = true;
      }
      if (!requested) interactHeld = false;
      if (gestureTimer > 0) gestureTimer = Math.max(0, gestureTimer - dt);

      state = gestureTimer > 0 ? "interact" : moving ? "move" : "idle";
      const speedRatio = moving ? Math.min(1, Math.hypot(dir.x, dir.z)) : 0;
      avatar.animate(state, clock, dt, speedRatio, gestureTimer / GESTURE_SECONDS);
      for (let i = 0; i < avatars.length; i++) {
        if (i !== activeIndex) avatars[i]!.animate("idle", clock, dt, 0, 0);
      }

      desiredTarget.set(pos.x, avatars[activeIndex]!.height * 0.8, pos.z);
      cameraTarget.lerp(desiredTarget, 1 - Math.exp(-dt * CAMERA_SMOOTHING));
      cameraYawSmoothed = lerpAngle(cameraYawSmoothed, facingYaw[activeIndex]!, 1 - Math.exp(-dt * 5));
    },
    getActivePosition(): THREE.Vector3 {
      const pos = positions[activeIndex]!;
      return new THREE.Vector3(pos.x, 0, pos.z);
    },
    getCameraTarget(): THREE.Vector3 {
      return cameraTarget.clone();
    },
    getNearestInteractable(): Interactable | null {
      return nearest;
    },
    getActiveState(): CharacterState {
      return state;
    },
    getActiveCharacter(): CharacterId {
      return activeId();
    },
    getInteraction(): WorldInteraction | null {
      return lastInteraction;
    },
    dispose(): void {
      for (const avatar of avatars) avatar.dispose();
      group.clear();
    },
  };

  function avatarPlace(index: number): void {
    const avatar = avatars[index]!;
    const pos = positions[index]!;
    avatar.root.position.set(pos.x, 0, pos.z);
    avatar.root.rotation.y = facingYaw[index]!;
  }
}
