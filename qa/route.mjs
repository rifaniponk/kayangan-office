/**
 * Drives the required QA route in real Chromium: all four characters walk to
 * every zone anchor, activate it, dwell in the zone, and the run is measured
 * frame-by-frame. Heap is sampled after an explicit gc() so a leak cannot hide
 * behind GC timing.
 *
 * Usage: node qa/route.mjs [url] [quality] [out.json]
 * Requires a server: `npm run preview` (dist/) or `npm run dev`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { consoleErrors, runPage } from "./cdp.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/?autoplay=1";
const quality = process.argv[3] ?? "high";
const out = resolve(process.argv[4] ?? "qa/art/route.json");

const heapPoll =
  "(() => { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize : null; })()";

const report = await runPage(
  { port: Number(process.env.KAYANGAN_DEBUG_PORT ?? $9334) + (process.pid % 40), url, args: ["--js-flags=--expose-gc"], timeoutMs: 600_000 },
  async (session, stderr) => {
    await session.waitFor();
    await session.evaluate(`window.KAYANGAN && window.KAYANGAN.start('${quality}')`);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const walked = await session.runAsync("window.KAYANGAN.runRoute()", 500_000, heapPoll);
    const route = walked.value;
    const heapSamples = walked.samples.filter((value) => typeof value === "number");
    const heapTrend =
      heapSamples.length > 1
        ? {
            samples: heapSamples.length,
            firstBytes: heapSamples[0],
            lastBytes: heapSamples[heapSamples.length - 1],
            peakBytes: Math.max(...heapSamples),
            deltaBytes: heapSamples[heapSamples.length - 1] - heapSamples[0],
          }
        : null;

    const post = await session.evaluate(
      "JSON.stringify({ errors: window.KAYANGAN.errors(), metrics: window.KAYANGAN.metrics(), restarts: (() => { window.KAYANGAN.restart(); window.KAYANGAN.pause(true); window.KAYANGAN.pause(false); return 'ok' })() })",
    );
    const shot = await session.call("Page.captureScreenshot", { format: "png" });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out.replace(/\.json$/, "-frame.png"), Buffer.from(shot.data, "base64"));
    const payload = { route, heapTrend, post: JSON.parse(post), browserErrors: consoleErrors(session.events) };
    await writeFile(out, JSON.stringify(payload, null, 2));
    return { ...payload, frame: out.replace(/\.json$/, "-frame.png"), browserErrors: payload.browserErrors, chromeStderr: stderr.trim().slice(0, 400) };
  },
);

const route = report.route;
console.log(
  JSON.stringify(
    {
      quality: report.frame ? quality : quality,
      routeSeconds: route.routeSeconds,
      wallSeconds: route.wallSeconds,
      averageFps: route.averageFps,
      frames: route.metrics.frames,
      medianFps: route.metrics.medianFps,
      p95FrameMs: route.metrics.p95FrameMs,
      maxFrameMs: route.metrics.maxFrameMs,
      slowFrames: route.metrics.slowFrames,
      medianCalls: route.metrics.medianCalls,
      medianTriangles: route.metrics.medianTriangles,
      heapTrend: report.heapTrend,
      anchorsVisited: route.anchorsVisited.length,
      interactions: route.interactions.length,
      consoleErrors: route.consoleErrors,
      browserErrors: report.browserErrors,
      frame: report.frame,
    },
    null,
    2,
  ),
);
