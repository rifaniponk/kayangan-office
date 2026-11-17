/**
 * Palette for the four avatars. Two independent samplers of
 * `design/kayangan-characters-lineup.png` (1774×887 RGB), run 2026-11-17:
 *
 * - C's official probe (`qa/pixel-probe.mjs`, 8×8 tile grid): Cloud body
 *   `#bed2e8` / shade `#a5bdd9`; Automaton bronze `#a67f62` / shade
 *   `#a48470`, face glow `#e2d2c6`; Courier teal `#4e988d` / shade
 *   `#477467`, warm beak/feet `#c8bbae`, satchel `#9b9d94`; Guardian stone
 *   `#816c56`/`#8a7b5f`, moss `#95953f`/`#83792c`; studio bg `#e4dddd`.
 * - My own band sampler (saturated-pixel clusters per character column):
 *   Cloud `#b8d8f8/#a8c8e8/#88b8e8/#78a8d8/#5878a8`, eyes `#1d1b28`;
 *   Automaton `#985828/#884828/#a85828`, joints `#582808/#482808`, glow
 *   `#f3d88a`, outline `#2a1c14`; Courier `#087878/#085858/#088888/#18a8a8`,
 *   outline `#1d1813`, warm accent `#cbd5a2`; Guardian `#886858/#b89888/
 *   #785848`, dark stone `#483828`, moss `#585808`, leaf `#dcce3f`.
 *
 * The tile grid blends studio background into figure tiles, so I keep the
 * saturated-cluster hues for body fills and take C's tile hues for lighter
 * accents; both agree on hue families.
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
    feet: 0xd8b26a, // yellow feet per lineup prompt, within C's warm tile family
    satchel: 0x9b9d94,
    beak: 0xc8bbae,
  },
  guardian: {
    stone: 0x8a7b5f,
    stoneLight: 0xb89888,
    stoneDark: 0x483828,
    moss: 0x83792c,
    leaf: 0x95953f,
    eye: 0x2c2014,
  },
} as const;
