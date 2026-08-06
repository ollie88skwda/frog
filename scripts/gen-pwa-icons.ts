// Generates apps/web/public/icon.svg (the favicon + PWA manifest SVG icon)
// and every PNG derivative from the vectorized frog mark
// (docs/brand/assets/frog-mark.svg — see vectorize-frog-mark.ts for how
// that's derived from the reference art). Unlike the hand-authored mark this
// replaced (see docs/DECISIONS.md 2026-08-06), icon.svg is *generated
// output* here, not a hand source — never hand-edit it, re-run this after
// touching frog-mark.svg:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon.svg (bg square + mark, the primary
// favicon — modern browsers rasterize SVG favicons crisply at any density),
// icon-192.png, icon-512.png, icon-maskable-512.png (safe-zone padded),
// apple-touch-icon.png (180, opaque — iOS doesn't support SVG here),
// favicon-32.png (old-browser fallback for the <link rel="icon"> PNG).
//
// Being vector, rasterizing frog-mark.svg at any target size is clean by
// construction — no background-removal or downscale-quality tricks needed,
// unlike the raster pipeline two mark-generations back.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Ground + mark fill both come straight off the reference art's own palette
// (see vectorize-frog-mark.ts's FILLS) — the frog's body carries the same
// green as the ground, so only the outline separates them. Keep this in sync
// with FILLS.green there.
const GROUND = "#6ab347";

// The mark is landscape (a sitting frog is wider than it is tall) and can't
// fill a square tile without letterboxing on one axis, so every tile is the
// mark centered on the ground square with breathing room on all sides.
// 0.9 leaves ~10% total margin split across the shorter axis's slack.
const TILE_FILL = 0.9;

// Maskable icons get cropped to an arbitrary shape by the platform — only the
// inner-80%-diameter circle (r = 0.4 * size) is guaranteed on screen, so
// nothing may bleed past it. The mark's bounding box corners are the
// farthest points from its own center (it has no protruding stroke caps to
// walk, unlike the old stroke-based mark), so sizing to the box's own
// enclosing circle is exact, not an approximation. 0.396 instead of 0.4
// leaves half a pixel for antialiasing to not rasterize past the boundary.
const SAFE_R = 0.396;

const publicDir = new URL("../apps/web/public/", import.meta.url);
const mark = readFileSync(
  new URL("../docs/brand/assets/frog-mark.svg", import.meta.url),
  "utf8",
);
const viewBox = mark.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) throw new Error("frog-mark.svg missing a 0 0 W H viewBox");
const markW = Number(viewBox[1]);
const markH = Number(viewBox[2]);

const layers = [
  ...mark.matchAll(
    /<g transform="[^"]*"\nfill="(#[0-9a-fA-F]+)" stroke="none">([\s\S]*?)<\/g>/g,
  ),
];
if (layers.length === 0) throw new Error("frog-mark.svg has no color layers");
const markInner = layers
  .map(([, fill, body]) => `<g fill="${fill}">${body.trim()}</g>`)
  .join("\n    ");
// The mark's own <g transform> bakes potrace's y-flip convention; carry it
// through (reformatted compactly — potrace pads every number to 6 decimals)
// so <g id="mark"> below composes with the pad/scale below.
const rawMarkTransform = mark.match(/<g transform="([^"]*)"/)?.[1];
if (!rawMarkTransform)
  throw new Error("frog-mark.svg missing its <g transform>");
const markTransform = `transform="${rawMarkTransform.replace(/-?\d*\.?\d+/g, (n) => String(Number(n)))}"`;

function frame(side: number, tx: number, ty: number, scale: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">
  <title>Frog</title>
  <rect id="ground" width="100%" height="100%" fill="${GROUND}"/>
  <g id="pad" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(6)})">
    <g id="mark" ${markTransform}>
    ${markInner}
    </g>
  </g>
</svg>
`;
}

// Tile: mark centered, longest side at TILE_FILL of the square.
const tileScale = (TILE_FILL * 512) / Math.max(markW, markH);
const tileSide = 512;
const tileTx = (tileSide - markW * tileScale) / 2;
const tileTy = (tileSide - markH * tileScale) / 2;

// Maskable: mark's bounding-box diagonal fit inside the safe circle.
const diag = Math.hypot(markW, markH);
const maskScale = (2 * SAFE_R * 512) / diag;
const maskSide = 512;
const maskTx = (maskSide - markW * maskScale) / 2;
const maskTy = (maskSide - markH * maskScale) / 2;

const iconSvg = frame(tileSide, tileTx, tileTy, tileScale);
writeFileSync(new URL("icon.svg", publicDir), iconSvg);
console.log("wrote apps/web/public/icon.svg");

// Both frames render on a fixed 512-unit viewBox; PNG targets just resize the
// root <svg>'s pixel width/height on top of that same coordinate system
// (SVG scales the viewBox to fit), so tx/ty/scale never need re-deriving
// per target size.
const frames = {
  tile: frame(512, tileTx, tileTy, tileScale),
  maskable: frame(512, maskTx, maskTy, maskScale),
} as const;

const targets = [
  { file: "icon-192.png", size: 192, cut: "tile" },
  { file: "icon-512.png", size: 512, cut: "tile" },
  { file: "icon-maskable-512.png", size: 512, cut: "maskable" },
  // Apple touch: exactly 180 x 180, fully opaque (iOS discards alpha), no
  // baked-in corner radius — iOS rounds its own. Opaque by construction here:
  // #ground always fills the whole tile.
  { file: "apple-touch-icon.png", size: 180, cut: "tile" },
  // Old-browser fallback for browsers that don't rasterize an SVG favicon.
  { file: "favicon-32.png", size: 32, cut: "tile" },
] as const satisfies { file: string; size: number; cut: keyof typeof frames }[];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}</style>${frames[t.cut]}`,
  );
  const root = page.locator("svg").first();
  await root.evaluate((el, size) => {
    el.setAttribute("width", String(size));
    el.setAttribute("height", String(size));
  }, t.size);
  await root.screenshot({ path: new URL(t.file, publicDir).pathname });
  console.log(`wrote apps/web/public/${t.file} (${t.size}px, ${t.cut} cut)`);
}

await browser.close();
