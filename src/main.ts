import * as THREE from "three";
import { createWorld } from "./world/index.js";
import { createCharacters } from "./characters/index.js";
import {
  CHARACTER_IDS,
  type CharacterSystem,
  type Interactable,
  type InputSource,
  type QualityMode,
  type World,
} from "./core/contracts.js";
import { CAMERA_BOUNDS, createStage, type Stage } from "./core/scene.js";
import { PerfMeter } from "./core/perf.js";
import { createOverlay } from "./ui/overlay.js";

const KEY_MOVE: Record<string, { x: number; z: number }> = {
  KeyW: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

const MOVE_KEYS = Object.keys(KEY_MOVE);
const DECK = { x: 18, z: 12 };

type RouteReport = {
  routeSeconds: number;
  wallSeconds: number;
  averageFps: number;
  characters: string[];
  anchorsVisited: string[];
  interactions: string[];
  blockedSteps: number;
  consoleErrors: string[];
  metrics: Record<string, number | null>;
  scene: { calls: number; triangles: number };
  quality: QualityMode;
  browser: string;
  webgl: string;
};

class App {
  readonly overlay = createOverlay();
  readonly meter = new PerfMeter();
  private readonly errors: string[] = [];
  private stage: Stage | null = null;
  private world: World | null = null;
  private characters: CharacterSystem | null = null;
  private quality: QualityMode = "high";
  private playing = false;
  private paused = false;
  private routeAxis = { x: 0, z: 0 };
  private routing = false;
  private interactHeld = false;
  private keys = new Set<string>();
  private cameraYaw = 0;
  private cameraPolar = 1.02;
  private cameraDistance = 11;
  private cameraTarget = new THREE.Vector3(0, 1.2, 0);
  private drag: { x: number; y: number } | null = null;
  private frameClock = 0;
  private raf = 0;
  private readonly loop = (now: number) => this.tick(now);

  constructor() {
    window.addEventListener("error", (event) => this.errors.push(event.message || "Unknown error"));
    window.addEventListener("unhandledrejection", (event) =>
      this.errors.push(String(event.reason)),
    );
  }

  private canvas(): HTMLCanvasElement {
    const node = document.getElementById("viewport");
    if (!(node instanceof HTMLCanvasElement)) throw new Error("Missing #viewport canvas");
    return node;
  }

  start(mode: QualityMode = this.quality): void {
    try {
      this.quality = mode;
      this.stage = createStage(this.canvas(), mode);
      this.world = createWorld();
      this.stage.scene.add(this.world.result.group);
      this.world.setQuality(mode);
      this.characters = createCharacters(this.world, this.inputSource());
      this.characters.select(this.characters.activeIndex);
      this.overlay.setPlaying(true);
      this.overlay.setQuality(mode);
      this.overlay.setPaused(false);
      this.playing = true;
      this.paused = false;
      this.snapCamera();
      this.bindInput();
      this.tick(0);
      this.overlay.toast("Pick a character with 1–4 or the panel. Walk with WASD.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.push(message);
      this.overlay.showError(`Startup failed: ${message}`);
    }
  }

  /** Steers toward an anchor, sliding sideways when a prop blocks the path. */
  private async steerTo(
    anchor: { x: number; z: number; radius: number },
    deadlineMs: number,
    onSample?: (position: THREE.Vector3, blocked: boolean) => void,
    onBlocked?: () => void,
  ): Promise<string> {
    const characters = this.characters;
    if (!characters) return "no-character-system";
    this.routing = true;
    const deadline = performance.now() + deadlineMs;
    let stuckFrames = 0;
    let detourFrames = 0;
    let detourSign = 1;
    let previous: { x: number; z: number } | null = null;
    let samples = 0;
    let status = "timeout";
    while (performance.now() < deadline) {
      const position = characters.getActivePosition();
      const dx = anchor.x - position.x;
      const dz = anchor.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= anchor.radius) {
        status = "arrived";
        break;
      }
      const length = Math.max(distance, 0.001);
      let axis = { x: dx / length, z: dz / length };
      if (detourFrames > 0) {
        // Blocked: slide along the obstacle instead of pinning against it.
        axis = { x: -axis.z * detourSign, z: axis.x * detourSign };
        detourFrames -= 1;
        if (detourFrames === 0) detourSign *= -1;
      }
      this.routeAxis = axis;
      await frame();
      samples += 1;
      const moved = previous ? Math.hypot(position.x - previous.x, position.z - previous.z) : 1;
      const blocked = moved < 0.01;
      if (blocked) {
        stuckFrames += 1;
        onBlocked?.();
      }
      else stuckFrames = 0;
      if (stuckFrames >= 12 && detourFrames === 0) {
        stuckFrames = 0;
        // Pick the side that actually has room, using the world's colliders.
        const colliders = this.world?.result.colliders ?? [];
        const radius = 0.55;
        const free = (sx: number, sz: number) =>
          !colliders.some((c) => {
            const cx = Math.max(c.x - c.width / 2, Math.min(c.x + c.width / 2, sx));
            const cz = Math.max(c.z - c.depth / 2, Math.min(c.z + c.depth / 2, sz));
            return (sx - cx) ** 2 + (sz - cz) ** 2 < radius * radius;
          });
        const probe = 0.6;
        const east = free(position.x - axis.z * probe, position.z + axis.x * probe);
        const west = free(position.x + axis.z * probe, position.z - axis.x * probe);
        detourSign = east ? 1 : west ? -1 : 1;
        detourFrames = 45;
      }
      if (blocked && samples % 8 === 0) onSample?.(position, true);
      else if (samples % 8 === 0) onSample?.(position, false);
      previous = { x: position.x, z: position.z };
    }
    this.routing = false;
    this.routeAxis = { x: 0, z: 0 };
    return status;
  }

  /** Walks the active character to an anchor using the normal movement path. */
  async walkTo(id: string): Promise<string> {
    const anchor = this.world?.result.interactables.find((item) => item.id === id);
    if (!anchor) return `${id}:unknown`;
    const status = await this.walkToAnchor(anchor);
    const position = this.characters?.getActivePosition();
    const distance = position ? Math.hypot(anchor.x - position.x, anchor.z - position.z) : -1;
    return `${id}:${status}:${distance.toFixed(2)}`;
  }

  /** Same walk as walkTo(), but records where the character got stuck. */
  async walkTrace(id: string): Promise<{ status: string; trace: Array<{ x: number; z: number; blocked: boolean }> }> {
    const anchor = this.world?.result.interactables.find((item) => item.id === id);
    if (!anchor) return { status: `${id}:unknown`, trace: [] };
    const trace: Array<{ x: number; z: number; blocked: boolean }> = [];
    const status = await this.walkToAnchor(anchor, () => {
      trace.push({ x: 0, z: 0, blocked: true });
    });
    return { status: `${id}:${status}`, trace };
  }

  /** Continuous walking sample: isolates the cost of moving characters. */
  async walkSample(seconds: number): Promise<{ wallSeconds: number; averageFps: number; snapshot: Record<string, number | null> }> {
    this.meter.reset();
    this.frameClock = 0;
    const wallStart = performance.now();
    const end = wallStart + seconds * 1000;
    this.routing = true;
    let forward = true;
    while (performance.now() < end) {
      forward = Math.floor((performance.now() - wallStart) / 2500) % 2 === 0;
      this.routeAxis = forward ? { x: 1, z: 0 } : { x: -1, z: 0 };
      await frame();
    }
    this.routing = false;
    this.routeAxis = { x: 0, z: 0 };
    const wallSeconds = (performance.now() - wallStart) / 1000;
    const snapshot = this.meter.snapshot();
    return {
      wallSeconds: Number(wallSeconds.toFixed(1)),
      averageFps: Number((snapshot.frames / Math.max(0.5, wallSeconds)).toFixed(2)),
      snapshot: snapshot as unknown as Record<string, number | null>,
    };
  }

  /** Hide a named world group so QA can attribute per-frame cost. */
  debugVisible(name: string, visible: boolean): boolean {
    const group = this.world?.result.group;
    if (!group) return false;
    let found = false;
    group.traverse((node) => {
      if (node.name === name) {
        node.visible = visible;
        found = true;
      }
    });
    return found;
  }

  /** Names of the top-level world groups, for attribution runs. */
  debugGroups(): string[] {
    return (this.world?.result.group.children ?? []).map((node) => node.name || "(unnamed)");
  }

  /** Camera rig state, for QA checks that drag and wheel must move the rig. */
  camera(): { distance: number; yaw: number; polar: number; x: number; y: number; z: number } {
    const position = this.stage?.camera.position ?? new THREE.Vector3();
    return {
      distance: this.cameraDistance,
      yaw: this.cameraYaw,
      polar: this.cameraPolar,
      x: position.x,
      y: position.y,
      z: position.z,
    };
  }

  /** Read-only view used by the QA harness and the stats panel. */
  debug(): { activeIndex: number; position: { x: number; y: number; z: number }; nearestAnchor: string | null; state: string | null } {
    const position = this.characters?.getActivePosition() ?? new THREE.Vector3();
    return {
      activeIndex: this.characters?.activeIndex ?? -1,
      position: { x: position.x, y: position.y, z: position.z },
      nearestAnchor: this.characters?.getNearestInteractable?.()?.id ?? null,
      state: this.characters?.getActiveState?.() ?? null,
    };
  }

  restart(): void {
    if (!this.world || !this.stage) return;
    const index = this.characters?.activeIndex ?? 0;
    this.characters?.dispose();
    this.characters = createCharacters(this.world, this.inputSource());
    this.characters.select(index);
    this.meter.reset();
    this.snapCamera();
    this.overlay.toast("Run restarted: every character is back at its spawn point.");
  }

  togglePause(force?: boolean): void {
    this.paused = force ?? !this.paused;
    this.overlay.setPaused(this.paused);
    if (this.paused) cancelAnimationFrame(this.raf);
    else {
      this.frameClock = 0;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  setQuality(mode: QualityMode): void {
    this.quality = mode;
    this.stage?.setQuality(mode);
    this.world?.setQuality(mode);
    this.overlay.setQuality(mode);
    this.overlay.toast(mode === "high" ? "Graphics: High (antialias, shadows, DPR ≤ 1.5)" : "Graphics: Low (no shadows, DPR ≤ 1.0)");
  }

  private inputSource(): InputSource {
    return {
      axis: () => {
        if (this.routing) return this.routeAxis;
        let x = 0;
        let z = 0;
        for (const code of this.keys) {
          const vector = KEY_MOVE[code];
          if (vector) {
            x += vector.x;
            z += vector.z;
          }
        }
        const length = Math.hypot(x, z);
        return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
      },
      interactRequested: () => this.interactHeld || this.routing && this.routeInteract,
      paused: () => this.paused || !this.playing || document.hidden,
      cameraYaw: () => this.cameraYaw,
    };
  }

  private routeInteract = false;

  private bindInput(): void {
    const canvas = this.stage?.renderer.domElement ?? this.canvas();
    window.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (MOVE_KEYS.includes(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
        return;
      }
      if (event.code === "KeyE") this.interactHeld = true;
      if (event.code === "KeyP") this.togglePause();
      if (event.code === "KeyR") this.restart();
      if (event.code === "KeyH") this.overlay.stats.classList.toggle("hidden");
      const digit = /^Digit([1-4])$/.exec(event.code);
      if (digit) {
        const index = Number(digit[1]) - 1;
        this.characters?.select(index);
        this.overlay.selectCharacter(index);
      }
    });
    window.addEventListener("keyup", (event) => {
      if (MOVE_KEYS.includes(event.code)) this.keys.delete(event.code);
      if (event.code === "KeyE") this.interactHeld = false;
    });
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("visibilitychange", () => {
      this.keys.clear();
      if (document.hidden) cancelAnimationFrame(this.raf);
      else if (this.playing && !this.paused) {
        this.frameClock = 0;
        this.raf = requestAnimationFrame(this.loop);
      }
    });
    window.addEventListener("resize", () => this.stage?.resize());
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 0 || event.button === 2) {
        this.drag = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      this.cameraYaw -= (event.clientX - this.drag.x) * 0.006;
      this.cameraPolar = Math.max(
        CAMERA_BOUNDS.minPolar,
        Math.min(CAMERA_BOUNDS.maxPolar, this.cameraPolar - (event.clientY - this.drag.y) * 0.004),
      );
      this.drag = { x: event.clientX, y: event.clientY };
    });
    const release = () => {
      this.drag = null;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.cameraDistance = Math.max(
          CAMERA_BOUNDS.minDistance,
          Math.min(CAMERA_BOUNDS.maxDistance, this.cameraDistance + event.deltaY * 0.02),
        );
      },
      { passive: false },
    );
    window.addEventListener("kayangan:select", (event) => {
      const detail = (event as CustomEvent<number>).detail;
      this.characters?.select(detail);
    });
    window.addEventListener("kayangan:pause", () => this.togglePause());
    window.addEventListener("kayangan:restart", () => this.restart());
    window.addEventListener("kayangan:quality", (event) => {
      this.setQuality((event as CustomEvent<string>).detail === "low" ? "low" : "high");
    });
  }

  private snapCamera(): void {
    const position = this.characters?.getActivePosition();
    if (position) this.cameraTarget.set(position.x, position.y + 1.1, position.z);
  }

  private followCamera(delta: number): void {
    const camera = this.stage?.camera;
    const position = this.characters?.getActivePosition();
    if (!camera || !position) return;
    const anchor = this.characters?.getCameraTarget?.() ?? position;
    const wanted = new THREE.Vector3(anchor.x, anchor.y + 1.1, anchor.z);
    const blend = Math.min(1, delta * 5);
    this.cameraTarget.lerp(wanted, blend);
    const x = this.cameraTarget.x + Math.sin(this.cameraYaw) * this.cameraDistance * Math.sin(this.cameraPolar);
    const z = this.cameraTarget.z + Math.cos(this.cameraYaw) * this.cameraDistance * Math.sin(this.cameraPolar);
    const y = Math.max(CAMERA_BOUNDS.minHeight, this.cameraTarget.y + this.cameraDistance * Math.cos(this.cameraPolar));
    // Keep the rig over the island so the office stays readable.
    camera.position.set(
      Math.max(-DECK.x - 6, Math.min(DECK.x + 6, x)),
      y,
      Math.max(-DECK.z - 8, Math.min(DECK.z + 8, z)),
    );
    camera.lookAt(this.cameraTarget);
  }

  private zoneOf(position: THREE.Vector3): "desk" | "meeting" | "lounge" | "terrace" | "aisle" {
    if (Math.abs(position.x) <= 2.6) return "aisle";
    if (position.x < 0) return position.z >= 0 ? "desk" : "meeting";
    return position.z >= 0 ? "lounge" : "terrace";
  }

  private tick(now: number): void {
    if (!this.playing || this.paused || document.hidden) return;
    const elapsed = this.frameClock === 0 ? 16.7 : now - this.frameClock;
    const delta = Math.min(0.05, elapsed / 1000 || 0.016);
    this.frameClock = now;
    this.characters?.update(delta);
    this.followCamera(delta);
    this.render(elapsed);
    this.refreshHud();
    this.raf = requestAnimationFrame(this.loop);
  }

  private render(frameMs: number): void {
    const stage = this.stage;
    if (!stage) return;
    stage.renderer.render(stage.scene, stage.camera);
    const info = stage.renderer.info.render;
    this.meter.record(Math.max(0.1, frameMs), info.calls, info.triangles, performance.now());
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    if (heap) this.meter.recordHeap(heap.usedJSHeapSize);
  }

  private lastInteraction = "";

  getErrors(): string[] {
    return [...this.errors];
  }

  private refreshHud(): void {
    const position = this.characters?.getActivePosition();
    if (!position) return;
    this.overlay.setZone(this.zoneOf(position));
    const nearest = this.characters?.getNearestInteractable?.() ?? null;
    this.overlay.setPrompt(nearest ? `E · ${nearest.label}` : "Walk near a marked object");
    const id = this.characters?.getActiveCharacter?.();
    if (id) this.overlay.setCharacter(id);
    const interaction = this.characters?.getInteraction?.();
    if (interaction && interaction.detail !== this.lastInteraction) {
      this.lastInteraction = interaction.detail;
      this.overlay.toast(`${interaction.label} — ${interaction.detail}`);
    }
    const snapshot = this.meter.snapshot();
    if (!this.overlay.stats.classList.contains("hidden")) {
      this.overlay.setStats({
        fps: snapshot.medianFps.toFixed(1),
        p95: `${snapshot.p95FrameMs.toFixed(1)} ms`,
        calls: String(snapshot.medianCalls),
        tris: (snapshot.medianTriangles / 1000).toFixed(1) + "k",
        textures: String(this.stage?.renderer.info.memory.textures ?? 0),
        heap: snapshot.heapBytes ? (snapshot.heapBytes / 1024 / 1024).toFixed(1) + " MB" : "n/a",
      });
    }
  }

  /**
   * Corridor waypoints the deck layout forces: the terrace is only reachable
   * through the inner rail gap and the meeting room through the door gap.
   */
  private static readonly WAYPOINTS: Record<string, { x: number; z: number } | undefined> = {
    "terrace-lookout": { x: 4.9, z: -2.5 },
    "meeting-screen": { x: -6.0, z: -1.4 },
    "lounge-sofa": { x: 6.5, z: 4.4 },
    "desk-monitor": { x: -5.0, z: 4.0 },
  };

  /** Walk to an anchor through its corridor waypoint, when the layout needs one. */
  private async walkToAnchor(anchor: Interactable, onBlocked?: () => void): Promise<string> {
    const waypoint = App.WAYPOINTS[anchor.id];
    if (waypoint) {
      const status = await this.steerTo(
        { x: waypoint.x, z: waypoint.z, radius: 0.7 },
        16_000,
        undefined,
        onBlocked,
      );
      if (status !== "arrived") return status;
    }
    return this.steerTo(anchor, 22_000, undefined, onBlocked);
  }

  /** Deterministic full route: every character visits and activates every zone. */
  async runRoute(): Promise<RouteReport> {
    const world = this.world;
    const characters = this.characters;
    const stage = this.stage;
    if (!world || !characters || !stage) throw new Error("Game is not playing");
    this.meter.reset();
    this.frameClock = 0;
    const wallStart = performance.now();
    const visited: string[] = [];
    const interactions: string[] = [];
    let blockedSteps = 0;
    let routeSeconds = 0;

    for (let index = 0; index < CHARACTER_IDS.length; index += 1) {
      characters.select(index);
      this.overlay.selectCharacter(index);
      await frame();
      routeSeconds += 1.5;
      await sleep(1500);
      for (const anchor of world.result.interactables) {
        const status = await this.walkToAnchor(anchor, () => {
          blockedSteps += 1;
        });
        routeSeconds += 3;
        await sleep(3000);
        this.interactHeld = true;
        await frame();
        await frame();
        this.interactHeld = false;
        const result = world.interact(anchor.id);
        if (result) interactions.push(`${CHARACTER_IDS[index]}:${result.zone}`);
        visited.push(`${CHARACTER_IDS[index]}:${anchor.id}:${status}`);
        await frame();
      }
    }

    const snapshot = this.meter.snapshot();
    const info = stage.renderer.info;
    const wallSeconds = (performance.now() - wallStart) / 1000;
    return {
      routeSeconds,
      wallSeconds: Number(wallSeconds.toFixed(1)),
      averageFps: Number((snapshot.frames / Math.max(0.5, wallSeconds)).toFixed(2)),
      characters: [...CHARACTER_IDS],
      anchorsVisited: visited,
      interactions,
      blockedSteps,
      consoleErrors: [...this.errors],
      metrics: {
        frames: snapshot.frames,
        medianFps: Number(snapshot.medianFps.toFixed(2)),
        p95FrameMs: Number(snapshot.p95FrameMs.toFixed(2)),
        maxFrameMs: Number(snapshot.maxFrameMs.toFixed(2)),
        slowFrames: snapshot.slowFrames,
        medianCalls: snapshot.medianCalls,
        medianTriangles: snapshot.medianTriangles,
        heapBytes: snapshot.heapBytes,
        heapGrowthBytes: snapshot.heapGrowthBytes,
      },
      scene: { calls: info.render.calls, triangles: info.render.triangles },
      quality: this.quality,
      browser: navigator.userAgent,
      webgl: stage.renderer.capabilities.isWebGL2 ? "WebGL2" : "WebGL1",
    };
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const app = new App();
const params = new URLSearchParams(location.search);
app.overlay.playButton.addEventListener("click", () => app.start());
app.overlay.selectCharacter(0);

declare global {
  interface Window {
    KAYANGAN: {
      start(mode?: QualityMode): void;
      runRoute(): Promise<RouteReport>;
      restart(): void;
      pause(paused: boolean): void;
      errors(): string[];
      metrics(): Record<string, number | null>;
      debug(): { activeIndex: number; position: { x: number; y: number; z: number }; nearestAnchor: string | null; state: string | null };
      setQuality(mode: QualityMode): void;
      key(code: string, down: boolean): void;
      walkTo(id: string): Promise<string>;
      walkTrace(id: string): Promise<{ status: string; trace: Array<{ x: number; z: number; blocked: boolean }> }>;
      camera(): { distance: number; yaw: number; polar: number; x: number; y: number; z: number };
      walkSample(seconds: number): Promise<{ wallSeconds: number; averageFps: number; snapshot: Record<string, number | null> }>;
      debugVisible(name: string, visible: boolean): boolean;
      debugGroups(): string[];
    };
  }
}

window.KAYANGAN = {
  start: (mode) => app.start(mode),
  runRoute: () => app.runRoute(),
  restart: () => app.restart(),
  pause: (paused) => app.togglePause(paused),
  errors: () => app.getErrors(),
  metrics: () => app.meter.snapshot() as unknown as Record<string, number | null>,
  debug: () => app.debug(),
  setQuality: (mode) => app.setQuality(mode),
  walkTo: (id) => app.walkTo(id),
  camera: () => app.camera(),
  walkSample: (seconds) => app.walkSample(seconds),
  debugVisible: (name, visible) => app.debugVisible(name, visible),
  debugGroups: () => app.debugGroups(),
  walkTrace: (id) => app.walkTrace(id),
  key: (code, down) =>
    window.dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }),
    ),
};

if (params.get("autoplay") === "1") {
  app.start(params.get("quality") === "low" ? "low" : "high");
}
