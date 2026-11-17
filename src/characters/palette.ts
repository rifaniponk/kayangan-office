/**
 * Palette for the four avatars, sampled programmatically (pixel math, no
 * image viewer) from `design/kayangan-characters-lineup.png` on 2026-11-17.
 * The lineup PNG is 1774×887 RGB; per character band (left→right):
 *
 *   Cloud     : #b8d8f8 / #a8c8e8 / #88b8e8 / #78a8d8 / #5878a8, eyes #1d1b28
 *   Automaton : #884828 / #985828 / #a85828, dark joints #582808/#482808,
 *               face glow #f3d88a, outline #2a1c14
 *   Courier   : #087878 / #085858 / #088888 / #18a8a8, outline #1d1813,
 *               warm accent #cbd5a2 (feet/satchel family)
 *   Guardian  : #785848 / #886858 / #b89888 stone, #483828 dark stone,
 *               moss #585808/#484808, leaf glow #dcce3f
 *
 * If C's qa/pixel-probe.mjs output differs materially, update these values.
 */
export const PALETTE = {
  cloud: {
    body: 0x8fb8e8,
    bodyLight: 0xb8d8f8,
    bodyShade: 0x5878a8,
    curl: 0xa8c8f8,
    eye: 0x1d1b28,
    feet: 0x4c6f9a,
  },
  automaton: {
    shell: 0x985828,
    shellDark: 0x884828,
    joint: 0x582808,
    outline: 0x2a1c14,
    faceGlow: 0xf3d88a,
    antennaTip: 0xf3d88a,
  },
  courier: {
    body: 0x087878,
    bodyDark: 0x085858,
    crest: 0x18a8a8,
    outline: 0x1d1813,
    feet: 0xe0bc63,
    satchel: 0xc08d4e,
    beak: 0xd8a24a,
  },
  guardian: {
    stone: 0x886858,
    stoneLight: 0xb89888,
    stoneDark: 0x483828,
    moss: 0x585810,
    leaf: 0x86a030,
    eye: 0x2c2014,
  },
} as const;
