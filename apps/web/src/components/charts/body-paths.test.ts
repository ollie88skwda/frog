import { MUSCLE_REGIONS } from "@frog/core";
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_PARTS,
  opacityFor,
  PART,
  regionSetsOf,
  VIEW_REGIONS,
} from "./body-paths";

// ── Geometry sanity ──────────────────────────────────────────────────────────
// The frog figure's region parts are hand-authored paths that tile edge-to-edge
// (adjacent parts may share edges/corners, never positive area): overlapping
// fills would paint one region's accent over its neighbour's and muddy the
// heat readout. The checker below parses each path to a polygon (Q curves
// sampled) and looks for genuine overlap — proper edge crossings, or a vertex
// strictly inside another polygon (boundary touches excluded).

type Pt = [number, number];

function polyOf(d: string): Pt[] {
  const pts: Pt[] = [];
  const toks = d.match(/([MLQZmlqz]|-?\d+(?:\.\d+)?)/g);
  if (!toks) throw new Error(`unparseable path: ${d}`);
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  const next = () => parseFloat(toks[i++]!);
  while (i < toks.length) {
    const t = toks[i++]!;
    if (t === "M") {
      x = next();
      y = next();
      sx = x;
      sy = y;
    } else if (t === "L") {
      x = next();
      y = next();
      pts.push([x, y]);
    } else if (t === "Q") {
      const cxp = next();
      const cyp = next();
      const xp = next();
      const yp = next();
      for (let s = 1; s <= 32; s++) {
        const u = s / 32;
        const v = 1 - u;
        pts.push([
          v * v * x + 2 * v * u * cxp + u * u * xp,
          v * v * y + 2 * v * u * cyp + u * u * yp,
        ]);
      }
      x = xp;
      y = yp;
    } else if (t === "Z") {
      pts.push([sx, sy]);
    } else {
      throw new Error(`unexpected token ${t} in ${d}`);
    }
  }
  return pts;
}

const EPS = 1e-6;
const cross = (o: Pt, a: Pt, b: Pt) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const onSeg = (p: Pt, a: Pt, b: Pt) =>
  Math.abs(cross(a, b, p)) <= EPS &&
  p[0] >= Math.min(a[0], b[0]) - EPS &&
  p[0] <= Math.max(a[0], b[0]) + EPS &&
  p[1] >= Math.min(a[1], b[1]) - EPS &&
  p[1] <= Math.max(a[1], b[1]) + EPS;

function properCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const c1 = cross(a, b, c);
  const c2 = cross(a, b, d);
  const c3 = cross(c, d, a);
  const c4 = cross(c, d, b);
  if (
    Math.abs(c1) <= EPS ||
    Math.abs(c2) <= EPS ||
    Math.abs(c3) <= EPS ||
    Math.abs(c4) <= EPS
  )
    return false;
  return Math.sign(c1) !== Math.sign(c2) && Math.sign(c3) !== Math.sign(c4);
}

/** True when two parts overlap in positive area (shared edges/corners pass). */
function overlaps(a: string, b: string): boolean {
  const pa = polyOf(a);
  const pb = polyOf(b);
  for (let i = 0; i < pa.length; i++) {
    const a1 = pa[i]!;
    const a2 = pa[(i + 1) % pa.length]!;
    for (let j = 0; j < pb.length; j++) {
      const b1 = pb[j]!;
      const b2 = pb[(j + 1) % pb.length]!;
      if (properCross(a1, a2, b1, b2)) return true;
    }
  }
  const inside = (pt: Pt, poly: Pt[]) => {
    for (let j = 0; j < poly.length; j++) {
      if (onSeg(pt, poly[j]!, poly[(j + 1) % poly.length]!)) return false;
    }
    let inr = false;
    for (let j = poly.length - 1, k = 0; k < poly.length; j = k++) {
      const [xi, yi] = poly[k]!;
      const [xj, yj] = poly[j]!;
      if (yi > pt[1] !== yj > pt[1]) {
        const ix = ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
        if (pt[0] < ix) inr = !inr;
      }
    }
    return inr;
  };
  for (const p of pa) if (inside(p, pb)) return true;
  for (const p of pb) if (inside(p, pa)) return true;
  return false;
}

describe("body-paths geometry", () => {
  it("references only parts that exist, and every part is used", () => {
    for (const view of Object.values(VIEW_REGIONS)) {
      for (const parts of Object.values(view)) {
        for (const part of parts!) expect(PART[part]).toBeDefined();
      }
    }
    const used = new Set(
      Object.values(VIEW_REGIONS).flatMap((v) => Object.values(v).flat()),
    );
    for (const name of Object.keys(PART)) expect(used.has(name)).toBe(true);
  });

  it("covers every muscle region across the two views", () => {
    for (const region of MUSCLE_REGIONS) {
      const seen = Object.values(VIEW_REGIONS).some((v) => v[region]?.length);
      expect(seen, `${region} must appear in some view`).toBe(true);
    }
  });

  it("front carries chest/core, back carries back and no core", () => {
    expect(VIEW_REGIONS.front.chest).toHaveLength(1);
    expect(VIEW_REGIONS.front.core).toHaveLength(1);
    expect(VIEW_REGIONS.front.back).toBeUndefined();
    expect(VIEW_REGIONS.back.back).toHaveLength(1);
    expect(VIEW_REGIONS.back.core).toBeUndefined();
  });

  it("has no positive-area overlap between any parts of a view", () => {
    for (const [view, regions] of Object.entries(VIEW_REGIONS)) {
      const parts = [
        ...NEUTRAL_PARTS,
        ...Object.values(regions).flatMap((p) => p!.map((name) => PART[name]!)),
      ];
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          expect(
            overlaps(parts[i]!, parts[j]!),
            `${view}: "${parts[i]}" overlaps "${parts[j]}"`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("opacityFor", () => {
  it("scales 0 → 0.85 within max, cap at max", () => {
    expect(opacityFor(0, 10)).toBe(0);
    expect(opacityFor(5, 10)).toBeCloseTo(0.5);
    expect(opacityFor(10, 10)).toBeCloseTo(0.85);
    expect(opacityFor(20, 10)).toBeCloseTo(0.85);
  });
});

describe("regionSetsOf", () => {
  it("rolls muscles up to their coarse regions and ignores unknowns", () => {
    expect(
      regionSetsOf({ quads: 3, hamstrings: 2, pecs: 4, "not-a-muscle": 9 }),
    ).toEqual({
      chest: 4,
      back: 0,
      legs: 5,
      shoulders: 0,
      arms: 0,
      core: 0,
    });
  });
});
