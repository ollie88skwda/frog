// Progressive-overload rule (Hevy-parity plan §C, master-spec Trainer):
// advance the working weight ONLY when the top of the rep range was hit on
// ALL prescribed sets at the current weight; otherwise repeat it. Step size
// follows the equipment.

import type { RoutineSet } from "../db/schema";

export type PerformedSet = {
  setNo: number;
  weightKg: number | null;
  reps: number | null;
  setType?: string;
};

export type OverloadResult = {
  /** True when every rep-range set hit its top at (or above) target weight. */
  advance: boolean;
  /** Suggested next working weight per set index (kg), null = keep/unknown. */
  nextWeightKg: Array<number | null>;
  status: "progressing" | "maintaining" | "no_data";
};

// A unilateral set advances only when BOTH sides hit the target, so every
// performed row sharing a set_no (a unilateral pair) has to clear the target
// on its own — weight and reps are independent conditions and folding the
// pair to one row before the check would let one side cover for the other.
// The suggested next weight is a single number, so it comes off the lightest
// row of the pair: the side that has the furthest to climb.
function lightestWeightKg(rows: PerformedSet[] | undefined): number | null {
  let min: number | null = null;
  for (const r of rows ?? []) {
    if (r.weightKg == null) continue;
    if (min == null || r.weightKg < min) min = r.weightKg;
  }
  return min;
}

export function overloadStepKg(equipment: string | null | undefined): number {
  switch (equipment) {
    case "dumbbell":
      return 2;
    case "barbell":
    case "ez_bar":
      return 2.5;
    case "machine":
    case "cable":
      return 5;
    default:
      return 2.5;
  }
}

export function nextPrescription(
  targets: Pick<
    RoutineSet,
    "setNo" | "setType" | "targetWeightKg" | "targetReps" | "targetRepsMax"
  >[],
  performed: PerformedSet[],
  equipment: string | null | undefined,
): OverloadResult {
  const working = targets.filter(
    (t) => t.setType === "normal" && t.targetRepsMax != null,
  );
  if (!working.length)
    return {
      advance: false,
      nextWeightKg: targets.map(() => null),
      status: "no_data",
    };

  const byNo = new Map<number, PerformedSet[]>();
  for (const p of performed) {
    const rows = byNo.get(p.setNo);
    if (rows) rows.push(p);
    else byNo.set(p.setNo, [p]);
  }
  let all = true;
  let any = false;
  for (const t of working) {
    const rows = byNo.get(t.setNo);
    if (!rows?.length || rows.some((p) => p.reps == null)) {
      all = false;
      continue;
    }
    any = true;
    const hit = rows.every((p) => {
      const weightOk =
        t.targetWeightKg == null ||
        (p.weightKg != null && p.weightKg >= t.targetWeightKg);
      return weightOk && (p.reps as number) >= (t.targetRepsMax as number);
    });
    if (!hit) all = false;
  }
  if (!any)
    return {
      advance: false,
      nextWeightKg: targets.map(() => null),
      status: "no_data",
    };

  const step = overloadStepKg(equipment);
  const nextWeightKg = targets.map((t) => {
    if (t.setType !== "normal" || t.targetRepsMax == null) return null;
    const current =
      lightestWeightKg(byNo.get(t.setNo)) ?? t.targetWeightKg ?? null;
    if (current == null) return null;
    return all ? current + step : current;
  });

  return {
    advance: all,
    nextWeightKg,
    status: all ? "progressing" : "maintaining",
  };
}
