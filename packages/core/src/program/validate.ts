// validateProgram: live, never-blocking feedback for the builder review
// screen and the routine editor's program meter (F8). Every finding carries
// its rule ID and tier; messages follow the report §12 anti-claims (no
// per-session cap claim, no growth promises from deloads).

import type { EvidenceTier, RuleId } from "../evidence/rules";
import { weakestTier } from "../evidence/rules";
import { setTargets } from "./resolve";
import { type ProgramRuleSet, PROGRAM_RULES as R } from "./rules";
import type { ProgramPatch, ProgramView, ViewSlot } from "./types";
import {
  estimateMinutes,
  type MuscleSets,
  type SessionSummary,
  summarizeSession,
  weeklyFrequency,
  weeklySets,
} from "./volume";

export type ProgramFindingCode =
  | "WEEKLY_LOW"
  | "WEEKLY_HIGH"
  | "SESSION_CAP"
  | "SESSION_LOW"
  | "FREQ_LOW"
  | "REPS_RANGE"
  | "RIR_RANGE"
  | "REST_SHORT"
  | "TIME_OVER"
  | "COVERAGE_GAP"
  | "DELOAD_MISSING";

export type ProgramFinding = {
  code: ProgramFindingCode;
  /** Never an error: every rule here is T4/T5 or "practical". */
  severity: "info" | "heads-up";
  target: { muscle?: string; session?: string; slot?: string };
  message: string;
  rule: RuleId;
  tier: EvidenceTier;
  fix?: { label: string; patch: ProgramPatch };
};

export type ValidationResult = {
  weekly: Record<string, MuscleSets>;
  perSession: SessionSummary[];
  minutes: { session: string; min: number; max: number }[];
  findings: ProgramFinding[];
};

/** R12b: region cells a muscle needs, when it is trained directly. */
export const REQUIRED_REGION_CELLS: Record<
  string,
  { cell: string; message: string }[]
