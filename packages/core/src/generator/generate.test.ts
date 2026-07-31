import { describe, expect, it } from "vitest";
import { generateProgram } from "./generate";
import { nextPrescription } from "./overload";
import type { SelectableExercise } from "./types";

const ex = (
  id: string,
  muscle: string,
  tier: string | null,
  equipment: string,
  secondary?: string,
  mechanic: string | null = null,
): SelectableExercise => ({
  id,
  name: id,
  isCustom: false,
  equipment,
  exerciseType: "weight_reps",
  muscleTargets: [
    { muscle, tier },
    ...(secondary ? [{ muscle: secondary, tier: null }] : []),
  ],
  mechanic,
});

const LIBRARY: SelectableExercise[] = [
  ex("squat", "quads", "S", "barbell", "glutes"),
  ex("leg-press", "quads", "A", "machine", "glutes"),
  ex("leg-ext", "quads", "B", "machine"),
  ex("rdl", "hamstrings", "S", "barbell", "glutes"),
  ex("bench", "pecs", "S", "barbell", "triceps"),
  ex("db-press", "pecs", "A", "dumbbell", "triceps"),
  ex("row", "lats", "S", "barbell", "biceps"),
  ex("pulldown", "lats", "A", "cable", "biceps"),
  ex("ohp", "front-delts", "S", "barbell", "triceps"),
  ex("curl", "biceps", "B", "dumbbell"),
  ex("crunch", "abs", null, "bodyweight"),
];

describe("generateProgram", () => {
  it("is deterministic and respects equipment", () => {
    const config = {
      goal: "muscle" as const,
      experience: "beginner" as const,
      equipment: ["dumbbell", "cable", "bodyweight"],
      daysPerWeek: 3 as const,
      minutesPerWorkout: 45 as const,
    };
    const a = generateProgram(config, LIBRARY);
    const b = generateProgram(config, LIBRARY);
    expect(a).toEqual(b);
    const ids = a.routines.flatMap((r) => r.exercises.map((e) => e.exerciseId));
    // No barbell/machine picks without that equipment.
    expect(ids).not.toContain("squat");
    expect(ids).not.toContain("leg-press");
    expect(ids).toContain("db-press"); // dumbbell pec pick
    expect(a.routines).toHaveLength(3);
    expect(a.routines[0].name).toBe("Full body A");
  });

  it("prefers better tiers and respects exclusions", () => {
    const config = {
      goal: "muscle" as const,
      experience: "intermediate" as const,
      equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
      daysPerWeek: 5 as const,
      minutesPerWorkout: 60 as const,
    };
    const withAll = generateProgram(config, LIBRARY);
    const legIds = withAll.routines
      .find((r) => r.name === "Legs")
      ?.exercises.map((e) => e.exerciseId);
    expect(legIds?.[0]).toBe("squat"); // S-tier quad compound first
    const excluded = generateProgram(config, LIBRARY, {
      excludedIds: new Set(["squat"]),
    });
    const legIds2 = excluded.routines
      .find((r) => r.name === "Legs")
      ?.exercises.map((e) => e.exerciseId);
    expect(legIds2).not.toContain("squat");
    expect(legIds2?.[0]).toBe("leg-press"); // next best tier
  });

  it("rep ranges + starting weights flow into targets", () => {
    const p = generateProgram(
      {
        goal: "strength",
        experience: "advanced",
        equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
        daysPerWeek: 4,
        minutesPerWorkout: 60,
      },
      LIBRARY,
      { startingWeightsKg: new Map([["bench", 80]]) },
    );
    const upper = p.routines[0];
    const bench = upper.exercises.find((e) => e.exerciseId === "bench");
    expect(bench?.sets).toHaveLength(5); // advanced strength compound
    expect(bench?.sets[0]).toMatchObject({
      targetWeightKg: 80,
      targetReps: 4,
      targetRepsMax: 6,
    });
    expect(bench?.restSec).toBe(180);
  });

  it("an explicit mechanic overrides the muscle-count proxy", () => {
    const config = {
      goal: "muscle" as const,
      experience: "intermediate" as const,
      equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
      daysPerWeek: 5 as const,
      minutesPerWorkout: 60 as const,
    };
    const library: SelectableExercise[] = [
      // One target but explicitly compound — without reading `mechanic`,
      // the muscle-count proxy would call this isolation.
      ex(
        "quad-explicit-compound",
        "quads",
        "S",
        "barbell",
        undefined,
        "compound",
      ),
      // Two targets but explicitly isolation — the proxy would call this
      // compound.
      ex(
        "quad-explicit-isolation",
        "quads",
        "S",
        "barbell",
        "glutes",
        "isolation",
      ),
      ex("hamstrings-s", "hamstrings", "S", "barbell", "glutes"),
      ex("glutes-s", "glutes", "S", "barbell"),
      ex("calves-s", "calves", "S", "bodyweight"),
      ex("abs-s", "abs", "S", "bodyweight"),
    ];
    const legIds = generateProgram(config, library)
      .routines.find((r) => r.name === "Legs")
      ?.exercises.map((e) => e.exerciseId);
    // Legs' first slot wants a compound quad; same tier on both candidates,
    // so this only resolves correctly if `mechanic` is read over the count.
    expect(legIds?.[0]).toBe("quad-explicit-compound");
  });

  it("focus muscle injects an extra slot", () => {
    const p = generateProgram(
      {
        goal: "muscle",
        experience: "beginner",
        equipment: ["barbell", "dumbbell", "machine", "cable", "bodyweight"],
        daysPerWeek: 2,
        minutesPerWorkout: 60,
        focusMuscle: "biceps",
      },
      LIBRARY,
    );
    expect(p.routines[0].exercises.map((e) => e.exerciseId)).toContain("curl");
  });
});

