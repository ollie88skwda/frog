// C4 / C5 RIR drift, C6 guard. COACH-LOGIC.md "RIR drift" + Computation defaults.
// Reads raw logged RIR and ignores the comparable-session effort check (that
// check would remove exactly the sets these rules judge).

import { DRIFT_MIN_SETS, DRIFT_SHARE, DRIFT_WINDOW_DAYS } from "../constants";
import { type ExerciseCtx, empty, mk, pct, type RuleOutput } from "../ctx";
import { clampRir } from "../grid";
import { plannedRirAt } from "../history";
import { localDayIndex } from "../time";

type Pooled = {
  loggedMin: number;
  loggedMax: number;
  min: number;
  max: number;
};

/** Pool the last 2 working sets of each session in the last 7 days; with one
 * working set per session, the last 6 sets across sessions instead. */
export function driftPool(ctx: ExerciseCtx): Pooled[] {
  const take = (n: number, from = ctx.hist) =>
    from.flatMap((s) => {
      if (!s.planned) return [];
      const idxs = s.sets.map((_, i) => i).slice(-n);
      return idxs.flatMap((i) => {
        const r = s.sets[i].rir;
        if (!r) return [];
        const t = plannedRirAt(s.planned as NonNullable<typeof s.planned>, i);
        return [{ loggedMin: r.min, loggedMax: r.max, min: t.min, max: t.max }];
      });
    });
  const today = localDayIndex(ctx.asOf, ctx.tz);
  const recent = ctx.hist.filter((s) => {
    const d = localDayIndex(s.startedAt, ctx.tz);
    return d >= today - DRIFT_WINDOW_DAYS && d <= today;
  });
  const pool = take(2, recent);
  if (pool.length >= DRIFT_MIN_SETS) return pool;
  if (ctx.hist.every((s) => s.sets.length <= 1))
    return take(1).slice(-DRIFT_MIN_SETS);
  return pool;
}

export function drift(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const id = ctx.exercise.id;
  const p = ctx.planned;
  if (!p || ctx.deloadActive) return out;
  const pool = driftPool(ctx);
  if (pool.length < DRIFT_MIN_SETS) {
    out.notEvaluated.push({
      ruleId: "C4/C5",
      exerciseId: id,
      reason: "too_few_sessions",
      detail: `${pool.length} of ${DRIFT_MIN_SETS} sets needed`,
    });
    return out;
  }
  const below = pool.filter((x) => x.loggedMax < x.min).length;
  const above = pool.filter((x) => x.loggedMin > x.max).length;
  const mean =
    pool.reduce((a, x) => a + (x.loggedMin + x.loggedMax) / 2, 0) / pool.length;
  const anchor = ctx.latest.sessionId;
  const name = ctx.exercise.name.toLowerCase();
  const inputs = (kind: "C4" | "C5", n: number) => [
    {
      text: `${n} of ${pool.length} recent last-sets ended ${kind === "C5" ? "above" : "below"} the planned ${p.rirMin === p.rirMax ? p.rirMin : `${p.rirMin}-${p.rirMax}`} reps left.`,
      stat: { label: "Share off plan", value: pct(n / pool.length) },
      cite: `${kind} · R10/R11 · Refalo 2024 PMID 37967832`,
    },
    {
      text: "RIR is a gut feel and the last sets are the most reliable read; this is a suggestion.",
    },
  ];
  if (above / pool.length >= DRIFT_SHARE) {
    const next = clampRir(
      [p.rirMin - 1, p.rirMax - 1],
      ctx.exercise.isCompound,
    );
    if (next[0] === p.rirMin && next[1] === p.rirMax) return out; // C6 clamp: nothing to lower
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C5",
        exerciseId: id,
        anchor,
        severity: "suggest",
        surfaces: ["in_set", "weekly", "post_session"],
        message: `last ${name} sets ended with about ${Math.round(mean)} reps left, not the ${p.rirMax} planned. next week aim for about ${next[1]} left. it's a gut feel, so just a suggestion.`,
        why: inputs("C5", above),
        tier: "T5",
        action: {
          kind: "set_target_rir",
          exerciseId: id,
          rir: next,
          forDays: 7,
        },
        data: { meanRir: mean, share: above / pool.length },
      }),
    );
  } else if (below / pool.length >= DRIFT_SHARE) {
    const next: [number, number] = [p.rirMin + 1, p.rirMax + 1];
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C4",
        exerciseId: id,
        anchor,
        severity: "suggest",
        surfaces: ["in_set", "weekly", "post_session"],
        message: `last ${name} sets ended with about ${Math.round(mean)} reps left, under the ${p.rirMin} planned. aim for about ${next[1]} left for a week.`,
        why: inputs("C4", below),
        tier: "T5",
        action: {
          kind: "set_target_rir",
          exerciseId: id,
          rir: next,
          forDays: 7,
        },
        data: { meanRir: mean, share: below / pool.length },
      }),
    );
  }
  return out;
}
