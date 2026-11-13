import { PROGRAM_TEMPLATES, validateProgram, viewOf } from "@frog/core";
import { describe, expect, it } from "vitest";
import {
  applyPatch,
  CAP_CHIP_AT,
  equipmentPresetId,
  groupBy,
  groupLabel,
  inBandCount,
  meterRows,
  prefsFromAnswers,
  prescriptionText,
  scheduleLabel,
  scheduleOptionId,
  sessionStrip,
  toGeneratorConfig,
  upsertOverride,
} from "./logic";

const answers = {
  schedule: { kind: "interval", everyDays: 2 } as const,
  goal: "muscle" as const,
  status: "intermediate" as const,
  equipment: ["barbell", "machine"] as never,
  minutes: 60 as const,
};

describe("schedule", () => {
  it("every other day reads as 3.5 a week (R5 not a requirement)", () => {
    expect(scheduleLabel(answers.schedule)).toBe("Every other day · 3.5×/wk");
    expect(scheduleOptionId(answers.schedule)).toBe("eod");
  });
  it("matches weekday presets and falls back to custom", () => {
    expect(scheduleOptionId({ kind: "weekdays", days: [5, 1, 3] })).toBe("3");
    expect(scheduleOptionId({ kind: "weekdays", days: [0, 6] })).toBe("custom");
    expect(scheduleLabel({ kind: "weekdays", days: [5, 1, 3] })).toBe(
      "Mon, Wed, Fri · 3×/wk",
    );
  });
});

describe("overrides and one-tap fixes (principle 6: apply, with undo)", () => {
  it("merges per slot and session, latest field wins", () => {
    let o = upsertOverride([], { slot: "1a", sets: 4 });
    o = upsertOverride(o, { slot: "1a", reps: [4, 7] });
    o = upsertOverride(o, { slot: "1a", sets: 3 });
    expect(o).toEqual([{ slot: "1a", sets: 3, reps: [4, 7] }]);
    o = upsertOverride(o, { slot: "1a", session: "b", sets: 2 });
    expect(o).toHaveLength(2);
  });

  it("applying a WEEKLY_LOW fix lifts that muscle's weekly sets", () => {
    const t = PROGRAM_TEMPLATES[0];
    const base = [{ slot: t.sessions[0].slots[0].slot, remove: true }];
    const r0 = validateProgram(viewOf(t, { overrides: base }));
    const low = r0.findings.find((f) => f.code === "WEEKLY_LOW" && f.fix);
    const muscle = low?.target.muscle;
    expect(muscle).toBeDefined();
    if (!low?.fix || !muscle) return;
    const r1 = validateProgram(
      viewOf(t, { overrides: applyPatch(base, low.fix.patch) }),
    );
    expect(r1.weekly[muscle].total).toBeGreaterThan(r0.weekly[muscle].total);
  });
});

describe("presets and text", () => {
  it("renders the report 8.4 slot row", () => {
    expect(
      prescriptionText({
        sets: 3,
        reps: [4, 8],
        rir: [1, 3],
        restSec: [120, 180],
        warmup: "none",
      }),
    ).toBe("3 × 4-8 · RIR 1-3 · rest 2-3 min");
  });
  it("detects equipment presets", () => {
    expect(equipmentPresetId(["bodyweight"])).toBe("bodyweight");
    expect(equipmentPresetId(["cable"])).toBe("custom");
  });
});

describe("grouping toggle (F14)", () => {
  const t = PROGRAM_TEMPLATES[0];
  const slots = t.sessions[0].slots;
  it("the same slots regroup by region without changing the set", () => {
    const ja = groupBy(slots, (s) => groupLabel(s, "joint_action"));
    const rg = groupBy(slots, (s) => groupLabel(s, "region"));
    expect(ja.flatMap((g) => g.items).length).toBe(slots.length);
    expect(rg.flatMap((g) => g.items).length).toBe(slots.length);
    expect(ja.map((g) => g.label)).not.toEqual(rg.map((g) => g.label));
  });
});

describe("meter (F3/F8 review)", () => {
  it("Frog default has every program-A muscle in the 10-20 band", () => {
    const t = PROGRAM_TEMPLATES[0];
    const res = validateProgram(viewOf(t));
    const rows = meterRows(res.weekly);
    expect(rows[0].total).toBeGreaterThanOrEqual(rows[rows.length - 1].total);
    expect(inBandCount(rows)).toBe(rows.length);
  });
  it("shows the cap chip at 6 direct sets, not 5 (R7b, C13)", () => {
    expect(CAP_CHIP_AT).toBe(6);
    expect(sessionStrip({ muscle: "quads", sets: 5 })?.chip).toBe(false);
    expect(sessionStrip({ muscle: "quads", sets: 6 })?.chip).toBe(true);
  });
});

