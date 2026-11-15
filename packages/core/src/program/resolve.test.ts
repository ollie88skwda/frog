import { describe, expect, it } from "vitest";
import type { SelectableExercise } from "../generator/types";
import { buildSavedConfig, parseSavedProgramConfig } from "./config";
import { DEFAULT_ANSWERS, recommendTemplate } from "./recommend";
import { pickMenuEntry, resolveTemplate, setTargets } from "./resolve";
import { FROG_DEFAULT } from "./templates/frog-default";
import { RESEARCH_A } from "./templates/research-a";
import { RESEARCH_B } from "./templates/research-b";
import { viewOf } from "./view";

let n = 0;
const ex = (
  name: string,
  equipment: string | null = "machine",
): SelectableExercise => ({
  id: `id-${++n}`,
  name,
  isCustom: false,
  equipment,
  exerciseType: "weight_reps",
  muscleTargets: null,
  mechanic: null,
});

const LIB = [
  "Leg Press",
  "Squat",
  "Leg Extension",
  "Romanian Deadlift",
  "Leverage Chest Press",
  "Bench Press",
  "Lying T-Bar Row",
  "Lateral Raise",
  "Incline Dumbbell Curl",
  "Triceps Overhead Extension with Rope",
  "Standing Calf Raises",
  "Seated Leg Curl",
].map((name) =>
  ex(name, name === "Squat" || name === "Bench Press" ? "barbell" : "machine"),
);

describe("resolveTemplate", () => {
  it("Frog default: stable-first picks, one routine, 24 sets", () => {
    const r = resolveTemplate(FROG_DEFAULT, LIB);
    expect(r.unresolved).toEqual([]);
    const names = r.program.routines[0].exercises.map(
      (e) => LIB.find((l) => l.id === e.exerciseId)!.name,
    );
    expect(names[0]).toBe("Leg Press"); // stable beats Squat (R13, a practical choice)
    expect(names[3]).toBe("Leverage Chest Press");
    expect(
      r.program.routines[0].exercises.reduce((a, e) => a + e.sets.length, 0),
    ).toBe(24);
  });

  it("equipment filter moves to the next menu entry and reports gaps", () => {
    const noMachine = resolveTemplate(FROG_DEFAULT, LIB, {
      answers: { goal: "muscle", minutes: 60, equipment: ["barbell"] },
    });
    const first = noMachine.program.routines[0].exercises[0];
    expect(LIB.find((l) => l.id === first.exerciseId)!.name).toBe("Squat");
    // No cable/dumbbell/machine: some slots cannot resolve; none throw.
    expect(noMachine.unresolved.length).toBeGreaterThan(0);
  });

  it("excluded ids are skipped", () => {
    const lp = LIB.find((l) => l.name === "Leg Press")!;
    const r = resolveTemplate(FROG_DEFAULT, LIB, {
      excludedIds: new Set([lp.id]),
    });
    const first = r.program.routines[0].exercises[0];
    expect(LIB.find((l) => l.id === first.exerciseId)!.name).toBe("Squat");
  });

  it("repBias heavy: isolation 4-8; research: isolation 10-15 (D4)", () => {
    const reps = (t: typeof FROG_DEFAULT, bias: "heavy" | "research") => {
      const v = viewOf(t, { philosophy: { ...t.philosophy, repBias: bias } });
      return v.sessions[0].slots.find((s) => s.slot === "1b")!.rx.reps;
    };
    expect(reps(FROG_DEFAULT, "heavy")).toEqual([4, 8]);
    expect(reps(FROG_DEFAULT, "research")).toEqual([10, 15]);
    // Compounds never change.
    const v = viewOf(FROG_DEFAULT);
    expect(v.sessions[0].slots.find((s) => s.slot === "1a")!.rx.reps).toEqual([
      5, 7,
    ]);
  });

  it("top-set-first: set 1 RIR 1, rest 2-3; max: 0-1; off: flat 1-3; isolation flat", () => {
    const slot = viewOf(FROG_DEFAULT).sessions[0].slots[0];
    const rir = (m: "off" | "top" | "max") =>
      setTargets(slot, m).map((t) => [t.rirMin, t.rirMax]);
    expect(rir("top")).toEqual([
      [1, 1],
      [2, 3],
      [2, 3],
    ]);
    expect(rir("max")).toEqual([
      [0, 1],
      [2, 3],
      [2, 3],
    ]);
    expect(rir("off")).toEqual([
      [1, 3],
      [1, 3],
      [1, 3],
    ]);
    const iso = viewOf(FROG_DEFAULT).sessions[0].slots.find(
      (s) => s.slot === "1b",
    )!;
    expect(setTargets(iso, "top").map((t) => [t.rirMin, t.rirMax])).toEqual([
      [1, 3],
      [1, 3],
    ]);
  });

  it("Program B resolves to three routines; hip thrust only on Wednesday", () => {
    const lib = [
      ...LIB,
      ex("Barbell Hip Thrust", "barbell"),
      ex("Incline Dumbbell Press", "dumbbell"),
      ex("Lat Pulldown", "cable"),
      ex("Cable Preacher Curl", "cable"),
    ];
    const r = resolveTemplate(RESEARCH_B, lib);
    expect(r.program.routines).toHaveLength(3);
    const counts = r.program.routines.map((x) => x.exercises.length);
    expect(counts[1]).toBe(counts[0] + 1);
  });

  it("a pinned exerciseId override wins (swap)", () => {
    const squat = LIB.find((l) => l.name === "Squat")!;
    const r = resolveTemplate(FROG_DEFAULT, LIB, {
      overrides: [{ slot: "1a", exerciseId: squat.id }],
    });
    expect(r.program.routines[0].exercises[0].exerciseId).toBe(squat.id);
  });

  it("emits per-set RIR ranges and midpoint rest", () => {
    const r = resolveTemplate(RESEARCH_A, LIB);
    const first = r.program.routines[0].exercises[0];
    expect(first.restSec).toBe(150);
    expect(
      first.sets.every((s) => s.targetRirMin === 1 && s.targetRirMax === 3),
    ).toBe(true);
    expect(first.sets[0].setType).toBe("normal");
  });

  it("pickMenuEntry ignores custom rows", () => {
    const custom = { ...ex("Leg Press"), isCustom: true };
    expect(
      pickMenuEntry(FROG_DEFAULT.sessions[0].slots[0].menu, [custom]),
    ).toBeNull();
  });
});

