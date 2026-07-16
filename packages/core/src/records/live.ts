// Live PR check for the in-session banner (plan §C): pure and hot-path safe —
// reads a cached bests snapshot, no network, no allocation churn. Only
// set-scoped PR types fire live; session-scoped ones finalize at save.

import { setPrCandidates } from "./records";
import type { ExerciseRecords, PrType, RecordsSetInput } from "./types";

export type PrHit = { prType: PrType; value: number; previous: number };

/**
 * Which set-scoped PR types this completed set beats. First-ever log of an
 * exercise (no snapshot entry) never fires; ties never fire.
 */
export function checkSetForPR(
  snapshot: ExerciseRecords | undefined,
  exerciseType: string,
  set: RecordsSetInput,
): PrHit[] {
  if (!snapshot) return [];
  const cand = setPrCandidates(exerciseType, set);
  const hits: PrHit[] = [];
  for (const [t, v] of Object.entries(cand) as [PrType, number][]) {
    const best = snapshot.bests[t];
    if (best && v > best.value)
      hits.push({ prType: t, value: v, previous: best.value });
  }
  return hits;
}
