/**
 * Numeric stand-in for visual inspection: this machine's agent models cannot
 * open image files, so QA samples the design assets through a real browser
 * canvas instead of guessing colours. Prints JSON.
 *
 * Usage: node qa/pixel-probe.mjs design/kayangan-office-concept-v2.png [grid]
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { runPage, serveHtml } from "./cdp.mjs";

const target = process.argv[2];
const grid = Number(process.argv[3] ?? 8);
if (!target) {
  console.error("usage: node qa/pixel-probe.mjs <image-file> [grid]");
  process.exit(1);
}

const buffer = await readFile(target);
const mime = target.endsWith(".webp") ? "image/webp" : "image/png";
const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

const html = `<!doctype html><meta charset="utf-8"><body><img id="i" src="${dataUrl}"></body>`;
const port = 9431;
const close = await serveHtml(port, html);

const report = await runPage(
  { port, url: `http://127.0.0.1:${port}/`, timeoutMs: 45_000 },
  async (session) =>
    session.evaluate(
      `(() => {
        const img = document.getElementById('i');
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const tiles = [];
        const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
        for (let row = 0; row < ${grid}; row++) {
          for (let col = 0; col < ${grid}; col++) {
            const x0 = Math.floor(img.naturalWidth * col / ${grid});
            const y0 = Math.floor(img.naturalHeight * row / ${grid});
            const w = Math.floor(img.naturalWidth / ${grid});
            const h = Math.floor(img.naturalHeight / ${grid});
            const data = ctx.getImageData(x0, y0, w, h).data;
            let r = 0, g = 0, b = 0, lum = 0;
            const n = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
              r += data[i]; g += data[i + 1]; b += data[i + 2];
              lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            }
            tiles.push({
              row, col,
              hex: hex(r / n, g / n, b / n),
              luminance: Number((lum / n / 255).toFixed(3)),
            });
          }
        }
        const overall = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data;
        let r = 0, g = 0, b = 0;
        const n = overall.length / 4;
        for (let i = 0; i < overall.length; i += 4) { r += overall[i]; g += overall[i + 1]; b += overall[i + 2]; }
        return JSON.stringify({
          file: '${basename(target)}',
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspect: Number((img.naturalWidth / img.naturalHeight).toFixed(2)),
          averageHex: hex(r / n, g / n, b / n),
          tiles,
        });
      })()`,
    ),
);

await close();
console.log(report);
