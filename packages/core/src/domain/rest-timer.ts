// Rest-countdown model (Hevy-parity plan §C): pure state math; the UI owns
// the ticking. Auto-starts when a set is completed; suppressed when the NEXT
// set is a drop set; ±15s adjustments accumulate.

export type RestTimerState = {
  targetSec: number;
  startedAt: number; // ms epoch
  adjustSec: number; // net ±15s presses
};

export function startRest(targetSec: number, now: number): RestTimerState {
  return { targetSec, startedAt: now, adjustSec: 0 };
}

export function adjustRest(
  t: RestTimerState,
  deltaSec: number,
): RestTimerState {
  return { ...t, adjustSec: t.adjustSec + deltaSec };
}

export function restRemainingSec(t: RestTimerState, now: number): number {
  const elapsed = Math.floor((now - t.startedAt) / 1000);
  return t.targetSec + t.adjustSec - elapsed;
}

export function restDone(t: RestTimerState, now: number): boolean {
  return restRemainingSec(t, now) <= 0;
}

/**
 * Whether completing a set should start the rest countdown: needs a positive
 * per-exercise target, and is suppressed when the next set is a drop set
 * (back-to-back weight reductions, no rest by definition).
 */
export function shouldStartRest(
  restTargetSec: number | null | undefined,
  nextSetType: string | null | undefined,
): boolean {
  if (!restTargetSec || restTargetSec <= 0) return false;
  return nextSetType !== "drop";
}
