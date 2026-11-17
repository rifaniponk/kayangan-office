import { describe, expect, it } from "vitest";
import { clampToDeck, overlapsAny, outsideDeck, CHARACTER_RADIUS } from "../src/gameplay/collision.js";
import { PerfMeter, median, percentile } from "../src/core/perf.js";

const desk = { x: -8, z: 7, width: 1.6, depth: 0.9 };

describe("collision sliding", () => {
  it("blocks a desk but slides along its face", () => {
    expect(overlapsAny(-8, 7, [desk], CHARACTER_RADIUS)).toBe(true);
    expect(overlapsAny(-8, 8.4, [desk], CHARACTER_RADIUS)).toBe(false);
    expect(overlapsAny(-10.2, 7, [desk], CHARACTER_RADIUS)).toBe(false);
  });

  it("keeps characters on the deck and flags escapes", () => {
    const bounds = { halfX: 18, halfZ: 12, inset: CHARACTER_RADIUS };
    expect(clampToDeck(30, 30, bounds)).toEqual({ x: 17.45, z: 11.45 });
    expect(outsideDeck(17.9, 0, bounds)).toBe(true);
    expect(outsideDeck(0, 0, bounds)).toBe(false);
  });
});

describe("performance meter", () => {
  it("reports median fps and p95 frame time from recorded samples", () => {
    const meter = new PerfMeter();
    for (let index = 0; index < 60; index += 1) meter.record(index % 2 === 0 ? 16 : 17, 40, 120_000, index);
    const snapshot = meter.snapshot();
    expect(snapshot.frames).toBe(60);
    expect(median([16, 17, 16])).toBe(16);
    expect(percentile([16, 17], 0.95)).toBe(17);
    expect(snapshot.medianFps).toBeGreaterThan(58);
    expect(snapshot.medianCalls).toBe(40);
    expect(snapshot.medianTriangles).toBe(120_000);
    meter.recordHeap(1_000_000);
    meter.recordHeap(1_200_000);
    expect(meter.snapshot().heapGrowthBytes).toBe(200_000);
    meter.reset();
    expect(meter.snapshot().frames).toBe(0);
  });
});
