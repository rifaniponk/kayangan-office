import type { CharacterId } from "../core/contracts.js";
import { buildCloud } from "./cloud.js";
import { buildAutomaton } from "./automaton.js";
import { buildCourier } from "./courier.js";
import { buildGuardian } from "./guardian.js";
import type { Avatar } from "./parts.js";

export type { Avatar } from "./parts.js";
export { PALETTE } from "./palette.js";
/** App entry point: src/main.ts imports createCharacters from this module. */
export { createCharacters } from "../gameplay/characters.js";

/** Index order matches CHARACTER_IDS: Cloud, Automaton, Courier, Guardian. */
export const AVATAR_BUILDERS: readonly (() => Avatar)[] = [
  buildCloud,
  buildAutomaton,
  buildCourier,
  buildGuardian,
];

export function buildAvatar(id: CharacterId): Avatar {
  const index = (["cloud", "automaton", "courier", "guardian"] as CharacterId[]).indexOf(id);
  const builder = AVATAR_BUILDERS[index];
  if (!builder) throw new Error(`Unknown character id: ${id}`);
  return builder();
}
