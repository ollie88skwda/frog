// C14 (deload), C15 (restart). COACH-LOGIC.md "Deload and time off".

import { C14_DECLINE, DAY_MS, DELOAD_RIR, RESTART_PCT } from "../constants";
import { type ExerciseCtx, empty, kg, mk, pct, type RuleOutput } from "../ctx";
import { declinedMoreThan } from "../e1rm";
import { gridKg, roundToGrid } from "../grid";
import { weekKey } from "../time";
import type { CoachAction } from "../types";

/** Weekly best e1RM per Monday-Sunday week over the comparable window
 * (C14: the current week's best so far counts). */
export function weeklyBests(
  ctx: ExerciseCtx,
): { week: number; best: number }[] {
  const byWeek = new Map<number, number>();
  for (const s of ctx.win) {
    const wk = weekKey(s.startedAt, ctx.tz, ctx.weekStart);
    byWeek.set(wk, Math.max(byWeek.get(wk) ?? 0, s.e1rm as number));
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, best]) => ({ week, best }));
}

/** Deload form (R17/C14): half the sets rounded down (min 1), the loads of the
 * most recent session, back-offs dropped first, 3-4 RIR. */
export function deloadAction(
  ctx: ExerciseCtx,
): { action: CoachAction; sets: number; loadKg: number } | null {
  const last = ctx.win[ctx.win.length - 1] ?? ctx.latest;
  const sets = Math.max(1, Math.floor(last.sets.length / 2));
  const loadKg = last.heaviestKg;
  return {
    sets,
    loadKg,
    action: {
      kind: "deload",
      exerciseIds: [ctx.exercise.id],
      setsPerExercise: { [ctx.exercise.id]: sets },
      loadKg: { [ctx.exercise.id]: loadKg },
      rir: DELOAD_RIR,
      weeks: 1,
    },
  };
}

/** C14: weekly best down by MORE than 2.5 % in each of two consecutive
 * Mon-Sun weeks, at planned effort; evaluated every session. */
export function c14(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  if (ctx.restart || ctx.deloadActive) return out;
  const wk = weeklyBests(ctx);
  if (wk.length < 3) return out;
  const [a, b, c] = wk.slice(-3);
  if (!(b.week - a.week === 7 && c.week - b.week === 7)) return out;
  if (
    !declinedMoreThan(a.best, b.best, C14_DECLINE) ||
    !declinedMoreThan(b.best, c.best, C14_DECLINE)
  )
    return out;
  const act = deloadAction(ctx);
  if (!act) return out;
  const name = ctx.exercise.name.toLowerCase();
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C14",
      exerciseId: ctx.exercise.id,
      anchor: ctx.latest.sessionId,
      severity: "caution",
      surfaces: ["prescription", "weekly"],
      message: `${name}'s slid two weeks running at normal effort. take a deload week: ${act.sets === 1 ? "one set" : `${act.sets} sets`} of ${kg(act.loadKg)}, stop ${DELOAD_RIR[0]} to ${DELOAD_RIR[1]} reps short. back to normal after.`,
      why: [
        {
          text: "Weekly best e1RM fell more than 2.5% in each of two consecutive Monday-Sunday weeks.",
          stat: {
            label: "Weekly bests",
            value: `${a.best.toFixed(1)} → ${b.best.toFixed(1)} → ${c.best.toFixed(1)}`,
          },
          cite: "C14 · R17/R25",
        },
        {
          text: `Deload: half the sets, same loads, ${DELOAD_RIR[0]}-${DELOAD_RIR[1]} RIR, same frequency. For fatigue and recovery, not a size claim.`,
        },
      ],
      tier: "T5",
      action: act.action,
      data: {
        w1: a.best,
        w2: b.best,
        w3: c.best,
        declinePrev: (a.best - b.best) / a.best,
        declineCur: (b.best - c.best) / b.best,
        loadKg: act.loadKg,
        sets: act.sets,
      },
    }),
  );
  return out;
}

/** C15: a gap of 14+ days → restart at 80-90 % of the previous top load
 * (default 85 %), then rebuild. The old window is not used for drop/stall/C14. */
export function c15(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  if (!ctx.restart) return out;
  const prev = ctx.prev;
  if (!prev) return out;
  const top = prev.heaviestKg;
  const g = gridKg(ctx.exercise) ?? 0.5;
  const load = roundToGrid(top * RESTART_PCT.default, g);
  const range: [number, number] = [
    roundToGrid(top * RESTART_PCT.low, g),
    roundToGrid(top * RESTART_PCT.high, g),
  ];
  const weeks = Math.round(ctx.gapDays / 7);
  const name = ctx.exercise.name.toLowerCase();
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C15",
      exerciseId: ctx.exercise.id,
      anchor: prev.sessionId,
      severity: "caution",
      surfaces: ["prescription"],
      message: `it's been ${weeks} week${weeks === 1 ? "" : "s"} since ${name}. start at ${kg(load)}, about ${pct(RESTART_PCT.default).replace(".0", "")} of your old top weight, and build back up. no need to go heavy yet.`,
      why: [
        {
          text: `${ctx.gapDays} days since the last session; old top load ${kg(top)}.`,
          stat: { label: "Restart range", value: `${range[0]}-${range[1]} kg` },
          cite: "C15 · Coleman 2024 PMID 38274324 (1-week break only)",
        },
        {
          text: "Practical default: restart near 80-90% and rebuild. Earlier sessions are not compared across the gap.",
        },
      ],
      tier: "T5",
      action: {
        kind: "restart_load",
        exerciseId: ctx.exercise.id,
        loadKg: load,
        rangeKg: range,
      },
      data: {
        restartKg: load,
        lowKg: range[0],
        highKg: range[1],
        gapDays: ctx.gapDays,
      },
    }),
  );
  return out;
}

export { DAY_MS };
