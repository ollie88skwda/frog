// Generates the favicon, PWA/app PNG icons, and the inline brand-mark asset
// from the vectorized frog mark (docs/brand/assets/frog-mark.svg — see
// vectorize-frog-mark.ts for how that's derived from the reference photo).
// Being a vector, rasterizing it at any target size is clean by construction
// — no background-removal or downscale-quality tricks needed, unlike the
// abandoned raster pipeline this replaced.
// Re-run after the vector mark changes:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon.svg (bg-square + mark, the primary
// favicon — modern browsers rasterize SVG favicons crisply at any density),
// icon-192.png, icon-512.png, icon-maskable-512.png (safe-zone padded),
// apple-touch-icon.png (180, opaque — iOS doesn't support SVG here),
// favicon-32.png (old-browser fallback for the <link rel="icon"> PNG).
// Emits into apps/web/src/assets/: frog-mark.svg — the transparent mark
// alone (no bg square), for inline use next to the wordmark in the shell
// sidebar and auth screen.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BG = "#101211"; // Radix sage-1 (dark app background)
const MARK_SVG = new URL("../docs/brand/assets/frog-mark.svg", import.meta.url);
const PUBLIC_DIR = new URL("../apps/web/public/", import.meta.url);
const ASSETS_DIR = new URL("../apps/web/src/assets/", import.meta.url);

const mark = readFileSync(MARK_SVG, "utf8");
const viewBox = mark.match(/viewBox="0 0 (\d+) (\d+)"/);
if (!viewBox) throw new Error("frog-mark.svg missing viewBox");
const markW = Number(viewBox[1]);
const markH = Number(viewBox[2]);

// Combined favicon: dark rounded square + the mark, matching the old eye-mark
// icon.svg's own convention (512 viewBox, rx=96 — an ~18.75% squircle).
const box = 512 * (1 - 0.1); // ~10% breathing room inside the square
const scale = Math.min(box / markW, box / markH);
const dw = markW * scale;
const dh = markH * scale;
const dx = (512 - dw) / 2;
const dy = (512 - dh) / 2;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Frog</title>
  <rect width="512" height="512" rx="96" fill="${BG}"/>
  <g transform="translate(${dx.toFixed(2)},${dy.toFixed(2)}) scale(${scale.toFixed(5)})">
${mark
  .replace(/<\/?svg[^>]*>/g, "")
  .replace(/<title>.*?<\/title>/s, "")
  .trim()}
  </g>
</svg>
`;
writeFileSync(new URL("icon.svg", PUBLIC_DIR), iconSvg);
console.log("wrote apps/web/public/icon.svg");

copyFileSync(MARK_SVG, new URL("frog-mark.svg", ASSETS_DIR));
console.log("wrote apps/web/src/assets/frog-mark.svg");

// PNG derivatives (manifest/apple-touch/old-browser favicon fallback),
// rasterized from icon.svg at each target size.
const pngTargets = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  // Maskable: keep the mark inside the ~80% safe zone (platforms crop edges).
  { file: "icon-maskable-512.png", size: 512, pad: 0.14 },
  { file: "apple-touch-icon.png", size: 180, pad: 0 },
  { file: "favicon-32.png", size: 32, pad: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

for (const t of pngTargets) {
  const svg =
    t.pad === 0
      ? iconSvg
      : // Maskable: same bg square, mark scaled into the padded safe zone.
        (() => {
          const b = 512 * (1 - t.pad * 2);
          const s = Math.min(b / markW, b / markH);
          const w = markW * s;
          const h = markH * s;
          const x = (512 - w) / 2;
          const y = (512 - h) / 2;
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${s.toFixed(5)})">
${mark
  .replace(/<\/?svg[^>]*>/g, "")
  .replace(/<title>.*?<\/title>/s, "")
  .trim()}
  </g>
</svg>`;
        })();

  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${t.size}px;height:${t.size}px;">${svg.replace(
      /viewBox="0 0 512 512"/,
      `viewBox="0 0 512 512" width="${t.size}" height="${t.size}"`,
    )}</body></html>`,
  );
  const el = await page.$("svg");
  const buf = await el!.screenshot({ omitBackground: true });
  writeFileSync(new URL(t.file, PUBLIC_DIR), buf);
  console.log(`wrote apps/web/public/${t.file} (${t.size}px)`);
}

await browser.close();
