// Small deterministic statistics for condition findings (engine-vs-research
// §3). No dependencies, seeded PRNG so a finding never flickers between
// renders. Guardrails: effect size, permutation p, Benjamini-Hochberg across
// the whole family of tests, detrending.

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

/** Cohen's d with pooled SD (a - b). Null when n < 2 or the pooled SD is 0. */
export function cohensD(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null;
  const pooled = Math.sqrt(
    ((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) /
      (a.length + b.length - 2),
  );
  if (!(pooled > 0)) return null;
  return (mean(a) - mean(b)) / pooled;
}

/** mulberry32: tiny seeded PRNG. */
function prng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two-sided permutation p-value for a difference of means. Deterministic
 * (seeded). Uses (hits + 1) / (iters + 1) so it is never exactly 0.
 */
export function permutationP(
  a: number[],
  b: number[],
  iters = 2000,
  seed = 1,
): number {
  const obs = Math.abs(mean(a) - mean(b));
  const all = [...a, ...b];
  const total = all.reduce((x, y) => x + y, 0);
  const na = a.length;
  const nb = b.length;
  const rand = prng(seed);
  let hits = 0;
  for (let k = 0; k < iters; k++) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = all[i];
      all[i] = all[j];
      all[j] = t;
    }
    let sa = 0;
    for (let i = 0; i < na; i++) sa += all[i];
    const d = Math.abs(sa / na - (total - sa) / nb);
    if (d >= obs - 1e-12) hits++;
  }
  return (hits + 1) / (iters + 1);
}

/** Subtract the OLS line (progression itself is a confound). */
export function detrend(
  points: { day: number; value: number }[],
): { day: number; resid: number }[] {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ day: p.day, resid: 0 }));
  const mx = mean(points.map((p) => p.day));
  const my = mean(points.map((p) => p.value));
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.day - mx) ** 2;
    sxy += (p.day - mx) * (p.value - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return points.map((p) => ({
    day: p.day,
    resid: p.value - (my + slope * (p.day - mx)),
  }));
}

/** Benjamini-Hochberg adjusted p-values (q-values), same order as input. */
export function bhAdjust(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const out = new Array<number>(m);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    running = Math.min(running, (order[k].p * m) / (k + 1));
    out[order[k].i] = running;
  }
  return out;
}
