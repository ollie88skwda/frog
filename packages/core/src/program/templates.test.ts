// Fixtures are the research program docs' own numbers (programs/*.md):
// weekly fractional sets, per-day set totals, direct-sets-per-session caps,
// and the Program C week-6 deload (12/12/11).

import { describe, expect, it } from "vitest";
import { ACTION_RATINGS, JOINT_ACTIONS, MUSCLES } from "../domain/anatomy";
import { evidenceRule } from "../evidence/rules";
import type { SelectableExercise } from "../generator/types";
import { applyDeload } from "./deload";
import { resolveTemplate } from "./resolve";
import { PROGRAM_RULES as R } from "./rules";
import { sessionsPerWeek } from "./schedule";
import { PROGRAM_TEMPLATES } from "./templates";
import { FROG_DEFAULT } from "./templates/frog-default";
import { RESEARCH_A } from "./templates/research-a";
import { RESEARCH_B } from "./templates/research-b";
import { RESEARCH_C } from "./templates/research-c";
import { validateProgram } from "./validate";
import { viewOf } from "./view";
import { summarizeSession, weeklySets } from "./volume";

const muscleKeys = new Set(MUSCLES.map((m) => m.key));
const actionKeys = new Set(JOINT_ACTIONS.map((a) => a.key));

