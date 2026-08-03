// CI guard: the frog mark's geometry is hand-copied in four places beyond
// its canonical sources — docs/brand/frog-brand-identity.html's app-tile
// sample, its 16px sample, its standalone in-app-mark sample, and its
// icon-row copy — and none of the four re-derive from the source at build
// time. Assert all four still match apps/web/public/icon.svg (the tile/16px
// pair) and apps/web/src/components/frog-mark.tsx (the in-app-mark pair) so
// a drifted copy fails CI instead of quietly going stale. See AGENTS.md
// "Brand mark."
import { readFileSync } from "node:fs";

const icon = readFileSync("apps/web/public/icon.svg", "utf8");
const brand = readFileSync("docs/brand/frog-brand-identity.html", "utf8");
const inAppSrc = readFileSync("apps/web/src/components/frog-mark.tsx", "utf8");

const errors: string[] = [];

// Whitespace-insensitive token comparison: icon.svg is hand-formatted with
// spaces around path commands, the HTML/TSX copies are minified — "M1 2C3 4"
// and "M1 2 C3 4" describe the same geometry and must compare equal.
function tokens(d: string): string {
  return (d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []).join(",");
}

function need(src: string, re: RegExp, label: string): string {
  const m = src.match(re);
  if (!m) throw new Error(`could not find ${label} — check script is broken`);
  return m[1];
}

