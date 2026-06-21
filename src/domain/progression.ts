export type SessionTop = { day: number; e1rm: number };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function isOutlier(values: number[], value: number, madThreshold = 5): boolean {
  if (values.length < 5) return false;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med))) || 1;
  return Math.abs(value - med) / (1.4826 * mad) > madThreshold;
}

function linregSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  return sxx === 0 ? 0 : sxy / sxx;
}

export function robustTrend(points: SessionTop[]) {
  const n0 = points.length;
  if (n0 < 5) return { verdict: "INSUFFICIENT" as const, pctChange: 0, perMonth: 0, n: n0 };
  const e1 = points.map((p) => p.e1rm);
  const kept = points.filter((p) => !isOutlier(e1, p.e1rm)); // drop bad-data spikes
  const pts = kept.length >= 5 ? kept : points;
  const xs = pts.map((p) => p.day), ys = pts.map((p) => p.e1rm);
  const slope = linregSlope(xs, ys);
  // Measure change from the regression fit (not raw endpoints) so a dropped
  // outlier can't shrink the signal: project the fitted line across the span.
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const span = xs[xs.length - 1] - xs[0];
  const fittedStart = my + slope * (xs[0] - mx);
  const pctChange = fittedStart ? ((slope * span) / fittedStart) * 100 : 0;
  const perMonth = slope * 30;
  let verdict: "PROGRESSING" | "PLATEAU" | "REGRESSING";
  if (pctChange >= 5 && slope > 0) verdict = "PROGRESSING";
  else if (pctChange <= -5) verdict = "REGRESSING";
  else verdict = "PLATEAU";
  return { verdict, pctChange, perMonth, n: pts.length };
}
