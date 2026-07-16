// Warm-up set calculator (Hevy-parity plan §C): percentage-based warm-up sets
// generated from a user-editable method, rounded to the equipment's step.

export type WarmupStep = { pct: number; reps: number };

// Hevy-style default ramp; fully user-editable in settings.
export const DEFAULT_WARMUP_METHOD: WarmupStep[] = [
  { pct: 0.4, reps: 8 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
];

export type WarmupRounding = {
  /** Rounding step for bar-loaded lifts (e.g. 2.5 kg plates → 5 kg total). */
  barbellStepKg: number;
  /** Rounding step for dumbbells (e.g. 2 kg rack increments). */
  dumbbellStepKg: number;
};

export const DEFAULT_WARMUP_ROUNDING: WarmupRounding = {
  barbellStepKg: 2.5,
  dumbbellStepKg: 2,
};

export type WarmupSet = { weightKg: number; reps: number };

/**
 * Percentage-based warm-up sets for a working weight. Load-bearing exercises
 * only (duration exercises can only flag sets manually). Weights never round
 * below the step itself.
 */
export function warmupSets(
  workingWeightKg: number,
  method: WarmupStep[] = DEFAULT_WARMUP_METHOD,
  rounding: WarmupRounding = DEFAULT_WARMUP_ROUNDING,
  equipment?: string | null,
): WarmupSet[] {
  if (!(workingWeightKg > 0)) return [];
  const step =
    equipment === "dumbbell" ? rounding.dumbbellStepKg : rounding.barbellStepKg;
  return method.map((m) => ({
    weightKg: Math.max(
      step,
      Math.round((workingWeightKg * m.pct) / step) * step,
    ),
    reps: m.reps,
  }));
}
