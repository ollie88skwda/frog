// Renders the PWA/app PNG icons from apps/web/public/icon.svg — the frog mark is
// authored once, as vector, and every raster here is a render of it. No external
// assets, no runtime dep (Playwright is already a devDependency). Re-run after
// touching icon.svg:
//   bun scripts/gen-pwa-icons.ts
// Emits into apps/web/public/: icon-192.png, icon-512.png,
// icon-maskable-512.png (safe-zone padded), apple-touch-icon.png (180, opaque).
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Must match the #ground fill in icon.svg. The tile ships on the source art's
// own grass green, with the frog as black line art over it. Flipping this alone
// is not enough — the line work in icon.svg is picked against this ground, and
// the body carries the same green so only the outline separates them. See the
// brand doc.
const GROUND = "#6AB347";

// --- the cut ---------------------------------------------------------------
// The mark is 1.6:1, so a straight render of the *whole* mark can never fill a
// square tile: sized to the width it leaves top/bottom margins ~2.5x the sides
// and the frog reads as floating in a mostly-empty tile. The tiles therefore
// ship an **icon cut** — a square window onto the mark, not the whole mark.
//
// Two numbers define that window, and every box they are stated against is
// measured off the live SVG below, so the frog stays the single geometry
// definition: edit icon.svg and the cut follows it.
const CUT = {
  // The head + body (#body in icon.svg) is the silhouette and must never be
  // cropped, so it sets the window width and therefore the window. 0.93 leaves
  // a hairline of ground beside its widest point. The haunches, feet and ground
  // bar are wider than that and run off the left and right edges — a bleeding
  // ground line is what makes the crop read as deliberate rather than as a mark
  // that doesn't quite fit.
  bodyFill: 0.93,
  // Bottom-anchored: the ground bar sits this far (as a fraction of the window)
  // above the tile's bottom edge, so the frog sits on the tile floor and the
  // vertical slack is spent as headroom above it rather than as equal dead
  // space above and below.
  floor: 0.035,
};

// Maskable is a different problem and gets the whole mark: platforms crop it to
// an arbitrary shape and only the inner 80% circle is guaranteed, so nothing may
// bleed. Fill is then a placement question. Centring the mark on its bounding
// box wastes the circle — the mark's corners are empty, its ground-bar caps are
// what actually reach furthest — while centring on the circle that minimises
// the enclosing radius fills most but lifts the frog 13% of the tile, which a
// launcher showing a near-full square reads as top-heavy. 0.25 takes about half
// the available gain for a 3% offset you have to measure to see.
const MASK_BIAS = 0.25;
// The maskable spec's safe circle is the inner 80%, r = 0.4 * size. Land half a
// pixel inside it: at exactly 0.4 the antialiased edge of the outermost stroke
// rasterises past the boundary. Verified by scanning the emitted PNG — every
// painted pixel, faint antialiasing included, lies wholly inside 0.4 * size.
const SAFE_R = 0.396;

const targets = [
  { file: "icon-192.png", size: 192, cut: "tile" },
  { file: "icon-512.png", size: 512, cut: "tile" },
  { file: "icon-maskable-512.png", size: 512, cut: "maskable" },
  // Apple touch: exactly 180 x 180, fully opaque (iOS discards alpha), and no
  // baked-in corner radius — iOS rounds its own.
  { file: "apple-touch-icon.png", size: 180, cut: "tile" },
] as const;

