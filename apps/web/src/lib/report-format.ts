import {
  formatDistance,
  formatWeight,
  kgToLb,
  type PrType,
  toDisplayDistance,
  unitLabel,
} from "@sbl/core";
import { formatMMSS } from "./format";
import type { DistanceUnit, Unit } from "./settings";

// Report-screen number formatting (M10). Volume totals are big (monthly/yearly
// tonnage), so they get thousands separators and a compact "k" form for chart
// labels; active time is shown as hours. Weights stay canonical kg until display.

const nf = new Intl.NumberFormat();

/** Canonical kg volume → whole number in the display unit. */
export function toDisplayVolume(kg: number, unit: Unit): number {
  return Math.round(unit === "kg" ? kg : kgToLb(kg));
}

/** Full volume with thousands separators and unit (e.g. `45,320 kg`). */
export function formatVolume(kg: number, unit: Unit): string {
  return `${nf.format(toDisplayVolume(kg, unit))} ${unitLabel(unit)}`;
}

/** Compact volume for tight chart labels (e.g. `45.3k`, `820`). */
export function compactVolume(kg: number, unit: Unit): string {
  const v = toDisplayVolume(kg, unit);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

/** Active-training milliseconds → hours string (e.g. `12.5`, `120`). */
export function hoursOf(ms: number): string {
  const h = ms / 3_600_000;
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

/** PR value display per PR type (mirrors the exercise-detail records panel). */
export function prValue(
  pr: PrType,
  v: number,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (pr) {
    case "heaviest_weight":
    case "best_e1rm":
    case "best_set_volume":
    case "best_session_volume":
      return formatWeight(v, unit);
    case "best_set_reps":
    case "best_session_reps":
      return `${Math.round(v)} reps`;
    case "best_time":
      return formatMMSS(v);
    case "longest_distance":
      return formatDistance(v, distUnit);
    case "best_pace":
      return `${toDisplayDistance(v * 3600, distUnit)} ${distUnit}/h`;
  }
}
