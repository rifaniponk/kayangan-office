/**
 * Numeric frame inspection. No agent in this profile can open image files, so
 * QA measures a screenshot instead of eyeballing it: coverage, palette spread,
 * and horizon/ground band luminance tell us whether a frame actually rendered.
 *
 * Usage: node qa/inspect.mjs <screenshot.png>
 */
import { basename } from "node:path";
import { runPage, servePair } from "./cdp.mjs";

const target = process.argv[2];
if (!target) {
  console.error("usage: node qa/inspect.mjs <screenshot.png>");
  process.exit(1);
}

const pagePort = Number(process.env.KAYANGAN_PAGE_PORT ?? 9442);
const debugPort = Number(process.env.KAYANGAN_DEBUG_PORT ?? 9432);
const site = await servePair(pagePort, `<!doctype html><meta charset="utf-8"><body><img id="i" src="__ASSET__"></body>`, target, "image/png");

const report = await runPage(
  { port: debugPort, url: site.url, timeoutMs: 40_000 },
  async (session) => {
    await session.waitFor("#i");
    return session.evaluate(
      `(() => {
        const img = document.getElementById('i');
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const bands = [];
        const unique = new Set();
        let dark = 0, bright = 0, total = 0;
        for (let y = 0; y < canvas.height; y += 3) {
          for (let x = 0; x < canvas.width; x += 3) {
            const i = (y * canvas.width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            unique.add((r >> 3 << 5) + (g >> 3 << 2) + (b >> 3));
            total++;
            if (lum < 0.12) dark++;
            if (lum > 0.72) bright++;
          }
        }
        for (let band = 0; band < 5; band++) {
          const y0 = Math.floor(canvas.height * band / 5);
          const tile = ctx.getImageData(0, y0, canvas.width, Math.floor(canvas.height / 5)).data;
          let sum = 0;
          const n = tile.length / 4;
          for (let i = 0; i < tile.length; i += 4) sum += 0.2126 * tile[i] + 0.7152 * tile[i + 1] + 0.0722 * tile[i + 2];
          bands.push(Number((sum / n / 255).toFixed(3)));
        }
        return JSON.stringify({
          file: '${basename(target)}',
          width: canvas.width,
          height: canvas.height,
          distinctColors: unique.size,
          darkFraction: Number((dark / total).toFixed(3)),
          brightFraction: Number((bright / total).toFixed(3)),
          luminanceBands: bands,
        });
      })()`,
    );
  },
);

await site.close();
console.log(report);
