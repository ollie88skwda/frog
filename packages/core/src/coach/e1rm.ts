import { MAX_E1RM_TOTAL_REPS } from "./constants";

/**
 * Brzycki on reps + RIR (C2c-e1rm): `load × 36 / (37 − (reps + RIR))`.
 * Computed unrounded, load multiplied first so exact cases stay exact
 * (97.5 × 36 / 30 = 117). Sets over 10 total reps are flagged and not used.
 * TODO(J1): re-export / delegate to `domain/e1rm.ts` e1rmSet once J1 merges
 * (same formula; keep this file the coach's only copy until then).
 */
export function brzycki(
  loadKg: number,
  reps: number,
  rir: number,
): { value: number; flagged: boolean } | null {
  const total = reps + Math.max(0, rir);
  if (!(loadKg > 0) || !(reps > 0) || total >= 37) return null;
  return {
    value: (loadKg * 36) / (37 - total),
    flagged: total > MAX_E1RM_TOTAL_REPS,
  };
}

/** Display precision for e1RM comparisons (0.5 kg). */
export function round05(x: number): number {
  return Math.round(x * 2) / 2;
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** `prev − cur` exceeds `frac × prev`, compared with a tolerance so an exact
 * boundary (117 vs 120 at 2.5 %) never fires on float noise. */
export function declinedMoreThan(
  prev: number,
  cur: number,
  frac: number,
): boolean {
  return prev - cur > frac * prev + 1e-9;
}
