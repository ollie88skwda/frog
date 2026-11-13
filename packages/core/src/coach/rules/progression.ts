// C1, C2c (progress / overshoot / stall), C2, C3. COACH-LOGIC.md "Stalled lift".

import { primaryMuscles } from "../../domain/anatomy";
import {
  COMPOUND_BAND,
  HIGH_STRESS,
  ISOLATION_BAND,
  MAX_DIRECT_SETS_PER_SESSION,
  MIN_STALL_SESSIONS,
  SHORT_SLEEP_H,
} from "../constants";
import { type ExerciseCtx, empty, kg, mk, pct, type RuleOutput } from "../ctx";
import { nextLoad } from "../grid";
import { plannedRirAt, withinOneOfTarget } from "../history";

const CITE_C2C = "C2c · Mayhew 1995 PMID 7500624; ACSM 2009 PMID 19204579";

/** Direct sets for the exercise's primary muscle(s) in this exercise's session
 * (R7b): slots sharing its dayKey, else only its own slot. */
export function directSetsForMuscle(ctx: ExerciseCtx): number {
  const mine = new Set(primaryMuscles(ctx.exercise.muscleTargets));
  const slots = ctx.input.plan ?? [];
  const own = slots.find((s) => s.exerciseId === ctx.exercise.id);
  if (!own) return ctx.planned?.sets ?? 0;
  let total = 0;
  for (const slot of slots) {
    if (own.dayKey ? slot.dayKey !== own.dayKey : slot !== own) continue;
    const ex = ctx.input.exercises.get(slot.exerciseId);
    if (!ex) continue;
    if (primaryMuscles(ex.muscleTargets).some((m) => mine.has(m)))
      total += slot.planned.sets;
  }
  return total;
}

/** C2 steps already taken in this exercise's history: rep-range changes and
 * added sets (a block change counts one each; an added set keeps the window). */
export function c2History(ctx: ExerciseCtx): {
  rangeChanges: number;
  addedSet: boolean;
} {
  let rangeChanges = 0;
  let addedSet = false;
  let prevKey: string | null = null;
  let prevSets: number | null = null;
  for (const s of ctx.hist) {
    if (s.isDeload) continue;
    const range = s.planned
      ? `${s.planned.repsMin}-${s.planned.repsMax}`
      : null;
    if (range != null && prevKey != null && range !== prevKey) rangeChanges++;
    if (
      s.planned &&
      prevSets != null &&
      s.planned.sets > prevSets &&
      range === prevKey
    )
      addedSet = true;
    if (range != null) prevKey = range;
    if (s.planned) prevSets = s.planned.sets;
  }
  return { rangeChanges, addedSet };
}

/** Next heavier range: top −2, bottom −1, inside the band (R8b); null if it
 * would leave the band. */
export function shiftHeavier(
  reps: [number, number],
  isCompound: boolean,
): [number, number] | null {
  const band = isCompound ? COMPOUND_BAND : ISOLATION_BAND;
  const next: [number, number] = [reps[0] - 1, reps[1] - 2];
  if (next[0] < band.min || next[1] < next[0]) return null;
  return next;
}

/** C1: a missed target is one data point, read with sleep and stress. */
export function c1(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const s = ctx.latest;
  const p = s.planned;
  if (!p || s.isDeload) return out;
  const idx = s.sets.indexOf(s.topSet);
  const rir = s.topSet.rir;
  if (!rir || !withinOneOfTarget(rir, plannedRirAt(p, idx))) return out;
  if (s.topSet.reps >= p.repsMin) return out;
  const normal =
    (s.sleepH == null || s.sleepH >= SHORT_SLEEP_H) &&
    (s.stress == null || s.stress < HIGH_STRESS);
  const ctxLine = normal
    ? `sleep${s.sleepH != null ? ` (${s.sleepH} h)` : ""} and stress${s.stress != null ? ` (${s.stress}/10)` : ""} look normal, so probably just a rough day.`
    : "sleep or stress was off that day, which likely explains it.";
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C1",
      exerciseId: ctx.exercise.id,
      anchor: s.sessionId,
      severity: "info",
      surfaces: ["post_session"],
      message: `top ${ctx.exercise.name.toLowerCase()} was ${s.topSet.reps} reps, under your ${p.repsMin} rep minimum. ${ctxLine} no change needed; watch the next session.`,
      why: [
        {
          text: `Top set ${kg(s.topSet.weightKg)} × ${s.topSet.reps} at planned effort.`,
          stat: { label: "Planned reps", value: `${p.repsMin}-${p.repsMax}` },
        },
        {
          text: "One missed target is one data point; check readiness before changing anything.",
          cite: "C1",
        },
      ],
      tier: "T5",
      action: { kind: "text_only" },
      data: { reps: s.topSet.reps, repsMin: p.repsMin },
    }),
  );
  return out;
}

