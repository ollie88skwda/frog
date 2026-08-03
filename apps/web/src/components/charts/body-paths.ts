import { type MuscleRegion, regionOf } from "@frog/core";

// Shared front/back figure geometry — the ONE copy of these path strings.
// `body-heatmap.tsx` (interactive SVG) and `lib/share/graphics.ts` (canvas
// signature graphic on the share card) both draw the same figure from this
// module rather than hand-copying path data a second time (AGENTS.md "Brand
// mark" tracks the repo's other hand-copy situations; this one doesn't join
// them). Local coordinates: x 0–72, y 0–152 per figure.

export const PART: Record<string, string> = {
  leftDelt: "M20,24 L28,25 L27,33 L18,33 Q16,28 20,24 Z",
  rightDelt: "M52,24 L44,25 L45,33 L54,33 Q56,28 52,24 Z",
  chest: "M26,25 L46,25 L47,44 L25,44 Z",
  core: "M25,44 L47,44 L45,74 L27,74 Z",
  upperBack: "M26,25 L46,25 L47,47 L25,47 Z",
  lowerBack: "M25,47 L47,47 L45,74 L27,74 Z",
  leftUpperArm: "M18,33 L26,34 L24,58 L15,57 Z",
  rightUpperArm: "M54,33 L46,34 L48,58 L57,57 Z",
  leftForearm: "M15,57 L24,58 L22,82 L13,80 Z",
  rightForearm: "M57,57 L48,58 L50,82 L59,80 Z",
  leftThigh: "M27,74 L35,74 L33,110 L24,108 Z",
  rightThigh: "M37,74 L45,74 L48,108 L39,110 Z",
  leftShin: "M24,108 L33,110 L31,148 L23,146 Z",
  rightShin: "M48,108 L39,110 L41,148 L49,146 Z",
};

export const ARMS = [
  "leftUpperArm",
  "rightUpperArm",
  "leftForearm",
  "rightForearm",
];
export const LEGS = ["leftThigh", "rightThigh", "leftShin", "rightShin"];

export type BodyView = "front" | "back";

export const VIEW_REGIONS: Record<
  BodyView,
  Partial<Record<MuscleRegion, string[]>>
> = {
  front: {
    shoulders: ["leftDelt", "rightDelt"],
    chest: ["chest"],
    core: ["core"],
    arms: ARMS,
    legs: LEGS,
  },
  back: {
    shoulders: ["leftDelt", "rightDelt"],
    back: ["upperBack", "lowerBack"],
    arms: ARMS,
    legs: LEGS,
  },
};

// Head + neck: neutral outline, never a region.
export const NEUTRAL_PARTS = [
  "M28,11 A8,8 0 1,1 44,11 A8,8 0 1,1 28,11 Z", // head
  "M32,18 L40,18 L40,23 L32,23 Z", // neck
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
