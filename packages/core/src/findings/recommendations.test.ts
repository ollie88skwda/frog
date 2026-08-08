import { describe, expect, it } from "vitest";
import { recommendationsForExercise } from "./recommendations";
import { rirStatsByExercise, sessionVolumeByExercise } from "./series";
import { progressionFindings } from "./teaser";
import type { FindingsSessionInput } from "./types";

const DAY_MS = 86_400_000;

type SetSpec = {
  weightKg: number | null;
  reps: number | null;
  setType?: string | null;
  rir?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
};

function lift(
  weightKg: number,
  reps = 5,
  extra: Partial<SetSpec> = {},
): SetSpec {
  return { weightKg, reps, ...extra };
}

function session(i: number, sets: SetSpec[]): FindingsSessionInput {
  return {
    sessionId: `s${i}`,
    startedAt: i * 3 * DAY_MS,
    conditionValues: null,
    sets: sets.map((s) => ({
      exerciseId: "ex1",
      exerciseName: "Squat",
      weightKg: s.weightKg,
      reps: s.reps,
      setType: s.setType ?? null,
      rir: s.rir ?? null,
      rirMin: s.rirMin ?? null,
      rirMax: s.rirMax ?? null,
    })),
  };
}

function trendFor(sessions: FindingsSessionInput[]) {
  const { trends } = progressionFindings(sessions);
  expect(trends).toHaveLength(1);
  return trends[0];
}

// e1RM ≈ 116.7 flat (PLATEAU) across these weight/reps pairs, volume rising.
const PLATEAU_RISING_PAIRS: Array<[number, number]> = [
  [100, 5],
  [95, 7],
  [90, 9],
  [85, 11],
  [81, 13],
  [78, 15],
];

// e1RM ≈ 116.7 flat while volume falls (500 → 115).
const PLATEAU_FALLING_PAIRS: Array<[number, number]> = [
  [100, 5],
  [103, 4],
  [106, 3],
  [110, 2],
  [115, 1],
  [115, 1],
];

describe("recommendationsForExercise", () => {
  it("keep-going on PROGRESSING, with RIR context when logged", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, [lift(100 + i * 5, 5, { rirMin: 2, rirMax: 3 })]),
    );
    const trend = trendFor(sessions);
    const recs = recommendationsForExercise("ex1", sessions, trend);
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe("keep-going");
    expect(recs[0].stats.medianRir).toBeCloseTo(2.5);
    expect(recs[0].stats.rirCoverage).toBe(1);
  });

  it("keep-going's n is the fit n, not the RIR work-set count", () => {
    // One bad-data spike session is rejected by the MAD fit, so trend.n <
    // session count; the RIR stats still span every session.
    const sessions = [
      ...Array.from({ length: 8 }, (_, i) =>
        session(i, [lift(100 + i * 5, 5, { rirMin: 2, rirMax: 3 })]),
      ),
      session(8, [lift(500, 5, { rirMin: 2, rirMax: 3 })]),
    ];
    const trend = trendFor(sessions);
    expect(trend.n).toBe(8);
    const recs = recommendationsForExercise("ex1", sessions, trend);
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe("keep-going");
    expect(recs[0].stats.n).toBe(trend.n);
    expect(recs[0].stats.rirCoverage).toBe(1);
    expect(recs[0].stats.medianRir).toBeCloseTo(2.5);
  });

  it("PLATEAU with flat volume → change-volume", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, [lift(100), lift(100)]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    const vol = recs.find((r) => r.kind === "change-volume");
    expect(vol).toBeDefined();
    expect(vol?.stats.volumePct).toBeCloseTo(0);
  });

  it("PLATEAU with falling volume → change-volume with negative pct", () => {
    const sessions = PLATEAU_FALLING_PAIRS.map(([w, r], i) =>
      session(i, [lift(w, r)]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    const vol = recs.find((r) => r.kind === "change-volume");
    expect(vol).toBeDefined();
    expect((vol?.stats.volumePct ?? 0) < 0).toBe(true);
  });

  it("PLATEAU with rising volume → no change-volume, but rir-gap stays", () => {
    const sessions = PLATEAU_RISING_PAIRS.map(([w, r], i) =>
      session(i, [lift(w, r)]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    const vol = recs.find((r) => r.kind === "change-volume");
    expect(vol).toBeUndefined();
    // Volume rising means the volume lever is silent, but RIR was never
    // logged, so the gap nudge still fires.
    expect(recs.find((r) => r.kind === "rir-gap")).toBeDefined();
  });

  it("PLATEAU with only warmup tonnage → no change-volume", () => {
    // Warm-ups feed the trend baseline (unchanged) but not the volume lever.
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, [lift(100, 5, { setType: "warmup" })]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    expect(recs.find((r) => r.kind === "change-volume")).toBeUndefined();
  });

  it("PLATEAU with low RIR coverage → rir-gap nudge", () => {
    const sessions = [
      session(0, [lift(100, 5, { rirMin: 2, rirMax: 2 })]),
      ...Array.from({ length: 7 }, (_, i) => session(i + 1, [lift(100)])),
    ];
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    const gap = recs.find((r) => r.kind === "rir-gap");
    expect(gap).toBeDefined();
    expect(gap?.stats.rirCoverage).toBeCloseTo(1 / 8);
  });

  it("PLATEAU with adequate RIR coverage → no rir-gap", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, [lift(100, 5, { rirMin: 2, rirMax: 3 })]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    expect(recs.find((r) => r.kind === "rir-gap")).toBeUndefined();
  });

  it("REGRESSING → no recommendations (lever deferred)", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session(i, [lift(150 - i * 10)]),
    );
    const recs = recommendationsForExercise(
      "ex1",
      sessions,
      trendFor(sessions),
    );
    expect(recs).toEqual([]);
  });
});

