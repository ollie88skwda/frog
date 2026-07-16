import { describe, expect, it } from "vitest";
import type { MuscleTarget } from "../domain/anatomy";
import type { RecordsSessionInput } from "../records/types";
import {
  bucketStart,
  type MuscleByExercise,
  mainExercises,
  muscleCredits,
  muscleDistribution,
  setsPerMuscle,
  sevenDayMuscleSets,
  weeklyConsistency,
} from "./aggregate";
import { monthlyReport, reportableMonths } from "./monthly-report";
import { yearReview } from "./year-review";

const DAY = 24 * 60 * 60 * 1000;
// Mon 2026-07-13 12:00 local
const NOW = new Date(2026, 6, 13, 12).getTime();
const OPTS = { now: NOW, includeWarmups: true, firstWeekday: 1 };

const bench = (targets: MuscleTarget[]): MuscleByExercise =>
  new Map([["bench", targets]]);

const MUSCLES = bench([
  { muscle: "pecs", tier: "S" },
  { muscle: "front-delts", tier: "A" },
]);

function session(
  id: string,
  startedAt: number,
  sets: number,
  weightKg = 100,
): RecordsSessionInput {
  return {
    sessionId: id,
    startedAt,
    endedAt: startedAt + 60 * 60 * 1000,
    pausedMs: 0,
    exercises: [
      {
        exerciseId: "bench",
        exerciseType: "weight_reps",
        sets: Array.from({ length: sets }, () => ({
          setType: "normal",
          weightKg,
          reps: 5,
          durationSec: null,
          distanceM: null,
        })),
      },
    ],
  };
}

describe("muscleCredits", () => {
  it("primary 1.0, secondaries 0.5", () => {
    expect(
      muscleCredits([
        { muscle: "pecs", tier: null },
        { muscle: "triceps", tier: null },
      ]),
    ).toEqual([
      { muscle: "pecs", credit: 1 },
      { muscle: "triceps", credit: 0.5 },
    ]);
    expect(muscleCredits(null)).toEqual([]);
  });
});

describe("setsPerMuscle", () => {
  it("buckets fractional counts by week", () => {
    const history = [
      session("a", NOW - DAY, 4),
      session("b", NOW - 8 * DAY, 2),
    ];
    const buckets = setsPerMuscle(history, MUSCLES, "3m", "week", OPTS);
    expect(buckets).toHaveLength(2);
    const latest = buckets[1];
    expect(latest.counts.pecs).toBe(4);
    expect(latest.counts["front-delts"]).toBe(2); // 4 sets × 0.5
  });

  it("excludes warm-ups when configured", () => {
    const h: RecordsSessionInput[] = [
      {
        ...session("a", NOW - DAY, 0),
        exercises: [
          {
            exerciseId: "bench",
            exerciseType: "weight_reps",
            sets: [
              {
                setType: "warmup",
                weightKg: 60,
                reps: 5,
                durationSec: null,
                distanceM: null,
              },
              {
                setType: "normal",
                weightKg: 100,
                reps: 5,
                durationSec: null,
                distanceM: null,
              },
            ],
          },
        ],
      },
    ];
    const buckets = setsPerMuscle(h, MUSCLES, "30d", "week", {
      ...OPTS,
      includeWarmups: false,
    });
    expect(buckets[0].counts.pecs).toBe(1);
  });
});

describe("muscleDistribution", () => {
  it("totals + prior-equal-period compare", () => {
    const history = [
      session("cur", NOW - 5 * DAY, 3), // in current 30d
      session("prev", NOW - 45 * DAY, 2), // in previous 30d window
    ];
    const { current, previous } = muscleDistribution(
      history,
      MUSCLES,
      "30d",
      OPTS,
    );
    expect(current.totals.workouts).toBe(1);
    expect(current.totals.sets).toBe(3);
    expect(current.totals.volumeKg).toBe(1500);
    expect(current.totals.durationMs).toBe(60 * 60 * 1000);
    expect(current.regionSets.chest).toBe(3);
    expect(current.regionSets.shoulders).toBe(1.5);
    expect(previous.totals.workouts).toBe(1);
    expect(previous.totals.sets).toBe(2);
  });
});

describe("mainExercises / consistency / 7-day muscles", () => {
  it("ranks by session count and windows correctly", () => {
    const history = [
      session("a", NOW - DAY, 3),
      session("b", NOW - 2 * DAY, 3),
      session("old", NOW - 100 * DAY, 3),
    ];
    expect(mainExercises(history, "30d", OPTS)).toEqual([
      { exerciseId: "bench", sessions: 2 },
    ]);
    const weeks = weeklyConsistency(history, 4, OPTS);
    expect(weeks).toHaveLength(4);
    // NOW is Mon 12:00; NOW−1d (Sun) and NOW−2d (Sat) fall in the PREVIOUS
    // Monday-start week, so the current week is empty.
    expect(weeks[3].sessions).toBe(0);
    expect(weeks[2].sessions).toBe(2);
    const seven = sevenDayMuscleSets(history, MUSCLES, OPTS);
    expect(seven.pecs).toBe(6);
  });
});

describe("monthly report + year review", () => {
  const june = new Date(2026, 5, 10, 10).getTime();
  const july = new Date(2026, 6, 5, 10).getTime();
  const history = [
    session("jun1", june, 4, 100),
    session("jul1", july, 4, 110), // beats june weights → PR events in July
  ];

  it("builds a month window with PRs and workout days", () => {
    const r = monthlyReport(history, MUSCLES, 2026, 6, OPTS);
    expect(r.totals.workouts).toBe(1);
    expect(r.previous.totals.workouts).toBe(1);
    expect(r.workoutDays).toEqual(["2026-07-05"]);
    expect(r.prEvents.length).toBeGreaterThan(0);
    expect(
      r.prEvents.every((e) => e.at >= new Date(2026, 6, 1).getTime()),
    ).toBe(true);
    expect(reportableMonths(history)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 5 },
    ]);
  });

  it("year review aggregates the calendar year", () => {
    const r = yearReview(history, MUSCLES, 2026, OPTS);
    expect(r.workouts).toBe(2);
    expect(r.volumeKg).toBe(4 * 5 * 100 + 4 * 5 * 110);
    expect(r.mostProductiveMonth?.workouts).toBe(1);
    expect(r.topRegions[0].region).toBe("chest");
    expect(r.topExercises[0]).toEqual({ exerciseId: "bench", sessions: 2 });
    expect(r.workoutDays).toHaveLength(2);
  });
});

describe("bucketStart", () => {
  it("month + year buckets snap to calendar boundaries", () => {
    expect(bucketStart(NOW, "month", 1)).toBe(new Date(2026, 6, 1).getTime());
    expect(bucketStart(NOW, "year", 1)).toBe(new Date(2026, 0, 1).getTime());
  });
});
