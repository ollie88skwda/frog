import { useSyncExternalStore } from "react";

// Names whose create failed during a bulk add. Module state for the same
// reason as `pending-exercises.ts`: the run outlives the dialog and the screen
// — `mutateAsync` keeps dispatching (and retrying) after unmount, so holding
// this in component state would drop the notice, and the retry prefill behind
// it, for anyone who navigates away from the library mid-run.
let failed: readonly string[] = [];
let runsInFlight = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l();
}

// The queued names supersede the notice only if no earlier run is still
// dispatching — otherwise that run's failures would be dropped unseen.
export function startBulkAddRun() {
  if (runsInFlight === 0 && failed.length > 0) {
    failed = [];
    emit();
  }
  runsInFlight += 1;
}

export function finishBulkAddRun(names: string[]) {
  runsInFlight = Math.max(0, runsInFlight - 1);
  const fresh = names.filter((n) => !failed.includes(n));
  if (fresh.length === 0) return;
  failed = [...failed, ...fresh];
  emit();
}

export function useBulkAddFailures(): readonly string[] {
  return useSyncExternalStore(subscribe, () => failed);
}
