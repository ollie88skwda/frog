import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImportFile } from "./csv-formats";
import { parseLooseDate } from "./dates";
import {
  convertDraftUnit,
  draftStats,
  draftToImportedSessions,
  findDuplicateSessions,
  isLowConfidence,
} from "./draft";
import { parseSetLine, parseWorkoutText } from "./text";

const fx = (n: string) =>
  readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const NOW = new Date(2026, 10, 14, 12).getTime();
const flat = (d: ReturnType<typeof parseWorkoutText>) =>
  d.sessions.flatMap((s) =>
    s.exercises.map((e) => ({
      name: e.rawName,
      sets: e.sets.map((x) => [x.weight, x.reps, x.setType, x.rir]),
    })),
  );

describe("file importers → ImportDraft", () => {
  it("hevy", () => {
    const r = parseImportFile(fx("hevy.csv"));
    expect(r.format).toBe("hevy-csv");
    expect(draftStats(r.draft)).toMatchObject({ sessions: 1, sets: 4 });
    const bench = r.draft.sessions[0].exercises[0];
    expect(bench.sets[0].setType).toBe("warmup");
    expect(bench.sets[1].rir).toBe(2);
  });
  it("strong", () => {
    const r = parseImportFile(fx("strong.csv"));
    expect(r.format).toBe("strong-csv");
    expect(r.draft.sessions[0].title).toBe("Pull Day");
    expect(draftStats(r.draft).sets).toBe(3);
  });
  it("fitbod (lbs column, warm-up flag, grouped by day)", () => {
    const r = parseImportFile(fx("fitbod.csv"));
    expect(r.format).toBe("fitbod-csv");
    expect(r.draft.sessions).toHaveLength(1);
    const squat = r.draft.sessions[0].exercises[0];
    expect(squat.sets.map((s) => s.setType)).toEqual([
      "warmup",
      "normal",
      "normal",
    ]);
    const out = draftToImportedSessions(r.draft, (n) => n);
    expect(out[0].exercises[0].sets[1].weightKg).toBeCloseTo(102.06, 1);
  });
  it("jefit via generic mapping (unit column wins)", () => {
    const r = parseImportFile(fx("jefit.csv"));
    expect(r.format).toBe("jefit-csv");
    expect(r.draft.unit).toBe("kg");
    expect(draftStats(r.draft)).toMatchObject({
      sessions: 1,
      sets: 3,
      exercises: 2,
    });
  });
  it("generic csv: semicolons, dmy dates, mapping", () => {
    const r = parseImportFile(fx("generic.csv"), {
      defaultUnit: "kg",
      now: NOW,
    });
    expect(r.format).toBe("generic-csv");
    expect(r.mapping).toMatchObject({
      date: 0,
      exercise: 1,
      weight: 2,
      reps: 3,
    });
    expect(r.draft.sessions).toHaveLength(2);
    // 14/11 is unambiguous, 03/11 is not → flagged low confidence
    expect(r.draft.sessions.map((s) => isLowConfidence(s.confidence))).toEqual([
      true,
      false,
    ]);
    expect(r.draft.notes.join(" ")).toMatch(/month-first/);
  });
  it("frog sets.csv round-trips", async () => {
    const { setsCsv } = await import("../export/csv");
    const t = Date.UTC(2026, 10, 1, 10);
    const csv = setsCsv({
      schemaVersion: 1,
      exportedAt: 0,
      machines: [],
      metrics: [],
      exercises: [{ id: "e1", name: "Squat" }],
      sessions: [{ id: "s1", title: "Legs", startedAt: t }],
      sessionExercises: [
        { id: "se1", sessionId: "s1", exerciseId: "e1", orderIndex: 0 },
      ],
      setLogs: [
        {
          id: "l1",
          sessionExerciseId: "se1",
          setNo: 0,
          setType: "normal",
          weightKg: 100,
          reps: 5,
          rir: 2,
        },
        {
          id: "l2",
          sessionExerciseId: "se1",
          setNo: 1,
          setType: "warmup",
          weightKg: 60,
          reps: 8,
        },
      ],
    } as never);
    const r = parseImportFile(csv);
    expect(r.format).toBe("frog-csv");
    const s = r.draft.sessions[0];
    expect(s.startedAt).toBe(t);
    expect(
      s.exercises[0].sets.map((x) => [x.weight, x.reps, x.setType, x.rir]),
    ).toEqual([
      [100, 5, "normal", 2],
      [60, 8, "warmup", null],
    ]);
  });
  it("frog json round-trips", () => {
    const json = JSON.stringify({
      sessions: [{ id: "s1", title: "Legs", startedAt: 1000, endedAt: null }],
      exercises: [{ id: "e1", name: "Squat" }],
      sessionExercises: [
        { id: "se1", sessionId: "s1", exerciseId: "e1", orderIndex: 0 },
      ],
      setLogs: [
        {
          id: "l1",
          sessionExerciseId: "se1",
          setNo: 0,
          setType: "normal",
          weightKg: 90,
          reps: 5,
        },
      ],
    });
    const r = parseImportFile(json);
    expect(r.format).toBe("frog-json");
    expect(draftStats(r.draft)).toMatchObject({ sessions: 1, sets: 1 });
  });
});

