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

  const byNo = new Map(performed.map((p) => [p.setNo, p]));
  let all = true;
  let any = false;
  for (const t of working) {
    const p = byNo.get(t.setNo);
    if (!p || p.reps == null) {
      all = false;
      continue;
    }
    any = true;
    const weightOk =
      t.targetWeightKg == null ||
      (p.weightKg != null && p.weightKg >= t.targetWeightKg);
    if (!(weightOk && p.reps >= (t.targetRepsMax as number))) all = false;
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
    const current = byNo.get(t.setNo)?.weightKg ?? t.targetWeightKg ?? null;
    if (current == null) return null;
    return all ? current + step : current;
  });

  return {
    advance: all,
    nextWeightKg,
    status: all ? "progressing" : "maintaining",
  };
}
