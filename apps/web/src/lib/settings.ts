import { useCallback, useSyncExternalStore } from "react";

export type Unit = "kg" | "lb";
export type DistanceUnit = "km" | "mi";
export type MeasurementUnit = "cm" | "in";

// Display units are device-local settings — weights are stored canonically in
// kg, distances in meters, circumferences in cm; the unit is a per-device
// render choice (plan §B split rule). All three share one listener set so a
// change to any re-renders every consumer (distance/measurement defaults follow
// the weight system until explicitly overridden).
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

// ── Weight (kg | lb), default lb ──────────────────────────────────────────
const UNIT_KEY = "unit";

function currentUnit(): Unit {
  return read(UNIT_KEY) === "kg" ? "kg" : "lb";
}

export function useUnit(): { unit: Unit; setUnit: (u: Unit) => void } {
  const unit = useSyncExternalStore(subscribe, currentUnit);
  const setUnit = useCallback((u: Unit) => write(UNIT_KEY, u), []);
  return { unit, setUnit };
}

// Distance display follows the weight unit's measurement system (metric → km,
// imperial → mi) unless the user picks one explicitly in Settings.
export function distanceUnitFor(unit: Unit): DistanceUnit {
  return unit === "kg" ? "km" : "mi";
}

// ── Distance (km | mi), default follows the weight system ─────────────────
const DISTANCE_KEY = "distanceUnit";

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
  const setDistanceUnit = useCallback(
    (u: DistanceUnit) => write(DISTANCE_KEY, u),
    [],
  );
  return { distanceUnit, setDistanceUnit };
}

// ── Body measurements (cm | in), default follows the weight system ────────
const MEASUREMENT_KEY = "measurementUnit";

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
  const setMeasurementUnit = useCallback(
    (u: MeasurementUnit) => write(MEASUREMENT_KEY, u),
    [],
  );
  return { measurementUnit, setMeasurementUnit };
}
