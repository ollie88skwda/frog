/**
 * Pure logic behind "The Spotlight" (session redesign R3) that's cheap to
 * unit-test in isolation from the screen's React tree: the RIR segmented
 * pick (0/1/2/3/4+, replacing the old free min/max range — locked decision,
 * docs/DECISIONS.md 2026-08-12) and the per-row "beat last time" comparison
 * that drives the weight/reps compare text and the `data-beat` tint.
 */

/** Which of the five RIR segments (0,1,2,3,4) a stored min/max pair reads as,
 * or null when it's empty or doesn't collapse to one segment (an untouched
 * asymmetric range from before this redesign, e.g. min=1/max=3). */
export function rirSegmentOf(min: string, max: string): number | null {
  const lo = min.trim() === "" ? null : Number.parseInt(min, 10);
  const hi = max.trim() === "" ? null : Number.parseInt(max, 10);
  if (lo == null && hi == null) return null;
  if (lo != null && lo >= 4) return 4;
  if (lo != null && hi != null && lo === hi && lo < 4) return lo;
  if (lo != null && hi == null && lo < 4) return lo;
  return null;
}

/** Segment value → the min/max pair it writes. 4 ("4+") is open-ended: no
 * upper bound, matching the mockup's "4+" reading as "4 or more". */
export function segmentToFields(v: number): { min: string; max: string } {
  if (v >= 4) return { min: "4", max: "" };
  return { min: String(v), max: String(v) };
}

export type Comparison = {
  text: string;
  state: "same" | "up" | "down" | "none";
};

/** The live spotlight's per-row comparison against last time: "same as
 * last", "▲ +5 kg on last", "▼ −1 on last", or "no last data" when there's
 * nothing to compare against yet. `unitTxt` is appended to a non-zero delta
 * only (weight/distance carry a unit; reps don't). */
export function compareToLast(
  currentValue: number | null,
  lastValue: number | null,
  unitTxt: string,
): Comparison {
  if (lastValue == null) return { text: "no last data", state: "none" };
  if (currentValue == null) return { text: "same as last", state: "none" };
  if (currentValue === lastValue)
    return { text: "same as last", state: "same" };
  const delta = Math.round((currentValue - lastValue) * 10) / 10;
  const suffix = unitTxt ? ` ${unitTxt}` : "";
  if (delta > 0)
    return { text: `▲ +${Math.abs(delta)}${suffix} on last`, state: "up" };
  return { text: `▼ −${Math.abs(delta)}${suffix} on last`, state: "down" };
}
