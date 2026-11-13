// Precedence + conflict resolution: the only place rules interact
// (COACH-LOGIC.md "Rule precedence", F4). Pure.

import { DAY_MS, DISMISS_EXERCISE_DAYS } from "./constants";
import { clampRir } from "./grid";
import type {
  CoachAction,
  CoachExercise,
  CoachRuleId,
  CoachSeverity,
  CoachSuggestion,
  DismissRecord,
} from "./types";

/** Plan-changing priority; higher wins per exercise. The F4 order:
 * deload > restart > short-sleep hold > stall response > RIR drift > add load
 * > volume add/trim. Text-only advice is additive and never competes. */
const PRIORITY: Partial<Record<CoachRuleId, number>> = {
  C14: 100,
  C10: 100,
  C15: 90,
  C9d: 80,
  "C2c-stall": 60,
  C2: 60,
  C5: 50,
  C4: 50,
  "C2c-overshoot": 40,
  "C2c-progress": 39,
  C12: 20,
  C11: 10,
};

const SEVERITY_RANK: Record<CoachSeverity, number> = {
  stop: 3,
  caution: 2,
  suggest: 1,
  info: 0,
};

const isPlan = (s: CoachSuggestion) => s.action.kind !== "text_only";
const isWeeklyOnly = (s: CoachSuggestion) =>
  s.surfaces.length === 1 && s.surfaces[0] === "weekly";
const prio = (s: CoachSuggestion) => PRIORITY[s.ruleId] ?? 0;

/** C6 guard: clamp any emitted RIR (compounds never reach failure). */
function clampAction(
  a: CoachAction,
  ex: CoachExercise | undefined,
): CoachAction {
  const compound = ex?.isCompound ?? true;
  if (a.kind === "set_load" && a.rir)
    return { ...a, rir: clampRir(a.rir, compound) };
  if (a.kind === "set_target_rir")
    return { ...a, rir: clampRir(a.rir, compound) };
  return a;
}

function demote(
  s: CoachSuggestion,
  by: CoachSuggestion | string,
  why: CoachSuggestion["suppressedBy"],
): CoachSuggestion {
  return {
    ...s,
    supersededBy: typeof by === "string" ? by : by.id,
    suppressedBy: why,
  };
}

export function isDismissed(
  s: CoachSuggestion,
  dismissed: readonly DismissRecord[],
  rulesOff: readonly CoachRuleId[],
  asOf: number,
): boolean {
  if (rulesOff.includes(s.ruleId)) return true;
  return dismissed.some((d) => {
    if (d.suggestionId && d.suggestionId === s.id) return true;
    if (d.ruleId !== s.ruleId) return false;
    if (d.scope === "rule") return true;
    if (d.scope === "exercise_4w")
      return (
        d.exerciseId === s.exerciseId &&
        asOf - d.at < DISMISS_EXERCISE_DAYS * DAY_MS
      );
    return false;
  });
}