describe("prefs round trip (D7)", () => {
  it("writes goal and status only when unset", () => {
    expect(
      prefsFromAnswers(answers, { goal: null, trainingStatus: null }),
    ).toEqual({
      goal: "build",
      trainingStatus: "intermediate",
    });
    expect(
      prefsFromAnswers(answers, { goal: "cut", trainingStatus: "new" }),
    ).toEqual({});
  });
  it("legacy config clamps days and maps experience", () => {
    const c = toGeneratorConfig({
      ...answers,
      status: "new",
      schedule: { kind: "weekdays", days: [1, 2, 3, 4, 5, 6, 0] },
    });
    expect(c.daysPerWeek).toBe(6);
    expect(c.experience).toBe("beginner");
  });
});

import { resolveTemplate } from "@frog/core";
import { creditDelta, slotChoices, withPinnedCredits } from "./logic";

describe("swap keeps the meter honest", () => {
  const t = PROGRAM_TEMPLATES[0];
  const view = viewOf(t);
  const slot = view.sessions[0].slots[0];
  it("a pinned swap re-credits the slot from the new lift", () => {
    const byId = new Map([
      [
        "x",
        {
          id: "x",
          name: "X",
          muscleTargets: [
            { muscle: "hamstrings", tier: null, role: "primary" as const },
            { muscle: "glutes", tier: null, role: "secondary" as const },
          ],
        },
      ],
    ]);
    const next = withPinnedCredits(
      view,
      [{ slot: slot.slot, exerciseId: "x" }],
      byId,
    );
    expect(next.sessions[0].slots[0].credits).toEqual({
      direct: ["hamstrings"],
      indirect: ["glutes"],
    });
    expect(next.sessions[0].slots[1].credits).toEqual(
      view.sessions[0].slots[1].credits,
    );
  });
  it("creditDelta reports the weekly change per muscle", () => {
    const d = creditDelta(
      { credits: { direct: ["quads"], indirect: ["glutes"] }, rx: { sets: 3 } },
      { direct: ["quads"], indirect: [] },
      3.5,
    );
    expect(d).toEqual([{ muscle: "glutes", label: "Glutes", delta: -5.2 }]);
  });
  it("slotChoices maps exercises back to slots, skipping unresolved ones", () => {
    const lib = [
      {
        id: "lp",
        name: "Leg Press",
        isCustom: false,
        equipment: "machine",
        exerciseType: "weight_reps",
        muscleTargets: null,
        mechanic: "compound",
      },
    ];
    const resolved = resolveTemplate(t, lib);
    const choices = slotChoices(
      view,
      resolved,
      new Map([["lp", { name: "Leg Press" }]]),
    );
    expect(choices.get(`${view.sessions[0].id}|${slot.slot}`)?.name).toBe(
      "Leg Press",
    );
    expect(choices.size).toBe(1);
  });
});

import { applyReps, applyRir, applyTopSet, isTopSet } from "./logic";

describe("routine editor presets", () => {
  const mk = (type = "normal", min = "1", max = "3") => ({
    setType: type,
    reps: "",
    repsMax: "",
    rirMin: min,
    rirMax: max,
  });
  it("top set toggle: set 1 at RIR 1, the rest 2-3, warm-ups untouched", () => {
    const base = [mk("warmup", "", ""), mk(), mk(), mk()];
    const on = applyTopSet(base, true);
    expect(on[0]).toEqual(base[0]);
    expect([on[1].rirMin, on[1].rirMax]).toEqual(["1", "1"]);
    expect([on[2].rirMin, on[2].rirMax]).toEqual(["2", "3"]);
    expect(isTopSet(on)).toBe(true);
    const off = applyTopSet(on, false);
    expect(isTopSet(off)).toBe(false);
    expect(off[3].rirMin).toBe("1");
  });
  it("a single working set is never a top set", () => {
    expect(isTopSet([mk()])).toBe(false);
  });
  it("rep and RIR presets skip warm-ups", () => {
    const base = [mk("warmup", "", ""), mk()];
    expect(applyReps(base, [4, 8])[1]).toMatchObject({
      reps: "4",
      repsMax: "8",
    });
    expect(applyReps(base, [4, 8])[0].reps).toBe("");
    expect(applyRir(base, [3, 4])[1]).toMatchObject({
      rirMin: "3",
      rirMax: "4",
    });
  });
});