describe("nextPrescription", () => {
  const targets = [
    {
      setNo: 0,
      setType: "normal",
      targetWeightKg: 100,
      targetReps: 8,
      targetRepsMax: 12,
    },
    {
      setNo: 1,
      setType: "normal",
      targetWeightKg: 100,
      targetReps: 8,
      targetRepsMax: 12,
    },
  ];

  it("advances only when ALL sets hit the top of the range", () => {
    const allTop = nextPrescription(
      targets,
      [
        { setNo: 0, weightKg: 100, reps: 12 },
        { setNo: 1, weightKg: 100, reps: 12 },
      ],
      "barbell",
    );
    expect(allTop.advance).toBe(true);
    expect(allTop.status).toBe("progressing");
    expect(allTop.nextWeightKg).toEqual([102.5, 102.5]);

    const oneShort = nextPrescription(
      targets,
      [
        { setNo: 0, weightKg: 100, reps: 12 },
        { setNo: 1, weightKg: 100, reps: 11 },
      ],
      "barbell",
    );
    expect(oneShort.advance).toBe(false);
    expect(oneShort.status).toBe("maintaining");
    expect(oneShort.nextWeightKg).toEqual([100, 100]);
  });

  it("no data → no_data; fixed-rep sets ignored", () => {
    expect(nextPrescription(targets, [], "barbell").status).toBe("no_data");
    const fixed = [
      {
        setNo: 0,
        setType: "normal",
        targetWeightKg: 100,
        targetReps: 5,
        targetRepsMax: null,
      },
    ];
    expect(
      nextPrescription(fixed, [{ setNo: 0, weightKg: 100, reps: 5 }], "barbell")
        .status,
    ).toBe("no_data");
  });

  it("dumbbell step is 2 kg", () => {
    const r = nextPrescription(
      targets,
      [
        { setNo: 0, weightKg: 100, reps: 12 },
        { setNo: 1, weightKg: 100, reps: 12 },
      ],
      "dumbbell",
    );
    expect(r.nextWeightKg).toEqual([102, 102]);
  });
});
