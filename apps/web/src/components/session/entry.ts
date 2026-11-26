// Pure logic for the set-entry tiles ("scrub tiles", 2026-11-16): step sizes,
// drag-to-scrub maths, long-press acceleration and the Log button label.

export type EntryUnit = "kg" | "lb";

/** Smallest weight plate jump per unit (2.5 kg / 5 lb). */
export function weightStep(unit: EntryUnit): number {
  return unit === "lb" ? 5 : 2.5;
}

/** Stepper/scrub increment per field: weight by plate, reps by 1, distance by 0.1. */
export function fieldStep(
  key: "weight" | "reps" | "distance",
  unit: EntryUnit,
): number {
  if (key === "weight") return weightStep(unit);
  if (key === "distance") return 0.1;
  return 1;
}

/** Applies `delta` to a text value; never below 0, rounded to 2dp. */
export function stepValue(current: string, delta: number): string {
  const base = Number.parseFloat(current || "0") || 0;
  return String(Math.max(0, Math.round((base + delta) * 100) / 100));
}

/** Whole steps implied by a horizontal drag; truncates toward zero. */
export function scrubSteps(dxPx: number, pxPerStep = 18): number {
  return Math.trunc(dxPx / pxPerStep);
}

/** Long-press repeat: multiplier grows the longer the button is held. */
export function holdMultiplier(repeats: number): number {
  if (repeats >= 20) return 10;
  if (repeats >= 8) return 4;
  return 1;
}

function pair(left: string, right: string): string {
  return right && right !== left ? `${left}/${right}` : left;
}

/**
 * "Log 80 kg × 8" — the button says exactly what it will write. Unilateral
 * sets show both sides when they differ ("Log 40/35 kg × 8/6"); an empty right
 * value falls back to the left one, as saving does.
 */
export function logLabel(opts: {
  weight: string;
  reps: string;
  weightUnit: string | null;
  setNo: number;
  unilateral: boolean;
  rightWeight?: string;
  rightReps?: string;
}): string {
  const w = opts.weight.trim();
  const r = opts.reps.trim();
  const w2 = opts.unilateral ? (opts.rightWeight ?? "").trim() || w : w;
  const r2 = opts.unilateral ? (opts.rightReps ?? "").trim() || r : r;
  const parts: string[] = [];
  if (opts.weightUnit && (w || w2))
    parts.push(`${pair(w || "–", w2)} ${opts.weightUnit}`);
  if (r || r2) parts.push(pair(r || "–", r2));
  const side = opts.unilateral ? " · L + R" : "";
  if (!parts.length) return `Log set ${opts.setNo}${side}`;
  return `Log ${parts.join(" × ")}${side}`;
}

/** Snaps `v` to the nearest `step` multiple and clamps to [min, max]; 2dp. */
export function snapToStep(
  v: number,
  step: number,
  min: number,
  max: number,
): number {
  const snapped = Math.round(v / step) * step;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 100) / 100;
}

/** Ruler detent: whether the tick at `index` (steps from zero) is a major tick. */
export function isMajorTick(index: number, majorEvery: number): boolean {
  return index % majorEvery === 0;
}

/**
 * Writes `label value` into a setup note, replacing that label's existing
 * number ("Seat 3" → "Seat 5") or appending it ("…, Seat 5").
 */
export function applySetupSetting(
  draft: string,
  label: string,
  value: string,
): string {
  const re = new RegExp(`\\b${label}\\s+\\d+(?:\\.\\d+)?`, "i");
  const piece = `${label} ${value}`;
  if (re.test(draft)) return draft.replace(re, piece);
  const t = draft.trim();
  return t ? `${t.replace(/[,;]\s*$/, "")}, ${piece}` : piece;
}

/**
 * Which exercise a reopened session lands on: the one the user was last on
 * (saved per session on this device) when it still exists, else the
 * exercise they are actually on by set state: the last one with logged sets
 * if it still has planned sets open, otherwise the next one after it.
 */
export function resumeBlockIndex(
  blocks: { seId: string; committed: number; planned: number }[],
  savedSeId: string | null,
): number {
  if (blocks.length === 0) return -1;
  if (savedSeId) {
    const i = blocks.findIndex((b) => b.seId === savedSeId);
    if (i >= 0) return i;
  }
  let last = -1;
  blocks.forEach((b, i) => {
    if (b.committed > 0) last = i;
  });
  if (last < 0) return 0;
  const b = blocks[last];
  if (b.committed < b.planned) return last;
  return Math.min(last + 1, blocks.length - 1);
}
