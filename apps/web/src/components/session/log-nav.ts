// Where the screen goes after Log. Pure so the rule is unit-tested:
//   - the exercise still has planned sets left  -> stay, ready for the next set
//   - otherwise, there is a following exercise  -> move to it
//   - otherwise (last exercise)                 -> stay
// Log never creates a set: the number of sets an exercise offers is
// planned + the ones the user added with "Add a set", nothing else.

export type AfterLog = "next-set" | "next-exercise" | "stay";

export function plannedSetCount(seedCount: number): number {
  // An exercise with no routine/plan still offers its first set.
  return Math.max(1, seedCount);
}

/** How many sets this exercise currently offers (logged + the open one). */
export function offeredSets(opts: {
  planned: number;
  added: number;
  committed: number;
}): number {
  return Math.max(opts.planned + opts.added, opts.committed);
}

/** True while an unlogged set is waiting for entry. */
export function hasOpenSet(opts: {
  planned: number;
  added: number;
  committed: number;
}): boolean {
  return opts.committed < opts.planned + opts.added;
}

export function afterLog(opts: {
  /** Sets logged INCLUDING the one just logged. */
  committedAfter: number;
  planned: number;
  added: number;
  hasNextExercise: boolean;
}): AfterLog {
  if (opts.committedAfter < opts.planned + opts.added) return "next-set";
  return opts.hasNextExercise ? "next-exercise" : "stay";
}
