// CI guard: the frog mark's geometry is hand-copied in four places beyond
// its canonical sources — docs/brand/frog-brand-identity.html's app-tile
// sample, its 16px sample, its standalone in-app-mark sample, and its
// icon-row copy — and none of the four re-derive from the source at build
// time. Assert all four still match the source they were copied from:
// apps/web/public/icon.svg for the tile/16px pair, and
// apps/web/src/components/frog-mark.tsx for the in-app-mark pair — so a
// drifted copy fails CI instead of quietly going stale. See AGENTS.md
// "Brand mark" and docs/DECISIONS.md 2026-08-06.
//
// Both canonical sources share one shape since 2026-08-06: a mark is 3
// <g fill="..."> layers, in a fixed order (outline, body, eye glints), each
// holding some number of filled <path>s — a color-separated potrace trace
// (scripts/vectorize-frog-mark.ts), not the hand-authored stroke-based
// silhouette it replaced. There is no small-size stroke/eye treatment to
// check anymore: filled vector shapes don't go sub-pixel at 16-32px the way
// thin strokes did, so icon.svg carries no size media query and frog-mark.tsx
// carries no separate simplification — the samples below are the *same*
// geometry as their canonical source, just recolored (icon.svg) or resized
// (16px sample), which is exactly what this checks.
import { readFileSync } from "node:fs";

const icon = readFileSync("apps/web/public/icon.svg", "utf8");
const brand = readFileSync("docs/brand/frog-brand-identity.html", "utf8");
const inAppSrc = readFileSync("apps/web/src/components/frog-mark.tsx", "utf8");

const errors: string[] = [];

// Whitespace-insensitive token comparison: some copies are hand-formatted
// with spaces around path commands, others are minified — "M1 2C3 4" and
// "M1 2 C3 4" describe the same geometry and must compare equal.
function tokens(d: string): string {
  return (d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []).join(",");
}

function need(src: string, re: RegExp, label: string): string {
  const m = src.match(re);
  if (!m) throw new Error(`could not find ${label} — check script is broken`);
  return m[1];
}

type Layer = { fill: string; paths: string[] };

// A mark's 3 fill layers, in document order, each with its <path d> list in
// document order. `root` must capture exactly the markup spanning all 3
// layers (see call sites) so this doesn't need to hand-balance nested <g>s.
function markLayers(root: string, label: string): Layer[] {
  const layers = [...root.matchAll(/<g fill="([^"]+)">([\s\S]*?)<\/g>/g)].map(
    ([, fill, inner]) => ({
      fill,
      paths: [...inner.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(
        (m) => m[1],
      ),
    }),
  );
  if (layers.length !== 3)
    throw new Error(
      `expected 3 fill layers in ${label}, found ${layers.length} — check script is broken`,
    );
  return layers;
}

function compareLayers(label: string, got: Layer[], want: Layer[]) {
  const LAYER_NAMES = ["outline", "body", "glints"];
  got.forEach((layer, i) => {
    const wantLayer = want[i];
    if (layer.paths.length !== wantLayer.paths.length) {
      errors.push(
        `${label}: ${LAYER_NAMES[i]} layer has ${layer.paths.length} paths, canonical has ${wantLayer.paths.length}`,
      );
      return;
    }
    layer.paths.forEach((d, j) => {
      if (tokens(d) !== tokens(wantLayer.paths[j]))
        errors.push(
          `${label}: ${LAYER_NAMES[i]} layer path ${j + 1} does not match canonical`,
        );
    });
  });
}

function viewBox(src: string, label: string): string {
  return need(src, /<svg\b[^>]*\bviewBox="([^"]+)"/, label);
}

function compare(
  label: string,
  what: string,
  got: string,
  want: string,
  source: string,
) {
  if (tokens(got) !== tokens(want))
    errors.push(`${label}: ${what} "${got}" != ${source} "${want}"`);
}

// ---- Canonical geometry: apps/web/public/icon.svg ----
// <g id="mark" transform="..."> wrapping exactly the 3 fill layers.
const iconMarkRoot = need(
  icon,
  /<g id="mark"[^>]*>((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "icon.svg #mark",
);
const iconLayers = markLayers(iconMarkRoot, "icon.svg");
const iconViewBox = viewBox(icon, "icon.svg viewBox");
const iconPad = need(
  icon,
  /<g\b[^>]*\bid="pad"[^>]*\btransform="([^"]+)"/,
  "icon.svg #pad transform",
);
const iconMarkTransform = need(
  icon,
  /<g\b[^>]*\bid="mark"[^>]*\btransform="([^"]+)"/,
  "icon.svg #mark transform",
);

