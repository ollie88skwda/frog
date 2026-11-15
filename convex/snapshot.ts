// Target snapshot builder (redesign §9.1). Pure — no Convex imports — so the
// core unit tests can import it directly. Written once per session block at
// session start by `sessions:startFromRoutine`; coach rules (C1/C2c/C4/C5/C14)
// judge a finished session against this, not against the routine as it later
// evolves. Pre-snapshot rows are never backfilled (§9.1 "Backfill policy").

/** The routine_sets columns the snapshot reads. */
export type SnapshotSetInput = {
  setNo: number;
  setType: string;
  targetWeightKg: number | null;
  targetReps: number | null;
  targetRepsMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  deletedAt?: number | null;
};

/** Coach prescription (or deload overlay) overriding the routine's targets. */
export type SnapshotOverride = {
  plannedLoadKg?: number | null;
  plannedRepsMin?: number | null;
  plannedRepsMax?: number | null;
  plannedRirMin?: number | null;
  plannedRirMax?: number | null;
  plannedSets?: number | null;
  plannedFirstSetMax?: boolean | null;
  plannedIsDeload?: boolean | null;
  prescriptionRuleId?: string | null;
};

export type TargetSnapshot = {
  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedRirMin: number | null;
  plannedRirMax: number | null;
  plannedSets: number | null;
  plannedLoadKg: number | null;
  plannedFirstSetMax: boolean | null;
  plannedIsDeload: boolean | null;
  prescriptionRuleId: string | null;
  snapshotSource: "start";
};

/**
 * Snapshot of one routine exercise's working-set targets. Warm-ups are
 * excluded (R17b: they are not hard sets). Reps/RIR/load come from the FIRST
 * working set — Oliver's top-set method puts the heaviest, hardest set first —
 * and a coach `override` wins field by field.
 */
export function buildSnapshot(
  sets: readonly SnapshotSetInput[],
  override: SnapshotOverride = {},
): TargetSnapshot {
  const working = sets
    .filter((s) => s.deletedAt == null && s.setType !== "warmup")
    .sort((a, b) => a.setNo - b.setNo);
  const first = working[0];
  const pick = <K extends keyof SnapshotOverride>(
    k: K,
    fallback: NonNullable<SnapshotOverride[K]> | null,
  ) => (override[k] !== undefined ? override[k] : fallback) ?? null;
  const repsMin = first?.targetReps ?? null;
  const rirMin = first?.targetRirMin ?? first?.targetRirMax ?? null;
  return {
    plannedRepsMin: pick("plannedRepsMin", repsMin) as number | null,
    plannedRepsMax: pick("plannedRepsMax", first?.targetRepsMax ?? repsMin) as
      | number
      | null,
    plannedRirMin: pick("plannedRirMin", rirMin) as number | null,
    plannedRirMax: pick("plannedRirMax", first?.targetRirMax ?? rirMin) as
      | number
      | null,
    plannedSets: pick(
      "plannedSets",
      working.length > 0 ? working.length : null,
    ) as number | null,
    plannedLoadKg: pick("plannedLoadKg", first?.targetWeightKg ?? null) as
      | number
      | null,
    plannedFirstSetMax: pick("plannedFirstSetMax", null) as boolean | null,
    plannedIsDeload: pick("plannedIsDeload", false) as boolean | null,
    prescriptionRuleId: pick("prescriptionRuleId", null) as string | null,
    snapshotSource: "start",
  };
}
