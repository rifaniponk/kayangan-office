/**
 * Drives the required QA route in real Chromium: all four characters walk to
 * every zone anchor, activate it, and the run is measured frame-by-frame.
 *
 * Usage: node qa/route.mjs [url] [quality] [out.json]
 * Requires a server: `npm run preview` (dist/) or `npm run dev`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { consoleErrors, runPage } from "./cdp.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/?autoplay=1";
const quality = process.argv[3] ?? "high";
const out = resolve(process.argv[4] ?? "qa/art/route.json");

const report = await runPage(
  { port: 9334, url, timeoutMs: 300_000 },
  async (session, stderr) => {
    await session.evaluate(`window.KAYANGAN && window.KAYANGAN.start('${quality}')`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const route = await session.evaluate("window.KAYANGAN.runRoute().then(JSON.stringify)", true);
    const post = await session.evaluate(
      "JSON.stringify({ errors: window.KAYANGAN.errors(), metrics: window.KAYANGAN.metrics(), restarts: (() => { window.KAYANGAN.restart(); window.KAYANGAN.pause(true); window.KAYANGAN.pause(false); return 'ok' })() })",
    );
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify({ route: JSON.parse(route), post: JSON.parse(post), browserErrors: consoleErrors(session.events) }, null, 2));
    return { route: JSON.parse(route), post: JSON.parse(post), browserErrors: consoleErrors(session.events), chromeStderr: stderr.trim().slice(0, 400) };
  },
);

console.log(JSON.stringify(report, null, 2));