describe("paste-text parser", () => {
  const cases: [string, string, unknown[][]][] = [
    [
      "text-hevy.txt",
      "Bench Press (Barbell)",
      [
        [95, 10, "warmup", null],
        [185, 6, "normal", null],
        [185, 5, "normal", null],
      ],
    ],
    [
      "text-strong.txt",
      "Deadlift (Barbell)",
      [
        [140, 5, "normal", 2],
        [140, 5, "normal", 1],
      ],
    ],
    [
      "text-fitbod.txt",
      "Barbell Back Squat",
      [
        [135, 8, "normal", null],
        [225, 5, "normal", null],
        [225, 5, "normal", null],
      ],
    ],
    [
      "text-jefit.txt",
      "Barbell Curl",
      [
        [30, 10, "normal", null],
        [30, 9, "normal", null],
      ],
    ],
  ];
  for (const [file, ex, sets] of cases) {
    it(`reads ${file}`, () => {
      const d = parseWorkoutText(fx(file), { defaultUnit: "kg", now: NOW });
      expect(d.sessions).toHaveLength(1);
      expect(d.sessions[0].startedAt).not.toBeNull();
      expect(flat(d).find((e) => e.name === ex)?.sets).toEqual(sets);
    });
  }
  it("detects units and flips them", () => {
    const d = parseWorkoutText(fx("text-hevy.txt"), { now: NOW });
    expect(d.unit).toBe("lb");
    expect(d.unitDetected).toBe(true);
    const kg = convertDraftUnit(d, "kg");
    expect(kg.sessions[0].exercises[0].sets[1].weight).toBeCloseTo(83.9, 1);
    const out = draftToImportedSessions(d, (n) => n);
    expect(out[0].exercises[0].sets[1].weightKg).toBeCloseTo(83.91, 1);
  });
  it("title, date and time", () => {
    const d = parseWorkoutText(fx("text-strong.txt"), { now: NOW });
    expect(d.sessions[0].title).toBe("Pull Day");
    expect(d.sessions[0].startedAt).toBe(
      new Date(2026, 10, 10, 8, 0).getTime(),
    );
    expect(d.sessions[0].hasTime).toBe(true);
  });
  it("freeform notes: ambiguous date + grouped sets + missing unit are low confidence", () => {
    const d = parseWorkoutText(fx("text-notes.txt"), {
      defaultUnit: "kg",
      now: NOW,
    });
    const s = d.sessions[0];
    expect(isLowConfidence(s.confidence)).toBe(true);
    expect(s.exercises.map((e) => e.sets.length)).toEqual([2, 3]);
    expect(d.unit).toBe("kg");
    expect(d.unitDetected).toBe(true);
  });
  it("routine text becomes a routine draft, not a session", () => {
    const d = parseWorkoutText(fx("text-routine.txt"), { now: NOW });
    expect(d.sessions).toHaveLength(0);
    expect(d.routines[0].name).toBe("Upper A");
    expect(
      d.routines[0].exercises.map((e) => [e.rawName, e.sets, e.reps]),
    ).toEqual([
      ["Bench Press", 4, 6],
      ["Barbell Row", 3, 10],
      ["Lateral Raise", 3, 15],
    ]);
  });
  it("apple fitness summary → one low-confidence session with duration", () => {
    const d = parseWorkoutText(fx("text-apple.txt"), { now: NOW });
    expect(d.sessions).toHaveLength(1);
    const s = d.sessions[0];
    expect(s.title).toBe("Traditional Strength Training");
    expect(s.endedAt! - s.startedAt!).toBe(48 * 60_000 + 20_000);
    expect(isLowConfidence(s.confidence)).toBe(true);
  });
  it("OCR cleanup repairs digit/unit confusions only when asked", () => {
    const d = parseWorkoutText(fx("text-ocr-noisy.txt"), {
      now: NOW,
      ocr: true,
    });
    expect(flat(d)[0].sets.map((s) => [s.at(0), s.at(1)])).toEqual([
      [140, 5],
      [140, 5],
    ]);
  });
  it("parseSetLine shapes", () => {
    expect(parseSetLine("1  100 kg x 8")).toMatchObject({
      weight: 100,
      reps: 8,
      unit: "kg",
    });
    expect(parseSetLine("Set 2: 225 lb × 5 @ RPE 8")).toMatchObject({
      weight: 225,
      reps: 5,
      rir: 2,
    });
    expect(parseSetLine("BW x 12")).toMatchObject({ weight: null, reps: 12 });
    expect(parseSetLine("W 40 x 10")).toMatchObject({
      setType: "warmup",
      weight: 40,
    });
    expect(parseSetLine("8 x 60 kg")).toMatchObject({ weight: 60, reps: 8 });
    expect(parseSetLine("3x8 @ 80kg")).toMatchObject({
      count: 3,
      reps: 8,
      weight: 80,
    });
    expect(parseSetLine("Bench Press")).toBeNull();
    expect(parseSetLine("Wed, Nov 12, 2026")).toBeNull();
  });
  it("never invents sets from empty/garbage text", () => {
    const d = parseWorkoutText("hello\n\n???", { now: NOW });
    expect(d.sessions.flatMap((s) => s.exercises)).toHaveLength(0);
  });
});