/** C2c add-load (overshoot wins over two-session) as a suggestion. */
export function addLoad(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const trig = ctx.pending;
  if (!trig || !ctx.planned) return out;
  const p = ctx.planned;
  const next = nextLoad(ctx.exercise, trig.atKg);
  const overshoot = trig.kind === "overshoot";
  const ruleId = overshoot ? "C2c-overshoot" : "C2c-progress";
  const why = [
    {
      text: overshoot
        ? `Heaviest set passed the top of your range (${p.repsMax}) by 2+ reps with effort near plan.`
        : `Every working set hit the top of the range (${p.repsMax}) at planned effort, two sessions running.`,
      stat: { label: "Current load", value: kg(trig.atKg) },
      cite: CITE_C2C,
    },
    {
      text: "Rule: add load, then restart reps at the bottom of the range.",
      cite: "C2c",
    },
  ];
  if (next.kind === "text") {
    out.suggestions.push(
      mk(ctx, {
        ruleId,
        exerciseId: ctx.exercise.id,
        anchor: trig.fromSessionId,
        severity: "suggest",
        surfaces: trig.overridden
          ? ["prescription"]
          : ["prescription", "in_set", "post_session"],
        message: `top of the range two sessions running on ${kg(trig.atKg)}. the smallest step may be a big jump here, so add a small add-on weight or keep adding reps first.`,
        why,
        tier: "T5",
        action: { kind: "text_only" },
        data: { fromKg: trig.atKg, fallback: next.reason },
      }),
    );
    return out;
  }
  out.suggestions.push(
    mk(ctx, {
      ruleId,
      exerciseId: ctx.exercise.id,
      anchor: trig.fromSessionId,
      severity: "suggest",
      surfaces: trig.overridden
        ? ["prescription"]
        : ["prescription", "in_set", "post_session"],
      message: overshoot
        ? trig.overridden
          ? `still at ${kg(trig.atKg)}; ready to go up to ${kg(next.loadKg)} whenever.`
          : `${trig.reps} reps on ${kg(trig.atKg)} is past the top. go to ${kg(next.loadKg)} at your next normal-sleep session.`
        : trig.overridden
          ? `still at ${kg(trig.atKg)}; ready to go up to ${kg(next.loadKg)} whenever.`
          : `top of the range two sessions running. go to ${kg(next.loadKg)} next session.`,
      why: [
        ...why,
        {
          text: "Step is about 2.5% for compounds, 5% for small machines.",
          stat: {
            label: "Step",
            value: pct((next.loadKg - trig.atKg) / trig.atKg),
          },
        },
      ],
      tier: "T5",
      action: {
        kind: "set_load",
        exerciseId: ctx.exercise.id,
        loadKg: next.loadKg,
        reps: [p.repsMin, p.repsMax],
        rir: [p.rirMin, p.rirMax],
      },
      data: { fromKg: trig.atKg, toKg: next.loadKg, trigger: trig.kind },
    }),
  );
  return out;
}

/** C2c-stall → C2 (rep-range shift, added set, lighter) → C3 (swap), plus the
 * conditional drop-load. */