describe("recommendTemplate", () => {
  it("every other day → Frog default (the boss default)", () => {
    expect(recommendTemplate(DEFAULT_ANSWERS)).toMatchObject({
      kind: "template",
      template: { id: "frog-default" },
    });
  });
  it("three fixed days → Program B; five days → legacy generator", () => {
    const w = (days: number[]) => ({
      ...DEFAULT_ANSWERS,
      schedule: { kind: "weekdays", days } as never,
    });
    expect(recommendTemplate(w([1, 3, 5]))).toMatchObject({
      template: { id: "research-b" },
    });
    expect(recommendTemplate(w([1, 2, 4, 5, 6])).kind).toBe("legacy");
  });
});

describe("SavedProgramConfig guard", () => {
  it("round-trips a built config", () => {
    const cfg = buildSavedConfig(FROG_DEFAULT, DEFAULT_ANSWERS, {
      startedAt: 1700000000000,
    });
    expect(parseSavedProgramConfig(JSON.parse(JSON.stringify(cfg)))).toEqual(
      cfg,
    );
  });
  it("rejects legacy generator configs and junk", () => {
    expect(
      parseSavedProgramConfig({ goal: "muscle", daysPerWeek: 3 }),
    ).toBeNull();
    expect(parseSavedProgramConfig(null)).toBeNull();
    expect(parseSavedProgramConfig("x")).toBeNull();
    expect(
      parseSavedProgramConfig({ templateId: "a", answers: {} }),
    ).toBeNull();
  });
  it("clamps everyWeeks to the 4-6 deload interval (R17) and drops bad overrides", () => {
    const base = JSON.parse(
      JSON.stringify(buildSavedConfig(FROG_DEFAULT, DEFAULT_ANSWERS)),
    );
    base.block.everyWeeks = 12;
    base.overrides = [{ slot: "1a", sets: 4 }, { nope: true }, 5];
    const out = parseSavedProgramConfig(base)!;
    expect(out.block.everyWeeks).toBe(6);
    expect(out.overrides).toEqual([{ slot: "1a", sets: 4 }]);
  });
});