> = {
  quads: [
    {
      cell: "quads-rf",
      message:
        "Quads have no leg extension. Squats and presses train the rectus femoris less, so a leg extension covers it (R12b).",
    },
    {
      cell: "quads-vasti",
      message: "Quads have no squat or leg press for the vasti (R12b).",
    },
  ],
  hamstrings: [
    {
      cell: "hams-biarticular",
      message:
        "Hamstrings have no seated curl. Seated curls grew the biarticular heads more than lying curls (R12b).",
    },
  ],
  triceps: [
    {
      cell: "triceps-long",
      message:
        "Triceps have no overhead extension. Overhead work grew the long head more (R12b).",
    },
  ],
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const muscleLabel = (m: string) => m.replace(/-/g, " ");

/** R18b: a maintain program aims at about a third of the usual dose. */
function doseShare(view: ProgramView, rules: ProgramRuleSet): number {
  return view.goal === "maintain" ? rules.maintainShare : 1;
}

function finding(
  f: Omit<ProgramFinding, "tier"> & { tier?: EvidenceTier },
): ProgramFinding {
  return { ...f, tier: f.tier ?? weakestTier([f.rule]) };
}

/** Add `n` sets to the best slot crediting `muscle` directly (isolation first). */
function addSetPatch(
  view: ProgramView,
  muscle: string,
  rules: ProgramRuleSet,
): { label: string; patch: ProgramPatch } | undefined {
  type Candidate = { session: string; slot: ViewSlot; bumpedDirect: number };
  let best: Candidate | null = null;
  for (const s of view.sessions) {
    const direct = s.slots
      .filter((x) => x.credits.direct.includes(muscle))
      .reduce((a, x) => a + x.rx.sets, 0);
    if (direct + 1 > rules.directPerSession[1]) continue;
    const slot = [...s.slots]
      .filter((x) => x.credits.direct.includes(muscle))
      .sort(
        (a, b) =>
          Number(b.role === "isolation") - Number(a.role === "isolation"),
      )[0];
    if (!slot) continue;
    if (!best || (slot.role === "isolation" && best.slot.role !== "isolation"))
      best = { session: s.id, slot, bumpedDirect: direct + 1 };
  }
  if (!best) return undefined;
  // "same" rotation or single-session: one override hits the only session.
  return {
    label: `Add a set to slot ${best.slot.slot}`,
    patch: [
      {
        session: view.sessions.length > 1 ? best.session : undefined,
        slot: best.slot.slot,
        sets: best.slot.rx.sets + 1,
      },
    ],
  };
}

/**
 * Trim an over-time program: accessory rest drops to 60 s first (R15d), then
 * isolation slots lose a set (every muscle stays at the practical weekly
 * floor). Best effort: returns the patch (empty if nothing helps); the
 * caller re-validates, so a program that cannot fit without dropping a muscle
 * below the weekly floor simply stays over time and says so.
 */
export function fitToMinutes(
  view: ProgramView,
  maxMinutes: number,
  rules: ProgramRuleSet = R,
): ProgramPatch {
  const patch: ProgramPatch = [];
  const work: ProgramView = {
    ...view,
    sessions: view.sessions.map((s) => ({
      ...s,
      slots: s.slots.map((x) => ({ ...x, rx: { ...x.rx } })),
    })),
  };
  const over = () =>
    Math.max(...work.sessions.map((s) => estimateMinutes(s.slots).max)) >
    maxMinutes;
  const floor = rules.weeklySets[0] * doseShare(view, rules);
  const weeklyOk = (muscle: string) =>
    (weeklySets(work)[muscle]?.total ?? 0) >= floor;

  // Lever 1: shorter accessory rest.
  if (over()) {
    for (const s of work.sessions) {
      for (const slot of s.slots) {
        if (slot.role !== "isolation") continue;
        const short: [number, number] = [
          rules.restAccessorySec[0],
          rules.restAccessorySec[0],
        ];
        if (slot.rx.restSec[1] > short[1]) {
          slot.rx.restSec = short;
          patch.push({
            session: work.sessions.length > 1 ? s.id : undefined,
            slot: slot.slot,
            restSec: short,
          });
        }
      }
    }
  }
  // Lever 2: isolation sets, one at a time, never below the weekly floor.
  let guard = 0;
  while (over() && guard++ < 60) {
    let changed = false;
    for (const s of work.sessions) {
      for (const slot of s.slots) {
        if (slot.role !== "isolation" || slot.rx.sets <= 1) continue;
        const muscles = slot.credits.direct;
        slot.rx.sets -= 1;
        if (muscles.every(weeklyOk) || muscles.length === 0) {
          patch.push({
            session: work.sessions.length > 1 ? s.id : undefined,
            slot: slot.slot,
            sets: slot.rx.sets,
          });
          changed = true;
          if (!over()) break;
        } else slot.rx.sets += 1;
      }
      if (!over()) break;
    }
    if (!changed) break;
  }
  return patch;
}

export function validateProgram(
  view: ProgramView,
  rules: ProgramRuleSet = R,
): ValidationResult {
  const weekly = weeklySets(view, rules.indirectWeight);
  const perSession = view.sessions.map((s) =>
    summarizeSession(s.id, s.name, s.slots),
  );
  const minutes = view.sessions.map((s) => ({
    session: s.id,
    ...estimateMinutes(s.slots),
  }));
  const findings: ProgramFinding[] = [];
  const maintain = view.goal === "maintain";
  const share = doseShare(view, rules);
  const weeklyFloor = rules.weeklySets[0] * share;
  const sessionFloor = rules.directPerSession[0] * share;

  // R6 / C11 / C12: weekly band per muscle; R18b scales the floor to maintain.
  for (const [muscle, w] of Object.entries(weekly)) {
    const label = muscleLabel(muscle);
    if (w.total < weeklyFloor) {
      findings.push(
        finding({
          code: "WEEKLY_LOW",
          severity: "heads-up",
          target: { muscle },
          message: maintain
            ? `${label}: ${fmt(w.total)} sets a week, below the maintenance dose of about ${fmt(weeklyFloor)} (a third of the ${rules.weeklySets[0]}-${rules.weeklySets[1]} starting range).`
            : `${label}: ${fmt(w.total)} sets a week, below the ${rules.weeklySets[0]}-${rules.weeklySets[1]} starting range. A starting range, not a landmark.`,
          rule: maintain ? "R18b" : "C11",
          fix: addSetPatch(view, muscle, rules),
        }),
      );
    } else if (w.total > rules.weeklyCapSets) {
      findings.push(
        finding({
          code: "WEEKLY_HIGH",
          severity: "info",
          target: { muscle },
          message: `${label}: ${fmt(w.total)} sets a week, over ${rules.weeklyCapSets}. Fine if you are recovering well; trim ${rules.trimSets[0]}-${rules.trimSets[1]} only if the lift stalls.`,
          rule: "C12",
        }),
      );
    }
  }

  // R7b: direct sets per muscle per session (planning range, never a cap).
  for (const s of perSession) {
    for (const [muscle, sets] of Object.entries(s.directByMuscle)) {
      const label = muscleLabel(muscle);
      if (sets > rules.directPerSession[1]) {
        const reduce = [
          ...(view.sessions.find((x) => x.id === s.id)?.slots ?? []),
        ]
          .filter((x) => x.credits.direct.includes(muscle))
          .sort((a, b) => b.rx.sets - a.rx.sets)[0];
        const multi = view.sessions.length > 1;
        let fix: ProgramFinding["fix"];
        if (reduce && reduce.rx.sets > 1) {
          const drop = {
            session: multi ? s.id : undefined,
            slot: reduce.slot,
            sets: reduce.rx.sets - 1,
          };
          const receiver = view.sessions
            .filter(
              (x) =>
                x.id !== s.id &&
                (perSession.find((p) => p.id === x.id)?.directByMuscle[
                  muscle
                ] ?? 0) < rules.directPerSession[1],
            )
            .map((x) => ({
              session: x.id,
              slot: x.slots.find((y) => y.slot === reduce.slot),
            }))
            .find((x) => x.slot != null);
          fix = receiver?.slot
            ? {
                label: "Move 1 set to another session",
                patch: [
                  drop,
                  {
                    session: receiver.session,
                    slot: receiver.slot.slot,
                    sets: receiver.slot.rx.sets + 1,
                  },
                ],
              }
            : { label: "Drop 1 set", patch: [drop] };
        }
        findings.push(
          finding({
            code: "SESSION_CAP",
            severity: "info",
            target: { muscle, session: s.id },
            message: `${sets} ${label} sets in one session. The planning range is ${rules.directPerSession[0]}-${rules.directPerSession[1]}; no study sets a cap, so this is about fatigue and session length.`,
            rule: "R7b",
            fix,
          }),
        );
      } else if (sets < sessionFloor) {
        findings.push(
          finding({
            code: "SESSION_LOW",
            severity: "info",
            target: { muscle, session: s.id },
            message: `${label}: ${sets} direct set in this session, a low dose for one visit. Planning range is ${rules.directPerSession[0]}-${rules.directPerSession[1]}.`,
            rule: "R7b",
          }),
        );
      }
    }
  }

  // R4: at least two sessions per muscle per week when practical.
  for (const muscle of Object.keys(weekly)) {
    const freq = weeklyFrequency(view, muscle);
    if (freq < rules.sessionsPerMuscleMin && freq > 0) {
      findings.push(
        finding({
          code: "FREQ_LOW",
          severity: "info",
          target: { muscle },
          message: `${muscleLabel(muscle)} is in ${fmt(freq)} session a week. Two or more spreads the sets; at equal volume that makes little difference for size, and it helps strength.`,
          rule: "R4",
        }),
      );
    }
  }

  // Per-slot checks (R8b, R10/C5/R6, R15), once per distinct prescription.
  const seen = new Set<string>();
  const firstSet = view.philosophy?.firstSet ?? "off";
  for (const s of view.sessions) {
    for (const slot of s.slots) {
      const key = [slot.slot, slot.rx.reps, slot.rx.rir, slot.rx.restSec].join(
        "|",
      );
      if (seen.has(key)) continue;
      seen.add(key);
      const target = { slot: slot.slot, session: s.id };
      const [lo, hi] = slot.rx.reps;
      const isIso = slot.role === "isolation";
      // Isolation is in range at 4-8 (R8 allows it) or 10-15 (R8b default).
      const repsOk = isIso
        ? lo >= rules.repsMost[0] && hi <= rules.repsIsolation[1]
        : lo >= rules.repsMainCompound[0] && hi <= rules.repsMainCompound[1];
      if (!repsOk) {
        findings.push(
          finding({
            code: "REPS_RANGE",
            severity: "info",
            target,
            message: isIso
              ? `${lo}-${hi} reps on an isolation lift is outside the practical ${rules.repsMost[0]}-${rules.repsIsolation[1]}. Any load near failure can work; this is a practical range.`
              : `${lo}-${hi} reps on a compound lift is outside the practical ${rules.repsMainCompound[0]}-${rules.repsMainCompound[1]}. Any load near failure can work; this is a practical range.`,
            rule: "R8b",
          }),
        );
      }
      const [rLo, rHi] = [
        Math.min(...setTargets(slot, firstSet).map((t) => t.rirMin)),
        slot.rx.rir[1],
      ];
      if (!isIso && rLo < rules.rirFloorCompound) {
        findings.push(
          finding({
            code: "RIR_RANGE",
            severity: "info",
            target,
            message: `Compound work usually stays at ${rules.rirFloorCompound} rep in reserve or more. Going to ${rLo} is your choice, not a research rule.`,
            rule: "C5",
          }),
        );
      } else if (rHi > rules.hardSetRirMax) {
        findings.push(
          finding({
            code: "RIR_RANGE",
            severity: "info",
            target,
            message: `Up to ${rHi} reps in reserve is far from hard. Sets above ${rules.hardSetRirMax} may not count as hard sets.`,
            rule: "R6",
          }),
        );
      }
      if (
        slot.role !== "isolation" &&
        slot.rx.restSec[1] < rules.restHeavySec[0]
      ) {
        findings.push(
          finding({
            code: "REST_SHORT",
            severity: "info",
            target,
            message: `Rest under ${rules.restHeavySec[0] / 60} minutes on a heavy multi-joint lift. About ${rules.restHeavySec[0] / 60}-${rules.restHeavySec[1] / 60} minutes is the usual range (which lifts count as heavy is inference).`,
            rule: "R15",
          }),
        );
      }
    }
  }

  // R15/R15b: time budget.
  if (view.maxMinutes) {
    for (const m of minutes) {
      if (m.max > view.maxMinutes) {
        const patch = fitToMinutes(view, view.maxMinutes, rules);
        findings.push(
          finding({
            code: "TIME_OVER",
            severity: "info",
            target: { session: m.session },
            message: `About ${m.max} minutes against your ${view.maxMinutes}. An estimate, not measured.`,
            rule: "R15b",
            fix: patch.length ? { label: "Trim to fit", patch } : undefined,
          }),
        );
        break; // one finding is enough; the fix covers every session
      }
    }
  }

  // R12b: region coverage for muscles trained directly.
  const regions = new Set(
    view.sessions.flatMap((s) => s.slots.map((x) => x.region).filter(Boolean)),
  );
  if (regions.size > 0) {
    for (const [muscle, w] of Object.entries(weekly)) {
      if (w.direct <= 0) continue;
      for (const req of REQUIRED_REGION_CELLS[muscle] ?? []) {
        if (!regions.has(req.cell as never)) {
          findings.push(
            finding({
              code: "COVERAGE_GAP",
              severity: "info",
              target: { muscle },
              message: req.message,
              rule: "R12b",
            }),
          );
        }
      }
    }
  }

  // R17: a deload plan.
  const hasDeload =
    view.block != null &&
    (view.block.kind === "continuous" || view.block.fixed.deloadWeek != null);
  if (!hasDeload) {
    findings.push(
      finding({
        code: "DELOAD_MISSING",
        severity: "info",
        target: {},
        message:
          "No deload planned. A deload is a fatigue and recovery tool, about every 4-6 weeks; its effect on size is unknown.",
        rule: "R17",
      }),
    );
  }

  return { weekly, perSession, minutes, findings };
}
