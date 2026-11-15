// Pure rules behind the data kit (no React) so they are unit-tested.
// Rule IDs: C2c = e1RM noise band (a delta inside it is never "a change"),
// R6/R7 = 10-20 hard-set starting band, R18b = ~1/3 maintains, C12 = trim >20
// only if stalled, §7 info-design = show n, never a percentage probability.

export type Tier = 1 | 2 | 3 | 4 | 5;

/** DeltaChip state. `noise` is the honest default look (neutral, never colored). */
export type DeltaState = "noise" | "good" | "attn" | "none";

/**
 * Classify a delta against its noise band (C2c: 10% single-session band).
 * `delta` and `noise` share units (e.g. both fractions or both kg).
 * Outside the band, movement in the good direction is "good" (Fern); against it
 * is "attn" (amber, never red: a stall is not a failure).
 */
export function deltaState(
  delta: number,
  noise: number,
  goodDirection: "up" | "down" | "none" = "up",
): DeltaState {
  if (!Number.isFinite(delta)) return "none";
  if (delta === 0 || Math.abs(delta) < noise) return "noise";
  if (goodDirection === "none") return "noise";
  const up = delta > 0;
  return up === (goodDirection === "up") ? "good" : "attn";
}

export type MeterStatus = "low" | "below" | "in-band" | "high";

export const METER_STATUS_WORD: Record<MeterStatus, string> = {
  low: "low (maintenance range)",
  below: "building",
  "in-band": "in band",
  high: "high: trim only if stalling",
};

/** F3: under 6 = maintenance range (R18b), 10-20 = starting band, over = amber. */
export function meterStatus(
  sets: number,
  band: readonly [number, number] = [10, 20],
): MeterStatus {
  if (sets > band[1]) return "high";
  if (sets >= band[0]) return "in-band";
  if (sets < 6) return "low";
  return "below";
}

export type Confidence = { level: 0 | 1 | 2 | 3; label: string };

/**
 * Three dots from sample size, effect vs noise and tier (info-design §7.5).
 * Below min-n = 0 dots "Not enough yet (3 of 7)". Never a probability.
 */
export function confidenceFrom(opts: {
  n: number;
  minN: number;
  tier?: Tier;
  exceedsNoise?: boolean;
  unit?: string;
}): Confidence {
  const { n, minN, tier = 3, exceedsNoise = true, unit = "sessions" } = opts;
  if (n < minN)
    return { level: 0, label: `Not enough yet (${n} of ${minN} ${unit})` };
  let level: 1 | 2 | 3 = n >= minN * 2 ? 3 : 2;
  if (!exceedsNoise) level = Math.min(level, 2) as 1 | 2 | 3;
  if (tier >= 4) level = Math.min(level, 2) as 1 | 2 | 3;
  if (tier === 5) level = 1;
  const word = level === 3 ? "High" : level === 2 ? "Medium" : "Low";
  return { level, label: `${word}: ${n} of ${minN}+ ${unit}` };
}

export const TIER_WORD: Record<Tier, string> = {
  1: "Meta-analysis of trials",
  2: "Trial in trained lifters",
  3: "Untrained or indirect",
  4: "Mechanism or consensus",
  5: "Practitioner claim",
};

export type SaveState = "queued" | "saved" | "failed";

/** F15: map a TanStack mutation's state to the SaveDot. */
export function saveStateFrom(m: {
  status: "idle" | "pending" | "success" | "error";
  isPaused?: boolean;
}): SaveState {
  if (m.status === "error") return "failed";
  if (m.status === "success") return "saved";
  return "queued"; // pending, paused (offline) or idle-not-yet-sent
}

export type SparkGeometry = {
  segments: string[];
  /** Dashed connector across a single missing point (never longer gaps). */
  bridges: string[];
  last: { x: number; y: number } | null;
  band: { y: number; h: number } | null;
};

/**
 * Sparkline geometry. null = gap (never interpolated), except a dashed bridge
 * over a single missing point. Pure so gap handling is tested.
 */
export function sparkGeometry(
  points: readonly (number | null)[],
  width: number,
  height: number,
  band?: readonly [number, number],
  pad = 3,
): SparkGeometry {
  const vals = points.filter((p): p is number => p != null);
  if (vals.length === 0)
    return { segments: [], bridges: [], last: null, band: null };
  let lo = Math.min(...vals, ...(band ? [band[0]] : []));
  let hi = Math.max(...vals, ...(band ? [band[1]] : []));
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const n = points.length;
  const x = (i: number) =>
    n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1);
  const y = (v: number) =>
    height - pad - ((v - lo) * (height - 2 * pad)) / (hi - lo);
  const r = (v: number) => Math.round(v * 10) / 10;
  const seg = (c: string[]) =>
    `M${c.length === 1 ? `${c[0]}L${c[0]}` : c.join("L")}`;
  const segments: string[] = [];
  const bridges: string[] = [];
  let cur: string[] = [];
  let lastIdx = -1;
  let last: SparkGeometry["last"] = null;
  points.forEach((p, i) => {
    if (p == null) return;
    const pt = `${r(x(i))} ${r(y(p))}`;
    if (cur.length && i - lastIdx === 2) {
      // single gap: close nothing, bridge dashed from previous point
      const prev = cur[cur.length - 1];
      bridges.push(`M${prev}L${pt}`);
      segments.push(seg(cur));
      cur = [pt];
    } else if (cur.length && i - lastIdx > 2) {
      segments.push(seg(cur));
      cur = [pt];
    } else cur.push(pt);
    lastIdx = i;
    last = { x: r(x(i)), y: r(y(p)) };
  });
  if (cur.length) segments.push(seg(cur));
  return {
    segments,
    bridges,
    last,
    band: band ? { y: r(y(band[1])), h: r(y(band[0]) - y(band[1])) } : null,
  };
}
