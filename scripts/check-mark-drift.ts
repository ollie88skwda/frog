// CI guard: the frog mark's geometry is hand-copied in four places beyond
// its canonical sources — docs/brand/frog-brand-identity.html's app-tile
// sample, its 16px sample, its standalone in-app-mark sample, and its
// icon-row copy — and none of the four re-derive from the source at build
// time. Assert all four still match the source they were copied from:
// apps/web/public/icon.svg for the tile/16px pair, and
// apps/web/src/components/frog-mark.tsx for the in-app-mark pair — so a
// drifted copy fails CI instead of quietly going stale. The icon.svg ->
// frog-mark.tsx hop is a hand-fitted re-map into another coordinate space and
// is not checkable here; that one stays manual. See AGENTS.md "Brand mark."
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

// Whole <path> tags in document order, so a part's other attributes are read
// off the same tag its geometry came from: nothing here is located by its own
// coordinates, which would turn a legitimate coordinated edit into a "check
// script is broken" throw.
function pathTags(src: string, count: number, label: string): string[] {
  const out = [...src.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]);
  if (out.length !== count)
    throw new Error(
      `expected ${count} ${label}, found ${out.length} — check script is broken`,
    );
  return out;
}

function pathD(tag: string, label: string): string {
  return need(tag, /\bd="([^"]+)"/, `${label} path d`);
}

// SVG attribute in the .svg/.html copies, JSX prop in the .tsx source. Widths
// are captured with the fraction attached — a bare (\d+) silently truncates
// 36.5 to 36 and lets real drift compare equal.
function strokeWidth(src: string, label: string): string {
  return need(src, /(?:stroke-width="|strokeWidth=\{)([\d.]+)/, label);
}

function viewBox(src: string, label: string): string {
  return need(src, /<svg\b[^>]*\bviewBox="([^"]+)"/, label);
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

function comparePaths(
  label: string,
  got: string[],
  want: string[],
  names: string[],
) {
  got.forEach((tag, i) => {
    const g = pathD(tag, `${label} ${names[i]}`);
    const w = pathD(want[i], `canonical ${names[i]}`);
    if (tokens(g) !== tokens(w))
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
// The in-app cut drops the nostrils and glints, so its two circles are eyes.
const MARK_EYE_NAMES = ["left eye", "right eye"];
const MOUTH = PART_NAMES.indexOf("mouth");
const MARK_MOUTH = MARK_PART_NAMES.indexOf("mouth");

// ---- Canonical geometry: apps/web/public/icon.svg ----
// 6 paths in document order: left haunch, right haunch, body, feet, mouth, ground.
const iconPaths = pathTags(icon, 6, "icon.svg paths");
// 6 circles in document order: left/right eye, left/right nostril, left/right glint.
const iconCircles = circles(icon, 6, "icon.svg circles");

// The icon cut: the tile samples hand-copy both the square window and the #pad
// offset that positions the mark inside it, so a moved cut has to move in all
// three or the samples render the wrong crop with every path still matching.
const iconViewBox = viewBox(icon, "icon.svg viewBox");
const iconPad = need(
  icon,
  /<g\b[^>]*\bid="pad"[^>]*\btransform="([^"]+)"/,
  "icon.svg #pad transform",
);

const iconStrokeWidth = need(
  icon,
  /class="frog"[\s\S]*?stroke-width="([\d.]+)"/,
  "icon.svg base stroke-width",
);
const iconMouthStrokeWidth = need(
  icon,
  /class="mouth"[^>]*stroke-width="([\d.]+)"/,
  "icon.svg mouth stroke-width",
);
// The 16px treatment lives in icon.svg's own <style> media query.
const iconSmallStrokeWidth = need(
  icon,
  /\.frog\s*\{\s*stroke-width:\s*([\d.]+)/,
  "icon.svg 16px .frog stroke-width",
);
const iconSmallMouthStrokeWidth = need(
  icon,
  /\.mouth\s*\{\s*stroke-width:\s*([\d.]+)/,
  "icon.svg 16px .mouth stroke-width",
);
const iconSmallEyeR = need(
  icon,
  /\.eye\s*\{\s*r:\s*([\d.]+)px/,
  "icon.svg 16px .eye r",
);
const iconSmallEyeCy = need(
  icon,
  /\.eye\s*\{[^}]*cy:\s*([\d.]+)px/,
  "icon.svg 16px .eye cy",
);

// ---- Canonical geometry: apps/web/src/components/frog-mark.tsx ----
// 4 paths in document order: body, feet, mouth, ground. 2 circles: the eyes.
const markPaths = pathTags(inAppSrc, 4, "frog-mark.tsx paths");
const markCircles = circles(inAppSrc, 2, "frog-mark.tsx circles");
const markViewBox = need(
  inAppSrc,
  /viewBox="([^"]+)"/,
  "frog-mark.tsx viewBox",
);
const markStrokeWidth = strokeWidth(
  inAppSrc,
  "frog-mark.tsx base stroke-width",
);
const markMouthStrokeWidth = strokeWidth(
  markPaths[MARK_MOUTH],
  "frog-mark.tsx mouth stroke-width",
);

// ---- Copy 1: brand spec's standalone app-tile sample ----
const tileBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog app tile"[\s\S]*?<\/svg>)/,
  "brand spec app-tile sample",
);
const tilePaths = pathTags(tileBlock, 6, "app-tile paths");
comparePaths("app-tile sample", tilePaths, iconPaths, PART_NAMES);
compareCircles(
  "app-tile sample",
  circles(tileBlock, 6, "app-tile circles"),
  iconCircles,
  EYE_NAMES,
);
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
  need(tileBlock, /<g\b[^>]*\btransform="([^"]+)"/, "app-tile pad transform"),
  iconPad,
  "icon.svg #pad",
);
compare(
  "app-tile sample",
  "base stroke-width",
  strokeWidth(tileBlock, "app-tile base stroke-width"),
  iconStrokeWidth,
  "icon.svg",
);
compare(
  "app-tile sample",
  "mouth stroke-width",
  strokeWidth(tilePaths[MOUTH], "app-tile mouth stroke-width"),
  iconMouthStrokeWidth,
  "icon.svg",
);

// ---- Copy 2: brand spec's 16px sample ----
const smallBlock = need(
  brand,
  /(<svg class="logo-16"[\s\S]*?<\/svg>)/,
  "brand spec 16px sample",
);
const smallPaths = pathTags(smallBlock, 6, "16px sample paths");
comparePaths("16px sample", smallPaths, iconPaths, PART_NAMES);
circles(smallBlock, 2, "16px sample eyes").forEach(([cx, cy, r], i) => {
  compare(
    "16px sample",
    `${EYE_NAMES[i]} cx`,
    cx,
    iconCircles[i][0],
    "icon.svg",
  );
  compare(
    "16px sample",
    `${EYE_NAMES[i]} cy`,
    cy,
    iconSmallEyeCy,
    "icon.svg 16px .eye cy",
  );
  compare(
    "16px sample",
    `${EYE_NAMES[i]} r`,
    r,
    iconSmallEyeR,
    "icon.svg 16px .eye r",
  );
});
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
  need(
    smallBlock,
    /<g\b[^>]*\btransform="([^"]+)"/,
    "16px sample pad transform",
  ),
  iconPad,
  "icon.svg #pad",
);
compare(
  "16px sample",
  "base stroke-width",
  strokeWidth(smallBlock, "16px sample base stroke-width"),
  iconSmallStrokeWidth,
  "icon.svg 16px .frog",
);
compare(
  "16px sample",
  "mouth stroke-width",
  strokeWidth(smallPaths[MOUTH], "16px sample mouth stroke-width"),
  iconSmallMouthStrokeWidth,
  "icon.svg 16px .mouth",
);

