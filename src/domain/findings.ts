import { isOutlier } from "./progression";

export type ExerciseRecord = {
  sessionDay: number; // Math.floor(dateMs / 86400000) — integer day-index for bucketing
  e1rm: number | null;
  weightKg: number;
  reps: number;
  setType: string; // 'normal' | 'warmup' | 'failure' | 'dropset' | ...
};

export type ExerciseFinding = {
  n: number;
  verdict: "PROGRESSING" | "PLATEAU" | "REGRESSING" | "INSUFFICIENT";
  pctChange: number;
  perMonth: number;
  r2: number;
};

export type OffDayFlag = {
  sessionDay: number;
  avgDevPct: number; // negative means below baseline (e.g. -9 = 9% below norm)
  exercisesChecked: number;
};

export type WeightOutlierFlag = {
  exercise: string;
  sessionDay: number;
  weightKg: number;
  medianKg: number;
  zScore: number;
};

export type SpikeRevertFlag = {
  exercise: string;
  sessionDay: number;
  prevE1rm: number;
  spikeE1rm: number;
  nextE1rm: number;
};

export type HolisticReport = {
  findings: Record<string, ExerciseFinding>;
  offDays: OffDayFlag[];
  weightOutliers: WeightOutlierFlag[];
  spikeReverts: SpikeRevertFlag[];
};

function linreg(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0 };
  const slope = sxy / sxx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept: my - slope * mx, r2 };
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function topE1rmBySession(records: ExerciseRecord[]): Array<{ day: number; e1rm: number }> {
  const byDay = new Map<number, number>();
  for (const r of records) {
    if (r.setType === "warmup" || r.e1rm === null) continue;
    const cur = byDay.get(r.sessionDay) ?? 0;
    if (r.e1rm > cur) byDay.set(r.sessionDay, r.e1rm);
  }
  return Array.from(byDay.entries())
    .map(([day, e1rm]) => ({ day, e1rm }))
    .sort((a, b) => a.day - b.day);
}

/** Per-exercise progression verdict with outlier-robust linreg and r². */
export function exerciseFinding(records: ExerciseRecord[]): ExerciseFinding {
  const sessions = topE1rmBySession(records);
  const n = sessions.length;
  if (n < 5) return { n, verdict: "INSUFFICIENT", pctChange: 0, perMonth: 0, r2: 0 };

  const e1rms = sessions.map((s) => s.e1rm);
  const kept = sessions.filter((s) => !isOutlier(e1rms, s.e1rm));
  const pts = kept.length >= 5 ? kept : sessions;

  const xs = pts.map((p) => p.day);
  const ys = pts.map((p) => p.e1rm);
  const { slope, r2 } = linreg(xs, ys);

  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const span = xs[xs.length - 1] - xs[0];
  const fittedStart = my + slope * (xs[0] - mx);
  const pctChange = fittedStart ? ((slope * span) / fittedStart) * 100 : 0;

  let verdict: ExerciseFinding["verdict"];
  if (pctChange >= 5 && slope > 0) verdict = "PROGRESSING";
  else if (pctChange <= -5) verdict = "REGRESSING";
  else verdict = "PLATEAU";

  return { n: pts.length, verdict, pctChange, perMonth: slope * 30, r2 };
}

/**
 * Off-day detection: flags sessions where most tracked exercises were below their
 * recent trailing median — a signal to annotate with "felt off / sick / deload".
 */
export function detectOffDays(
  exerciseMap: Record<string, ExerciseRecord[]>,
  threshold = -7,
  minExercises = 3,
): OffDayFlag[] {
  const sessionDevs = new Map<number, number[]>();

  for (const records of Object.values(exerciseMap)) {
    const sessions = topE1rmBySession(records);
    for (let i = 0; i < sessions.length; i++) {
      const prev = sessions.slice(Math.max(0, i - 4), i).map((s) => s.e1rm);
      if (prev.length < 2) continue;
      const base = medianOf(prev);
      if (!base) continue;
      const devPct = ((sessions[i].e1rm - base) / base) * 100;
      const day = sessions[i].day;
      if (!sessionDevs.has(day)) sessionDevs.set(day, []);
      sessionDevs.get(day)!.push(devPct);
    }
  }

  const flags: OffDayFlag[] = [];
  for (const [day, devs] of sessionDevs.entries()) {
    if (devs.length < minExercises) continue;
    const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
    if (avg <= threshold) flags.push({ sessionDay: day, avgDevPct: avg, exercisesChecked: devs.length });
  }
  return flags.sort((a, b) => a.sessionDay - b.sessionDay);
}

/**
 * Weight outlier detection: per-exercise MAD scan on raw logged weights.
 * Catches lb-not-kg typos and other data-entry errors.
 * Requires >=8 sets per exercise to avoid false positives on sparse data.
 */
export function detectWeightOutliers(
  exerciseMap: Record<string, ExerciseRecord[]>,
  madThreshold = 5,
): WeightOutlierFlag[] {
  const flags: WeightOutlierFlag[] = [];

  for (const [exercise, records] of Object.entries(exerciseMap)) {
    const ws = records.map((r) => r.weightKg).filter((w) => w > 0);
    if (ws.length < 8) continue;
    const medianKg = medianOf(ws);
    const mad = medianOf(ws.map((w) => Math.abs(w - medianKg))) || 1;

    for (const r of records) {
      if (!r.weightKg) continue;
      const zScore = Math.abs(r.weightKg - medianKg) / (1.4826 * mad);
      if (zScore > madThreshold) {
        flags.push({ exercise, sessionDay: r.sessionDay, weightKg: r.weightKg, medianKg, zScore });
      }
    }
  }
  return flags;
}

/**
 * Spike-then-revert detection: flags single-session e1RM anomalies where one
 * session is >spikeRatio times both its neighbors — the classic typo / lb-kg mix
 * signature (e.g. 100 → 450 → 102).
 */
export function detectSpikeReverts(
  exerciseMap: Record<string, ExerciseRecord[]>,
  spikeRatio = 1.4,
): SpikeRevertFlag[] {
  const flags: SpikeRevertFlag[] = [];

  for (const [exercise, records] of Object.entries(exerciseMap)) {
    const sessions = topE1rmBySession(records);
    for (let i = 1; i < sessions.length - 1; i++) {
      const a = sessions[i - 1].e1rm;
      const b = sessions[i].e1rm;
      const c = sessions[i + 1].e1rm;
      if (b > a * spikeRatio && b > c * spikeRatio) {
        flags.push({ exercise, sessionDay: sessions[i].day, prevE1rm: a, spikeE1rm: b, nextE1rm: c });
      }
    }
  }
  return flags;
}

/** Runs all findings analyses and returns a combined holistic report. */
export function holistic(exerciseMap: Record<string, ExerciseRecord[]>): HolisticReport {
  const findings: Record<string, ExerciseFinding> = {};
  for (const [name, records] of Object.entries(exerciseMap)) {
    findings[name] = exerciseFinding(records);
  }
  return {
    findings,
    offDays: detectOffDays(exerciseMap),
    weightOutliers: detectWeightOutliers(exerciseMap),
    spikeReverts: detectSpikeReverts(exerciseMap),
  };
}
