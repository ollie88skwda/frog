// Warm-up set calculator (Hevy-parity plan §C): percentage-based warm-up sets
// generated from a user-editable method, rounded to the equipment's step.

export type WarmupStep = { pct: number; reps: number };

// R17b [T5]: first heavy multi-joint lift ramps about 40% x 6 then about 80% x 3,
// well short of failure. Fully user-editable in settings; a saved custom method
// is never replaced by this default. (Replaced the Hevy-style 40x8/60x5/80x3.)
export const DEFAULT_WARMUP_METHOD: WarmupStep[] = [
  { pct: 0.4, reps: 6 },
  { pct: 0.8, reps: 3 },
];

// R17b: later main lifts get one ramp set at about 60-70% (T5 inference).
export const LATER_LIFT_WARMUP_METHOD: WarmupStep[] = [{ pct: 0.65, reps: 4 }];

export type WarmupRole = "first_heavy" | "later_main" | "isolation";

/**
 * R17b warm-up plan by the exercise's role in the session: first heavy lift
 * gets the full ramp (`method`, user-editable), later main lifts one 60-70%
 * step, isolation none. Warm-ups never count toward volume or hard sets.
 */
export function warmupPlan(
  workingWeightKg: number,
  role: WarmupRole,
  method: WarmupStep[] = DEFAULT_WARMUP_METHOD,
  rounding: WarmupRounding = DEFAULT_WARMUP_ROUNDING,
  equipment?: string | null,
): WarmupSet[] {
  if (role === "isolation") return [];
  return warmupSets(
    workingWeightKg,
    role === "first_heavy" ? method : LATER_LIFT_WARMUP_METHOD,
    rounding,
    equipment,
  );
}

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