const outDir = new URL("../apps/web/public/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", outDir), "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><meta charset="utf-8">
   <style>*{margin:0;padding:0}</style>${svg}`,
);

// Both windows, in the mark's own art coordinates, measured off the live SVG.
// Each is stated the way icon.svg already frames itself — a square viewBox of
// side `side`, plus the #pad translate that places the mark inside it.
const windows = await page.evaluate(
  ({ cut, maskBias, safeR }) => {
    const root = document.querySelector("svg") as SVGSVGElement;
    const pad = document.getElementById("pad") as unknown as SVGGElement;
    // Un-translate the mark and give it a 1:1 viewBox, so every measurement
    // below reads straight out in the mark's own coordinates.
    root.setAttribute("viewBox", "0 0 1000 1000");
    pad.setAttribute("transform", "translate(0 0)");

    const shapes = [
      ...root.querySelectorAll<SVGGeometryElement>(
        "#pad path, #pad ellipse, #pad circle",
      ),
    ];
    // getBBox() is geometry-only, and getBoundingClientRect() agrees with it on
    // SVG, so the stroke has to be added back by hand: half a stroke width,
    // which is exact here because every cap and join in the mark is round.
    const outset = (el: SVGGeometryElement) => {
      const s = getComputedStyle(el as unknown as Element);
      return s.stroke === "none"
        ? 0
        : (Number.parseFloat(s.strokeWidth) || 0) / 2;
    };
    const strokeBox = (el: SVGGeometryElement) => {
      const b = el.getBBox();
      const o = outset(el);
      return {
        x: b.x - o,
        y: b.y - o,
        w: b.width + 2 * o,
        h: b.height + 2 * o,
      };
    };
    const boxes = shapes.map(strokeBox);
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const body = strokeBox(
      document.getElementById("body") as unknown as SVGPathElement,
    );

    // Every outline walked once, each point carrying its own element's stroke
    // outset — the points don't depend on the candidate centre, only the
    // distance to it does, and the ternary search below asks for ~100 centres.
    const samples = shapes.flatMap((el) => {
      const len = el.getTotalLength();
      const o = outset(el);
      const n = Math.max(64, Math.ceil(len / 2));
      return Array.from({ length: n + 1 }, (_, i) => {
        const p = el.getPointAtLength((len * i) / n);
        return { x: p.x, y: p.y, o };
      });
    });
    // Farthest painted point from a candidate centre. Drives the maskable safe
    // circle, so the sampling above is load-bearing on the shipped raster.
    const radius = (cx: number, cy: number) =>
      samples.reduce(
        (max, s) => Math.max(max, Math.hypot(s.x - cx, s.y - cy) + s.o),
        0,
      );

    const tileSide = body.w / cut.bodyFill;
    const tile = {
      side: tileSide,
      tx: tileSide / 2 - (body.x + body.w / 2),
      ty: tileSide * (1 - cut.floor) - bottom,
    };

    // Ternary search for the centre that minimises the enclosing radius, then
    // bias back toward the bounding-box centre for optical balance.
    const cx = (left + right) / 2;
    let lo = top;
    let hi = bottom;
    for (let i = 0; i < 50; i++) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (radius(cx, a) < radius(cx, b)) hi = b;
      else lo = a;
    }
    const bboxCy = (top + bottom) / 2;
    const cy = bboxCy + maskBias * ((lo + hi) / 2 - bboxCy);
    const maskSide = radius(cx, cy) / safeR;
    const maskable = {
      side: maskSide,
      tx: maskSide / 2 - cx,
      ty: maskSide / 2 - cy,
    };
    return {
      tile,
      maskable,
      markH: bottom - top,
      // The body's own edges inside the tile window, for the crop assert.
      bodyTop: body.y + tile.ty,
      bodyBottom: body.y + body.h + tile.ty,
    };
  },
  { cut: CUT, maskBias: MASK_BIAS, safeR: SAFE_R },
);

// The cut is allowed to crop the haunches, feet and ground bar — that bleed is
// the point — but never the head + body. Horizontally that holds by
// construction (the window's side *is* body.w / bodyFill); vertically nothing
// enforces it, so check it: a redraw that makes the silhouette taller relative
// to the body's width would otherwise slice the head off every tile, and the
// drift assert below would still pass, since it only compares the authored
// framing to the derived one.
const cropped = (
  [
    ["top", -windows.bodyTop],
    ["bottom", windows.bodyBottom - windows.tile.side],
  ] as const
).filter(([, over]) => over > 0);
if (cropped.length) {
  throw new Error(
    "the icon cut would crop the body, the one part it may never crop:\n" +
      cropped
        .map(([edge, over]) => `  ${over.toFixed(1)} units off the ${edge}`)
        .join("\n") +
      `\n  (body spans ${windows.bodyTop.toFixed(1)}..${windows.bodyBottom.toFixed(1)}` +
      ` in a ${windows.tile.side.toFixed(1)}-unit window)`,
  );
}

// icon.svg frames itself on the same cut, so the favicon and the manifest's SVG
// icon read like the PNG tiles rather than like the old floating mark. Those
// three numbers are the only hand-authored framing left, so assert them: an
// edit to the mark that moves the cut must not leave icon.svg on the old one.
const authored = [
  Number(/viewBox="0 0 ([\d.]+) \1"/.exec(svg)?.[1]),
  ...(
    /id="pad" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"/
      .exec(svg)
      ?.slice(1, 3) ?? []
  ).map(Number),
];
const wanted = [windows.tile.side, windows.tile.tx, windows.tile.ty];
if (wanted.some((v, i) => !(Math.abs(v - authored[i]) < 0.5))) {
  const [s, tx, ty] = wanted.map((v) => v.toFixed(1));
  throw new Error(
    "icon.svg frames itself on a stale cut — update it to:\n" +
      `  viewBox="0 0 ${s} ${s}"  and  #pad transform="translate(${tx} ${ty})"\n` +
      `  (it currently has ${authored.join(", ")})`,
  );
}

for (const t of targets) {
  const w = t.cut === "tile" ? windows.tile : windows.maskable;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.evaluate(
    ({ size, side, tx, ty, ground }) => {
      const root = document.querySelector("svg") as SVGSVGElement;
      root.setAttribute("viewBox", `0 0 ${side} ${side}`);
      root.setAttribute("width", String(size));
      root.setAttribute("height", String(size));
      const rect = document.getElementById(
        "ground",
      ) as unknown as SVGRectElement;
      rect.setAttribute("fill", ground);
      const pad = document.getElementById("pad") as unknown as SVGGElement;
      pad.setAttribute("transform", `translate(${tx} ${ty})`);
    },
    { size: t.size, side: w.side, tx: w.tx, ty: w.ty, ground: GROUND },
  );
  const el = await page.$("svg");
  if (!el) throw new Error(`icon.svg produced no <svg> element for ${t.file}`);
  await el.screenshot({ path: new URL(t.file, outDir).pathname });
  const tall = ((windows.markH / w.side) * 100).toFixed(0);
  console.log(
    `wrote apps/web/public/${t.file} (${t.size}px, ${t.cut} cut, mark ${tall}% tall)`,
  );
}

await browser.close();
