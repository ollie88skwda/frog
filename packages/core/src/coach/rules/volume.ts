// C11 / C12 weekly volume, plus the C19 carb display. COACH-LOGIC.md "Volume adjustments".
// Fractional hard sets: R6 (non-warm-up, RIR ≤ 4, blank RIR counts and is
// flagged), R7 (indirect 0.5). TODO(J1): swap the credit loop for
// domain/hard-sets.ts `fractionalHardSets` once J1 merges.

import { FIRST_WEEKDAY } from "../../config";
import { muscleLabel, roleAt } from "../../domain/anatomy";
import {
  C19_MIN_PATTERN,
  HARD_SET_RIR_MAX,
  INDIRECT_CREDIT,
  MAX_DIRECT_SETS_PER_SESSION,
  VOLUME_BAND,
} from "../constants";
import { empty, kg, mk, type RuleOutput } from "../ctx";
import { median } from "../e1rm";
import { workSetsOf } from "../history";
import { weekKey } from "../time";
import type { CoachInput, CoachSuggestion } from "../types";

export type MuscleWeek = {
  muscle: string;
  direct: number;
  indirect: number;
  total: number;
  noRirCount: number;
};

/** Fractional hard sets per muscle for sessions starting in [from, to). */
export function weeklyMuscleSets(
  input: CoachInput,
  from: number,
  to: number,
): Map<string, MuscleWeek> {
  const out = new Map<string, MuscleWeek>();
  for (const s of input.sessions) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const b of s.exercises) {
      const ex = input.exercises.get(b.exerciseId);
      if (!ex) continue;
      for (const w of workSetsOf(b.sets)) {
        if (w.rir && w.rir.min > HARD_SET_RIR_MAX) continue;
        for (let i = 0; i < ex.muscleTargets.length; i++) {
          const t = ex.muscleTargets[i];
          const direct = roleAt(ex.muscleTargets, i) === "primary";
          const m = out.get(t.muscle) ?? {
            muscle: t.muscle,
            direct: 0,
            indirect: 0,
            total: 0,
            noRirCount: 0,
          };
          if (direct) m.direct += 1;
          else m.indirect += INDIRECT_CREDIT;
          m.total = m.direct + m.indirect;
          if (!w.rir) m.noRirCount += 1;
          out.set(t.muscle, m);
        }
      }
    }
  }
  return out;
}

const WEEK_MS = 7 * 86_400_000;