export function stall(ctx: ExerciseCtx): RuleOutput {
  const out = empty();
  const a = ctx.analysis;
  const id = ctx.exercise.id;
  const p = ctx.planned;
  if (!a.stall.evaluable) {
    out.notEvaluated.push({
      ruleId: "C2c-stall",
      exerciseId: id,
      reason:
        ctx.inferred && a.n >= MIN_STALL_SESSIONS
          ? "no_snapshot"
          : "too_few_sessions",
      detail: `${a.n} sessions logged; stall check starts at ${MIN_STALL_SESSIONS}`,
    });
  }
  const c2 = c2History(ctx);
  // Drop-load: only after a C2 step has been tried and e1RM fell beyond the band
  // again (never together with the stall response on the same session).
  if (a.isDrop && !a.stall.stalled && (c2.rangeChanges > 0 || c2.addedSet)) {
    const from = ctx.baseLoadKg;
    const to = Math.max(0, Math.round(from * 0.95 * 2) / 2);
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C2",
        exerciseId: id,
        anchor: `drop:${ctx.latest.sessionId}`,
        severity: "suggest",
        surfaces: ["prescription", "post_session"],
        message: `${ctx.exercise.name.toLowerCase()} fell ${pct(a.dropPct as number)} below your usual after a plan change. drop to ${kg(to)} and rebuild with reps first.`,
        why: [
          {
            text: "A further decline beyond the 10% noise band after a range or set change.",
            stat: { label: "Below median", value: pct(a.dropPct as number) },
            cite: "C2c-drop",
          },
        ],
        tier: "T5",
        action: {
          kind: "set_load",
          exerciseId: id,
          loadKg: to,
          reps: p ? [p.repsMin, p.repsMax] : undefined,
        },
        data: { fromKg: from, toKg: to },
      }),
    );
  }
  if (!a.stall.stalled || !p) return out;

  const dropNote = a.isDrop
    ? ` today was ${((a.dropPct as number) * 100).toFixed(0)}% down.`
    : "";
  const why = [
    {
      text: `No new best e1RM in the last 6 of ${a.n} comparable sessions (estimate, ±10%).`,
      stat: {
        label: "Best before",
        value: `${(a.stall.priorBest as number).toFixed(1)} kg`,
      },
      cite: "C2c-stall",
    },
  ];
  const band = ctx.exercise.isCompound ? COMPOUND_BAND : ISOLATION_BAND;
  const reps: [number, number] = [p.repsMin, p.repsMax];
  const heavier = shiftHeavier(reps, ctx.exercise.isCompound);
  const canAdd = directSetsForMuscle(ctx) + 1 <= MAX_DIRECT_SETS_PER_SESSION;
  const name = ctx.exercise.name.toLowerCase();
  const anchor = `${ctx.latest.sessionId}`;

  // C3: swap only after two block changes and once no C2 step is left untried.
  const addTried = c2.addedSet || !canAdd;
  if (!heavier && addTried && c2.rangeChanges >= 2) {
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C3",
        exerciseId: id,
        anchor,
        severity: "suggest",
        surfaces: ["weekly", "post_session"],
        message: `${name} is still stuck after rep-range and set changes. a different ${ctx.exercise.isCompound ? "variation" : "exercise"} for the same muscle is now worth trying.`,
        why: [
          ...why,
          {
            text: "Swaps come only after two block changes with no C2 step left. No trial shows swapping grows muscle faster.",
            cite: "C3 · R12/R13",
          },
        ],
        tier: "T5",
        action: { kind: "text_only" },
        data: { rangeChanges: c2.rangeChanges },
      }),
    );
    return out;
  }

  if (heavier) {
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C2c-stall",
        exerciseId: id,
        anchor,
        severity: "suggest",
        surfaces: ["prescription", "weekly", "post_session"],
        message: `${name} has been flat for ${a.n} sessions.${dropNote} no swap yet. keeping ${kg(ctx.baseLoadKg)}; next block ${heavier[0]} to ${heavier[1]} reps.`,
        why: [
          ...why,
          {
            text: `Rule: shift the rep range heavier (top −2, bottom −1) within ${band.min}-${band.max} first.`,
            cite: "C2 · R8b",
          },
        ],
        tier: "T5",
        action: { kind: "change_rep_range", exerciseId: id, reps: heavier },
        data: { toMin: heavier[0], toMax: heavier[1], loadKg: ctx.baseLoadKg },
      }),
    );
    return out;
  }
  if (canAdd && !c2.addedSet) {
    out.suggestions.push(
      mk(ctx, {
        ruleId: "C2c-stall",
        exerciseId: id,
        anchor,
        severity: "suggest",
        surfaces: ["prescription", "weekly", "post_session"],
        message: `still stuck at ${kg(ctx.baseLoadKg)} after rep-range changes. adding one set next block; if that stalls too, we can try a different ${ctx.exercise.isCompound ? "variation" : "exercise"}.`,
        why: [
          ...why,
          {
            text: "Rule: add one set, only while the muscle stays at 5 or fewer direct sets in a session.",
            cite: "C2 · R7b",
          },
        ],
        tier: "T5",
        action: { kind: "add_set", exerciseId: id },
        data: { sets: p.sets + 1 },
      }),
    );
    return out;
  }
  // Out of heavier shifts and sets: lighter range.
  const lighter: [number, number] = ctx.exercise.isCompound ? [6, 9] : [12, 15];
  out.suggestions.push(
    mk(ctx, {
      ruleId: "C2c-stall",
      exerciseId: id,
      anchor,
      severity: "suggest",
      surfaces: ["prescription", "weekly", "post_session"],
      message: `${name} is flat. try ${lighter[0]} to ${lighter[1]} reps at a lighter load for a block.`,
      why: [
        ...why,
        {
          text: "Rule: lighter range after heavier shifts and set adds.",
          cite: "C2",
        },
      ],
      tier: "T5",
      action: { kind: "change_rep_range", exerciseId: id, reps: lighter },
    }),
  );
  return out;
}
