// Rest-stopwatch model: pure state math; the UI owns the ticking. Auto-starts
// when a set is completed; suppressed when the NEXT set is a drop set.

export type RestTimerState = {
  startedAt: number; // ms epoch
};

export function startRest(now: number): RestTimerState {
  return { startedAt: now };
}

/**
 * Whether completing a set should start the rest stopwatch: suppressed when
 * the next set is a drop set (back-to-back weight reductions, no rest by
 * definition).
 */
export function shouldStartRest(
  nextSetType: string | null | undefined,
): boolean {
  return nextSetType !== "drop";
}
