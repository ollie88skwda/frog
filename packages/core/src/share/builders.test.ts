import { describe, expect, it } from "vitest";
import type { MuscleTarget } from "../domain/anatomy";
import { computeRecords } from "../records/records";
import type { RecordsSessionInput } from "../records/types";
import type { MuscleByExercise } from "../stats/aggregate";
import { monthlyReport } from "../stats/monthly-report";
import { yearReview } from "../stats/year-review";
import {
  buildExerciseRecordsCard,
  buildMonthCard,
  buildPrCard,
  buildSessionCard,
  buildStreakCard,
  buildYearCard,
} from "./builders";
import type { SessionCardBlock } from "./types";

const OPTS = { now: Date.now(), includeWarmups: true, firstWeekday: 0 };
const IDENTITY = { displayName: "Ollie" };

describe("buildSessionCard", () => {
  const blocks: SessionCardBlock[] = [
    {
      exerciseId: "bench",
      exerciseName: "Bench Press",
      exerciseType: "weight_reps",
      sets: [
        {
          id: "s1",
          setNo: 0,
          setType: "normal",
          weightKg: 100,
          reps: 5,
          durationSec: null,
          distanceM: null,
        },
        {
          id: "s2",
          setNo: 1,
          setType: "normal",
          weightKg: 110,
          reps: 3,
          durationSec: null,
          distanceM: null,
        },
      ],
    },
    {
      exerciseId: "curl",
      exerciseName: "Bicep Curl",
      exerciseType: "weight_reps",
      sets: [
        {
          id: "s3",
          setNo: 0,
          setType: "normal",
          weightKg: 20,
          reps: 10,
          durationSec: null,
          distanceM: null,
        },
      ],
    },
  ];

  it("auto-picks the heaviest set as hero", () => {
    const card = buildSessionCard({
      ordinal: 1,
      title: "Push day",
      date: "Jul 30",
      durationMs: 62 * 60_000,
      blocks,
      muscles: new Map(),
      bodyweightKg: null,
      unit: "kg",
      identity: IDENTITY,
      includeWarmups: true,
    });
    expect(card.hero.caption).toBe("Bench Press");
    expect(card.hero.value).toBe("110");
    expect(card.isAutoHero).toBe(true);
    expect(card.support[1]).toEqual({ label: "Sets", value: "3" });
    expect(card.support[2].value).toBe("1:02");
  });

  it("honors a user-chosen hero set over the auto pick", () => {
    const card = buildSessionCard({
      ordinal: 1,
      title: "Push day",
      date: "Jul 30",
      durationMs: 60_000,
      blocks,
      muscles: new Map(),
      bodyweightKg: null,
      unit: "kg",
      identity: IDENTITY,
      heroSet: { exerciseId: "curl", setId: "s3" },
      includeWarmups: true,
    });
    expect(card.hero.caption).toBe("Bicep Curl");
    expect(card.hero.value).toBe("20");
    expect(card.isAutoHero).toBe(false);
  });

  it("falls back to reps when no set carries a weight (bodyweight-only session)", () => {
    const bwBlocks: SessionCardBlock[] = [
      {
        exerciseId: "pushup",
        exerciseName: "Push-up",
        exerciseType: "bodyweight_reps",
        sets: [
          {
            id: "b1",
            setNo: 0,
            setType: "normal",
            weightKg: null,
            reps: 15,
            durationSec: null,
            distanceM: null,
          },
        ],
      },
    ];
    const card = buildSessionCard({
      ordinal: 2,
      title: "Bodyweight",
      date: "Jul 30",
      durationMs: 0,
      blocks: bwBlocks,
      muscles: new Map(),
      bodyweightKg: null, // no bodyweight logged
      unit: "kg",
      identity: IDENTITY,
      includeWarmups: true,
    });
    expect(card.hero.value).toBe("15");
    expect(card.hero.unit).toBe("reps");
    // No bodyweight on record ⇒ volume can't be computed ⇒ "—", not 0.
    expect(card.support[0]).toEqual({ label: "Volume", value: "—" });
  });

  it("excludes warm-up sets from Volume/Sets/muscle credit when includeWarmups is false, matching every other stats surface", () => {
    const warmupBlocks: SessionCardBlock[] = [
      {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        exerciseType: "weight_reps",
        sets: [
          {
            id: "w1",
            setNo: 0,
            setType: "warmup",
            weightKg: 40,
            reps: 10,
            durationSec: null,
            distanceM: null,
          },
          {
            id: "s1",
            setNo: 1,
            setType: "normal",
            weightKg: 100,
            reps: 5,
            durationSec: null,
            distanceM: null,
          },
          {
            id: "s2",
            setNo: 2,
            setType: "normal",
            weightKg: 100,
            reps: 5,
            durationSec: null,
            distanceM: null,
          },
        ],
      },
    ];
    const withWarmups = buildSessionCard({
      ordinal: 1,
      title: "Push day",
      date: "Jul 30",
      durationMs: 0,
      blocks: warmupBlocks,
      muscles: new Map(),
      bodyweightKg: null,
      unit: "kg",
      identity: IDENTITY,
      includeWarmups: true,
    });
    const withoutWarmups = buildSessionCard({
      ordinal: 1,
      title: "Push day",
      date: "Jul 30",
      durationMs: 0,
      blocks: warmupBlocks,
      muscles: new Map(),
      bodyweightKg: null,
      unit: "kg",
      identity: IDENTITY,
      includeWarmups: false,
    });
    expect(withWarmups.support[1]).toEqual({ label: "Sets", value: "3" });
    expect(withWarmups.support[0].value).toBe("1,400 kg");
    expect(withoutWarmups.support[1]).toEqual({ label: "Sets", value: "2" });
    expect(withoutWarmups.support[0].value).toBe("1,000 kg");
  });
});

