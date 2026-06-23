import { describe, it, expect } from "vitest";
import { buildExportRows, toCSV, toJSON, type ExportSession } from "./export";

const BASE_DATE = Date.UTC(2023, 10, 14); // 2023-11-14T00:00:00.000Z
const NEXT_DATE = Date.UTC(2023, 10, 15); // 2023-11-15T00:00:00.000Z

const sessions: ExportSession[] = [
  { date: BASE_DATE, title: "Push A", exercise: "Bench Press", setNo: 0, weightKg: 100, reps: 5, rir: 2 },
  { date: BASE_DATE, title: "Push A", exercise: "Bench Press", setNo: 1, weightKg: 100, reps: 4, rir: 1 },
  { date: NEXT_DATE, title: null, exercise: "Squat", setNo: 0, weightKg: 120, reps: 3, rir: null },
];

describe("buildExportRows", () => {
  it("formats date as YYYY-MM-DD", () => {
    const rows = buildExportRows(sessions);
    expect(rows[0].date).toBe("2023-11-14");
    expect(rows[2].date).toBe("2023-11-15");
  });

  it("converts null title to empty string", () => {
    const rows = buildExportRows(sessions);
    expect(rows[2].sessionTitle).toBe("");
  });

  it("converts weightKg to weightLb", () => {
    const rows = buildExportRows(sessions);
    // 100 kg * (1/0.45359237) ≈ 220.46 → rounded to 1 decimal = 220.5
    expect(rows[0].weightLb).toBeCloseTo(220.5, 0);
    // 120 kg ≈ 264.6 lb
    expect(rows[2].weightLb).toBeCloseTo(264.6, 0);
  });

  it("computes Epley e1rm", () => {
    const rows = buildExportRows(sessions);
    // 100kg × (1 + 5/30) = 116.67 → rounded to 1 decimal
    expect(rows[0].e1rm).toBeCloseTo(116.7, 1);
  });

  it("handles null weightKg gracefully", () => {
    const s: ExportSession[] = [
      { date: BASE_DATE, title: null, exercise: "Stretch", setNo: 0, weightKg: null, reps: null, rir: null },
    ];
    const rows = buildExportRows(s);
    expect(rows[0].weightKg).toBeNull();
    expect(rows[0].weightLb).toBeNull();
    expect(rows[0].e1rm).toBeNull();
  });

  it("handles null reps with non-null weight (no e1rm but has weightLb)", () => {
    const s: ExportSession[] = [
      { date: BASE_DATE, title: null, exercise: "Deadlift", setNo: 0, weightKg: 200, reps: null, rir: null },
    ];
    const rows = buildExportRows(s);
    expect(rows[0].weightLb).not.toBeNull();
    expect(rows[0].e1rm).toBeNull();
  });
});

describe("toCSV", () => {
  it("produces a header line and one data line per row", () => {
    const csv = toCSV(buildExportRows(sessions));
    const lines = csv.split("\n");
    expect(lines[0]).toContain("date");
    expect(lines[0]).toContain("weightKg");
    expect(lines[0]).toContain("e1rm");
    expect(lines).toHaveLength(4); // header + 3 data rows
  });

  it("escapes commas in session titles", () => {
    const s: ExportSession[] = [
      {
        date: BASE_DATE,
        title: "Push, Pull, Legs",
        exercise: "Bench Press",
        setNo: 0,
        weightKg: 100,
        reps: 5,
        rir: null,
      },
    ];
    const csv = toCSV(buildExportRows(s));
    expect(csv).toContain('"Push, Pull, Legs"');
  });

  it("renders nulls as empty fields (not the string 'null')", () => {
    const s: ExportSession[] = [
      { date: BASE_DATE, title: null, exercise: "X", setNo: 0, weightKg: null, reps: null, rir: null },
    ];
    const csv = toCSV(buildExportRows(s));
    expect(csv).not.toContain("null");
  });
});

describe("toJSON", () => {
  it("produces valid JSON with correct structure", () => {
    const json = toJSON(buildExportRows(sessions));
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toHaveProperty("date");
    expect(parsed[0]).toHaveProperty("weightLb");
  });
});

describe("condition columns in export", () => {
  it("buildExportRows merges conditionValues and setMetricValues into 'conditions'", () => {
    const s: ExportSession[] = [
      {
        date: BASE_DATE,
        title: "Push",
        exercise: "Bench",
        setNo: 0,
        weightKg: 100,
        reps: 5,
        rir: null,
        conditionValues: { sleep: 8, stress: 2 },
        setMetricValues: { rir_override: 1 },
      },
    ];
    const rows = buildExportRows(s);
    expect(rows[0].conditions).toEqual({ sleep: 8, stress: 2, rir_override: 1 });
  });

  it("toCSV adds condition keys as extra columns (alpha sorted)", () => {
    const s: ExportSession[] = [
      {
        date: BASE_DATE, title: null, exercise: "Squat", setNo: 0,
        weightKg: 120, reps: 5, rir: null,
        conditionValues: { stress: 3, sleep: 7 },
      },
    ];
    const csv = toCSV(buildExportRows(s));
    const header = csv.split("\n")[0];
    // Should appear in alpha order after fixed columns
    const cols = header.split(",");
    const sleepIdx  = cols.indexOf("sleep");
    const stressIdx = cols.indexOf("stress");
    expect(sleepIdx).toBeGreaterThan(0);
    expect(stressIdx).toBeGreaterThan(sleepIdx); // alpha: sleep < stress
  });

  it("toCSV with no conditions matches the original fixed-column header", () => {
    const csv = toCSV(buildExportRows(sessions));
    const header = csv.split("\n")[0];
    expect(header).toBe("date,sessionTitle,exercise,setNo,weightKg,weightLb,reps,rir,e1rm");
  });

  it("rows missing a condition key get an empty field", () => {
    const s: ExportSession[] = [
      { date: BASE_DATE, title: null, exercise: "A", setNo: 0, weightKg: 100, reps: 5, rir: null, conditionValues: { sleep: 8 } },
      { date: BASE_DATE, title: null, exercise: "B", setNo: 0, weightKg: 100, reps: 5, rir: null }, // no conditions
    ];
    const csv = toCSV(buildExportRows(s));
    const lines = csv.split("\n");
    // Row 2 (exercise B) should have an empty sleep field
    const row2 = lines[2];
    expect(row2.endsWith(",")).toBe(true); // trailing comma = empty last field
  });
});
