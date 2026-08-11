import {
  type ExercisePref,
  type ExerciseType,
  formatPrevious,
  type GhostSet,
  type Laterality,
  type LoggedSet,
  type SetType,
  TYPE_FIELDS,
  toDisplayDistance,
  toDisplayWeight,
  unitLabel,
  weightLabel,
} from "@frog/core";
import { formatMMSS } from "@/lib/format";
import type { DistanceUnit, Unit } from "@/lib/settings";

// Types + formatters shared by the session screen (the ledger) and the logger
// drawer. They live here rather than in screens/session.tsx so the two halves
// of the split read/write design can import them without a cycle.

/** Which logging fields an exercise type shows, left→right. Weight first,
 * then distance, time, reps — the natural order for every type. */
export type ColKey = "weight" | "reps" | "duration" | "distance";
export type Column = { key: ColKey; header: string };

export function columnsFor(
  type: ExerciseType,
  unit: Unit,
  distUnit: DistanceUnit,
): Column[] {
  const f = TYPE_FIELDS[type];
  const cols: Column[] = [];
  if (f.weight)
    cols.push({ key: "weight", header: weightLabel(type, unitLabel(unit)) });
  if (f.distance) cols.push({ key: "distance", header: distUnit });
  if (f.duration) cols.push({ key: "duration", header: "time" });
  // Unilateral: the ᴸ/ᴿ markers already say "per side", so the header stays
  // "reps" (legacy alternating rows read as bilateral too).
  if (f.reps) cols.push({ key: "reps", header: "reps" });
  return cols;
}

/** mm:ss for a rest duration in whole seconds. */
export function formatRest(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * A prior performance as the reference string. Always through
 * `formatPrevious`, which owns the uneven-pair convention
 * (`40 kg × 8 / 35 kg × 8`) — reading a GhostSet's own weightKg/reps inline
 * silently drops the ᴿ side (AGENTS.md).
 */
export function previousText(g: GhostSet, unit: Unit): string | null {
  return formatPrevious(g, (kg) => String(toDisplayWeight(kg, unit)));
}

/** Committed-value formatter for one column (— when the field is empty). */
export function committedText(
  key: ColKey,
  set: LoggedSet,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (key) {
    case "weight":
      return set.weightKg != null
        ? String(toDisplayWeight(set.weightKg, unit))
        : "—";
    case "reps":
      return set.reps != null ? String(set.reps) : "—";
    case "duration":
      return set.durationSec != null ? formatMMSS(set.durationSec) : "—";
    case "distance":
      return set.distanceM != null
        ? String(toDisplayDistance(set.distanceM, distUnit))
        : "—";
  }
}

/** Target-value formatter for a routine/copy seed (rep range renders "6–8"). */
export function seedText(
  key: ColKey,
  seed: SeedSet,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (key) {
    case "weight":
      return seed.weightKg != null
        ? String(toDisplayWeight(seed.weightKg, unit))
        : "—";
    case "reps":
      if (seed.repsMax != null) return `${seed.reps ?? ""}–${seed.repsMax}`;
      return seed.reps != null ? String(seed.reps) : "—";
    case "duration":
      return seed.durationSec != null ? formatMMSS(seed.durationSec) : "—";
    case "distance":
      return seed.distanceM != null
        ? String(toDisplayDistance(seed.distanceM, distUnit))
        : "—";
  }
}

/** The stored per-exercise weight-unit override, null when unset/unreadable. */
export function weightUnitOverrideFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
): Unit | null {
  const override = prefs.find((p) => p.exerciseId === exerciseId)?.weightUnit;
  return override === "kg" || override === "lb" ? override : null;
}

/** A block's display weight unit: that override, else the session unit. */
export function blockUnitFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
  sessionUnit: Unit,
): Unit {
  return weightUnitOverrideFor(prefs, exerciseId) ?? sessionUnit;
}

/**
 * The four laterality states the logger offers per set (R2). `both` is a
 * single bilateral row; `left`/`right` a single one-sided row; `pair` the two
 * rows sharing one set_no that the data model calls a unilateral set.
 */
export type LatMode = "both" | "left" | "right" | "pair";

export const LAT_LABEL: Record<LatMode, string> = {
  both: "Both",
  left: "L",
  right: "R",
  pair: "L+R",
};

/** Context a commit hands up so the screen can run the PR check + rest
 * stopwatch without re-deriving per-block facts. */
export type CommitCtx = {
  exerciseType: ExerciseType;
  /** Planned type of the set that will follow (routine seed at the next
   * index), used for drop-set rest suppression. */
  nextSetType: string | null;
};

export type CommitInput = Omit<LoggedSet, "id" | "setNo" | "restSec"> & {
  metricValues?: Record<string, unknown> | null;
  restSec?: number | null;
  /** Present only for a unilateral pair: the right side's own values, written
   * as a second row sharing this commit's set_no. Set type, RIR/RPE, note and
   * metrics seed the right row from the left side at commit — one entry for
   * the symmetric case. Only set type stays shared afterwards. */
  otherSide?: {
    weightKg: number | null;
    reps: number | null;
    durationSec: number | null;
    distanceM: number | null;
  } | null;
};

export type SetPatch = {
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rir?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
  rpe?: number | null;
  note?: string | null;
  setType?: SetType;
  /**
   * Seconds rested AFTER this set — the measured stopwatch reading, stamped
   * on the set that earned it when the rest ends (redesign R1). Note this
   * inverts the pre-redesign attribution ("seconds rested before this set",
   * derived from commit timestamps); only per-exercise/per-session averages
   * consume it, so the aggregate is unchanged.
   */
  restSec?: number | null;
};

/**
 * Per-set-index seed for the logger: routine targets (weights/reps/rep-range
 * placeholder) OR the source sets when copying a workout.
 */
export type SeedSet = {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repsMax: number | null; // non-null ⇒ rep range (placeholder only)
  durationSec: number | null;
  distanceM: number | null;
  /** Per-set laterality override from the routine template. Null = fall
   * through to the exercise-level default. */
  laterality?: Laterality | null;
};
