/**
 * Shared world palette (Agent A). Colors follow AGENTIC_LOOP.md §2 visual
 * contract: off-white stone/concrete, warm wood, bronze frames, teal
 * upholstery, soft sky light with warm morning sun.
 */
export const PALETTE = {
  deckStone: 0xd8d0c4,
  concreteEdge: 0xcac0b2,
  rock: 0xa89c8c,
  rockDeep: 0x4c4742,
  bronze: 0xb07a3f,
  bronzeDark: 0x8a6032,
  wood: 0x99795d,
  woodDark: 0x7b6250,
  teal: 0x2f7d78,
  tealDeep: 0x245f58,
  glass: 0xcfe4f2,
  screenOff: 0x22303a,
  screenOn: 0x66d2c2,
  moss: 0x6b885a,
  soil: 0x69543d,
  cloudWhite: 0xc9cfd9,
  sunWarm: 0xffe2bd,
  skySoft: 0xcfe4f2,
  groundWarm: 0xb69c84,
} as const;

/** Deterministic PRNG (mulberry32) so every rebuild is identical. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
