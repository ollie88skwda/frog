// evaluateCoach(): the one entry point (F4). Pure, no Date.now(), no backend.
// Folds `generator/overload.ts nextPrescription` and
// `findings/recommendations.ts` behind one engine; callers stop using those.

import { roleAt } from "../domain/anatomy";
import { bodyweightSummary } from "./bodyweight";
import {
  BASELINE_SESSIONS,
  BREAK_DAYS,
  COACH_WEEK_START,
  DAY_MS,
  HIGH_STRESS,
  MIN_RIR_COVERAGE,
  SHORT_SLEEP_H,
} from "./constants";
import type { ExerciseCtx, Readiness } from "./ctx";
import { dormantNotEvaluated } from "./dormant";
import { median } from "./e1rm";
import {
  analyze,
  buildExHistory,
  type ExSession,
  pendingAddLoad,
  plannedKey,
  rirCoverage,
  stallWindow,
  windowFor,
} from "./history";
import { resolve, rulePriority } from "./resolve";
import { c14, c15 } from "./rules/deload";
import { drift } from "./rules/drift";
import { addLoad, c1, stall } from "./rules/progression";
import { c7, c9b, c9d, c10 } from "./rules/readiness";
import { c19, volume } from "./rules/volume";
import { localDayIndex } from "./time";
import type {
  CoachInput,
  CoachResult,
  CoachSession,
  CoachSuggestion,
  ExerciseCoachState,
  ExercisePrescription,
  NotEvaluated,
  PlannedTarget,
} from "./types";

function readinessOf(
  input: CoachInput,
  session: CoachSession | null,
): Readiness | null {
  if (!session) return null;
  const earlier = input.sessions
    .filter((s) => s.id !== session.id && s.startedAt < session.startedAt)
    .sort((a, b) => a.startedAt - b.startedAt);
  const prev = earlier[earlier.length - 1];
  const short = session.sleepH != null && session.sleepH < SHORT_SLEEP_H;
  const highStress = session.stress != null && session.stress >= HIGH_STRESS;
  return {
    sessionId: session.id,
    sleepH: session.sleepH,
    stress: session.stress,
    shortSleep: short,
    highStress,
    bad: short || highStress,
    backToBackShort:
      short && prev?.sleepH != null && prev.sleepH < SHORT_SLEEP_H,
  };
}

/** Evaluate one exercise. Returns its suggestions (unresolved), state and
 * not-evaluated notes. `evaluateCoach` resolves across all of them. */
