import { useCallback, useSyncExternalStore } from "react";

export type Unit = "kg" | "lb";

// Display unit is a local device setting (weights are stored canonically in kg).
const KEY = "unit";
const listeners = new Set<() => void>();

function current(): Unit {
  return localStorage.getItem(KEY) === "kg" ? "kg" : "lb"; // default lb
}

function set(unit: Unit) {
  localStorage.setItem(KEY, unit);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useUnit(): { unit: Unit; setUnit: (u: Unit) => void } {
  const unit = useSyncExternalStore(subscribe, current);
  const setUnit = useCallback((u: Unit) => set(u), []);
  return { unit, setUnit };
}
