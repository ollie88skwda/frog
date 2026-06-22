import { describe, it, expect } from "vitest";
import { parseHevyCSV } from "./import";
import { KG_PER_LB } from "./units";

const CLASSIC_CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2024-01-15 09:00:00,Push Day A,,Bench Press (Barbell),1,135,10,0,0,,,
2024-01-15 09:00:00,Push Day A,,Bench Press (Barbell),2,135,8,0,0,,,
2024-01-15 09:00:00,Push Day A,,Overhead Press (Barbell),1,95,8,0,0,,,
2024-01-22 10:30:00,Push Day B,,Bench Press (Barbell),1,140,8,0,0,,,9`;

const NEW_FORMAT_CSV = `Title,Start Time,End Time,Description,Exercise Title,Superset ID,Exercise Notes,Set Order,Weight,Reps,Distance,Seconds,Notes,Set Type,Weight Unit,Personal Record
Push Day A,2024-01-15 09:00:00,2024-01-15 10:30:00,,Bench Press (Barbell),,,1,61.2,10,0,0,,normal,kg,false
Push Day A,2024-01-15 09:00:00,2024-01-15 10:30:00,,Bench Press (Barbell),,,2,61.2,8,0,0,,normal,kg,false`;

describe("parseHevyCSV – classic format (lbs)", () => {
  it("parses all rows", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions).toHaveLength(4);
  });

  it("produces no warnings for valid CSV", () => {
    const { warnings } = parseHevyCSV(CLASSIC_CSV);
    expect(warnings).toHaveLength(0);
  });

  it("converts lbs to kg", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[0].weightKg).toBeCloseTo(135 * KG_PER_LB, 3);
  });

  it("parses reps and setNo correctly", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[0].reps).toBe(10);
    expect(sessions[0].setNo).toBe(1);
    expect(sessions[1].reps).toBe(8);
    expect(sessions[1].setNo).toBe(2);
  });

  it("parses exercise and title", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[0].exercise).toBe("Bench Press (Barbell)");
    expect(sessions[0].title).toBe("Push Day A");
  });

  it("date is a positive timestamp in the expected year", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[0].date).toBeGreaterThan(0);
    expect(new Date(sessions[0].date).getFullYear()).toBe(2024);
  });

  it("converts RPE 9 to RIR 1", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[3].rir).toBe(1); // last row has RPE 9
  });

  it("produces null rir when RPE column is empty", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    expect(sessions[0].rir).toBeNull();
  });

  it("produces two distinct session dates", () => {
    const { sessions } = parseHevyCSV(CLASSIC_CSV);
    const dates = new Set(sessions.map((s) => new Date(s.date).toISOString().slice(0, 10)));
    expect(dates.size).toBe(2);
    expect(dates.has("2024-01-15")).toBe(true);
    expect(dates.has("2024-01-22")).toBe(true);
  });
});

describe("parseHevyCSV – new format (kg unit column)", () => {
  it("parses rows without converting weight", () => {
    const { sessions, warnings } = parseHevyCSV(NEW_FORMAT_CSV);
    expect(sessions).toHaveLength(2);
    expect(warnings).toHaveLength(0);
    expect(sessions[0].weightKg).toBeCloseTo(61.2, 3);
    expect(sessions[0].exercise).toBe("Bench Press (Barbell)");
  });
});

describe("parseHevyCSV – edge cases", () => {
  it("returns empty sessions and warning for empty string", () => {
    const { sessions, warnings } = parseHevyCSV("");
    expect(sessions).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("handles quoted fields containing commas", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2024-01-15 09:00:00,"Push, Day A",,Bench Press (Barbell),1,135,10,0,0,,,`;
    const { sessions } = parseHevyCSV(csv);
    expect(sessions[0].title).toBe("Push, Day A");
  });

  it("handles quoted fields containing escaped quotes", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2024-01-15 09:00:00,"Push ""A""",,Bench Press (Barbell),1,135,10,0,0,,,`;
    const { sessions } = parseHevyCSV(csv);
    expect(sessions[0].title).toBe('Push "A"');
  });

  it("null weightKg when weight field is empty", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2024-01-15 09:00:00,Push Day,,Bodyweight Squat,1,,15,0,0,,,`;
    const { sessions } = parseHevyCSV(csv);
    expect(sessions[0].weightKg).toBeNull();
    expect(sessions[0].reps).toBe(15);
  });

  it("clamps RPE 10 to RIR 0", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
2024-01-15 09:00:00,Push Day,,Bench Press (Barbell),1,135,8,0,0,,,10`;
    const { sessions } = parseHevyCSV(csv);
    expect(sessions[0].rir).toBe(0);
  });

  it("warns when date column is missing", () => {
    const csv = `Exercise Name,Weight (lbs),Reps\nBench Press (Barbell),135,10`;
    const { warnings } = parseHevyCSV(csv);
    expect(warnings.some((w) => w.message.includes("date"))).toBe(true);
  });

  it("skips rows with unparseable dates and adds a warning", () => {
    const csv = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight (lbs),Reps,Distance (meters),Seconds,Notes,Workout Notes,RPE
INVALID,,, Bench Press (Barbell),1,135,10,0,0,,,`;
    const { sessions, warnings } = parseHevyCSV(csv);
    expect(sessions).toHaveLength(0);
    expect(warnings.some((w) => w.message.includes("Could not parse date"))).toBe(true);
  });
});
