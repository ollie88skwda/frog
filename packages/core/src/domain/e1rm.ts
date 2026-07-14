// Epley estimated 1RM. Note: unreliable for high-rep isolation work; treat as a trend proxy, not a true max.
export function epley(weightKg: number, reps: number): number | null {
  if (!weightKg || !reps) return null;
  return weightKg * (1 + reps / 30);
}

/** RIR implied by an RPE value (RPE 10 = 0 RIR, RPE 8 = 2 RIR, …). */
export function rirFromRpe(rpe: number): number {
  return Math.max(0, 10 - rpe);
}

/**
 * Effort-aware estimated 1RM. Plain Epley assumes the set was taken to failure;
 * when the lifter left reps in reserve (RIR, or RPE where RIR ≈ 10 − RPE) the
 * true rep-max at that load is `reps + RIR`, so we project to failure before
 * applying Epley. This is the "calculator" behind the logged effort notes.
 * Falls back to plain Epley when no effort is recorded.
 */
export function e1rmFromEffort(
  weightKg: number | null,
  reps: number | null,
  effort?: { rir?: number | null; rpe?: number | null },
): number | null {
  if (!weightKg || !reps) return null;
  const rir =
    effort?.rir != null
      ? effort.rir
      : effort?.rpe != null
        ? rirFromRpe(effort.rpe)
        : 0;
  const effectiveReps = reps + Math.max(0, rir);
  return weightKg * (1 + effectiveReps / 30);
}
