import type { Exercise } from "@sbl/core";
import { useSyncExternalStore } from "react";

// Exercises that exist only as an optimistic row: bulk add seeds every pasted
// name into the `["exercises"]` cache up front while the inserts run four at a
// time, so a row can be on screen for the whole run before its INSERT is even
// dispatched. `session_exercises.exercise_id` is a real FK, so anything that
// writes a reference to an exercise must wait for the row to land — the list
// itself can show it immediately. The row itself is held here (not just its
// id) so `useExercises` can re-apply it over any server payload that lands
// mid-run. Module state, not the query cache: it is about a write in flight,
// not about server data.
const pending = new Map<string, Exercise>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, Exercise> = new Map();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  snapshot = new Map(pending);
  for (const l of listeners) l();
}

export function markExercisesPending(rows: Exercise[]) {
  const added = rows.filter((r) => !pending.has(r.id));
  if (added.length === 0) return;
  for (const row of added) pending.set(row.id, row);
  emit();
}

// Called once the create settles either way: on success the row is real, on
// failure it has been rolled back out of the cache.
export function resolveExercisePending(id: string) {
  if (pending.delete(id)) emit();
}

export function usePendingExercises(): ReadonlyMap<string, Exercise> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
