import { useSyncExternalStore } from "react";

// Ids of exercises that exist only as an optimistic row: bulk add seeds every
// pasted name into the `["exercises"]` cache up front while the inserts run
// four at a time, so a row can be on screen for the whole run before its INSERT
// is even dispatched. `session_exercises.exercise_id` is a real FK, so anything
// that writes a reference to an exercise must wait for the row to land — the
// list itself can show it immediately. Module state, not the query cache: it is
// about a write in flight, not about server data.
const pending = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  snapshot = new Set(pending);
  for (const l of listeners) l();
}

export function markExercisesPending(ids: string[]) {
  const added = ids.filter((id) => !pending.has(id));
  if (added.length === 0) return;
  for (const id of added) pending.add(id);
  emit();
}

// Called once the create settles either way: on success the row is real, on
// failure it has been rolled back out of the cache.
export function resolveExercisePending(id: string) {
  if (pending.delete(id)) emit();
}

export function usePendingExercises(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