describe("buildPrCard", () => {
  it("computes a delta when a previous best exists", () => {
    const card = buildPrCard({
      event: {
        prType: "heaviest_weight",
        value: 110,
        previous: 100,
        sessionId: "s",
        at: Date.now(),
        exerciseId: "bench",
      },
      prTypeLabel: "Heaviest weight",
      exerciseName: "Bench Press",
      unit: "kg",
      distUnit: "km",
      estOneRmKg: 123,
      sparkline: [],
      extraPrLabels: [],
      identity: IDENTITY,
    });
    expect(card.hero.value).toBe("110 kg");
    expect(card.delta).toEqual({ label: "Δ vs previous", value: "+10 kg" });
    expect(card.previousBest).toEqual({
      label: "Previous best",
      value: "100 kg",
    });
    expect(card.estOneRm).toEqual({ label: "Est. 1RM", value: "123 kg" });
  });

  it("omits delta/previous when this is the exercise's first-ever entry for that PR type", () => {
    const card = buildPrCard({
      event: {
        prType: "best_e1rm",
        value: 150,
        previous: null,
        sessionId: "s",
        at: Date.now(),
        exerciseId: "bench",
      },
      prTypeLabel: "Best 1RM (est.)",
      exerciseName: "Bench Press",
      unit: "kg",
      distUnit: "km",
      estOneRmKg: null,
      sparkline: [],
      extraPrLabels: [],
      identity: IDENTITY,
    });
    expect(card.delta).toBeNull();
    expect(card.previousBest).toBeNull();
    expect(card.estOneRm).toBeNull();
  });
});

describe("buildStreakCard", () => {
  it("formats rest days as 'Trained today' at zero", () => {
    const card = buildStreakCard({
      weeksStreak: 4,
      workoutsThisWeek: 2,
      volumeKgThisWeek: 3200,
      restDays: 0,
      last13Weeks: Array(13).fill(true),
      unit: "kg",
      identity: IDENTITY,
    });
    expect(card.hero).toEqual({ value: "4", unit: "weeks streak" });
    expect(card.support[2]).toEqual({ label: "Rest", value: "Trained today" });
  });

  it("thousands-separates the weekly volume, like every other volume stat", () => {
    const card = buildStreakCard({
      weeksStreak: 4,
      workoutsThisWeek: 3,
      volumeKgThisWeek: 12500,
      restDays: 1,
      last13Weeks: Array(13).fill(true),
      unit: "kg",
      identity: IDENTITY,
    });
    expect(card.support[1]).toEqual({ label: "Volume", value: "12,500 kg" });
  });
});