export function evaluateExercise(
  input: CoachInput,
  exerciseId: string,
  ref?: { weekStart?: number },
): {
  suggestions: CoachSuggestion[];
  state: ExerciseCoachState;
  notEvaluated: NotEvaluated[];
  stalled: boolean;
} | null {
  const exercise = input.exercises.get(exerciseId);
  if (!exercise) return null;
  const tz = input.prefs?.tzOffsetMin ?? 0;
  const current = input.currentSessionId
    ? (input.sessions.find((s) => s.id === input.currentSessionId) ?? null)
    : null;
  const refTime = current?.startedAt ?? input.asOf;
  const planSlot =
    input.plan?.find((p) => p.exerciseId === exerciseId)?.planned ?? null;
  const sessions = input.sessions
    .filter((s) => s.startedAt <= input.asOf)
    .sort((a, b) => a.startedAt - b.startedAt);
  const histAll = buildExHistory(exerciseId, sessions, planSlot);
  const notEvaluated: NotEvaluated[] = [];

  const emptyState = (): ExerciseCoachState => ({
    comparableSessions: 0,
    sessionE1rms: [],
    baselineMedian: null,
    stalled: null,
    stallPending: false,
    dropPct: null,
    pendingAddLoad: null,
    holdActive: false,
    deloadActive: null,
    rirSkipCount: 0,
    rirCoverage: null,
    prescription: null,
  });
  if (!histAll.length) {
    const st = emptyState();
    if (planSlot)
      st.prescription = {
        loadKg: planSlot.loadKg ?? null,
        reps: [planSlot.repsMin, planSlot.repsMax],
        rir: [planSlot.rirMin, planSlot.rirMax],
        sets: planSlot.sets,
        ruleId: null,
        delta: "same",
      };
    notEvaluated.push({
      ruleId: "all",
      exerciseId,
      reason: "too_few_sessions",
      detail: "no sessions logged for this exercise yet",
    });
    return { suggestions: [], state: st, notEvaluated, stalled: false };
  }

  // Restart: a 14+ day gap before the reference session starts a new window (C2c-reset).
  const before = histAll.filter(
    (s) => s.startedAt < refTime && s.sessionId !== current?.id,
  );
  const prev = before[before.length - 1] ?? null;
  const gapDays = prev ? Math.floor((refTime - prev.startedAt) / DAY_MS) : 0;
  const restart =
    prev != null && refTime - prev.startedAt >= BREAK_DAYS * DAY_MS;
  const hist = restart
    ? histAll.filter((s) => s.startedAt >= refTime)
    : histAll;
  const latest = hist[hist.length - 1] ?? histAll[histAll.length - 1];

  const target = [...hist].reverse().find((s) => !s.isDeload) ?? latest;
  const planned = planSlot ?? target.planned;
  const coverage = rirCoverage(histAll);
  const lowRir = coverage != null && coverage < MIN_RIR_COVERAGE;
  const key = plannedKey(target.planned);
  const endIdx = hist.length - 1;
  const win = endIdx >= 0 ? windowFor(hist, endIdx, key) : [];
  const progWin = endIdx >= 0 ? windowFor(hist, endIdx, key, false) : [];
  const analysis = analyze(stallWindow(win));
  const pending = pendingAddLoad(progWin, hist);
  const readiness = readinessOf(input, current);

  const recent = [...win].slice(-3).map((s) => s.heaviestKg);
  const baseLoadKg = recent.length
    ? median(recent)
    : (prev?.heaviestKg ?? latest.heaviestKg);

  const lastDeload = [...histAll].reverse().find((s) => s.isDeload);
  const deloadActive =
    lastDeload && refTime - lastDeload.startedAt < 7 * DAY_MS
      ? { until: lastDeload.startedAt + 7 * DAY_MS }
      : null;

  const currentExIds = current?.exercises.map((e) => e.exerciseId) ?? [];
  const ctx: ExerciseCtx = {
    input,
    asOf: input.asOf,
    tz,
    exercise,
    hist,
    win,
    progWin,
    analysis,
    latest,
    planned,
    readiness,
    currentSession: current,
    prev,
    gapDays,
    rirCoverage: coverage,
    inferred: win.some((s) => s.inferred),
    deloadActive,
    pending,
    baseLoadKg,
    restart,
    weekStart: ref?.weekStart ?? COACH_WEEK_START,
    isLastInCurrent:
      currentExIds.length > 0 &&
      currentExIds[currentExIds.length - 1] === exerciseId,
  };

  const suggestions: CoachSuggestion[] = [];
  const run = (out: {
    suggestions: CoachSuggestion[];
    notEvaluated: NotEvaluated[];
  }) => {
    suggestions.push(...out.suggestions);
    notEvaluated.push(...out.notEvaluated);
  };

  // Rules that need no RIR.
  run(c15(ctx));
  run(c9d(ctx));
  if (lowRir) {
    notEvaluated.push({
      ruleId: "C1/C2c/C4/C5/C7/C10/C14",
      exerciseId,
      reason: "no_rir",
      detail: `only ${Math.round((coverage as number) * 100)}% of recent sets have RIR; log RIR to unlock suggestions`,
    });
  } else if (!restart || hist.length) {
    // Post-session rules only judge the session being reviewed (current, or
    // the latest completed when no session is in progress).
    const reviewing = !current || latest.sessionId === current.id;
    if (reviewing) {
      run(c1(ctx));
      run(c9b(ctx));
      if (win.length && win[win.length - 1].sessionId === latest.sessionId)
        run(c7(ctx));
    }
    if (!deloadActive) {
      run(addLoad(ctx));
      run(stall(ctx));
      run(drift(ctx));
      run(c14(ctx));
      run(c10(ctx));
    }
  }

  // C19 carbs: display only; a comment appears after ≥3 sessions of the same link.
  const e1rms = win.map((s) => ({
    sessionId: s.sessionId,
    e1rm: s.e1rm as number,
    flagged: s.flagged,
    carbsG: s.carbsG,
  }));
  suggestions.push(...c19({ exerciseId, name: exercise.name }, e1rms, ctx));

  const state: ExerciseCoachState = {
    comparableSessions: win.length,
    sessionE1rms: e1rms,
    baselineMedian: analysis.baselineMedian,
    stalled: analysis.stall.evaluable ? analysis.stall.stalled : null,
    stallPending: analysis.stall.pending,
    dropPct: analysis.dropPct,
    pendingAddLoad: pending
      ? { loadKg: pending.atKg, fromSessionId: pending.fromSessionId }
      : null,
    holdActive: !!readiness?.shortSleep,
    deloadActive,
    rirSkipCount: histAll
      .slice(-BASELINE_SESSIONS)
      .reduce((a, s) => a + s.skippedNoRir, 0),
    rirCoverage: coverage,
    prescription: null,
  };
  return {
    suggestions,
    state,
    notEvaluated,
    stalled: analysis.stall.stalled,
  };
}

