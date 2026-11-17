/**
 * Numeric composition comparison between the design target and the rendered
 * frame. The agents' model cannot view images, so QA compares a 6x6 tile grid
 * of averaged colours: low mean distance means the render reads with the same
 * light/dark structure as the concept.
 *
 * Usage: node qa/compare.mjs <target.png> <frame.png>
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { runPage } from "./cdp.mjs";

const target = process.argv[2] ?? "design/kayangan-office-concept-v2.png";
const frame = process.argv[3] ?? "qa/art/gameplay.png";
const grid = Number(process.argv[4] ?? 6);
const pagePort = Number(process.env.KAYANGAN_PAGE_PORT ?? 9443);
const debugPort = Number(process.env.KAYANGAN_DEBUG_PORT ?? 9433);

const targetBytes = await readFile(target);
const frameBytes = await readFile(frame);
const targetMime = target.endsWith(".webp") ? "image/webp" : "image/png";

const html = `<!doctype html><meta charset="utf-8">
<body>
  <img id="a" src="__ASSET__">
  <img id="b" src="http://127.0.0.1:${pagePort}/asset2">
</body>`;

// One origin for both images: cross-origin images would taint the canvas.
const { createServer } = await import("node:http");
const { once } = await import("node:events");
const server = createServer((request, response) => {
  const body = request.url && request.url.startsWith("/asset2") ? frameBytes : targetBytes;
  response.writeHead(200, { "content-type": request.url?.startsWith("/asset2") ? "image/png" : targetMime });
  response.end(body);
});
server.listen(pagePort, "127.0.0.1");
await once(server, "listening");

const result = await runPage(
  { port: debugPort, url: `http://127.0.0.1:${pagePort}/`, timeoutMs: 45_000 },
  async (session) => {
    await session.waitFor("#a");
    return session.evaluate(
      `(() => {
        const tiles = (id) => {
          const img = document.getElementById(id);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const out = [];
          for (let row = 0; row < ${grid}; row++) {
            for (let col = 0; col < ${grid}; col++) {
              const w = Math.floor(img.naturalWidth / ${grid});
              const h = Math.floor(img.naturalHeight / ${grid});
              const data = ctx.getImageData(Math.floor(img.naturalWidth * col / ${grid}), Math.floor(img.naturalHeight * row / ${grid}), w, h).data;
              let r = 0, g = 0, b = 0;
              const n = data.length / 4;
              for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
              out.push([r / n, g / n, b / n]);
            }
          }
          return out;
        };
        const a = tiles('a');
        const b = tiles('b');
        const deltas = a.map((c, i) => Math.sqrt((c[0] - b[i][0]) ** 2 + (c[1] - b[i][1]) ** 2 + (c[2] - b[i][2]) ** 2));
        const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
        const rows = [];
        for (let row = 0; row < ${grid}; row++) {
          const slice = a.slice(row * ${grid}, (row + 1) * ${grid});
          const sliceB = b.slice(row * ${grid}, (row + 1) * ${grid});
          rows.push({
            targetLum: Number((slice.map(lum).reduce((x, y) => x + y, 0) / ${grid}).toFixed(3)),
            frameLum: Number((sliceB.map(lum).reduce((x, y) => x + y, 0) / ${grid}).toFixed(3)),
          });
        }
        return JSON.stringify({
          target: '${basename(target)}',
          frame: '${basename(frame)}',
          meanDelta: Number((deltas.reduce((x, y) => x + y, 0) / deltas.length).toFixed(1)),
          worstDelta: Number(Math.max(...deltas).toFixed(1)),
          luminanceRows: rows,
        });
      })()`,
    );
  },
);

await new Promise((resolve) => server.close(resolve));
console.log(result);
