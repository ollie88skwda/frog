import { type MuscleRegion, regionOf } from "@frog/core";

// Shared front/back frog figure geometry — the ONE copy of these path strings.
// `body-heatmap.tsx` (interactive SVG) and `lib/share/graphics.ts` (canvas
// signature graphic on the share card) both draw the same figure from this
// module rather than hand-copying path data a second time (AGENTS.md "Brand
// mark" tracks the repo's other hand-copy situations; this one doesn't join
// them). Local coordinates: x 0–72, y 0–132 per figure (figure content
// y 24–118; the interactive SVG's viewBox is 168×132 — two figures at
// xOffset 2 and 90, label at y 126).
//
// The figure is a faceless squatting-frog schematic, head-on in the mark's
// sitting pose (docs/brand/frog-brand-identity.html "The mark"): two eye-hump
// silhouette bumps, a wide body, front legs hanging at the sides (arms), big
// haunches at the bottom corners (legs), and the mark's ground bar. Deliberately
// NO eyes/mouth/nostrils — a data figure may borrow the mark's silhouette, never
// the mascot's face (docs/DECISIONS.md 2026-08-08, frog-heatmap entry;
// frog-brand-identity.html §13). Still legibility-first: blocky on purpose so
// the region a set lands in is unmistakable, and region parts tile edge-to-edge
// with zero positive-area overlap (guarded by body-paths.test.ts).

export const PART: Record<string, string> = {
  leftShoulder: "M8,44 L16,44 L16,64 L8,64 Z",
  rightShoulder: "M64,44 L56,44 L56,64 L64,64 Z",
  chest: "M16,44 L56,44 L56,64 L16,64 Z",
  core: "M16,64 L56,64 L54,90 L18,90 Z",
  back: "M16,44 L56,44 L56,90 L16,90 Z",
  leftArm: "M8,64 L16,64 L15,90 L9,90 Z",
  rightArm: "M64,64 L56,64 L57,90 L63,90 Z",
  leftLeg: "M10,90 L34,90 L34,102 Q34,114 22,114 Q10,112 10,100 Z",
  rightLeg: "M62,90 L38,90 L38,102 Q38,114 50,114 Q62,112 62,100 Z",
};

export const ARMS = ["leftArm", "rightArm"];
export const LEGS = ["leftLeg", "rightLeg"];

export type BodyView = "front" | "back";

export const VIEW_REGIONS: Record<
  BodyView,
  Partial<Record<MuscleRegion, string[]>>
> = {
  front: {
    shoulders: ["leftShoulder", "rightShoulder"],
    chest: ["chest"],
    core: ["core"],
    arms: ARMS,
    legs: LEGS,
  },
  back: {
    shoulders: ["leftShoulder", "rightShoulder"],
    back: ["back"],
    arms: ARMS,
    legs: LEGS,
  },
};

// Head (eye-hump silhouette) + the mark's ground bar: neutral, never a region.
export const NEUTRAL_PARTS = [
  "M27,44 L27,38 L30,38 L32,24 L36,33 L40,24 L42,38 L45,38 L45,44 Z", // head
  "M8,114 L64,114 L64,118 L8,118 Z", // ground bar
];

export const REGION_ORDER: MuscleRegion[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "legs",
];

export function opacityFor(value: number, max: number): number {
  if (value <= 0) return 0;
  return 0.15 + 0.7 * Math.min(1, value / max);
}

/** Roll per-muscle set counts up to the six coarse regions. */
export function regionSetsOf(
  muscleSets: Record<string, number>,
): Record<MuscleRegion, number> {
  const out = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
    core: 0,
  } as Record<MuscleRegion, number>;
  for (const [muscle, n] of Object.entries(muscleSets)) {
    const region = regionOf(muscle);
    if (region) out[region] += n;
  }
  return out;
}