function prescriptionFor(
  planned: PlannedTarget | null,
  baseLoadKg: number | null,
  mine: CoachSuggestion[],
): ExercisePrescription {
  const p: ExercisePrescription = {
    loadKg: baseLoadKg ?? planned?.loadKg ?? null,
    reps: planned ? [planned.repsMin, planned.repsMax] : null,
    rir: planned ? [planned.rirMin, planned.rirMax] : null,
    sets: planned?.sets ?? null,
    ruleId: null,
    delta: "same",
  };
  const plan = mine
    .filter(
      (s) =>
        s.action.kind !== "text_only" &&
        !(s.surfaces.length === 1 && s.surfaces[0] === "weekly"),
    )
    .filter((s) => s.surfaces.includes("prescription"))
    // Highest-priority rule applies last, so a deload beats a hold's load.
    .sort((a, b) => rulePriority(a.ruleId) - rulePriority(b.ruleId));
  for (const s of plan) {
    const a = s.action;
    switch (a.kind) {
      case "deload":
        p.loadKg = Object.values(a.loadKg)[0] ?? p.loadKg;
        p.sets = Object.values(a.setsPerExercise)[0] ?? p.sets;
        p.rir = a.rir;
        p.delta = "deload";
        p.ruleId = s.ruleId;
        break;
      case "restart_load":
        p.loadKg = a.loadKg;
        p.delta = "restart";
        p.ruleId = s.ruleId;
        break;
      case "hold_load":
        p.loadKg = a.loadKg;
        p.delta = "hold";
        p.ruleId = s.ruleId;
        break;
      case "set_load":
        p.loadKg = a.loadKg;
        if (a.reps) p.reps = a.reps;
        if (a.rir) p.rir = a.rir;
        p.delta = "up";
        p.ruleId = s.ruleId;
        break;
      case "change_rep_range":
        p.reps = a.reps;
        p.delta = "range";
        p.ruleId = s.ruleId;
        break;
      case "set_target_rir":
        p.rir = a.rir;
        p.ruleId = s.ruleId;
        break;
      case "add_set":
        p.sets = (p.sets ?? 0) + 1;
        p.ruleId = s.ruleId;
        break;
      default:
        break;
    }
  }
  return p;
}

