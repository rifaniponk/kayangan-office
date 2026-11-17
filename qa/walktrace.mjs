/**
 * Walk trace: drives the active character toward an anchor and prints the
 * position every ~1 s, so a blocked route can be attributed to a coordinate
 * instead of guessed at. Usage: node qa/walktrace.mjs [anchorId]
 */
import { runPage } from "./cdp.mjs";

const anchor = process.argv[2] ?? "meeting-screen";
const via = process.argv[3];
const url = process.env.KAYANGAN_URL ?? "http://127.0.0.1:4173/?autoplay=1";

const trace = await runPage({ port: Number(process.env.KAYANGAN_DEBUG_PORT ?? 9337) + (process.pid % 40), url, timeoutMs: 90_000 }, async (session) => {
  await session.waitFor();
  if (via) await session.runAsync(`window.KAYANGAN.walkTo('${via}')`);
  const parsed = (await session.runAsync(`window.KAYANGAN.walkTrace('${anchor}')`)).value;
  return JSON.stringify({
    anchor,
    via,
    status: parsed.status,
    blockedSamples: parsed.trace.filter((sample) => sample.blocked).length,
    trace: parsed.trace,
    debug: await session.evaluate("JSON.stringify(window.KAYANGAN.debug())"),
  });
});

console.log(trace);
