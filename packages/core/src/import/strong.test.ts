import { describe, expect, it } from "vitest";
import { parseStrongCsv, parseStrongDate, parseStrongDuration } from "./strong";

const CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes
2026-01-14 09:30:00,Push Day,1h 10m,Bench Press (Barbell),W,60,kg,8,,,,,warm,
2026-01-14 09:30:00,Push Day,1h 10m,Bench Press (Barbell),1,100,kg,5,8,,,,"felt good",
2026-01-14 09:30:00,Push Day,1h 10m,Bench Press (Barbell),2,100,kg,5,9,,,,,
2026-01-14 09:30:00,Push Day,1h 10m,Running,1,,,,,5,km,1500,,
2026-01-16 18:00:00,Pull Day,45m,Deadlift (Barbell),1,315,lbs,3,,,,,,
`;

describe("parseStrongCsv", () => {
  it("groups by session, converts units, maps warm-ups + RPE", () => {
    const sessions = parseStrongCsv(CSV);
    expect(sessions).toHaveLength(2);

    const push = sessions[0];
    expect(push.title).toBe("Push Day");
    expect(push.startedAt).toBe(new Date(2026, 0, 14, 9, 30).getTime());
    expect(push.endedAt).toBe(push.startedAt + 70 * 60 * 1000);
    expect(push.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Running",
    ]);

    const bench = push.exercises[0].sets;
    expect(bench).toHaveLength(3);
    expect(bench[0].setType).toBe("warmup");
    expect(bench[0].weightKg).toBe(60);
    expect(bench[1]).toMatchObject({
      weightKg: 100,
      reps: 5,
      note: "felt good",
    });
    expect(bench[1].rir).toBe(2); // RPE 8 → RIR 2

    const run = push.exercises[1].sets[0];
    expect(run.distanceM).toBe(5000);
    expect(run.durationSec).toBe(1500);
    expect(run.weightKg).toBeNull();

    const pull = sessions[1];
    expect(pull.exercises[0].sets[0].weightKg).toBeCloseTo(142.88, 1); // 315 lb
  });

  it("handles semicolon exports and rejects non-Strong files", () => {
    const semi = CSV.replaceAll(",", ";");
    expect(parseStrongCsv(semi)).toHaveLength(2);
    expect(parseStrongCsv("a,b,c\n1,2,3\n")).toEqual([]);
    expect(parseStrongCsv("")).toEqual([]);
  });
});

describe("parsers", () => {
  it("dates and durations", () => {
    expect(parseStrongDate("2026-01-14 09:30:00")).toBe(
      new Date(2026, 0, 14, 9, 30).getTime(),
    );
    expect(parseStrongDate("garbage")).toBeNull();
    expect(parseStrongDuration("1h 30m")).toBe(90 * 60 * 1000);
    expect(parseStrongDuration("45m")).toBe(45 * 60 * 1000);
    expect(parseStrongDuration("")).toBeNull();
  });
});