export function evaluateCoach(input: CoachInput): CoachResult {
  const bw = bodyweightSummary(
    input.bodyweight,
    localDayIndex(input.asOf, input.prefs?.tzOffsetMin ?? 0),
  );
  if (input.prefs?.enabled === false)
    return {
      suggestions: [],
      suppressed: [],
      banner: null,
      perExercise: new Map(),
      notEvaluated: [],
      bodyweight: bw,
    };

  const ids = new Set<string>();
  for (const s of input.sessions)
    for (const e of s.exercises) ids.add(e.exerciseId);
  for (const p of input.plan ?? []) ids.add(p.exerciseId);

  const all: CoachSuggestion[] = [];
  const perExercise = new Map<string, ExerciseCoachState>();
  const notEvaluated: NotEvaluated[] = [];
  const stalled = new Map<string, boolean>();
  for (const id of ids) {
    const r = evaluateExercise(input, id);
    if (!r) continue;
    all.push(...r.suggestions);
    perExercise.set(id, r.state);
    notEvaluated.push(...r.notEvaluated);
    stalled.set(id, r.stalled);
  }

  // Weekly volume (C11 / C12) over the coach week (COACH_WEEK_START).
  const tz = input.prefs?.tzOffsetMin ?? 0;
  const lastTwoWeeksRirOk = (muscle: string): boolean => {
    const since = input.asOf - 14 * DAY_MS;
    let judged = 0;
    for (const s of input.sessions) {
      if (s.startedAt < since) continue;
      for (const b of s.exercises) {
        const ex = input.exercises.get(b.exerciseId);
        if (
          !ex?.muscleTargets.some(
            (t, i) =>
              t.muscle === muscle && roleAt(ex.muscleTargets, i) === "primary",
          )
        )
          continue;
        const sets = buildExHistory(b.exerciseId, [s], null)[0]?.sets ?? [];
        for (const w of sets) {
          const planned = b.planned;
          if (!w.rir || !planned) return false;
          if (w.rir.min < 2 || w.reps < planned.repsMin) return false;
          judged++;
        }
      }
    }
    return judged > 0;
  };
  const vol = volume(input, input.asOf, tz, stalled, lastTwoWeeksRirOk);
  all.push(...vol.suggestions);

  const readinessSession = input.currentSessionId
    ? input.sessions.find((s) => s.id === input.currentSessionId)
    : undefined;
  const bad =
    !!readinessSession &&
    ((readinessSession.sleepH ?? SHORT_SLEEP_H) < SHORT_SLEEP_H ||
      (readinessSession.stress ?? 0) >= HIGH_STRESS);
  const resolved = resolve(all, {
    exercises: input.exercises,
    dismissed: input.prefs?.dismissed ?? [],
    rulesOff: input.prefs?.rulesOff ?? [],
    asOf: input.asOf,
    badDayExercises: bad ? new Set(ids) : new Set(),
  });

  // Prescription per exercise from the resolved, dismiss-aware suggestions.
  for (const [id, st] of perExercise) {
    const mine = resolved.suggestions.filter((s) => s.exerciseId === id);
    const planSlot =
      input.plan?.find((p) => p.exerciseId === id)?.planned ?? null;
    const deloadOn = st.deloadActive != null;
    const lastPlanned =
      input.sessions
        .filter((s) => s.startedAt <= input.asOf)
        .sort((a, b) => a.startedAt - b.startedAt)
        .flatMap((s) =>
          s.exercises.filter(
            (e) =>
              e.exerciseId === id &&
              e.planned &&
              (deloadOn || !e.planned.isDeload),
          ),
        )
        .map((e) => e.planned as PlannedTarget)
        .pop() ?? null;
    const load = baseLoadFor(input, id);
    st.prescription = prescriptionFor(
      deloadOn ? (lastPlanned ?? planSlot) : (planSlot ?? lastPlanned),
      load,
      mine,
    );
  }

  const bannerRank = (s: CoachSuggestion) =>
    s.action.kind === "deload"
      ? 3
      : s.ruleId === "C15"
        ? 2
        : s.ruleId === "C9d"
          ? 1
          : 0;
  const banner =
    [...resolved.suggestions]
      .filter((s) => bannerRank(s) > 0)
      .sort((a, b) => bannerRank(b) - bannerRank(a))[0] ?? null;

  notEvaluated.push(...dormantNotEvaluated(input.prefs?.features));

  return {
    suggestions: resolved.suggestions,
    suppressed: resolved.suppressed,
    banner,
    perExercise,
    notEvaluated,
    bodyweight: bw,
  };
}

function baseLoadFor(input: CoachInput, exerciseId: string): number | null {
  const sessions = input.sessions
    .filter((s) => s.startedAt <= input.asOf)
    .sort((a, b) => a.startedAt - b.startedAt);
  const h: ExSession[] = buildExHistory(exerciseId, sessions, null).filter(
    (s) => !s.isDeload && s.effortOk !== false,
  );
  const last3 = h.slice(-3).map((s) => s.heaviestKg);
  return last3.length ? median(last3) : null;
}
