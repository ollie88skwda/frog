import { describe, expect, it } from "vitest";
import { PROGRAM_TEMPLATES } from "../program/templates";
import { validateProgram } from "../program/validate";
import { viewOf } from "../program/view";
import { type ViewExercise, viewFromRoutines } from "./routine-view";
import { rankSwaps, type SwapCandidate } from "./swap";

const lookup = new Map([
  [
    "press",
    {
      mechanic: "compound",
      muscleTargets: [
        { muscle: "pecs", tier: "S" as const, role: "primary" as const },
        { muscle: "triceps", tier: null, role: "secondary" as const },
      ],
    },
  ],
  [
    "ext",
    {
      mechanic: "isolation",
      muscleTargets: [{ muscle: "triceps", tier: "A" as const }],
    },
  ],
]);

const set = (type = "normal") => ({
  setType: type,
  targetReps: 4,
  targetRepsMax: 8,
  targetRirMin: 1,
  targetRirMax: 3,
});

describe("viewFromRoutines (R6/R7 meter for any program)", () => {
  it("counts working sets only: warm-ups never enter the meter", () => {
    const v = viewFromRoutines(
      [
        {
          id: "r1",
          name: "Full body",
          exercises: [
            {
              exerciseId: "press",
              sets: [set("warmup"), set(), set(), set()],
            },
            { exerciseId: "ext", sets: [set(), set()] },
          ],
        },
      ],
      lookup,
      { schedule: { kind: "interval", everyDays: 2 } },
    );
    expect(v.sessions[0].slots[0].rx.sets).toBe(3);
    expect(v.sessions[0].slots[0].credits).toEqual({
      direct: ["pecs"],
      indirect: ["triceps"],
    });
    const res = validateProgram(v);
    // 3.5 sessions/wk: pecs 3 × 3.5 = 10.5 direct; triceps 2 × 3.5 + 3 × 3.5 × .5.
    expect(res.weekly.pecs.direct).toBeCloseTo(10.5);
    expect(res.weekly.triceps.direct).toBeCloseTo(7);
    expect(res.weekly.triceps.indirect).toBeCloseTo(5.25);
  });

  it("an exercise with only warm-up sets is dropped", () => {
    const v = viewFromRoutines(
      [
        {
          id: "r1",
          name: "x",
          exercises: [{ exerciseId: "press", sets: [set("warmup")] }],
        },
      ],
      lookup,
    );
    expect(v.sessions[0].slots).toHaveLength(0);
  });

  it("routines written from a template read back the template's weekly sets", () => {
    const tv = viewOf(PROGRAM_TEMPLATES[0]);
    const exLookup = new Map<string, ViewExercise>();
    const routines = tv.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      exercises: s.slots.map((slot) => {
        const exerciseId = `${s.id}|${slot.slot}`;
        exLookup.set(exerciseId, {
          mechanic: slot.role === "isolation" ? "isolation" : "compound",
          muscleTargets: [
            ...slot.credits.direct.map((muscle) => ({
              muscle,
              tier: null,
              role: "primary" as const,
            })),
            ...slot.credits.indirect.map((muscle) => ({
              muscle,
              tier: null,
              role: "secondary" as const,
            })),
          ],
        });
        return {
          exerciseId,
          sets: [
            set("warmup"),
            ...Array.from({ length: slot.rx.sets }, () => set()),
          ],
        };
      }),
    }));
    const expected = validateProgram(tv).weekly;
    const got = validateProgram(
      viewFromRoutines(routines, exLookup, { schedule: tv.schedule }),
    ).weekly;
    expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    for (const [muscle, w] of Object.entries(expected)) {
      expect(got[muscle].direct).toBeCloseTo(w.direct);
      expect(got[muscle].indirect).toBeCloseTo(w.indirect);
    }
  });
});

describe("rankSwaps (F14: muscle → region → action → stability)", () => {
  const mk = (
    id: string,
    equipment: string,
    muscle: string,
    actions: string[],
  ): SwapCandidate => ({
    id,
    name: id,
    isCustom: false,
    equipment,
    exerciseType: "weight_reps",
    muscleTargets: [{ muscle, tier: "A" }],
    mechanic: "isolation",
    jointActions: actions,
  });
  const current = mk("cur", "barbell", "triceps", ["elbow-extension"]);
  const lib = [
    current,
    mk("bar", "barbell", "triceps", ["elbow-extension"]),
    mk("cab", "cable", "triceps", ["elbow-extension"]),
    mk("curl", "cable", "biceps", ["elbow-flexion"]),
    mk("mach", "machine", "triceps", []),
  ];

  it("only same-primary-muscle candidates, stable first", () => {
    const r = rankSwaps(current, lib).map((x) => x.exercise.id);
    expect(r).toEqual(["cab", "bar", "mach"]);
  });

  it("a region-cell match outranks stability", () => {
    const r = rankSwaps(current, lib, {
      currentRegion: "triceps-long",
      regionOf: (id) => (id === "bar" ? "triceps-long" : null),
    }).map((x) => x.exercise.id);
    expect(r[0]).toBe("bar");
  });
});
