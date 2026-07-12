import { describe, expect, it } from "vitest";
import { parseFitbitSleep } from "./fitbit-sleep";
import { parseCsv, parseHevyCsv, parseHevyDate } from "./hevy";

const HEADER =
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"';

describe("parseHevyDate", () => {
  it("parses Hevy's English date format as local time", () => {
    const ms = parseHevyDate("19 Jun 2026, 16:42");
    expect(ms).toBe(new Date(2026, 5, 19, 16, 42).getTime());
  });
  it("rejects garbage", () => {
    expect(parseHevyDate("not a date")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quoted fields with commas, quotes, and emoji", () => {
    const rows = parseCsv('"a, b","say ""hi""","fbeod 💔🥀"\nx,y,z');
    expect(rows[0]).toEqual(["a, b", 'say "hi"', "fbeod 💔🥀"]);
    expect(rows[1]).toEqual(["x", "y", "z"]);
  });
});

describe("parseHevyCsv", () => {
  const csv = [
    HEADER,
    '"push, day 💪","19 Jun 2026, 16:42","19 Jun 2026, 17:50","","Bench Press (Barbell)",,"",0,"normal",135,8,,,8',
    '"push, day 💪","19 Jun 2026, 16:42","19 Jun 2026, 17:50","","Bench Press (Barbell)",,"felt heavy",1,"failure",185,5,,,',
    '"push, day 💪","19 Jun 2026, 16:42","19 Jun 2026, 17:50","","Lat Pulldown (Cable)",,"",0,"failure",190,6,,,',
    // duration-only row (plank) — skipped
    '"push, day 💪","19 Jun 2026, 16:42","19 Jun 2026, 17:50","","Plank",,"",0,"normal",,,,"60",',
    // second session, earlier date — output must be chronological
    '"legs","01 May 2026, 09:05","01 May 2026, 10:00","","Squat (Barbell)",,"",0,"normal",225,5,,,',
  ].join("\n");

  it("groups sessions/exercises, converts lb→kg, maps rpe/failure→RIR", () => {
    const sessions = parseHevyCsv(csv);
    expect(sessions).toHaveLength(2);
    // chronological
    expect(sessions[0].title).toBe("legs");
    const push = sessions[1];
    expect(push.title).toBe("push, day 💪");
    expect(push.startedAt).toBe(new Date(2026, 5, 19, 16, 42).getTime());
    expect(push.endedAt).toBe(new Date(2026, 5, 19, 17, 50).getTime());
    expect(push.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Lat Pulldown (Cable)",
    ]);
    const bench = push.exercises[0].sets;
    expect(bench).toHaveLength(2);
    expect(bench[0].weightKg).toBeCloseTo(61.23, 2); // 135 lb
    expect(bench[0].reps).toBe(8);
    expect(bench[0].rir).toBe(2); // rpe 8 → 10-8
    expect(bench[1].rir).toBe(0); // failure, no rpe
    expect(bench[1].note).toBe("felt heavy");
  });

  it("supports a weight_kg column variant", () => {
    const kgCsv = [
      HEADER.replace("weight_lbs", "weight_kg"),
      '"a","19 Jun 2026, 16:42","","","Squat",,"",0,"normal",100,5,,,',
    ].join("\n");
    expect(parseHevyCsv(kgCsv)[0].exercises[0].sets[0].weightKg).toBe(100);
  });
});

describe("parseFitbitSleep", () => {
  it("prefers main sleep, converts minutes to hours, merges files", () => {
    const fileA = JSON.stringify([
      { dateOfSleep: "2026-06-19", minutesAsleep: 431, mainSleep: true },
      { dateOfSleep: "2026-06-19", minutesAsleep: 45, mainSleep: false }, // nap ignored
      { dateOfSleep: "2026-06-20", minutesAsleep: 480 },
    ]);
    const fileB = JSON.stringify([
      { dateOfSleep: "2026-06-21", minutesAsleep: 390, mainSleep: true },
    ]);
    const map = parseFitbitSleep([fileA, fileB]);
    expect(map.get("2026-06-19")).toBe(7.2);
    expect(map.get("2026-06-20")).toBe(8);
    expect(map.get("2026-06-21")).toBe(6.5);
    expect(map.size).toBe(3);
  });

  it("rejects non-array files", () => {
    expect(() => parseFitbitSleep(['{"not": "sleep"}'])).toThrow();
  });
});