function paths(src: string, count: number, label: string): string[] {
  const out = [...src.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (out.length !== count)
    throw new Error(
      `expected ${count} ${label}, found ${out.length} — check script is broken`,
    );
  return out;
}

type Circle = [cx: string, cy: string, r: string];

function circles(src: string, count: number, label: string): Circle[] {
  const re =
    /<circle\b[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/g;
  const out = [...src.matchAll(re)].map((m) => [m[1], m[2], m[3]] as Circle);
  if (out.length !== count)
    throw new Error(
      `expected ${count} ${label}, found ${out.length} — check script is broken`,
    );
  return out;
}

function comparePaths(
  label: string,
  got: string[],
  want: string[],
  names: string[],
) {
  got.forEach((g, i) => {
    if (tokens(g) !== tokens(want[i]))
      errors.push(`${label}: ${names[i]} path does not match canonical`);
  });
}

function compareCircles(
  label: string,
  got: Circle[],
  want: Circle[],
  names: string[],
) {
  got.forEach(([cx, cy, r], i) => {
    const [wcx, wcy, wr] = want[i];
    if (cx !== wcx || cy !== wcy || r !== wr)
      errors.push(`${label}: ${names[i]} circle does not match canonical`);
  });
}

const PART_NAMES = [
  "left haunch",
  "right haunch",
  "body",
  "feet",
  "mouth",
  "ground",
];
const EYE_NAMES = [
  "left eye",
  "right eye",
  "left nostril",
  "right nostril",
  "left glint",
  "right glint",
];
const MARK_PART_NAMES = ["body", "feet", "mouth", "ground"];
const GLINT_NAMES = ["left glint", "right glint"];

// ---- Canonical geometry: apps/web/public/icon.svg ----
// 6 paths in document order: left haunch, right haunch, body, feet, mouth, ground.
const iconPaths = paths(icon, 6, "icon.svg paths");
// 6 circles in document order: left/right eye, left/right nostril, left/right glint.
const iconCircles = circles(icon, 6, "icon.svg circles");

const iconStrokeWidth = need(
  icon,
  /class="frog"[\s\S]*?stroke-width="(\d+)"/,
  "icon.svg base stroke-width",
);
const iconMouthStrokeWidth = need(
  icon,
  /class="mouth"[^>]*stroke-width="(\d+)"/,
  "icon.svg mouth stroke-width",
);
// The 16px treatment lives in icon.svg's own <style> media query.
const iconSmallStrokeWidth = need(
  icon,
  /\.frog\s*\{\s*stroke-width:\s*(\d+)/,
  "icon.svg 16px .frog stroke-width",
);
const iconSmallMouthStrokeWidth = need(
  icon,
  /\.mouth\s*\{\s*stroke-width:\s*(\d+)/,
  "icon.svg 16px .mouth stroke-width",
);
const iconSmallEyeR = need(
  icon,
  /\.eye\s*\{\s*r:\s*(\d+)px/,
  "icon.svg 16px .eye r",
);
const iconSmallEyeCy = need(
  icon,
  /\.eye\s*\{[^}]*cy:\s*(\d+)px/,
  "icon.svg 16px .eye cy",
);

// ---- Canonical geometry: apps/web/src/components/frog-mark.tsx ----
// 4 paths in document order: body, feet, mouth, ground. 2 circles: glints.
const markPaths = paths(inAppSrc, 4, "frog-mark.tsx paths");
const markCircles = circles(inAppSrc, 2, "frog-mark.tsx circles");

// ---- Copy 1: brand spec's standalone app-tile sample ----
const tileBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog app tile"[\s\S]*?<\/svg>)/,
  "brand spec app-tile sample",
);
comparePaths(
  "app-tile sample",
  paths(tileBlock, 6, "app-tile paths"),
  iconPaths,
  PART_NAMES,
);
compareCircles(
  "app-tile sample",
  circles(tileBlock, 6, "app-tile circles"),
  iconCircles,
  EYE_NAMES,
);
const tileStrokeWidth = need(
  tileBlock,
  /stroke-width="(\d+)"/,
  "app-tile stroke-width",
);
if (tileStrokeWidth !== iconStrokeWidth)
  errors.push(
    `app-tile sample: base stroke-width "${tileStrokeWidth}" != icon.svg "${iconStrokeWidth}"`,
  );
const tileMouthStrokeWidth = need(
  tileBlock,
  /stroke-width="(\d+)"\s+d="M233 163H443"/,
  "app-tile mouth stroke-width",
);
if (tileMouthStrokeWidth !== iconMouthStrokeWidth)
  errors.push(
    `app-tile sample: mouth stroke-width "${tileMouthStrokeWidth}" != icon.svg "${iconMouthStrokeWidth}"`,
  );

// ---- Copy 2: brand spec's 16px sample ----
const smallBlock = need(
  brand,
  /(<svg class="logo-16"[\s\S]*?<\/svg>)/,
  "brand spec 16px sample",
);
comparePaths(
  "16px sample",
  paths(smallBlock, 6, "16px sample paths"),
  iconPaths,
  PART_NAMES,
);
circles(smallBlock, 2, "16px sample eyes").forEach(([cx, cy, r], i) => {
  const wantCx = iconCircles[i][0];
  if (cx !== wantCx)
    errors.push(
      `16px sample: ${EYE_NAMES[i]} cx "${cx}" != icon.svg "${wantCx}"`,
    );
  if (cy !== iconSmallEyeCy)
    errors.push(
      `16px sample: ${EYE_NAMES[i]} cy "${cy}" != icon.svg 16px .eye cy "${iconSmallEyeCy}"`,
    );
  if (r !== iconSmallEyeR)
    errors.push(
      `16px sample: ${EYE_NAMES[i]} r "${r}" != icon.svg 16px .eye r "${iconSmallEyeR}"`,
    );
});
const smallStrokeWidth = need(
  smallBlock,
  /stroke-width="(\d+)"/,
  "16px sample stroke-width",
);
if (smallStrokeWidth !== iconSmallStrokeWidth)
  errors.push(
    `16px sample: base stroke-width "${smallStrokeWidth}" != icon.svg 16px .frog "${iconSmallStrokeWidth}"`,
  );
const smallMouthStrokeWidth = need(
  smallBlock,
  /stroke-width="(\d+)"\s+d="M233 163H443"/,
  "16px sample mouth stroke-width",
);
if (smallMouthStrokeWidth !== iconSmallMouthStrokeWidth)
  errors.push(
    `16px sample: mouth stroke-width "${smallMouthStrokeWidth}" != icon.svg 16px .mouth "${iconSmallMouthStrokeWidth}"`,
  );

// ---- Copy 3: brand spec's standalone in-app-mark sample ----
const inAppBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog in-app mark"[\s\S]*?<\/svg>)/,
  "brand spec in-app-mark sample",
);
comparePaths(
  "in-app-mark sample",
  paths(inAppBlock, 4, "in-app-mark sample paths"),
  markPaths,
  MARK_PART_NAMES,
);
compareCircles(
  "in-app-mark sample",
  circles(inAppBlock, 2, "in-app-mark sample circles"),
  markCircles,
  GLINT_NAMES,
);

// ---- Copy 4: brand spec's icon-row copy ----
const rowBlock = need(
  brand,
  /(<svg[^>]*aria-label="frog"[\s\S]*?<\/svg>)/,
  "brand spec icon-row copy",
);
comparePaths(
  "icon-row copy",
  paths(rowBlock, 4, "icon-row paths"),
  markPaths,
  MARK_PART_NAMES,
);
compareCircles(
  "icon-row copy",
  circles(rowBlock, 2, "icon-row circles"),
  markCircles,
  GLINT_NAMES,
);

if (errors.length > 0) {
  console.error("frog mark geometry has drifted from its canonical source:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("frog mark geometry matches across all 4 hand-copies.");
