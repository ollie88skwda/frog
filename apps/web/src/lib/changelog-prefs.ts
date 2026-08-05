import { latestChangelogDate } from "virtual:changelog-latest";
import { useSyncExternalStore } from "react";

// Dev-facing changelog (docs/DECISIONS.md 2026-08-04): tracks the
// last-visited marker (an ISO YYYY-MM-DD date) so the nav badge can tell when
// the log has grown a newer entry since the captain last opened /changelog.
// Device-local only — single-user dev tooling, same pattern as
// lib/workout-prefs.ts / lib/lessons.ts, no server round trip.

const KEY = "changelogLastSeen";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit() {
  for (const l of listeners) l();
}

export function getChangelogLastSeen(): string | null {
  return localStorage.getItem(KEY);
}

export function markChangelogSeen(date: string) {
  localStorage.setItem(KEY, date);
  emit();
}

export function useChangelogLastSeen(): string | null {
  return useSyncExternalStore(subscribe, getChangelogLastSeen);
}

/** Drives the nav badge dot: true once docs/DECISIONS.md's newest entry
 * postdates the stored last-visited marker (including "never visited"). */
export function useChangelogHasUnseen(): boolean {
  const lastSeen = useChangelogLastSeen();
  if (latestChangelogDate == null) return false;
  return lastSeen == null || lastSeen < latestChangelogDate;
}
