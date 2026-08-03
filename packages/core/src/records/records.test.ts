import { describe, expect, it } from "vitest";
import { checkSetForPR } from "./live";
import { computeRecords } from "./records";
import type { RecordsSessionInput } from "./types";

const set = (
  weightKg: number | null,
  reps: number | null,
  setType = "normal",
) => ({
  setType,
  weightKg,
  reps,
  durationSec: null,
  distanceM: null,
  setNo: 0,
  side: null,
});

function session(
  sessionId: string,
  startedAt: number,
  sets: ReturnType<typeof set>[],
  exerciseType = "weight_reps",
): RecordsSessionInput {
  return {
    sessionId,
    startedAt,
    exercises: [{ exerciseId: "ex1", exerciseType, sets }],
  };
}

describe("computeRecords", () => {
  it("first-ever session seeds baselines without events", () => {
    const r = computeRecords([session("s1", 1, [set(100, 5)])]);
    expect(r.events).toHaveLength(0);
    const bests = r.byExercise.get("ex1")?.bests;
    expect(bests?.heaviest_weight?.value).toBe(100);
    expect(bests?.best_set_volume?.value).toBe(500);
    expect(bests?.best_session_volume?.value).toBe(500);
    expect(bests?.best_e1rm?.value).toBeGreaterThan(100);
  });

  it("later sessions fire events only on strict improvement", () => {
    const r = computeRecords([
      session("s1", 1, [set(100, 5)]),
      session("s2", 2, [set(100, 5)]), // tie — nothing
      session("s3", 3, [set(105, 5)]), // beats weight/volume/e1rm/session vol
    ]);
    expect(r.events.filter((e) => e.sessionId === "s2")).toHaveLength(0);
    const s3 = r.events.filter((e) => e.sessionId === "s3");
    expect(s3.map((e) => e.prType).sort()).toEqual([
      "best_e1rm",
      "best_session_volume",
      "best_set_volume",
      "heaviest_weight",
    ]);
    expect(s3.find((e) => e.prType === "heaviest_weight")?.previous).toBe(100);
  });

  it("warm-up sets are excluded when the toggle is off", () => {
    const history = [
      session("s1", 1, [set(60, 5)]),
      session("s2", 2, [set(120, 5, "warmup"), set(80, 5)]),
    ];
    const withWu = computeRecords(history, { includeWarmups: true });
    expect(withWu.byExercise.get("ex1")?.bests.heaviest_weight?.value).toBe(
      120,
    );
    const withoutWu = computeRecords(history, { includeWarmups: false });
    expect(withoutWu.byExercise.get("ex1")?.bests.heaviest_weight?.value).toBe(
      80,
    );
  });

  it("assisted bodyweight gets reps PRs only", () => {
    const r = computeRecords([
      session("s1", 1, [set(30, 8)], "assisted_bodyweight"),
      session("s2", 2, [set(20, 9)], "assisted_bodyweight"), // less assistance, more reps
    ]);
    const bests = r.byExercise.get("ex1")?.bests;
    expect(bests?.heaviest_weight).toBeUndefined();
    expect(bests?.best_set_reps?.value).toBe(9);
  });

  it("set records track heaviest weight per exact rep count", () => {
    const r = computeRecords([
      session("s1", 1, [set(100, 5), set(90, 8)]),
      session("s2", 2, [set(102.5, 5), set(80, 8)]),
    ]);
    const sr = r.byExercise.get("ex1")?.setRecords;
    expect(sr?.get(5)?.weightKg).toBe(102.5);
    expect(sr?.get(8)?.weightKg).toBe(90);
  });

  it("cardio type: distance, time, pace", () => {
    const cardio = (m: number, sec: number) => ({
      setType: "normal",
      weightKg: null,
      reps: null,
      durationSec: sec,
      distanceM: m,
      setNo: 0,
      side: null,
    });
    const r = computeRecords([
      {
        sessionId: "s1",
        startedAt: 1,
        exercises: [
          {
            exerciseId: "run",
            exerciseType: "distance_duration",
            sets: [cardio(5000, 1500)],
          },
        ],
      },
      {
        sessionId: "s2",
        startedAt: 2,
        exercises: [
          {
            exerciseId: "run",
            exerciseType: "distance_duration",
            sets: [cardio(4000, 1000)],
          },
        ],
      },
    ]);
    const bests = r.byExercise.get("run")?.bests;
    expect(bests?.longest_distance?.value).toBe(5000);
    expect(bests?.best_time?.value).toBe(1500);
    expect(bests?.best_pace?.value).toBe(4); // 4000/1000 m/s beats 5000/1500
    expect(r.events.some((e) => e.prType === "best_pace")).toBe(true);
  });

  it("top records: reps-only, duration, and distance types keep an all-time list", () => {
    const reps = (n: number) => ({
      setType: "normal",
      weightKg: null,
      reps: n,
      durationSec: null,
      distanceM: null,
      setNo: 0,
      side: null,
    });
    const r = computeRecords([
      session("s1", 1, [reps(8), reps(12)], "bodyweight_reps"),
      session("s2", 2, [reps(10)], "bodyweight_reps"),
    ]);
    const top = r.byExercise.get("ex1")?.topRecords;
    expect(top?.map((t) => t.value)).toEqual([12, 10, 8]);
  });

  it("top records cap at 4, keeping only the highest values", () => {
    const dur = (sec: number) => ({
      setType: "normal",
      weightKg: null,
      reps: null,
      durationSec: sec,
      distanceM: null,
      setNo: 0,
      side: null,
    });
    const r = computeRecords([
      {
        sessionId: "s1",
        startedAt: 1,
        exercises: [
          {
            exerciseId: "ex1",
            exerciseType: "duration",
            sets: [dur(60), dur(90), dur(30), dur(120), dur(45)],
          },
        ],
      },
    ]);
    const top = r.byExercise.get("ex1")?.topRecords;
    expect(top?.map((t) => t.value)).toEqual([120, 90, 60, 45]);
  });

  it("top records keep distinct values, so straight sets don't fill the list", () => {
    const dur = (sec: number) => ({
      setType: "normal",
      weightKg: null,
      reps: null,
      durationSec: sec,
      distanceM: null,
      setNo: 0,
      side: null,
    });
    const r = computeRecords([
      {
        sessionId: "s1",
        startedAt: 1,
        exercises: [
          {
            exerciseId: "ex1",
            exerciseType: "duration",
            sets: [dur(60), dur(60), dur(60), dur(50), dur(40)],
          },
        ],
      },
    ]);
    const top = r.byExercise.get("ex1")?.topRecords;
    expect(top?.map((t) => t.value)).toEqual([60, 50, 40]);
  });
});

describe("checkSetForPR", () => {
  it("fires on strict beats, silent on first-ever and ties", () => {
    const r = computeRecords([session("s1", 1, [set(100, 5)])]);
    const snap = r.byExercise.get("ex1");
    expect(checkSetForPR(undefined, "weight_reps", set(200, 5))).toEqual([]);
    expect(checkSetForPR(snap, "weight_reps", set(100, 5))).toEqual([]);
    const hits = checkSetForPR(snap, "weight_reps", set(105, 5));
    expect(hits.map((h) => h.prType)).toContain("heaviest_weight");
    expect(hits.find((h) => h.prType === "heaviest_weight")?.previous).toBe(
      100,
    );
  });
});
