import * as THREE from "three";
import type { CharacterId, CharacterState, CharacterSystem, InputSource, Interactable, World, WorldInteraction } from "../core/contracts.js";
import { CHARACTER_IDS } from "../core/contracts.js";
import { buildAvatar, type Avatar } from "../characters/index.js";
import {
  CHARACTER_RADIUS,
  overlapsAny,
  lerpAngle,
  nearestInteractable,
  resolveSafeSpawn,
  type Vec2,
} from "./collision.js";

export const DECK_BOUNDS = { halfX: 18, halfZ: 12, inset: CHARACTER_RADIUS + 0.35 };
const SPEEDS: Record<CharacterId, number> = { cloud: 3.2, automaton: 2.5, courier: 3.6, guardian: 2.1 };
const MAX_DT = 0.1;
const GESTURE_SECONDS = 0.9;
const CAMERA_SMOOTHING = 6;
/** Follow-camera targets never dip below deck level + headroom. */
const CAMERA_TARGET_MIN_Y = 1.45;

/**
 * Implements CharacterSystem: four retained positions, camera-relative
 * movement, collider sliding, deck containment, nearest-interactable
 * prompt, one-shot `E` activation via world.interact, smoothed camera
 * target + facing yaw, and reset-to-spawn if a character leaves the deck.
 * `setMoveAxis` is the on-screen control entry point: it feeds the same
 * camera-relative movement path as the keyboard, clamped to unit length.
 */
export type CharacterSystemWithTouch = CharacterSystem & {
  setMoveAxis(x: number, z: number): void;
};

export function createCharacters(world: World, input: InputSource): CharacterSystemWithTouch {
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
  let moveAxis: Vec2 = { x: 0, z: 0 }; // on-screen control axis (camera-relative)
  let lastInteraction: WorldInteraction | null = null;
  /** Follow-camera anchor height: head height with clear deck margin. */
  const headY = (index: number): number =>
    Math.max(CAMERA_TARGET_MIN_Y, avatars[index]!.height * 0.8 + 0.45);

  const cameraTarget = new THREE.Vector3(positions[0]!.x, headY(0), positions[0]!.z);
  const desiredTarget = new THREE.Vector3();
  const positionView = new THREE.Vector3(); // reused view returned by getActivePosition()
  let cameraYawSmoothed = 0;

  const activeId = (): CharacterId => CHARACTER_IDS[activeIndex]!;

  return {
    group,
    get activeIndex(): number {
      return activeIndex;
    },
    setMoveAxis(x: number, z: number): void {
      // Same camera-relative semantics as the keyboard path, clamped to
      // unit length so a diagonal request never exceeds the walk speed.
      const len = Math.hypot(x, z);
      if (len === 0) {
        moveAxis = { x: 0, z: 0 };
        return;
      }
      const scale = Math.min(1, len) / len;
      moveAxis = { x: x * scale, z: z * scale };
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
      cameraTarget.set(safe.x, headY(next), safe.z);
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

      // Allocation-free movement path: plain numeric locals, no per-frame
      // Vector3/objects. Semantics match cameraRelativeAxis + slideMove +
      // ensureOnDeck exactly (kept exported for pure-logic tests).
      let ax = 0;
      let az = 0;
      if (moveAxis.x !== 0 || moveAxis.z !== 0) {
        ax = moveAxis.x;
        az = moveAxis.z;
      } else {
        const keyboard = input.axis();
        ax = keyboard.x;
        az = keyboard.z;
      }
      const yaw = input.cameraYaw();
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const dirX = ax * c + az * s;
      const dirZ = -ax * s + az * c;
      const moving = dirX !== 0 || dirZ !== 0;
      const speed = SPEEDS[id]!;
      const step = speed * dt;

      if (moving) {
        const dx = dirX * step;
        const dz = dirZ * step;
        const halfX = DECK_BOUNDS.halfX - DECK_BOUNDS.inset;
        const halfZ = DECK_BOUNDS.halfZ - DECK_BOUNDS.inset;
        const tx = Math.max(-halfX, Math.min(halfX, pos.x + dx));
        const tz = Math.max(-halfZ, Math.min(halfZ, pos.z + dz));
        let fx = pos.x;
        let fz = pos.z;
        if (!overlapsAny(tx, tz, colliders, CHARACTER_RADIUS)) {
          fx = tx;
          fz = tz;
        } else if (!overlapsAny(tx, pos.z, colliders, CHARACTER_RADIUS)) {
          fx = tx;
          fz = pos.z;
        } else if (!overlapsAny(pos.x, tz, colliders, CHARACTER_RADIUS)) {
          fx = pos.x;
          fz = tz;
        }
        // Reset-to-spawn safety net (same threshold as ensureOnDeck).
        if (Math.abs(fx) > halfX + 0.001 || Math.abs(fz) > halfZ + 0.001) {
          fx = spawns[activeIndex]!.x;
          fz = spawns[activeIndex]!.z;
        }
        pos.x = fx;
        pos.z = fz;
        facingYaw[activeIndex] = lerpAngle(facingYaw[activeIndex]!, Math.atan2(dirX, dirZ), 1 - Math.exp(-dt * 12));
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
      const speedRatio = moving ? Math.min(1, Math.hypot(dirX, dirZ)) : 0;
      avatar.animate(state, clock, dt, speedRatio, gestureTimer / GESTURE_SECONDS);
      // Hidden avatars keep their last pose; animating them would burn CPU
      // on meshes nobody can see. They resume instantly on select (poses are
      // pure functions of `clock`).

      desiredTarget.set(pos.x, headY(activeIndex), pos.z);
      cameraTarget.lerp(desiredTarget, 1 - Math.exp(-dt * CAMERA_SMOOTHING));
      cameraYawSmoothed = lerpAngle(cameraYawSmoothed, facingYaw[activeIndex]!, 1 - Math.exp(-dt * 5));
    },
    getActivePosition(): THREE.Vector3 {
      // Shared read-only view (no per-frame allocation); callers must not
      // hold onto it across frames — main.ts reads components immediately.
      positionView.set(positions[activeIndex]!.x, 0, positions[activeIndex]!.z);
      return positionView;
    },
    getCameraTarget(): THREE.Vector3 {
      return cameraTarget; // shared smoothed target; read components immediately
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