/** C11 add / C12 trim. Uses the app week (FIRST_WEEKDAY) for weekly buckets. */
export function volume(
  input: CoachInput,
  asOf: number,
  tz: number,
  stalledByExercise: ReadonlyMap<string, boolean>,
  lastSessionRirOk: (muscle: string) => boolean,
): RuleOutput {
  const out = empty();
  const thisWeek = weekKey(asOf, tz, FIRST_WEEKDAY) * 86_400_000 - tz * 60_000;
  const w1 = weeklyMuscleSets(input, thisWeek - WEEK_MS, thisWeek);
  const w2 = weeklyMuscleSets(
    input,
    thisWeek - 2 * WEEK_MS,
    thisWeek - WEEK_MS,
  );
  if (!w1.size && !w2.size) return out;
  for (const [muscle, a] of w1) {
    const b = w2.get(muscle);
    const label = muscleLabel(muscle).toLowerCase();
    const anchor = thisWeek;
    // C12: ≥20 weekly sets AND its lifts stalled → trim 1 set, before any C2 add.
    if (a.total >= VOLUME_BAND.high) {
      const target = [...input.exercises.values()].find(
        (ex) =>
          stalledByExercise.get(ex.id) &&
          ex.muscleTargets.some(
            (t, i) =>
              t.muscle === muscle && roleAt(ex.muscleTargets, i) === "primary",
          ),
      );
      if (target) {
        out.suggestions.push(
          mk(null, {
            ruleId: "C12",
            exerciseId: target.id,
            anchor,
            severity: "suggest",
            surfaces: ["weekly"],
            message: `${label} got ${a.total} hard sets last week and its lifts are stalled. trim one set on ${target.name.toLowerCase()} before adding anything else.`,
            why: [
              {
                text: `${a.total} fractional hard sets last week (20+ band) with a stalled lift.`,
                stat: { label: "Weekly hard sets", value: String(a.total) },
                cite: "C12 · Pelland 2026 PMID 41343037 (diminishing returns only)",
              },
            ],
            tier: "T5",
            action: { kind: "remove_set", exerciseId: target.id, count: 1 },
            data: { total: a.total },
          }),
        );
      }
      continue; // C11 adds are blocked at ≥20
    }
    // C11: last two weeks inside 10-20 with ≥2 RIR left → add one set to a
    // session with <5 direct sets for the muscle.
    if (
      b &&
      a.total >= VOLUME_BAND.low &&
      b.total >= VOLUME_BAND.low &&
      b.total < VOLUME_BAND.high &&
      lastSessionRirOk(muscle)
    ) {
      const slots = (input.plan ?? []).filter((s) => {
        const ex = input.exercises.get(s.exerciseId);
        return ex?.muscleTargets.some(
          (t, i) =>
            t.muscle === muscle && roleAt(ex.muscleTargets, i) === "primary",
        );
      });
      const direct = (day: string | undefined, sl: (typeof slots)[number]) =>
        (input.plan ?? [])
          .filter((x) => (day ? x.dayKey === day : x === sl))
          .reduce((n, x) => {
            const ex = input.exercises.get(x.exerciseId);
            const isMine = ex?.muscleTargets.some(
              (t, i) =>
                t.muscle === muscle &&
                roleAt(ex.muscleTargets, i) === "primary",
            );
            return n + (isMine ? x.planned.sets : 0);
          }, 0);
      const pick = slots.find(
        (s) => direct(s.dayKey, s) + 1 <= MAX_DIRECT_SETS_PER_SESSION,
      );
      if (!pick) continue;
      const ex = input.exercises.get(pick.exerciseId);
      if (!ex) continue;
      out.suggestions.push(
        mk(null, {
          ruleId: "C11",
          exerciseId: pick.exerciseId,
          anchor,
          severity: "suggest",
          surfaces: ["weekly"],
          message: `${label} has been in the 10 to 20 set range two weeks running with reps in reserve. add one set to ${ex.name.toLowerCase()}.`,
          why: [
            {
              text: "Two weeks in the 10-20 weekly hard-set band with 2+ reps left.",
              stat: {
                label: "Last two weeks",
                value: `${b.total} → ${a.total} sets`,
              },
              cite: "C11 · R7b · Baz-Valle 2022 PMID 35291645",
            },
            {
              text: "Planning range 2-5 direct sets per session; the added set keeps it at 5 or fewer.",
            },
          ],
          tier: "T5",
          action: { kind: "add_set", exerciseId: pick.exerciseId },
          data: { total: a.total },
        }),
      );
    }
  }
  return out;
}

/** C19: carbs beside session e1RM (display via ExerciseCoachState). A comment
 * appears only after ≥3 sessions show the same link, and is never a target. */
export function c19(
  ctx: { exerciseId: string; name: string },
  sessions: { e1rm: number; carbsG: number | null; sessionId: string }[],
  mkCtx: Parameters<typeof mk>[0],
): CoachSuggestion[] {
  const withCarbs = sessions.filter((s) => s.carbsG != null);
  if (withCarbs.length < C19_MIN_PATTERN * 2) return [];
  const cut = median(withCarbs.map((s) => s.carbsG as number));
  const low = withCarbs.filter((s) => (s.carbsG as number) < cut);
  const high = withCarbs.filter((s) => (s.carbsG as number) >= cut);
  if (low.length < C19_MIN_PATTERN || !high.length) return [];
  const highMedian = median(high.map((s) => s.e1rm));
  if (!low.every((s) => s.e1rm < highMedian)) return [];
  return [
    mk(mkCtx, {
      ruleId: "C19",
      exerciseId: ctx.exerciseId,
      anchor: withCarbs[withCarbs.length - 1].sessionId,
      severity: "info",
      surfaces: ["post_session"],
      message: `${low.length} sessions with less pre-workout carbs were all below your usual ${ctx.name.toLowerCase()} estimate. just a pattern, not a target.`,
      why: [
        {
          text: `Sessions under ${Math.round(cut)} g carbs: ${low.length}, each below the ${kg(highMedian)} median of the rest.`,
          cite: "C19",
        },
        { text: "Correlation, not proof. No carb target is implied." },
      ],
      tier: "T5",
      action: { kind: "text_only" },
    }),
  ];
}
