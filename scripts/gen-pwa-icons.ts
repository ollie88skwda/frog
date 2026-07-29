// Renders the PWA/app PNG icons from apps/web/public/icon.svg — the frog mark is
// authored once, as vector, and every raster here is a render of it. No external
// assets, no runtime dep (Playwright is already a devDependency). Re-run after
// touching icon.svg:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon-192.png, icon-512.png,
// icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180, opaque).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// Must match the #ground fill in icon.svg. The tile ships on lab ink, the same
// value the manifest uses for background_color/theme_color, so it does not
// clash inside the dark app shell. Flipping this alone is not enough — on a
// dark ground the line work in icon.svg has to invert too. See the brand doc.
const GROUND = "#101211";

// icon.svg states the mark in its own coordinates: a 573 x 357 silhouette
// centred on (288, 179). Padding is therefore one number — the square viewBox
// side — plus the wrapper translate that re-centres the mark inside it.
const MARK_W = 573;
const MARK_CX = 288;
const MARK_CY = 179;

const targets = [
  // Standard tiles: ~9% margin, matching icon.svg's own viewBox.
  { file: "icon-192.png", size: 192, markFraction: 0.82 },
  { file: "icon-512.png", size: 512, markFraction: 0.82 },
  // Maskable: platforms may crop to the inner 80% circle (r = 0.4 * size). At
  // 0.656 the mark's half-diagonal is 337.6 against a 349.3 safe radius, so a
  // circular mask never clips it.
  { file: "icon-maskable-512.png", size: 512, markFraction: 0.656 },
  // Apple touch: 10% margin, and no baked-in corner radius — iOS rounds it.
  { file: "apple-touch-icon.png", size: 180, markFraction: 0.8 },
];

const outDir = new URL("../apps/web/public/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", outDir), "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>*{margin:0;padding:0}</style>${svg}`,
  );
  await page.evaluate(
    ({ size, markFraction, ground, markW, cx, cy }) => {
      const side = markW / markFraction;
      const root = document.querySelector("svg") as SVGSVGElement;
      root.setAttribute("viewBox", `0 0 ${side} ${side}`);
      root.setAttribute("width", String(size));
      root.setAttribute("height", String(size));
      const rect = document.getElementById(
        "ground",
      ) as unknown as SVGRectElement;
      rect.setAttribute("width", String(side));
      rect.setAttribute("height", String(side));
      rect.setAttribute("fill", ground);
      const pad = document.getElementById("pad") as unknown as SVGGElement;
      pad.setAttribute(
        "transform",
        `translate(${side / 2 - cx} ${side / 2 - cy})`,
      );
    },
    {
      size: t.size,
      markFraction: t.markFraction,
      ground: GROUND,
      markW: MARK_W,
      cx: MARK_CX,
      cy: MARK_CY,
    },
  );
  const el = await page.$("svg");
  await el?.screenshot({ path: new URL(t.file, outDir).pathname });
  console.log(`wrote apps/web/public/${t.file} (${t.size}px)`);
}

await browser.close();
