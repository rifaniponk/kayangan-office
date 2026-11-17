import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVATAR_BUILDERS, PALETTE } from "./index.js";

/** Collect the distinct material colours each avatar actually renders with. */
function avatarColors(build: () => { root: THREE.Group; dispose: () => void }): Set<number> {
  const avatar = build();
  const colors = new Set<number>();
  avatar.root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of materials) {
        if (m instanceof THREE.MeshStandardMaterial) colors.add(m.color.getHex());
      }
    }
  });
  avatar.dispose();
  return colors;
}

const names = ["cloud", "automaton", "courier", "guardian"];
const sets = AVATAR_BUILDERS.map((build) => avatarColors(build));

describe("avatar palettes are distinct and probe-aligned", () => {
  it.each(names.map((name, i) => [name, i] as [string, number]))("%s renders with its own multi-colour palette", (_name, i) => {
    expect(sets[i]!.size).toBeGreaterThanOrEqual(3);
  });

  it("no two characters share any colour (never recoloured copies)", () => {
    for (let a = 0; a < sets.length; a++) {
      for (let b = a + 1; b < sets.length; b++) {
        const shared = [...sets[a]!].filter((hex) => sets[b]!.has(hex));
        expect(shared, `${names[a]} and ${names[b]} share colours`).toEqual([]);
      }
    }
  });

  it("palette constants feed the meshes", () => {
    expect(sets[0]!.has(PALETTE.cloud.body)).toBe(true);
    expect(sets[1]!.has(PALETTE.automaton.shell)).toBe(true);
    expect(sets[2]!.has(PALETTE.courier.body)).toBe(true);
    expect(sets[3]!.has(PALETTE.guardian.stone)).toBe(true);
  });
});
