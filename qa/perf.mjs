/**
 * Movement-only frame sample: walks a character back and forth for a fixed
 * window and reports frame statistics, so a cost can be attributed to the
 * moving-character pass (shadows) instead of the idle scene.
 *
 * Usage: node qa/perf.mjs [quality] [seconds] [url]
 */
import { runPage } from "./cdp.mjs";

const quality = process.argv[2] ?? "high";
const seconds = Number(process.argv[3] ?? 12);
const url = process.argv[4] ?? "http://127.0.0.1:5173/?autoplay=1";

const result = await runPage(
  { port: 9336, url, timeoutMs: seconds * 1000 + 60_000 },
  async (session) => {
    await session.waitFor();
    await session.evaluate(`window.KAYANGAN.start('${quality}')`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const sample = await session.runAsync(`window.KAYANGAN.walkSample(${seconds})`, seconds * 1000 + 30_000);
    const idle = await session.evaluate("JSON.stringify(window.KAYANGAN.metrics())");
    return JSON.stringify({
      quality,
      seconds,
      moving: sample.value,
      idleSnapshot: JSON.parse(idle),
      errors: JSON.parse(await session.evaluate("JSON.stringify(window.KAYANGAN.errors())")),
    });
  },
);

const parsed = JSON.parse(result);
console.log(
  JSON.stringify(
    {
      quality: parsed.quality,
      windowSeconds: parsed.moving.wallSeconds,
      averageFpsWhileMoving: parsed.moving.averageFps,
      medianFps: parsed.moving.snapshot.medianFps,
      p95FrameMs: parsed.moving.snapshot.p95FrameMs,
      maxFrameMs: parsed.moving.snapshot.maxFrameMs,
      slowFrames: parsed.moving.snapshot.slowFrames,
      frames: parsed.moving.snapshot.frames,
      drawCalls: parsed.moving.snapshot.medianCalls,
      triangles: parsed.moving.snapshot.medianTriangles,
      errors: parsed.errors,
    },
    null,
    2,
  ),
);
