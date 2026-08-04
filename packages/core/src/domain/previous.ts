// PREVIOUS-column resolver (Hevy-parity plan §C): what the user did for each
// set index last time, merged with the routine's target prescription for the
// current session. The PREVIOUS cell is a read-only reference + tap-to-fill;
// targets pre-populate the draft grid when a session starts from a routine.

import type { RoutineSet } from "../db/schema";
import type { GhostSet } from "../repo/types";

export type PreviousCell = {
  // Prior performance for this set index (null = never logged this index).
  previous: GhostSet | null;
  // Template target for this set index (null = ad-hoc set / empty workout).
  target: RoutineSet | null;
};

/**
 * Per set index: previous[i] comes from the prior performance (scope —
 * "any workout" vs "same routine" — is applied upstream when fetching the
 * ghost sets); target[i] from the routine template. Rows exist for
 * max(#previous, #targets, minRows).
 */
export function previousCells(
  prior: GhostSet[],
  targets: RoutineSet[],
  minRows = 0,
): PreviousCell[] {
  const n = Math.max(prior.length, targets.length, minRows);
  const cells: PreviousCell[] = [];
  for (let i = 0; i < n; i++) {
    cells.push({
      // Per-index match only: a newly added 5th set shows a blank PREVIOUS
      // until it has been logged once (unlike ghostFor's clamp-to-last).
      previous: prior[i] ?? null,
      target: targets[i] ?? null,
    });
  }
  return cells;
}

function formatOneSide(
  g: Omit<GhostSet, "otherSide">,
  formatWeight: (kg: number) => string,
): string | null {
  if (g.durationSec != null) {
    const m = Math.floor(g.durationSec / 60);
    const s = g.durationSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (g.weightKg == null && g.reps == null) return null;
  if (g.weightKg == null) return `${g.reps ?? 0} reps`;
  return `${formatWeight(g.weightKg)} × ${g.reps ?? 0}`;
}

/**
 * Formats a previous performance as the reference string ("100 kg × 8"). A
 * unilateral pair collapses to one string when both sides matched last time;
 * an uneven pair (an injury, a strength imbalance) shows both ("100 × 8 /
 * 90 × 6") rather than silently picking one side to represent the set.
 */
export function formatPrevious(
  g: GhostSet,
  formatWeight: (kg: number) => string,
): string | null {
  const left = formatOneSide(g, formatWeight);
  if (!g.otherSide) return left;
  const right = formatOneSide(g.otherSide, formatWeight);
  if (right == null || right === left) return left;
  return left == null ? right : `${left} / ${right}`;
}