describe("dates", () => {
  it("reads common forms", () => {
    const ms = (y: number, m: number, d: number, h = 12, mi = 0) =>
      new Date(y, m, d, h, mi).getTime();
    expect(parseLooseDate("12 Nov 2026, 16:42")?.ms).toBe(
      ms(2026, 10, 12, 16, 42),
    );
    expect(parseLooseDate("Nov 12, 2026 5:30 PM")?.ms).toBe(
      ms(2026, 10, 12, 17, 30),
    );
    expect(parseLooseDate("2026-11-12")?.hasTime).toBe(false);
    expect(parseLooseDate("14/11/2026")?.ambiguous).toBe(false);
    expect(parseLooseDate("Dec 20", { now: NOW })?.ms).toBe(ms(2025, 11, 20));
    expect(parseLooseDate("31/02/2026")).toBeNull();
    expect(parseLooseDate("Bench 100 x 5")).toBeNull();
  });
});

describe("duplicates + commit", () => {
  it("flags exact and same-day duplicates; re-import is idempotent by start", () => {
    const d = parseWorkoutText(fx("text-jefit.txt"), { now: NOW });
    const day = d.sessions[0].startedAt as number;
    expect(
      findDuplicateSessions(d.sessions, [{ startedAt: day + 3600_000 }]).get(
        d.sessions[0].id,
      ),
    ).toBe("same-day");
    const h = parseImportFile(fx("hevy.csv")).draft;
    const t = h.sessions[0].startedAt as number;
    expect(
      findDuplicateSessions(h.sessions, [{ startedAt: t }]).get(
        h.sessions[0].id,
      ),
    ).toBe("exact");
    expect(findDuplicateSessions(h.sessions, [])).toEqual(new Map());
  });
  it("two untimed sessions on one day get distinct start keys", () => {
    const d = parseWorkoutText(
      "Nov 12, 2026\nSquat\n1  100 kg x 5\nNov 12, 2026\nBench\n1  80 kg x 5",
      { now: NOW },
    );
    const out = draftToImportedSessions(d, (n) => n);
    expect(new Set(out.map((s) => s.startedAt)).size).toBe(out.length);
  });
  it("drops excluded exercises and unmatched-to-null", () => {
    const d = parseWorkoutText(fx("text-jefit.txt"), { now: NOW });
    const out = draftToImportedSessions(d, (n) =>
      n === "Cable Pushdown" ? null : n,
    );
    expect(out[0].exercises.map((e) => e.name)).toEqual(["Barbell Curl"]);
  });
});
