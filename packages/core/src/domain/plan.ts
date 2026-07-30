// "Today's plan" — which pre-saved routine to offer next.
//
// Frog's premise is that you never build a session during your workout: the
// work is pre-built, and opening the app should already know what today is.
// This module answers that from data the app already has — routine order plus
// session provenance (`sessions.routine_id`) — with no new tables and no
// stored "current day" cursor to drift out of sync with what you actually did.
//
// **One rule, deliberately.** The Trainer dashboard already shipped a
// "next workout" for the active program: the routine whose last completion is
// oldest, never-completed first, ties broken by position. The Home hero uses
// this same function rather than a second, subtly different definition — two
// screens disagreeing about what today is would be a real bug, and this repo
// has been bitten by parallel unreconciled implementations before (see the
// AGENTS.md note on the two exercise matchers).
//
// The rule self-heals: skip leg day and it stays the most neglected, so it is
// what you are offered next. An authored A/B/C order still emerges naturally
// from a completed cycle, because the one you did longest ago is the one that
// comes round again.
//
// Only *completed* sessions count. An abandoned session is not a workout, and
// letting one mark a routine "done" would silently skip it in the rotation.
//
// Everything here is a pure function over plain data, so it unit-tests without
// a database.

/** A routine as the planner needs it. Input order is the display order — the
 *  repo returns routines sorted by position, and ties fall back to it. */
export type PlanRoutine = {
  id: string;
  /** null = unfiled. A program owns exactly one folder. */
  folderId: string | null;
};

/** A session, as far as provenance goes. `routineId` null = empty workout;
 *  `endedAt` null = still running or abandoned. */
export type PlanHistoryEntry = {
  routineId: string | null;
  endedAt: number | null;
};

/** When each routine was last *completed*. Soft-deleted sessions must already
 *  be filtered out by the caller (the repo's list methods do). */
export function lastPerformedByRoutine(
  history: readonly PlanHistoryEntry[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of history) {
    if (s.routineId == null || s.endedAt == null) continue;
    const prev = out.get(s.routineId);
    if (prev == null || s.endedAt > prev) out.set(s.routineId, s.endedAt);
  }
  return out;
}

/**
 * The routine to offer next, or null when nothing is pre-saved.
 *
 * `programFolderId` is the active program's folder: while that folder still has
 * live routines the choice is confined to them, so an active program's split
 * doesn't get interrupted by a stray one-off routine. A program whose routines
 * were all deleted falls back to the whole shelf rather than suggesting
 * nothing.
 */
export function suggestRoutineId(
  routines: readonly PlanRoutine[],
  lastPerformed: ReadonlyMap<string, number>,
  programFolderId?: string | null,
): string | null {
  const inProgram =
    programFolderId == null
      ? []
      : routines.filter((r) => r.folderId === programFolderId);
  const pool = inProgram.length > 0 ? inProgram : routines;
  if (pool.length === 0) return null;

  // Longest-neglected wins; never-completed sorts oldest. The comparison is
  // strict, so ties keep the earlier display position.
  let best = pool[0];
  let bestAt = lastPerformed.get(best.id) ?? 0;
  for (const r of pool) {
    const at = lastPerformed.get(r.id) ?? 0;
    if (at < bestAt) {
      best = r;
      bestAt = at;
    }
  }
  return best.id;
}