describe("rirStatsByExercise", () => {
  it("excludes warmup sets and falls back to the legacy scalar", () => {
    const sessions = [
      session(0, [
        lift(100, 5, { setType: "warmup", rirMin: 5, rirMax: 5 }),
        lift(120, 5, { rir: 2 }),
      ]),
      session(1, [lift(120, 5, { rirMin: 1, rirMax: 3 })]),
      session(2, [lift(120, 5, { rir: 4 })]),
    ];
    const stats = rirStatsByExercise(sessions, "ex1");
    expect(stats.total).toBe(3);
    expect(stats.logged).toBe(3);
    expect(stats.coverage).toBe(1);
    // session medians 2 (scalar), 2 (range midpoint), 4 → median 2.
    expect(stats.medianRir).toBe(2);
  });

  it("treats a unilateral pair's rows as one session (same RIR at commit)", () => {
    const sessions = [0, 1, 2].map((i) =>
      session(i, [
        lift(30, 8, { rirMin: 2, rirMax: 2 }),
        lift(30, 8, { rirMin: 2, rirMax: 2 }), // the other limb
      ]),
    );
    const stats = rirStatsByExercise(sessions, "ex1");
    expect(stats.total).toBe(3);
    expect(stats.logged).toBe(3);
    expect(stats.medianRir).toBe(2);
  });

  it("reports null median below the 3-session floor", () => {
    const sessions = [
      session(0, [lift(100, 5, { rirMin: 2, rirMax: 2 })]),
      session(1, [lift(100, 5, { rirMin: 2, rirMax: 2 })]),
    ];
    const stats = rirStatsByExercise(sessions, "ex1");
    expect(stats.medianRir).toBeNull();
    expect(stats.coverage).toBe(1);
  });
});

describe("sessionVolumeByExercise", () => {
  it("sums weight×reps per session and excludes warmups", () => {
    const sessions = [
      session(0, [
        lift(100, 5, { setType: "warmup" }),
        lift(100, 5),
        lift(90, 8),
      ]),
      session(1, [lift(120, 3)]),
    ];
    const volume = sessionVolumeByExercise(sessions).get("ex1");
    expect(volume?.points.map((p) => p.kg)).toEqual([500 + 720, 360]);
  });
});