const bench = (targets: MuscleTarget[]): MuscleByExercise =>
  new Map([["bench", targets]]);

function session(
  id: string,
  startedAt: number,
  weightKg: number,
): RecordsSessionInput {
  return {
    sessionId: id,
    startedAt,
    endedAt: startedAt + 3_600_000,
    pausedMs: 0,
    exercises: [
      {
        exerciseId: "bench",
        exerciseType: "weight_reps",
        sets: [
          {
            setType: "normal",
            weightKg,
            reps: 5,
            durationSec: null,
            distanceM: null,
          },
        ],
      },
    ],
  };
}

describe("buildMonthCard / buildYearCard", () => {
  const muscles = bench([{ muscle: "pecs", tier: "S" }]);
  const history = [
    session("a", new Date(2026, 6, 5).getTime(), 100),
    session("b", new Date(2026, 6, 12).getTime(), 105),
  ];

  it("builds a month card from a real monthlyReport()", () => {
    const report = monthlyReport(history, muscles, 2026, 6, OPTS, null);
    const card = buildMonthCard({
      report,
      unit: "kg",
      topExerciseName: "Bench Press",
      identity: IDENTITY,
    });
    expect(card.hero).toEqual({ value: "2", unit: "workouts" });
    expect(card.eyebrow).toBe("JULY 2026");
  });

  it("builds a year card from a real yearReview()", () => {
    const review = yearReview(history, muscles, 2026, OPTS, null);
    const card = buildYearCard({
      review,
      unit: "kg",
      topExerciseName: "Bench Press",
      identity: IDENTITY,
    });
    expect(card.support[0]).toEqual({ label: "Workouts", value: "2" });
    expect(card.monthlyWorkouts[6]).toBe(2);
  });
});

describe("buildExerciseRecordsCard", () => {
  it("returns null when the exercise has no applicable bests yet", () => {
    const { byExercise } = computeRecords([], { includeWarmups: true });
    const card = buildExerciseRecordsCard({
      exerciseName: "Bench Press",
      type: "weight_reps",
      records: byExercise.get("bench") ?? {
        exerciseId: "bench",
        bests: {},
        setRecords: new Map(),
      },
      unit: "kg",
      distUnit: "km",
      sparkline: [],
      identity: IDENTITY,
    });
    expect(card).toBeNull();
  });

  it("prefers best_e1rm as the hero over heaviest_weight", () => {
    const { byExercise } = computeRecords(
      [session("a", 0, 100), session("b", 86_400_000, 110)],
      { includeWarmups: true },
    );
    const records = byExercise.get("bench");
    if (!records) throw new Error("expected records");
    const card = buildExerciseRecordsCard({
      exerciseName: "Bench Press",
      type: "weight_reps",
      records,
      unit: "kg",
      distUnit: "km",
      sparkline: [],
      identity: IDENTITY,
    });
    expect(card?.heroPrType).toBe("best_e1rm");
  });

  it("falls back to best_set_reps for a bodyweight exercise (no weight PR types exist)", () => {
    const pullup = (id: string, startedAt: number, reps: number) => ({
      sessionId: id,
      startedAt,
      endedAt: startedAt + 3_600_000,
      pausedMs: 0,
      exercises: [
        {
          exerciseId: "pullup",
          exerciseType: "bodyweight_reps",
          sets: [
            {
              setType: "normal",
              weightKg: null,
              reps,
              durationSec: null,
              distanceM: null,
            },
          ],
        },
      ],
    });
    const { byExercise } = computeRecords(
      [pullup("a", 0, 8), pullup("b", 86_400_000, 10)],
      { includeWarmups: true },
    );
    const records = byExercise.get("pullup");
    if (!records) throw new Error("expected records");
    const card = buildExerciseRecordsCard({
      exerciseName: "Pull-up",
      type: "bodyweight_reps",
      records,
      unit: "kg",
      distUnit: "km",
      sparkline: [],
      identity: IDENTITY,
    });
    expect(card?.heroPrType).toBe("best_set_reps");
    expect(card?.hero.value).toBe("10 reps");
  });
});
