/**
 * Opens the built game in real Chromium, waits for a settle period, then writes
 * a screenshot plus scene/error evidence as JSON.
 *
 * Usage: node qa/render.mjs [url] [out.png] [quality] [settleMs]
 * Requires a server: `npm run preview` (dist/) or `npm run dev`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { consoleErrors, runPage } from "./cdp.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/?autoplay=1";
const out = resolve(process.argv[3] ?? "qa/art/gameplay.png");
const quality = process.argv[4] ?? "high";
const settleMs = Number(process.argv[5] ?? 4000);

const report = await runPage(
  { port: Number(process.env.KAYANGAN_DEBUG_PORT ?? $9333) + (process.pid % 40), url, timeoutMs: settleMs + 40_000 },
  async (session, stderr) => {
    await session.waitFor()
    await session.evaluate(`window.KAYANGAN && window.KAYANGAN.start('${quality}')`);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    await session.call("Page.enable");
    const shot = await session.call("Page.captureScreenshot", { format: "png" });
    const scene = await session.evaluate(
      "JSON.stringify({ errors: window.KAYANGAN ? window.KAYANGAN.errors() : [], metrics: window.KAYANGAN ? window.KAYANGAN.metrics() : {}, canvas: (() => { const c = document.getElementById('viewport'); return { w: c.width, h: c.height } })() })",
    );
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(shot.data, "base64"));
    return {
      url,
      quality,
      screenshot: out,
      scene: JSON.parse(scene),
      browserErrors: consoleErrors(session.events),
      chromeStderr: stderr.trim().slice(0, 400),
    };
  },
);

console.log(JSON.stringify(report, null, 2));