// ---- Copy 3: brand spec's standalone in-app-mark sample ----
const inAppBlock = need(
  brand,
  /(<svg class="big-mark"[^>]*aria-label="Frog in-app mark"[\s\S]*?<\/svg>)/,
  "brand spec in-app-mark sample",
);
const inAppPaths = pathTags(inAppBlock, 4, "in-app-mark sample paths");
comparePaths("in-app-mark sample", inAppPaths, markPaths, MARK_PART_NAMES);
compareCircles(
  "in-app-mark sample",
  circles(inAppBlock, 2, "in-app-mark sample circles"),
  markCircles,
  MARK_EYE_NAMES,
);
compare(
  "in-app-mark sample",
  "viewBox",
  viewBox(inAppBlock, "in-app-mark sample viewBox"),
  markViewBox,
  "frog-mark.tsx",
);
compare(
  "in-app-mark sample",
  "base stroke-width",
  strokeWidth(inAppBlock, "in-app-mark sample base stroke-width"),
  markStrokeWidth,
  "frog-mark.tsx",
);
compare(
  "in-app-mark sample",
  "mouth stroke-width",
  strokeWidth(inAppPaths[MARK_MOUTH], "in-app-mark sample mouth stroke-width"),
  markMouthStrokeWidth,
  "frog-mark.tsx",
);

// ---- Copy 4: brand spec's icon-row copy ----
const rowBlock = need(
  brand,
  /(<svg[^>]*aria-label="frog"[\s\S]*?<\/svg>)/,
  "brand spec icon-row copy",
);
const rowPaths = pathTags(rowBlock, 4, "icon-row paths");
comparePaths("icon-row copy", rowPaths, markPaths, MARK_PART_NAMES);
compareCircles(
  "icon-row copy",
  circles(rowBlock, 2, "icon-row circles"),
  markCircles,
  MARK_EYE_NAMES,
);
compare(
  "icon-row copy",
  "viewBox",
  viewBox(rowBlock, "icon-row viewBox"),
  markViewBox,
  "frog-mark.tsx",
);
compare(
  "icon-row copy",
  "base stroke-width",
  strokeWidth(rowBlock, "icon-row base stroke-width"),
  markStrokeWidth,
  "frog-mark.tsx",
);
compare(
  "icon-row copy",
  "mouth stroke-width",
  strokeWidth(rowPaths[MARK_MOUTH], "icon-row mouth stroke-width"),
  markMouthStrokeWidth,
  "frog-mark.tsx",
);

if (errors.length > 0) {
  console.error("frog mark geometry has drifted from its canonical source:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("frog mark geometry matches across all 4 hand-copies.");