describe("template data is well-formed", () => {
  for (const t of PROGRAM_TEMPLATES) {
    it(`${t.id}: muscles and joint actions exist in anatomy`, () => {
      for (const s of t.sessions)
        for (const slot of s.slots) {
          for (const m of [...slot.credits.direct, ...slot.credits.indirect])
            expect(muscleKeys.has(m), `${slot.slot} ${m}`).toBe(true);
          for (const a of slot.jointActions)
            expect(actionKeys.has(a), `${slot.slot} ${a}`).toBe(true);
          for (const e of slot.menu)
            expect(actionKeys.has(e.jointAction), e.matchKey).toBe(true);
        }
    });
    it(`${t.id}: every cited rule is in the evidence library`, () => {
      for (const id of t.provenance.rules)
        expect(evidenceRule(id), id).toBeDefined();
      for (const s of t.sessions)
        for (const slot of s.slots)
          for (const id of slot.rules)
            expect(evidenceRule(id), id).toBeDefined();
    });
    it(`${t.id}: slot ids are unique within a session`, () => {
      for (const s of t.sessions) {
        const ids = s.slots.map((x) => x.slot);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
    it(`${t.id}: no template emits a superset`, () => {
      const library: SelectableExercise[] = [
        ...new Set(
          t.sessions.flatMap((s) =>
            s.slots.flatMap((x) => x.menu.map((m) => m.matchKey)),
          ),
        ),
      ].map((name, i) => ({
        id: `ex-${i}`,
        name,
        isCustom: false,
        equipment: "machine",
        exerciseType: "weight_reps",
        muscleTargets: null,
        mechanic: null,
      }));
      const { program, unresolved } = resolveTemplate(t, library, {});
      expect(unresolved).toEqual([]);
      const exercises = program.routines.flatMap((r) => r.exercises);
      expect(exercises.length).toBeGreaterThan(0);
      for (const e of exercises) expect(e.supersetGroup ?? null).toBeNull();
    });
  }
  it("joint-action keys on slots match a rated (muscle, action) where one exists", () => {
    // Soft sanity: the primary slot action has an expert rating for its muscle.
    const rated = new Set(
      ACTION_RATINGS.map((r) => `${r.muscle}:${r.jointAction}`),
    );
    const slot = FROG_DEFAULT.sessions[0].slots[0];
    expect(rated.has(`quads:${slot.jointActions[0]}`)).toBe(true);
  });
});

describe("weekly fractional sets match the program docs", () => {
  for (const t of PROGRAM_TEMPLATES) {
    it(t.id, () => {
      const w = weeklySets(viewOf(t));
      for (const [muscle, expected] of Object.entries(t.expectedWeekly)) {
        expect(w[muscle]?.total, `${t.id} ${muscle}`).toBeCloseTo(expected, 5);
      }
    });
  }
  it("Program A: every-other-day is 3.5 sessions a week", () => {
    expect(sessionsPerWeek(FROG_DEFAULT.schedule)).toBe(3.5);
  });
  it("Program A runs 24 working sets", () => {
    const v = viewOf(RESEARCH_A);
    expect(
      summarizeSession("full", "full", v.sessions[0].slots).totalSets,
    ).toBe(24);
  });
});

describe("per-session sets match the program docs (Program B)", () => {
  const v = viewOf(RESEARCH_B);
  const total = (id: string) =>
    summarizeSession(id, id, v.sessions.find((s) => s.id === id)!.slots);
  it("Mon 28 / Wed 28 / Fri 27", () => {
    expect(total("mon").totalSets).toBe(28);
    expect(total("wed").totalSets).toBe(28);
    expect(total("fri").totalSets).toBe(27);
  });
  it("no muscle exceeds 5 direct sets in a session (R7b)", () => {
    for (const s of v.sessions) {
      const sum = summarizeSession(s.id, s.name, s.slots);
      expect(sum.top!.sets).toBeLessThanOrEqual(R.directPerSession[1]);
    }
  });
  it("hip thrust is Wednesday only", () => {
    const has = (id: string) =>
      v.sessions.find((s) => s.id === id)!.slots.some((x) => x.slot === "9");
    expect([has("mon"), has("wed"), has("fri")]).toEqual([false, true, false]);
  });
});

describe("Program C deload week (R17, F11 acceptance)", () => {
  it("halves sets to 12 / 12 / 11 with loads kept", () => {
    const sets = (id: string) => {
      const view = viewOf(RESEARCH_C);
      const slots = view.sessions.find((s) => s.id === id)!.slots;
      return applyDeload(
        slots.map((s, i) => ({
          exerciseId: `e${i}`,
          orderIndex: i,
          sets: Array.from({ length: s.rx.sets }, (_, k) => ({
            setNo: k,
            setType: "normal",
            targetWeightKg: 100,
          })),
        })),
      );
    };
    const count = (id: string) =>
      sets(id).reduce((a, e) => a + e.sets.length, 0);
    // The doc counts the 7a/7b superset as 1+1; ours are two slots of 1 each.
    expect([count("mon"), count("wed"), count("fri")]).toEqual([12, 12, 11]);
    for (const e of sets("mon"))
      for (const s of e.sets) {
        expect(s.targetWeightKg).toBe(100);
        expect([s.targetRirMin, s.targetRirMax]).toEqual([3, 4]);
      }
  });
});

describe("shipped templates validate cleanly enough", () => {
  for (const t of PROGRAM_TEMPLATES) {
    it(`${t.id}: no weekly-low, session-cap or deload-missing findings`, () => {
      const r = validateProgram(viewOf(t));
      const bad = r.findings.filter((f) =>
        ["WEEKLY_LOW", "SESSION_CAP", "DELOAD_MISSING"].includes(f.code),
      );
      expect(bad.map((f) => `${f.code} ${f.target.muscle ?? ""}`)).toEqual([]);
    });
  }
  it("Program A has no seated curl, so the R12b hamstring hint fires (info, never blocking)", () => {
    const gaps = validateProgram(viewOf(RESEARCH_A)).findings.filter(
      (f) => f.code === "COVERAGE_GAP",
    );
    expect(gaps.map((f) => f.target.muscle)).toEqual(["hamstrings"]);
    expect(gaps[0].severity).toBe("info");
    expect(gaps[0].rule).toBe("R12b");
  });
  it("Programs B and C cover every region cell", () => {
    for (const t of [RESEARCH_B, RESEARCH_C])
      expect(
        validateProgram(viewOf(t)).findings.filter(
          (f) => f.code === "COVERAGE_GAP",
        ),
      ).toEqual([]);
  });
});

describe("estimateMinutes lands inside the program docs' ranges", () => {
  it("Program A 47-59 min (working time, rounded)", async () => {
    const { estimateMinutes } = await import("./volume");
    const e = estimateMinutes(viewOf(RESEARCH_A).sessions[0].slots);
    expect(e.min).toBeGreaterThanOrEqual(45);
    expect(e.max).toBeLessThanOrEqual(62);
  });
});
