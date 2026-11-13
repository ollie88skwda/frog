import { INCREMENT_PCT, MAX_STEP_FRACTION } from "./constants";
import type { CoachExercise } from "./types";

/** Smallest load step: the user's stepKg, else 0.5 kg for plate-loaded bars,
 * else unknown (machines/cables/dumbbells give text-only steps, C2c). */
export function gridKg(ex: CoachExercise): number | null {
  if (ex.stepKg && ex.stepKg > 0) return ex.stepKg;
  if (ex.equipment === "barbell" || ex.equipment === "ez_bar") return 0.5;
  if (ex.equipment == null && ex.isCompound) return 0.5;
  return null;
}

export const roundToGrid = (x: number, g: number): number =>
  Math.round(x / g) * g;

export type NextLoad =
  | { kind: "kg"; loadKg: number }
  | { kind: "text"; reason: "no_step" | "step_too_big" };

/** C2c increment: ~2.5 % compounds, ~5 % small machines, rounded to the
 * smallest step; a step over 10 % of the load falls back to text. */
export function nextLoad(ex: CoachExercise, fromKg: number): NextLoad {
  const g = gridKg(ex);
  if (g == null) return { kind: "text", reason: "no_step" };
  const pct = ex.isCompound ? INCREMENT_PCT.compound : INCREMENT_PCT.isolation;
  let next = roundToGrid(fromKg * (1 + pct), g);
  if (next <= fromKg) next = fromKg + g;
  next = Number.parseFloat(next.toFixed(4));
  if ((next - fromKg) / fromKg > MAX_STEP_FRACTION + 1e-9)
    return { kind: "text", reason: "step_too_big" };
  return { kind: "kg", loadKg: next };
}

/** C6: never prescribe failure on a compound; clamp RIR ends to ≥1 (≥0 for isolation). */
export function clampRir(
  rir: [number, number],
  isCompound: boolean,
): [number, number] {
  const floor = isCompound ? 1 : 0;
  return [Math.max(floor, rir[0]), Math.max(floor, rir[1])];
}
