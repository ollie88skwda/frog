// Vectorizes the frog reference art into a clean flat-color SVG
// (docs/brand/assets/frog-mark.svg) via color-separated potrace tracing —
// the source is a simple 3-color flat illustration (dark navy outline, green
// fill, white eye-highlight dots), so tracing each color plane separately and
// letting potrace fit clean bezier curves reproduces it far more faithfully
// than a generic multi-color autotrace (imagetracerjs was tried first and
// rejected: only 21.8% pixel-exact, visibly faceted edges — this
// color-separated approach gets to 94% of pixels within a diff of 20/255,
// the rest a sub-pixel edge halo, not shape error — see docs/DECISIONS.md
// 2026-08-06).
//
// Source is docs/brand/assets/frog-logo-reference.jpg — the original supplied
// reference art (see docs/DECISIONS.md 2026-08-06). docs/brand/frog-source-1024.png
// (main's own prior flattened reference, used by a hand-fitted trace this
// pipeline replaces) loses the eye-highlight color in its flatten — it gets
// merged into the near-white background — so it can't reproduce the glints
// this mark has; the original supplied art keeps them as a distinguishable
// near-white shade, which is what the classify step below needs.
//
// Requires the `potrace` CLI on PATH (`brew install potrace`) — not an npm
// dependency, so this is a manual/occasional re-run, not part of the regular
// `gen-pwa-icons.ts` build step. Re-run only if the source artwork changes:
//   bun scripts/vectorize-frog-mark.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

if (spawnSync("potrace", ["--version"]).status !== 0) {
  console.error(
    "potrace not found on PATH — install with `brew install potrace`",
  );
  process.exit(1);
}

const SOURCE = new URL(
  "../docs/brand/assets/frog-logo-reference.jpg",
  import.meta.url,
);
const OUT = new URL("../docs/brand/assets/frog-mark.svg", import.meta.url);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");

const sourceDataUrl = `data:image/jpeg;base64,${readFileSync(SOURCE).toString("base64")}`;

// In-page: key the white/near-white background to alpha, trim to content
// bbox, classify every opaque pixel into one of 3 flat-color buckets,
// despeckle each mask (3x3 majority vote — kills isolated compression-noise
// pixels), and pack each into a raw P4 PBM buffer (1 bit/pixel, MSB-first,
// 1 = black/foreground, the convention potrace expects). Returned as base64
// so Node never needs a PNG decoder.
const result: { width: number; height: number; pbm: Record<string, string> } =
  await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // Alpha-key (distance-from-white) + trim bbox.
    const alpha = new Uint8Array(width * height);
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const lo = 8;
    const hi = 45;
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const dist = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
      const a = Math.max(0, Math.min(1, (dist - lo) / (hi - lo)));
      alpha[i] = a > 0.5 ? 1 : 0;
      if (a > 0.02) {
        const x = i % width;
        const y = Math.floor(i / width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const padX = Math.round((maxX - minX) * 0.04);
    const padY = Math.round((maxY - minY) * 0.04);
    const bx = Math.max(0, minX - padX);
    const by = Math.max(0, minY - padY);
    const bw = Math.min(width, maxX + padX) - bx;
    const bh = Math.min(height, maxY + padY) - by;

    // Classify trimmed, opaque pixels into dark / green / white buckets.
    const classes: Record<string, Uint8Array> = {
      dark: new Uint8Array(bw * bh),
      green: new Uint8Array(bw * bh),
      white: new Uint8Array(bw * bh),
    };
    for (let ty = 0; ty < bh; ty++) {
      for (let tx = 0; tx < bw; tx++) {
        const sx = bx + tx;
        const sy = by + ty;
        const si = sy * width + sx;
        if (!alpha[si]) continue;
        const r = data[si * 4];
        const g = data[si * 4 + 1];
        const b = data[si * 4 + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const ti = ty * bw + tx;
        if (mn > 170) classes.white![ti] = 1;
        else if (mx < 100) classes.dark![ti] = 1;
        else classes.green![ti] = 1;
      }
    }

    // Despeckle: 3x3 majority vote kills isolated noise pixels without
    // eroding real edges.
    function despeckle(mask: Uint8Array): Uint8Array {
      const out = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          let on = 0;
          let total = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
              total++;
              if (mask[ny * bw + nx]) on++;
            }
          }
          out[y * bw + x] = on * 2 > total ? 1 : 0;
        }
      }
      return out;
    }

    // Pack a 0/1 mask into a raw P4 PBM buffer (MSB-first, 1 = black).
    function toPbmBase64(mask: Uint8Array): string {
      const rowBytes = Math.ceil(bw / 8);
      const bytes = new Uint8Array(rowBytes * bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          if (mask[y * bw + x]) {
            bytes[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
          }
        }
      }
      const header = `P4\n${bw} ${bh}\n`;
      const headerBytes = new TextEncoder().encode(header);
      const combined = new Uint8Array(headerBytes.length + bytes.length);
      combined.set(headerBytes, 0);
      combined.set(bytes, headerBytes.length);
      let binary = "";
      for (const byte of combined) binary += String.fromCharCode(byte);
      return btoa(binary);
    }

    return {
      width: bw,
      height: bh,
      pbm: {
        dark: toPbmBase64(despeckle(classes.dark!)),
        green: toPbmBase64(despeckle(classes.green!)),
        white: toPbmBase64(despeckle(classes.white!)),
      },
    };
  }, sourceDataUrl);

await browser.close();

const workDir = mkdtempSync(join(tmpdir(), "frog-vectorize-"));
const FILLS: Record<string, string> = {
  dark: "#131426",
  green: "#6ab347",
  white: "#ffffff",
};
const layers: string[] = [];
for (const name of ["dark", "green", "white"] as const) {
  const pbmPath = join(workDir, `${name}.pbm`);
  writeFileSync(pbmPath, Buffer.from(result.pbm[name]!, "base64"));
  const svgPath = join(workDir, `${name}.svg`);
  const turdsize = name === "white" ? "8" : "6";
  const res = spawnSync("potrace", [
    pbmPath,
    "-s",
    "-o",
    svgPath,
    "--turdsize",
    turdsize,
    "--alphamax",
    "1",
    "--opttolerance",
    "0.3",
  ]);
  if (res.status !== 0) {
    console.error(`potrace failed on ${name}:`, res.stderr?.toString());
    process.exit(1);
  }
  const svg = readFileSync(svgPath, "utf8");
  const g = svg.match(/<g .*?<\/g>/s)?.[0];
  if (!g) {
    console.error(`no <g> found in potrace output for ${name}`);
    process.exit(1);
  }
  layers.push(g.replace(/fill="#[0-9a-fA-F]{6}"/, `fill="${FILLS[name]}"`));
}
rmSync(workDir, { recursive: true, force: true });

const merged = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.width} ${result.height}">
<title>Frog</title>
${layers.join("\n")}
</svg>
`;
writeFileSync(OUT, merged);
console.log(
  `wrote docs/brand/assets/frog-mark.svg (${result.width}x${result.height})`,
);
