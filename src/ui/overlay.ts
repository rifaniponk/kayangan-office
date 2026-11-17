import {
  CHARACTER_HINTS,
  CHARACTER_IDS,
  CHARACTER_NAMES,
  type CharacterId,
  type QualityMode,
} from "../core/contracts.js";

/** Colours used for the picker swatches; mirrors Agent B's avatar palettes. */
const SWATCH: Record<CharacterId, string> = {
  cloud: "#8fc3e8",
  automaton: "#b07a3f",
  courier: "#2f7d78",
  guardian: "#6f7d5a",
};

const ZONES = ["desk", "meeting", "lounge", "terrace"] as const;

export type Overlay = {
  picker: HTMLElement;
  playButton: HTMLButtonElement;
  hud: HTMLElement;
  toastPanel: HTMLElement;
  stats: HTMLElement;
  errorBanner: HTMLElement;
  qaReport: HTMLElement;
  selectCharacter(index: number): void;
  setPlaying(playing: boolean): void;
  setPaused(paused: boolean): void;
  setZone(zone: (typeof ZONES)[number] | "aisle"): void;
  setPrompt(text: string): void;
  setCharacter(id: CharacterId): void;
  toast(text: string): void;
  setStats(stats: Record<string, string>): void;
  setQuality(mode: QualityMode): void;
  showError(text: string): void;
  writeReport(report: unknown): void;
};

function q<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element #${id}`);
  return node as T;
}

export function createOverlay(): Overlay {
  const picker = q("character-picker");
  const playButton = q<HTMLButtonElement>("play-button");
  const hud = q("hud");
  const toastPanel = q("toast");
  const stats = q("stats");
  const errorBanner = q("error-banner");
  const qaReport = q("qa-report");
  const boot = q("boot");
  const pauseButton = q<HTMLButtonElement>("pause-button");
  const restartButton = q<HTMLButtonElement>("restart-button");
  const statsButton = q<HTMLButtonElement>("stats-button");
  const qualitySelect = q<HTMLSelectElement>("quality-select");
  const hudCharacter = q("hud-character");
  const hudZone = q("hud-zone");
  const hudPrompt = q("hud-prompt");

  const buttons: HTMLButtonElement[] = [];
  CHARACTER_IDS.forEach((id, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pick";
    button.dataset.index = String(index);
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = SWATCH[id];
    const label = document.createElement("span");
    label.textContent = `${index + 1} · ${CHARACTER_NAMES[id]}`;
    button.append(swatch, label);
    button.title = CHARACTER_HINTS[id];
    picker.append(button);
    buttons.push(button);
  });

  let selected = 0;
  let toastTimer = 0;

  function paintSelection(): void {
    buttons.forEach((button, index) => button.classList.toggle("active", index === selected));
  }

  function selectCharacter(index: number): void {
    selected = Math.max(0, Math.min(buttons.length - 1, index));
    paintSelection();
    hudCharacter.textContent = CHARACTER_NAMES[CHARACTER_IDS[selected] ?? "cloud"];
  }

  function setPlaying(playing: boolean): void {
    boot.classList.toggle("hidden", playing);
    hud.classList.toggle("hidden", !playing);
    document.getElementById("dpad")?.classList.toggle("hidden", !playing);
    document.getElementById("interact-button")?.classList.toggle("hidden", !playing);
  }

  function setPaused(paused: boolean): void {
    pauseButton.textContent = paused ? "Resume" : "Pause";
  }

  function setZone(zone: (typeof ZONES)[number] | "aisle"): void {
    const names: Record<string, string> = {
      desk: "Shared desks",
      meeting: "Glass meeting room",
      lounge: "Lounge",
      terrace: "Terrace",
      aisle: "Central aisle",
    };
    hudZone.textContent = names[zone] ?? "Central aisle";
  }

  function setPrompt(text: string): void {
    hudPrompt.textContent = text;
  }

  function setCharacter(id: CharacterId): void {
    hudCharacter.textContent = CHARACTER_NAMES[id];
  }

  function toast(text: string): void {
    toastPanel.textContent = text;
    toastPanel.classList.remove("hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastPanel.classList.add("hidden"), 3200);
  }

  function setStats(values: Record<string, string>): void {
    for (const [key, value] of Object.entries(values)) {
      const node = document.getElementById(`stat-${key}`);
      if (node) node.textContent = value;
    }
  }

  function setQuality(mode: QualityMode): void {
    qualitySelect.value = mode;
  }

  function showError(text: string): void {
    errorBanner.textContent = text;
    errorBanner.classList.remove("hidden");
  }

  function writeReport(report: unknown): void {
    qaReport.textContent = JSON.stringify(report);
  }

  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      selectCharacter(index);
      window.dispatchEvent(new CustomEvent("kayangan:select", { detail: index }));
    });
  });

  // On-screen movement pad: pointer/touch friendly, mirrors WASD.
  const dpad = q<HTMLDivElement>("dpad");
  const axes: Record<string, { x: number; z: number }> = {
    forward: { x: 0, z: -1 },
    back: { x: 0, z: 1 },
    left: { x: -1, z: 0 },
    right: { x: 1, z: 0 },
  };
  dpad.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    const axis = axes[button.dataset.dir ?? ""] ?? { x: 0, z: 0 };
    const send = (held: boolean) =>
      window.dispatchEvent(
        new CustomEvent("kayangan:move", { detail: held ? axis : { x: 0, z: 0 } }),
      );
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      // Synthetic pointer events (QA harness) have no active pointer to capture.
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      send(true);
    });
    const release = () => send(false);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });

  const interactButton = q<HTMLButtonElement>("interact-button");
  interactButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent("kayangan:interact", { detail: { held: true } }));
  });
  const releaseInteract = () =>
    window.dispatchEvent(new CustomEvent("kayangan:interact", { detail: { held: false } }));
  interactButton.addEventListener("pointerup", releaseInteract);
  interactButton.addEventListener("pointerleave", releaseInteract);
  interactButton.addEventListener("pointercancel", releaseInteract);

  pauseButton.addEventListener("click", () => window.dispatchEvent(new Event("kayangan:pause")));
  restartButton.addEventListener("click", () => window.dispatchEvent(new Event("kayangan:restart")));
  statsButton.addEventListener("click", () => stats.classList.toggle("hidden"));
  qualitySelect.addEventListener("change", () =>
    window.dispatchEvent(new CustomEvent("kayangan:quality", { detail: qualitySelect.value })),
  );

  paintSelection();
  selectCharacter(0);

  return {
    picker,
    playButton,
    hud,
    toastPanel,
    stats,
    errorBanner,
    qaReport,
    selectCharacter,
    setPlaying,
    setPaused,
    setZone,
    setPrompt,
    setCharacter,
    toast,
    setStats,
    setQuality,
    showError,
    writeReport,
  };
}

export const QUALITY_EVENT = "kayangan:quality";
