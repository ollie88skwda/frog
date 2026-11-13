// C7, C9b, C9d, C10 (and the C8 guard). COACH-LOGIC.md "Bad sleep, caffeine, or stress days".

import {
  C9B_BEFORE_MINUTE,
  C10_SHARE,
  C10_WINDOW_DAYS,
  DELOAD_RIR,
  LIGHT_LOAD_FRACTION,
  SHORT_SLEEP_H,
} from "../constants";
import { type ExerciseCtx, empty, kg, mk, pct, type RuleOutput } from "../ctx";
import { localDayIndex, localMinuteOfDay } from "../time";
import { deloadAction, weeklyBests } from "./deload";

/** C9d: short sleep before this session → hold load, skip add-load (incl.
 * overshoot, which stays pending). Two back-to-back short nights add the
 * no-stall flag. */
export function c9d(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const r = ctx.readiness;
  if (!r?.shortSleep || ctx.restart) return out;
  const load = ctx.pending ? ctx.pending.atKg : ctx.baseLoadKg;
  const name = ctx.exercise.name.toLowerCase();
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C9d",
      exerciseId: ctx.exercise.id,
      anchor: r.sessionId,
      severity: "caution",
      surfaces: ["prescription", "in_set"],
      message: r.backToBackShort
        ? `slept ${r.sleepH} h again, so hold ${name} at ${kg(load)} or accept fewer reps. a miss today won't count as a stall.`
        : `slept ${r.sleepH} h, so ${kg(load)} again today. hold it, no shame.`,
      why: [
        {
          text: `Sleep before this session: ${r.sleepH} h (under ${SHORT_SLEEP_H} h).`,
          stat: { label: "Sleep", value: `${r.sleepH} h` },
          cite: "C9d · Knowles 2018 PMID 29422383",
        },
        {
          text: ctx.pending
            ? `The planned add to ${kg(ctx.pending.atKg)}+ waits for the next normal-sleep session.`
            : "One short night is enough to hold load; no weekly volume change (C8).",
        },
      ],
      tier: "T4",
      action: { kind: "hold_load", exerciseId: ctx.exercise.id, loadKg: load },
      data: { sleepH: r.sleepH, backToBack: r.backToBackShort, holdKg: load },
    }),
  );
  return out;
}

/** C7: bad-day cut: one fewer set on the LAST exercise, only if the session
 * also dropped beyond the noise band (≥3 prior comparable). Session-only. */
export function c7(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const r = ctx.readiness;
  const a = ctx.analysis;
  if (!r?.bad || !ctx.isLastInCurrent) return out;
  if (ctx.latest.sessionId !== r.sessionId) return out; // needs today's sets
  if (!a.isDrop) return out; // also covers <3 prior
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C7",
      exerciseId: ctx.exercise.id,
      anchor: r.sessionId,
      severity: "caution",
      surfaces: ["in_set", "post_session"],
      message: `rough day (${r.shortSleep ? `${r.sleepH} h sleep` : `stress ${r.stress}/10`}) and ${ctx.exercise.name.toLowerCase()} is ${pct(a.dropPct as number)} under your usual. skip one set today; this week's plan stays the same.`,
      why: [
        {
          text: "Short sleep or stress 8+ together with a drop beyond the 10% noise band.",
          stat: { label: "Below median", value: pct(a.dropPct as number) },
          cite: "C7",
        },
        { text: "Session-only: it never changes weekly volume (C8)." },
      ],
      tier: "T5",
      action: { kind: "remove_set", exerciseId: ctx.exercise.id, count: 1 },
      data: { dropPct: a.dropPct },
    }),
  );
  return out;
}

