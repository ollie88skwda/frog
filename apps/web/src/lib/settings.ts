import type { UserPrefs, UserPrefsPatch } from "@frog/core";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useUpdateUserPrefs, useUserPrefs } from "./profile-queries";
import { registerUserScopedReset } from "./user-scoped-state";

export type Unit = "kg" | "lb";
export type DistanceUnit = "km" | "mi";
export type MeasurementUnit = "cm" | "in";

// Display units follow the ACCOUNT (user_prefs.weightUnit / distanceUnit /
// measurementUnit, 2026-11-25): an iOS Home Screen app has its own storage, so
// a per-browser setting silently reverted there. Weights are still stored
// canonically in kg, distances in meters, circumferences in cm; the unit is
// only a render choice. localStorage is a fast cache so the first paint is
// right on a known device; `useAccountUnitSync` makes the account value win
// once prefs load, and uploads this device's choice once when the account has
// none yet. All three share one listener set so a change to any re-renders
// every consumer (distance/measurement follow the weight system until set).
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l();
}

function read(key: string): string | null {
  return localStorage.getItem(key);
}

function write(key: string, value: string) {
  localStorage.setItem(key, value);
  emit();
}

const UNIT_KEYS = {
  weightUnit: "unit",
  distanceUnit: "distanceUnit",
  measurementUnit: "measurementUnit",
} as const;
type UnitField = keyof typeof UNIT_KEYS;
const UNIT_FIELDS = Object.keys(UNIT_KEYS) as UnitField[];

// The one-time device → account upload, at most once per signed-in user per
// page load (every unit hook runs the sync effect).
let migrated = false;
// The cache itself is kept: the reset also fires on a Clerk page load (userId
// null → id), which must not wipe the value the migration uploads, and the
// account value overwrites it as soon as the next user's prefs load.
registerUserScopedReset(() => {
  migrated = false;
});

/** Pure: what the cache should hold for a loaded prefs row (account wins), or
 * the patch to upload when the account has no units yet. Exported for tests. */
export function planUnitSync(
  row: UserPrefs | null,
  local: Record<UnitField, string | null>,
):
  | { kind: "cache"; values: Record<UnitField, string | null> }
  | { kind: "upload"; patch: UserPrefsPatch }
  | { kind: "none" } {
  const account = Object.fromEntries(
    UNIT_FIELDS.map((f) => [f, row?.[f] ?? null]),
  ) as Record<UnitField, string | null>;
  if (UNIT_FIELDS.some((f) => account[f] !== null))
    return { kind: "cache", values: account };
  const patch = Object.fromEntries(
    UNIT_FIELDS.filter((f) => local[f] !== null).map((f) => [f, local[f]]),
  ) as UserPrefsPatch;
  return Object.keys(patch).length
    ? { kind: "upload", patch }
    : { kind: "none" };
}

function readLocal(): Record<UnitField, string | null> {
  return Object.fromEntries(
    UNIT_FIELDS.map((f) => [f, read(UNIT_KEYS[f])]),
  ) as Record<UnitField, string | null>;
}

/** Account → cache sync plus the account write for a unit change. */
function useAccountUnits(): (field: UnitField, value: string) => void {
  const { data, isSuccess } = useUserPrefs();
  const { mutate } = useUpdateUserPrefs();
  useEffect(() => {
    if (!isSuccess) return;
    const plan = planUnitSync(data ?? null, readLocal());
    if (plan.kind === "cache") {
      let changed = false;
      for (const f of UNIT_FIELDS) {
        const v = plan.values[f];
        if (read(UNIT_KEYS[f]) === v) continue;
        if (v === null) localStorage.removeItem(UNIT_KEYS[f]);
        else localStorage.setItem(UNIT_KEYS[f], v);
        changed = true;
      }
      if (changed) emit();
    } else if (plan.kind === "upload" && !migrated) {
      migrated = true;
      mutate(plan.patch);
    }
  }, [data, isSuccess, mutate]);
  return useCallback(
    (field: UnitField, value: string) => {
      write(UNIT_KEYS[field], value);
      mutate({ [field]: value } as UserPrefsPatch);
    },
    [mutate],
  );
}

// ── Weight (kg | lb), default lb ──────────────────────────────────────────
const UNIT_KEY = UNIT_KEYS.weightUnit;

function currentUnit(): Unit {
  return read(UNIT_KEY) === "kg" ? "kg" : "lb";
}

export function useUnit(): { unit: Unit; setUnit: (u: Unit) => void } {
  const unit = useSyncExternalStore(subscribe, currentUnit);
  const save = useAccountUnits();
  const setUnit = useCallback((u: Unit) => save("weightUnit", u), [save]);
  return { unit, setUnit };
}

// Distance display follows the weight unit's measurement system (metric → km,
// imperial → mi) unless the user picks one explicitly in Settings.
export function distanceUnitFor(unit: Unit): DistanceUnit {
  return unit === "kg" ? "km" : "mi";
}

// ── Distance (km | mi), default follows the weight system ─────────────────
const DISTANCE_KEY = UNIT_KEYS.distanceUnit;

function currentDistanceUnit(): DistanceUnit {
  const stored = read(DISTANCE_KEY);
  if (stored === "km" || stored === "mi") return stored;
  return distanceUnitFor(currentUnit());
}

export function useDistanceUnit(): {
  distanceUnit: DistanceUnit;
  setDistanceUnit: (u: DistanceUnit) => void;
} {
  const distanceUnit = useSyncExternalStore(subscribe, currentDistanceUnit);
  const save = useAccountUnits();
  const setDistanceUnit = useCallback(
    (u: DistanceUnit) => save("distanceUnit", u),
    [save],
  );
  return { distanceUnit, setDistanceUnit };
}

// ── Body measurements (cm | in), default follows the weight system ────────
const MEASUREMENT_KEY = UNIT_KEYS.measurementUnit;

function currentMeasurementUnit(): MeasurementUnit {
  const stored = read(MEASUREMENT_KEY);
  if (stored === "cm" || stored === "in") return stored;
  return currentUnit() === "kg" ? "cm" : "in";
}

export function useMeasurementUnit(): {
  measurementUnit: MeasurementUnit;
  setMeasurementUnit: (u: MeasurementUnit) => void;
} {
  const measurementUnit = useSyncExternalStore(
    subscribe,
    currentMeasurementUnit,
  );
  const save = useAccountUnits();
  const setMeasurementUnit = useCallback(
    (u: MeasurementUnit) => save("measurementUnit", u),
    [save],
  );
  return { measurementUnit, setMeasurementUnit };
}
