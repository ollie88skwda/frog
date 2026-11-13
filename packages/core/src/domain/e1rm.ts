// Strength estimates (COACH-LOGIC "Computation defaults", C2c-e1rm).
//
// Brzycki with RIR: e1RM = load x 36 / (37 - total), total = reps + RIR.
// Valid up to 10 total reps (Mayhew 1995); a set over 10 total reps is
// flagged and never used. Computed unrounded; display to 0.5 kg.
// `epley` stays exported for legacy callers only (J7/J8 migrate the two web
// call sites); nothing in packages/core uses it any more.

/** Legacy Epley estimate. Reps only, no RIR, no 10-rep cap. Do not add callers. */
export function epley(weightKg: number, reps: number): number | null {
  if (!weightKg || !reps) return null;
  return weightKg * (1 + reps / 30);
}

/** RIR implied by an RPE value (RPE 10 = 0 RIR, RPE 8 = 2 RIR, …). */
export function rirFromRpe(rpe: number): number {
  return Math.max(0, 10 - rpe);
}

/** C2c-e1rm: highest total reps (reps + RIR) the estimate is valid for. */
export const E1RM_MAX_TOTAL_REPS = 10;

/** Brzycki: load x 36 / (37 - totalReps). Null when it is undefined (no load,
 * under 1 total rep, or 37+). Does not apply the 10-rep cap; see e1rmSet. */
export function brzycki(loadKg: number, totalReps: number): number | null {
  if (!(loadKg > 0) || !(totalReps >= 1) || totalReps >= 37) return null;
  return (loadKg * 36) / (37 - totalReps);
}

/** Display rounding for e1RM: nearest 0.5 kg (compute unrounded, round once). */
export function roundE1rmDisplay(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/** Effort fields a stored set may carry. Any subset may be present. */
export type RirInput = {
  rir?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
  rpe?: number | null;
};

/** RIR used for estimation: range midpoint, else the legacy scalar, else RPE
 * (10 - RPE), else null. Never rounded. */
export function rirMidpoint(e: RirInput | null | undefined): number | null {
  if (!e) return null;
  if (e.rirMin != null || e.rirMax != null) {
    const lo = e.rirMin ?? (e.rirMax as number);
    const hi = e.rirMax ?? (e.rirMin as number);
    return (lo + hi) / 2;
  }
  if (e.rir != null) return e.rir;
  if (e.rpe != null) return rirFromRpe(e.rpe);
  return null;
}

export type SetE1rmQuality =
  | "ok"
  | "assumed_rir0" // no RIR logged: treated as 0 (a lower bound), flagged
  | "over_10_total_reps" // reps + RIR > 10: flagged, value null
  | "invalid"; // no load / no reps

export type SetE1rm = {
  /** Unrounded estimate, or null when flagged over 10 total reps / invalid. */
  value: number | null;
  /** True when the set was refused for exceeding 10 total reps (C2c). */
  flagged: boolean;
  /** True when RIR was missing and 0 was assumed. */
  noRir: boolean;
  totalReps: number | null;
  rirUsed: number | null;
  quality: SetE1rmQuality;
  weightKg: number | null;
};

/**
 * e1RM of one set (C2c-e1rm). `effort` is a plain RIR number, or an object with
 * any of rir / rirMin / rirMax / rpe (see rirMidpoint). A missing RIR is treated
 * as 0 and reported through `noRir` / quality `assumed_rir0`.
 */
export function e1rmSet(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
  effort?: number | RirInput | null,
): SetE1rm {
  const invalid: SetE1rm = {
    value: null,
    flagged: false,
    noRir: false,
    totalReps: null,
    rirUsed: null,
    quality: "invalid",
    weightKg: weightKg ?? null,
  };
  if (!(weightKg != null && weightKg > 0) || !(reps != null && reps >= 1))
    return invalid;
  const rirMid =
    typeof effort === "number" ? effort : rirMidpoint(effort ?? null);
  const noRir = rirMid == null;
  const rirUsed = Math.max(0, rirMid ?? 0);
  const totalReps = reps + rirUsed;
  if (totalReps > E1RM_MAX_TOTAL_REPS)
    return {
      value: null,
      flagged: true,
      noRir,
      totalReps,
      rirUsed,
      quality: "over_10_total_reps",
      weightKg,
    };
  const value = brzycki(weightKg, totalReps);
  if (value == null) return { ...invalid, totalReps, rirUsed };
  return {
    value,
    flagged: false,
    noRir,
    totalReps,
    rirUsed,
    quality: noRir ? "assumed_rir0" : "ok",
    weightKg,
  };
}

/** Same as e1rmSet for a stored set row. */
export function e1rmOfSet(
  s: { weightKg: number | null; reps: number | null } & RirInput,
): SetE1rm {
  return e1rmSet(s.weightKg, s.reps, s);
}

/**
 * Session e1RM: highest e1RM among the given WORKING sets (the caller drops
 * warm-ups) with 10 or fewer total reps. Null when no set qualifies.
 */
export function sessionE1rm(sets: SetE1rm[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.value == null) continue;
    if (best === null || s.value > best) best = s.value;
  }
  return best;
}
