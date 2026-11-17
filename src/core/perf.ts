/**
 * Frame-time and resource measurement (owned by C).
 * Pure and DOM-free so tests can drive it with synthetic samples.
 */

export type FrameSample = { ms: number; calls: number; triangles: number };

export type PerfSnapshot = {
  frames: number;
  medianFps: number;
  p95FrameMs: number;
  medianCalls: number;
  medianTriangles: number;
  heapBytes: number | null;
  heapGrowthBytes: number | null;
};

export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

type HeapReporter = { usedJSHeapSize: number };
type HeapWindow = { memory?: HeapReporter };

export class PerfMeter {
  private readonly samples: FrameSample[] = [];
  private readonly heap: number[] = [];
  private readonly limit: number;
  private clock = 0;

  constructor(limit = 6000) {
    this.limit = limit;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** `clock` lets tests supply deterministic frame times. */
  record(ms: number, calls: number, triangles: number, clock?: number): void {
    if (clock !== undefined) this.clock = clock;
    this.samples.push({ ms, calls, triangles });
    if (this.samples.length > this.limit) this.samples.shift();
  }

  recordHeap(bytes: number): void {
    this.heap.push(bytes);
    if (this.heap.length > 400) this.heap.shift();
  }

  snapshot(): PerfSnapshot {
    const frames = this.samples.map((s) => s.ms);
    const calls = this.samples.map((s) => s.calls);
    const triangles = this.samples.map((s) => s.triangles);
    const heap = (globalThis as { performance?: HeapWindow }).performance?.memory;
    const first = this.heap[0];
    const last = this.heap[this.heap.length - 1];
    return {
      frames: this.samples.length,
      medianFps: median(frames) > 0 ? 1000 / median(frames) : 0,
      p95FrameMs: percentile(frames, 0.95),
      medianCalls: median(calls),
      medianTriangles: median(triangles),
      heapBytes: heap ? heap.usedJSHeapSize : null,
      heapGrowthBytes: first !== undefined && last !== undefined ? last - first : null,
    };
  }

  reset(): void {
    this.samples.length = 0;
    this.heap.length = 0;
    this.clock = 0;
  }
}
