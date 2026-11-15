// Hard sets and fractional weekly volume per muscle.
// R6 [T4/T5]: a hard set is a working set (not a warm-up) logged at RIR <= 4;
//   indirect sets count fractionally; planning band ~10-20 fractional hard
//   sets per muscle per week (T5, a starting range, not a landmark).
// R7 [T4]: indirect weight 0.5. R7b [T5]: 2-5 direct hard sets per muscle per
//   session (planning only, never a growth rule).
// R17b: warm-ups never count. R11: RIR is an estimate, so a set with no RIR
//   still counts as hard, but its coverage is reported (`noRirCount`).
// One credit loop for the whole app: stats/aggregate.ts and share/builders.ts
// route through here instead of keeping their own copies.

import type { MuscleTarget } from "./anatomy";
import { roleAt } from "./anatomy";
import { type RirInput, rirMidpoint } from "./e1rm";
import { groupSetsBySetNo } from "./volume";

export const HARD_SET_MAX_RIR = 4; // R6 default; user_prefs.hardSetRirMax may override
export const INDIRECT_SET_WEIGHT = 0.5; // R7
export const WEEKLY_BAND: readonly [number, number] = [10, 20]; // R6 / C11
export const SESSION_DIRECT_BAND: readonly [number, number] = [2, 5]; // R7b

export type HardSetInput = {
  setNo?: number;
  side?: string | null;
  setType?: string | null;
  completed?: boolean;
} & RirInput;

export type HardSetOptions = { rirMax?: number };

/** R6: is this one row a hard set? `rirKnown` is false when no RIR/RPE is
 * logged (counted as hard by assumption, flagged for the coverage footnote). */
export function isHardSet(
  s: HardSetInput,
  opts: HardSetOptions = {},
): { hard: boolean; rirKnown: boolean } {
  const rirMax = opts.rirMax ?? HARD_SET_MAX_RIR;
  if (s.completed === false || s.setType === "warmup")
    return { hard: false, rirKnown: false };
  const rir = rirMidpoint(s);
  if (rir == null) return { hard: true, rirKnown: false };
  return { hard: rir <= rirMax, rirKnown: true };
}

export type HardSetCount = {
  /** Physical hard sets (a unilateral pair is one). */
  hard: number;
  /** Hard sets with no RIR logged (counted as hard, flagged). */
  rirUnknown: number;
  /** Physical sets left out (warm-up, uncompleted, RIR above the cap). */
  excluded: number;
};

/** Hard sets among set rows. Unilateral pairs (shared setNo) are one physical
 * set; a pair is hard if either side is (the harder side decides). */
export function hardSetCount(
  sets: (HardSetInput & { setNo: number })[],
  opts: HardSetOptions = {},
): HardSetCount {
  let hard = 0;
  let rirUnknown = 0;
  let excluded = 0;
  for (const group of groupSetsBySetNo(sets)) {
    const checks = group.map((s) => isHardSet(s, opts));
    if (checks.some((c) => c.hard)) {
      hard += 1;
      if (!checks.some((c) => c.hard && c.rirKnown)) rirUnknown += 1;
    } else excluded += 1;
  }
  return { hard, rirUnknown, excluded };
}

export type MuscleCredit = {
  muscle: string;
  credit: number;
  kind: "direct" | "indirect";
};

/** Credit one hard set gives each muscle: primary (explicit role, or index 0
 * under the back-compat rule) 1.0 direct, every other target 0.5 indirect. */
export function creditsFor(
  targets: readonly MuscleTarget[] | null | undefined,
): MuscleCredit[] {
  if (!targets?.length) return [];
  return targets.map((t, i) =>
    roleAt(targets, i) === "primary"
      ? { muscle: t.muscle, credit: 1, kind: "direct" as const }
      : {
          muscle: t.muscle,
          credit: INDIRECT_SET_WEIGHT,
          kind: "indirect" as const,
        },
  );
}

export type MuscleHardSets = {
  muscle: string;
  direct: number;
  indirect: number;
  /** direct + indirect (indirect already weighted 0.5). */
  total: number;
  /** Hard sets feeding this muscle with no RIR logged (credit-weighted). */
  noRirCount: number;
};

export type FractionalResult = {
  muscles: MuscleHardSets[];
  byMuscle: Record<string, MuscleHardSets>;
  /** Hard sets on exercises with no muscle map (so weekly numbers are never
   * silently low). */
  unmapped: number;
  /** Total physical hard sets counted, and how many had no RIR. */
  hardSets: number;
  noRirSets: number;
};

export type HardSetBlock = {
  targets: readonly MuscleTarget[] | null | undefined;
  sets: (HardSetInput & { setNo: number })[];
};

/** Fractional hard sets per muscle over any set of blocks (a session, a week). */
export function fractionalHardSets(
  blocks: HardSetBlock[],
  opts: HardSetOptions = {},
): FractionalResult {
  const byMuscle: Record<string, MuscleHardSets> = {};
  let unmapped = 0;
  let hardSets = 0;
  let noRirSets = 0;
  for (const b of blocks) {
    const c = hardSetCount(b.sets, opts);
    hardSets += c.hard;
    noRirSets += c.rirUnknown;
    if (c.hard === 0) continue;
    const credits = creditsFor(b.targets);
    if (!credits.length) {
      unmapped += c.hard;
      continue;
    }
    for (const { muscle, credit, kind } of credits) {
      let m = byMuscle[muscle];
      if (!m) {
        m = { muscle, direct: 0, indirect: 0, total: 0, noRirCount: 0 };
        byMuscle[muscle] = m;
      }
      const v = c.hard * credit;
      if (kind === "direct") m.direct += v;
      else m.indirect += v;
      m.total += v;
      m.noRirCount += c.rirUnknown * credit;
    }
  }
  const muscles = Object.values(byMuscle).sort((a, b) => b.total - a.total);
  return { muscles, byMuscle, unmapped, hardSets, noRirSets };
}

/** R6/C11 weekly planning band: <10 below, 10 up to (not incl.) 20 in, 20+ over
 * (C11 blocks adds at >= 20). A starting range, never a validated landmark. */
export function weeklyBand(fractional: number): "below" | "in" | "over" {
  if (fractional < WEEKLY_BAND[0]) return "below";
  if (fractional < WEEKLY_BAND[1]) return "in";
  return "over";
}

/** R7b planning check on direct hard sets of one muscle in one session. */
export function sessionDirectCheck(direct: number): "low" | "ok" | "high" {
  if (direct < SESSION_DIRECT_BAND[0]) return "low";
  if (direct > SESSION_DIRECT_BAND[1]) return "high";
  return "ok";
}
