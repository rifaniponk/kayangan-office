import * as THREE from "three";
import { PALETTE, seededRandom } from "./palette.js";

/**
 * Material/texture kit shared by every world module. Everything created here
 * is registered for disposal via `dispose()`.
 */
export interface MaterialKit {
  stone: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  bronzeDark: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
  tealDeep: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  screen: THREE.MeshStandardMaterial;
  screenBoard: THREE.MeshStandardMaterial;
  moss: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  cloud: THREE.MeshBasicMaterial;
  glow: THREE.MeshStandardMaterial;
  dispose(): void;
}

function noiseTexture(
  size: number,
  base: number,
  specks: number,
  speckAlpha: number,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null; // headless/node: no canvas
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const hex = "#" + base.toString(16).padStart(6, "0");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  const rand = seededRandom(base);
  for (let i = 0; i < specks; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 2.2;
    const light = rand() > 0.5;
    ctx.fillStyle = light
      ? `rgba(255,246,230,${speckAlpha * (0.4 + rand() * 0.6)})`
      : `rgba(58,44,32,${speckAlpha * (0.35 + rand() * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterialKit(): MaterialKit {
  const disposables: Array<{ dispose(): void }> = [];

  // Canvas textures are browser-only; headless tests get plain-colour materials.
  const stoneTex = noiseTexture(128, PALETTE.deckStone, 1400, 0.10);
  if (stoneTex) {
    stoneTex.repeat.set(6, 4);
    disposables.push(stoneTex);
  }

  const rockTex = noiseTexture(128, PALETTE.rockDeep, 900, 0.16);
  if (rockTex) {
    rockTex.repeat.set(3, 2);
    disposables.push(rockTex);
  }

  const woodTex = noiseTexture(128, PALETTE.wood, 1100, 0.12);
  if (woodTex) {
    woodTex.repeat.set(3, 3);
    disposables.push(woodTex);
  }

  const std = (
    color: number,
    opts: Partial<THREE.MeshStandardMaterialParameters> = {},
  ): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, ...opts });
    disposables.push(m);
    return m;
  };

  const stone = std(PALETTE.deckStone, { roughness: 0.92, map: stoneTex });
  const concrete = std(PALETTE.concreteEdge, { roughness: 0.85 });
  const rock = std(PALETTE.rock, { roughness: 0.95, flatShading: true, map: rockTex });
  const bronze = std(PALETTE.bronze, { roughness: 0.45, metalness: 0.45 });
  const bronzeDark = std(PALETTE.bronzeDark, { roughness: 0.5, metalness: 0.35 });
  const wood = std(PALETTE.wood, { roughness: 0.7, map: woodTex });
  const woodDark = std(PALETTE.woodDark, { roughness: 0.75 });
  const teal = std(PALETTE.teal, { roughness: 0.85 });
  const tealDeep = std(PALETTE.tealDeep, { roughness: 0.9 });
  const screenDesk = std(PALETTE.screenOff, { roughness: 0.35, emissive: 0x000000, emissiveIntensity: 0 });
  const screenBoard = std(PALETTE.screenOff, { roughness: 0.3, emissive: 0x000000, emissiveIntensity: 0 });
  const moss = std(PALETTE.moss, { roughness: 0.9, flatShading: true });
  const soil = std(PALETTE.soil, { roughness: 1 });
  const glow = std(PALETTE.sunWarm, {
    roughness: 0.4,
    emissive: 0xffc98a,
    emissiveIntensity: 0.9,
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: PALETTE.glass,
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  disposables.push(glass);

  const cloud = new THREE.MeshBasicMaterial({
    color: PALETTE.cloudWhite,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
  });
  disposables.push(cloud);

  return {
    stone,
    concrete,
    rock,
    bronze,
    bronzeDark,
    wood,
    woodDark,
    teal,
    tealDeep,
    glass,
    screen: screenDesk,
    screenBoard,
    moss,
    soil,
    cloud,
    glow,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Shared primitive geometry cache — one geometry instance per shape. */
export class GeoCache {
  private map = new Map<string, THREE.BufferGeometry>();

  get(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.map.get(key);
    if (!g) {
      g = make();
      this.map.set(key, g);
    }
    return g;
  }

  box(w: number, h: number, d: number): THREE.BufferGeometry {
    return this.get(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  cyl(rTop: number, rBottom: number, h: number, seg: number): THREE.BufferGeometry {
    return this.get(`cyl:${rTop}:${rBottom}:${h}:${seg}`, () =>
      new THREE.CylinderGeometry(rTop, rBottom, h, seg),
    );
  }

  sphere(r: number, wSeg: number, hSeg: number): THREE.BufferGeometry {
    return this.get(`sph:${r}:${wSeg}:${hSeg}`, () =>
      new THREE.SphereGeometry(r, wSeg, hSeg),
    );
  }

  dispose(): void {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}