export function resolve(
  all: CoachSuggestion[],
  opts: {
    exercises: ReadonlyMap<string, CoachExercise>;
    dismissed: readonly DismissRecord[];
    rulesOff: readonly CoachRuleId[];
    asOf: number;
    /** C7/C9d bad day today: C8 keeps weekly volume unchanged. */
    badDayExercises: ReadonlySet<string>;
  },
): { suggestions: CoachSuggestion[]; suppressed: CoachSuggestion[] } {
  const kept: CoachSuggestion[] = [];
  const suppressed: CoachSuggestion[] = [];
  const byEx = new Map<string, CoachSuggestion[]>();
  for (const s of all) {
    const k = s.exerciseId ?? "all";
    const list = byEx.get(k);
    if (list) list.push(s);
    else byEx.set(k, [s]);
  }

  for (const group of byEx.values()) {
    let live = [...group];
    const drop = (
      pred: (s: CoachSuggestion) => boolean,
      by: CoachSuggestion,
      why: CoachSuggestion["suppressedBy"] = "superseded",
    ) => {
      const out: CoachSuggestion[] = [];
      for (const s of live) {
        if (s !== by && pred(s)) suppressed.push(demote(s, by, why));
        else out.push(s);
      }
      live = out;
    };

    // 2. Deload gate: C14/C10 → ONE deload citing both; blocks C2 steps.
    const c14 = live.find((s) => s.ruleId === "C14");
    const c10 = live.find((s) => s.ruleId === "C10");
    if (c14 && c10) {
      const merged: CoachSuggestion = {
        ...c14,
        why: [
          ...c14.why,
          ...c10.why.map((w) => ({ ...w, cite: w.cite ?? "C10" })),
        ],
      };
      live = live.map((s) => (s === c14 ? merged : s));
      drop((s) => s === c10, merged);
    }
    const deload = live.find((s) => s.action.kind === "deload");
    if (deload)
      drop(
        (s) =>
          isPlan(s) &&
          !isWeeklyOnly(s) &&
          s.ruleId !== "C15" &&
          s.ruleId !== "C9d",
        deload,
      );

    // 3. Restart: blocks everything else plan-changing for this exercise.
    const restart = live.find((s) => s.ruleId === "C15");
    if (restart && !deload)
      drop((s) => isPlan(s) && !isWeeklyOnly(s) && s.ruleId !== "C9d", restart);

    // Hold (C9d) blocks add-load; both C9d and C7 stay (hold = load, C7 = sets).
    const hold = live.find((s) => s.ruleId === "C9d");
    if (hold)
      drop(
        (s) => s.ruleId === "C2c-progress" || s.ruleId === "C2c-overshoot",
        hold,
      );

    // C12 trims before any C2 add-set (and C7 blocks add-set on a bad day).
    const c12 = live.find((s) => s.ruleId === "C12");
    if (c12)
      drop(
        (s) =>
          (s.ruleId === "C2c-stall" || s.ruleId === "C2") &&
          s.action.kind === "add_set",
        c12,
      );
    const c7 = live.find((s) => s.ruleId === "C7");
    if (c7)
      drop((s) => s.action.kind === "add_set" && !isWeeklyOnly(s), c7, "guard");

    // C8: one bad reading never adds weekly volume.
    const ex0 = group[0]?.exerciseId;
    if (ex0 && opts.badDayExercises.has(ex0)) {
      const c11 = live.find((s) => s.ruleId === "C11");
      if (c11) drop((s) => s === c11, c11, "guard");
    }

    // One plan-changing suggestion per exercise per surface-class: highest
    // priority wins; C9d + C7 coexist.
    for (const weekly of [false, true]) {
      const pool = live
        .filter((s) => isPlan(s) && isWeeklyOnly(s) === weekly)
        .sort((a, b) => prio(b) - prio(a));
      const winner = pool[0];
      if (!winner) continue;
      drop(
        (s) =>
          isPlan(s) &&
          isWeeklyOnly(s) === weekly &&
          !(
            (s.ruleId === "C7" && winner.ruleId === "C9d") ||
            (s.ruleId === "C9d" && winner.ruleId === "C7")
          ),
        winner,
      );
    }
    kept.push(...live);
  }

  // Dismissals compute silently (history stays consistent) but never render.
  const shown: CoachSuggestion[] = [];
  for (const s of kept) {
    const clamped = {
      ...s,
      action: clampAction(
        s.action,
        s.exerciseId ? opts.exercises.get(s.exerciseId) : undefined,
      ),
    };
    if (isDismissed(s, opts.dismissed, opts.rulesOff, opts.asOf))
      suppressed.push({
        ...clamped,
        suppressedBy: opts.rulesOff.includes(s.ruleId)
          ? "rule_off"
          : "dismissed",
      });
    else shown.push(clamped);
  }
  shown.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      prio(b) - prio(a) ||
      a.id.localeCompare(b.id),
  );
  return { suggestions: shown, suppressed };
}

export const rulePriority = (ruleId: CoachRuleId): number =>
  PRIORITY[ruleId] ?? 0;
