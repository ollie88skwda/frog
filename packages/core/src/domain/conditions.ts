import { SEED_CONDITIONS } from "../db/seed-ids";

// The conditions a brand-new user tracks before customizing anything. Kept in
// code (not a DB seed) so it's renameable and testable without a migration.
// Decided with the user: keep it minimal — Sleep + Stress.
export const DEFAULT_TRACKED_CONDITIONS: string[] = [
  SEED_CONDITIONS.sleepH,
  SEED_CONDITIONS.stress,
];

export type TrackPref = { metricId: string; tracked: boolean };

/**
 * Whether a condition is currently tracked (pre-loaded into new sessions).
 * An explicit preference row wins; absent one, a metric is tracked iff it's a
 * default. So a new user (no prefs) sees the defaults, and untracking a default
 * writes a `tracked:false` row that hides it — distinguishable from "new".
 */
export function isConditionTracked(
  metricId: string,
  prefs: TrackPref[],
  defaults: string[] = DEFAULT_TRACKED_CONDITIONS,
): boolean {
  const pref = prefs.find((p) => p.metricId === metricId);
  if (pref) return pref.tracked;
  return defaults.includes(metricId);
}
