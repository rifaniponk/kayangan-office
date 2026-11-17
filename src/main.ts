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
  private readonly overlay = createOverlay();
  private readonly meter = new PerfMeter();
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
    else this.tick(0);
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
      const digit = /^[Digit1-4]$/.exec(event.code);
      if (digit) {
        const index = Number(event.code.slice(5)) - 1;
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
      if (document.hidden) this.keys.clear();
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
    if (!this.playing || this.paused) return;
    const elapsed = this.frameClock === 0 ? 16.7 : now - this.frameClock;
    const delta = Math.min(0.05, elapsed / 1000 || 0.016);
    this.frameClock = now;
    this.characters?.update(delta);
    this.followCamera(delta);
    this.render(elapsed);
    this.refreshHud();
    this.raf = requestAnimationFrame(this.tick);
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

  /** Deterministic full route: every character visits and activates every zone. */
  async runRoute(): Promise<RouteReport> {
    const world = this.world;
    const characters = this.characters;
    const stage = this.stage;
    if (!world || !characters || !stage) throw new Error("Game is not playing");
    this.routing = true;
    this.meter.reset();
    const visited: string[] = [];
    const interactions: string[] = [];
    let blockedSteps = 0;
    let routeSeconds = 0;
    const previous = { x: 0, z: 0 };

    for (let index = 0; index < CHARACTER_IDS.length; index += 1) {
      characters.select(index);
      this.overlay.selectCharacter(index);
      for (const anchor of world.result.interactables) {
        const deadline = performance.now() + 26_000;
        while (performance.now() < deadline) {
          const position = characters.getActivePosition();
          const dx = anchor.x - position.x;
          const dz = anchor.z - position.z;
          const distance = Math.hypot(dx, dz);
          if (distance <= anchor.radius) break;
          const length = Math.max(distance, 0.001);
          this.routeAxis = { x: dx / length, z: dz / length };
          const step = Math.min(0.05, Math.max(0.1, performance.now() - this.frameClock) / 1000);
          routeSeconds += step;
          characters.update(step);
          this.followCamera(step);
          this.render(step * 1000);
          if (Math.hypot(position.x - previous.x, position.z - previous.z) < 0.005) blockedSteps += 1;
          previous.x = position.x;
          previous.z = position.z;
          await frame();
        }
        this.routeInteract = true;
        characters.update(0.25);
        this.render(250);
        const result = world.interact(anchor.id);
        if (result) interactions.push(`${CHARACTER_IDS[index]}:${result.zone}`);
        visited.push(`${CHARACTER_IDS[index]}:${anchor.id}`);
        this.routeInteract = false;
        await frame();
      }
    }
    this.routing = false;
    this.routeAxis = { x: 0, z: 0 };

    const snapshot = this.meter.snapshot();
    const info = stage.renderer.info;
    return {
      routeSeconds,
      characters: [...CHARACTER_IDS],
      anchorsVisited: visited,
      interactions,
      blockedSteps,
      consoleErrors: this.errors,
      metrics: {
        frames: snapshot.frames,
        medianFps: Number(snapshot.medianFps.toFixed(2)),
        p95FrameMs: Number(snapshot.p95FrameMs.toFixed(2)),
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
};

if (params.get("autoplay") === "1") {
  app.start(params.get("quality") === "low" ? "low" : "high");
}
