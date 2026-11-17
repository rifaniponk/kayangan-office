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
const viewport = process.argv[5] ? process.argv[5].split("x").map(Number) : null;
const hide = process.argv[6] ? process.argv[6].split(",") : [];

const result = await runPage(
  { port: Number(process.env.KAYANGAN_DEBUG_PORT ?? $9336) + (process.pid % 40), url, timeoutMs: seconds * 1000 + 60_000 },
  async (session) => {
    await session.waitFor();
    if (viewport) {
      await session.call("Emulation.setDeviceMetricsOverride", {
        width: viewport[0],
        height: viewport[1],
        deviceScaleFactor: 1,
        mobile: false,
      });
    }
    await session.evaluate(`window.KAYANGAN.start('${quality}')`);
    for (const name of hide) await session.evaluate(`window.KAYANGAN.debugVisible('${name}', false)`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const sample = await session.runAsync(`window.KAYANGAN.walkSample(${seconds})`, seconds * 1000 + 30_000);
    const idle = await session.evaluate("JSON.stringify(window.KAYANGAN.metrics())");
    return JSON.stringify({
      quality,
      seconds,
      viewport: viewport ? `${viewport[0]}x${viewport[1]}` : "1920x1080",
      hiddenGroups: hide,
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
      viewport: parsed.viewport,
      hiddenGroups: parsed.hiddenGroups,
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