/** C9b: morning light-load note. Advice only; never changes load/sets/stall math. */
export function c9b(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const s = ctx.latest;
  if (s.baseline == null) return out;
  const minute = localMinuteOfDay(s.startedAt, ctx.tz);
  if (minute >= C9B_BEFORE_MINUTE) return out; // strict: 09:59 fires, 10:00 not
  const light = s.sets.find(
    (x) => x.weightKg <= LIGHT_LOAD_FRACTION * (s.baseline as number),
  );
  if (!light) return out;
  const frac = light.weightKg / s.baseline;
  const heavyNote =
    s.e1rm != null
      ? ` heavy sets look normal, about ${Math.abs(((s.baseline - s.e1rm) / s.baseline) * 100).toFixed(0)}% ${s.e1rm < s.baseline ? "under" : "over"} your usual${Math.abs(s.baseline - s.e1rm) / s.baseline <= 0.1 ? ", inside normal wobble" : ""}.`
      : "";
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C9b",
      exerciseId: ctx.exercise.id,
      anchor: s.sessionId,
      severity: "info",
      surfaces: ["post_session"],
      message: `${kg(light.weightKg)} set this morning, and light morning sets can dip a bit. don't read it as lost strength.${heavyNote} no change to the plan.`,
      why: [
        {
          text: `Session started before 10:00 and a set was at ${pct(frac)} of your baseline e1RM (25% line).`,
          stat: {
            label: "Baseline e1RM",
            value: `${s.baseline.toFixed(1)} kg`,
          },
          cite: "C9b · Montalvo-Alonso 2025 PMID 40478455",
        },
      ],
      tier: "T3",
      action: { kind: "text_only" },
      data: {
        baseline: s.baseline,
        lightPct: frac * 100,
        lightKg: light.weightKg,
      },
    }),
  );
  return out;
}

/** C10: >50 % of sessions in the last 14 days were short-sleep AND the weekly
 * best e1RM fell two consecutive weeks (current week so far counts): sleep
 * check plus a deload in C14's form. */
export function c10(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const asOfDay = localDayIndex(ctx.asOf, ctx.tz);
  const recent = ctx.input.sessions.filter((s) => {
    if (s.sleepH == null || s.startedAt > ctx.asOf) return false;
    const d = localDayIndex(s.startedAt, ctx.tz);
    return d > asOfDay - C10_WINDOW_DAYS && d <= asOfDay;
  });
  if (!recent.length) return out;
  const short = recent.filter(
    (s) => (s.sleepH as number) < SHORT_SLEEP_H,
  ).length;
  const share = short / recent.length;
  if (share <= C10_SHARE) return out;
  const wk = weeklyBests(ctx);
  const n = wk.length;
  if (n < 3) return out;
  const [a, b, c] = wk.slice(-3);
  if (!(b.week - a.week === 7 && c.week - b.week === 7)) return out;
  if (!(b.best < a.best && c.best < b.best)) return out;
  const act = deloadAction(ctx);
  if (!act) return out;
  const name = ctx.exercise.name.toLowerCase();
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C10",
      exerciseId: ctx.exercise.id,
      anchor: ctx.latest.sessionId,
      severity: "caution",
      surfaces: ["prescription", "weekly"],
      message: `sleep's been under ${SHORT_SLEEP_H} h on ${short} of your last ${recent.length} sessions, and your best ${name} has dipped two weeks running. check sleep first; next week take ${act.sets} set${act.sets === 1 ? "" : "s"} at ${kg(act.loadKg)}, stopping ${DELOAD_RIR[0]} to ${DELOAD_RIR[1]} reps short.`,
      why: [
        {
          text: `${short} of ${recent.length} sessions in 14 days under ${SHORT_SLEEP_H} h sleep.`,
          stat: { label: "Short-sleep share", value: pct(share) },
          cite: "C10",
        },
        {
          text: "Weekly best e1RM fell two weeks running (current week so far counts). A readiness call, not a growth claim.",
          stat: {
            label: "Weekly bests",
            value: `${a.best.toFixed(1)} → ${b.best.toFixed(1)} → ${c.best.toFixed(1)}`,
          },
        },
      ],
      tier: "T5",
      action: act.action,
      data: { share, sleepShort: short, sessions: recent.length },
    }),
  );
  return out;
}