// ---- Canonical geometry: apps/web/src/components/frog-mark.tsx ----
const markMarkRoot = need(
  inAppSrc,
  /<g transform="translate\(0,395\) scale\(0\.1,-0\.1\)">((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "frog-mark.tsx mark group",
);
const markLayersCanon = markLayers(markMarkRoot, "frog-mark.tsx");
const markViewBox = need(
  inAppSrc,
  /viewBox="([^"]+)"/,
  "frog-mark.tsx viewBox",
);

// ---- Copy 1: brand spec's standalone app-tile sample ----
const tileBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog app tile"[\s\S]*?<\/svg>)/,
  "brand spec app-tile sample",
);
const tileMarkRoot = need(
  tileBlock,
  /<g id="mark"[^>]*>((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "app-tile sample #mark",
);
compareLayers("app-tile sample", markLayers(tileMarkRoot, "app-tile sample"), iconLayers);
compare(
  "app-tile sample",
  "viewBox",
  viewBox(tileBlock, "app-tile viewBox"),
  iconViewBox,
  "icon.svg",
);
compare(
  "app-tile sample",
  "pad transform",
  need(tileBlock, /<g\b[^>]*\bid="pad"[^>]*\btransform="([^"]+)"/, "app-tile pad transform"),
  iconPad,
  "icon.svg #pad",
);
compare(
  "app-tile sample",
  "mark transform",
  need(tileBlock, /<g\b[^>]*\bid="mark"[^>]*\btransform="([^"]+)"/, "app-tile mark transform"),
  iconMarkTransform,
  "icon.svg #mark",
);

// ---- Copy 2: brand spec's 16px sample ----
// Same markup as the tile sample (filled vector shapes don't need a separate
// small-size treatment), just rendered smaller via the .logo-16 CSS class.
const smallBlock = need(
  brand,
  /(<svg class="logo-16"[\s\S]*?<\/svg>)/,
  "brand spec 16px sample",
);
const smallMarkRoot = need(
  smallBlock,
  /<g id="mark"[^>]*>((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "16px sample #mark",
);
compareLayers("16px sample", markLayers(smallMarkRoot, "16px sample"), iconLayers);
compare(
  "16px sample",
  "viewBox",
  viewBox(smallBlock, "16px sample viewBox"),
  iconViewBox,
  "icon.svg",
);
compare(
  "16px sample",
  "pad transform",
  need(smallBlock, /<g\b[^>]*\bid="pad"[^>]*\btransform="([^"]+)"/, "16px sample pad transform"),
  iconPad,
  "icon.svg #pad",
);
compare(
  "16px sample",
  "mark transform",
  need(smallBlock, /<g\b[^>]*\bid="mark"[^>]*\btransform="([^"]+)"/, "16px sample mark transform"),
  iconMarkTransform,
  "icon.svg #mark",
);

// ---- Copy 3: brand spec's standalone in-app-mark sample ----
const inAppBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog in-app mark"[\s\S]*?<\/svg>)/,
  "brand spec in-app-mark sample",
);
const inAppMarkRoot = need(
  inAppBlock,
  /<g transform="translate\(0,395\) scale\(0\.1,-0\.1\)">((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "in-app-mark sample mark group",
);
compareLayers(
  "in-app-mark sample",
  markLayers(inAppMarkRoot, "in-app-mark sample"),
  markLayersCanon,
);
compare(
  "in-app-mark sample",
  "viewBox",
  viewBox(inAppBlock, "in-app-mark sample viewBox"),
  markViewBox,
  "frog-mark.tsx",
);

// ---- Copy 4: brand spec's icon-row copy ----
const rowBlock = need(
  brand,
  /(<svg[^>]*aria-label="frog"[\s\S]*?<\/svg>)/,
  "brand spec icon-row copy",
);
const rowMarkRoot = need(
  rowBlock,
  /<g transform="translate\(0,395\) scale\(0\.1,-0\.1\)">((?:\s*<g fill="[^"]+">[\s\S]*?<\/g>\s*){3})\s*<\/g>/,
  "icon-row copy mark group",
);
compareLayers("icon-row copy", markLayers(rowMarkRoot, "icon-row copy"), markLayersCanon);
compare(
  "icon-row copy",
  "viewBox",
  viewBox(rowBlock, "icon-row viewBox"),
  markViewBox,
  "frog-mark.tsx",
);

if (errors.length > 0) {
  console.error("frog mark geometry has drifted from its canonical source:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("frog mark geometry matches across all 4 hand-copies.");
