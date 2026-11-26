import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setsCsv } from "../export/csv";
import type { ExportBundle } from "../repo/types";
import { parseImportFile } from "./csv-formats";
import { parseLooseDate } from "./dates";
import {
  draftStats,
  draftToImportedSessions,
  findDuplicateSessions,
  isLowConfidence,
  setDraftUnit,
} from "./draft";
import { pairSetNos } from "./set-nos";
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
  it("fitbod: a workout across UTC midnight stays one session", () => {
    const csv = [
      "Date,Exercise,Reps,Weight(lbs),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier",
      "2026-11-11 23:50:00 +0000,Squat,5,225,0,0,0,0,false,,1",
      "2026-11-12 00:10:00 +0000,Squat,5,225,0,0,0,0,false,,1",
    ].join("\n");
    // 6:50–7:10 pm in New York: one evening workout.
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(parseImportFile(csv).draft.sessions).toHaveLength(1);
    } finally {
      process.env.TZ = tz;
    }
  });
  it("semicolon csv keeps comma decimals inside one field", () => {
    const r = parseImportFile(
      "Day;Lift;Load;Repetitions;Comment\n14/11/2026;Squat;62,5;8;ok, felt good",
      { defaultUnit: "kg", now: NOW },
    );
    const set = r.draft.sessions[0].exercises[0].sets[0];
    expect([set.weight, set.reps, set.note]).toEqual([
      62.5,
      8,
      "ok, felt good",
    ]);
  });
  it("frog export round-trip keeps an L/R pair as one unilateral set", () => {
    const t = Date.UTC(2026, 10, 12, 17, 0);
    const row = { createdAt: t, updatedAt: t, deletedAt: null };
    const log = (id: string, setNo: number, side: "left" | "right" | null) => ({
      ...row,
      id,
      sessionExerciseId: "se1",
      setNo,
      side,
      setType: "normal",
      weightKg: 20,
      reps: 10,
      durationSec: null,
      distanceM: null,
      rir: null,
      rirMin: 1,
      rirMax: 2,
      rpe: 8.5,
      note: null,
    });
    const bundle = {
      schemaVersion: 3,
      exportedAt: t,
      exercises: [{ ...row, id: "ex1", name: "DB Row" }],
      machines: [],
      metrics: [],
      sessions: [
        { ...row, id: "s1", title: "Pull", startedAt: t, endedAt: null },
      ],
      sessionExercises: [
        {
          ...row,
          id: "se1",
          sessionId: "s1",
          exerciseId: "ex1",
          orderIndex: 0,
        },
      ],
      setLogs: [
        log("a", 0, "left"),
        log("b", 0, "right"),
        log("c", 1, "left"),
        log("d", 1, "right"),
      ],
    } as unknown as ExportBundle;
    for (const text of [setsCsv(bundle), JSON.stringify(bundle)]) {
      const r = parseImportFile(text);
      // 2 unilateral sets = 4 rows on 2 set_nos (AGENTS.md: L/R share set_no)
      expect(draftStats(r.draft).sets).toBe(2);
      const out = draftToImportedSessions(r.draft, (n) => n);
      expect(out[0].exercises[0].sets.map((x) => x.side)).toEqual([
        "left",
        "right",
        "left",
        "right",
      ]);
      expect(pairSetNos(out[0].exercises[0].sets)).toEqual([0, 0, 1, 1]);
      // RIR is logged as a range (rir null, rirMin/rirMax set): keep it.
      expect(out[0].exercises[0].sets[0]).toMatchObject({
        rir: 1,
        rirMin: 1,
        rirMax: 2,
        rpe: 8.5,
      });
    }
    // Set 0's left row deleted: R0 stays its own set, not paired with L1.
    const orphan = {
      ...bundle,
      setLogs: bundle.setLogs.map((l) =>
        l.id === "a" ? { ...l, deletedAt: t } : l,
      ),
    };
    const out = draftToImportedSessions(
      parseImportFile(JSON.stringify(orphan)).draft,
      (n) => n,
    );
    expect(pairSetNos(out[0].exercises[0].sets)).toEqual([0, 1, 1]);
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
  it("detects units", () => {
    const d = parseWorkoutText(fx("text-hevy.txt"), { now: NOW });
    expect(d.unit).toBe("lb");
    expect(d.unitDetected).toBe(true);
    const out = draftToImportedSessions(d, (n) => n);
    // 185 lb × 0.45359237 kg/lb (international avoirdupois pound)
    expect(out[0].exercises[0].sets[1].weightKg).toBeCloseTo(83.91, 2);
  });
  it("L/R rows pair onto shared set numbers on insert", () => {
    const L = { side: "left" };
    const R = { side: "right" };
    const B = { side: null };
    expect(pairSetNos([L, R, L, R])).toEqual([0, 0, 1, 1]);
    expect(pairSetNos([B, L, R, B])).toEqual([0, 1, 1, 2]);
    expect(pairSetNos([L, L, R])).toEqual([0, 1, 1]);
    // Exported set numbers win: an orphan R0 never pairs with L1.
    expect(
      pairSetNos([
        { side: "right", setNo: 0 },
        { side: "left", setNo: 1 },
        { side: "right", setNo: 1 },
      ]),
    ).toEqual([0, 1, 1]);
  });
  it("unit toggle relabels a wrong guess instead of converting", () => {
    const d = parseWorkoutText("Nov 12, 2026\nBench\n1 225 x 5", {
      defaultUnit: "kg",
      now: NOW,
    });
    expect(d.unitDetected).toBe(false);
    const lb = setDraftUnit(d, "lb");
    expect(lb.unitDetected).toBe(false);
    expect(lb.sessions[0].exercises[0].sets[0].weight).toBe(225);
    const out = draftToImportedSessions(lb, (n) => n);
    // 225 lb × 0.45359237 = 102.058 kg
    expect(out[0].exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 2);
  });
  it("an indexed row with a small bare weight is one low-confidence set", () => {
    const d = parseWorkoutText(
      "Nov 12, 2026\nLateral Raise\n1 10 x 12\n2 10 x 12",
      { now: NOW },
    );
    const sets = d.sessions[0].exercises[0].sets;
    expect(sets.map((x) => [x.weight, x.reps])).toEqual([
      [10, 12],
      [10, 12],
    ]);
    expect(sets.every((x) => isLowConfidence(x.confidence))).toBe(true);
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
  it("spelled-out grouped sets parse", () => {
    expect(parseSetLine("4 sets x 6 reps @ 80kg")).toMatchObject({
      count: 4,
      reps: 6,
      weight: 80,
      unit: "kg",
    });
    const d = parseWorkoutText(
      "Push\nBench\n4 sets x 6 reps @ 80kg\nSquat 3 sets x 5 reps",
      {
        now: NOW,
      },
    );
    expect(
      d.routines[0].exercises.map((e) => [e.rawName, e.sets, e.reps]),
    ).toEqual([
      ["Bench", 4, 6],
      ["Squat", 3, 5],
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
  it("month-prefixed exercise names are not dates", () => {
    const d = parseWorkoutText(
      "Nov 12, 2026\nDecline 3 x 10\nMarching Lunge 3 x 12\nBench\n1 100 kg x 5",
      { now: NOW },
    );
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].startedAt).toBe(new Date(2026, 10, 12, 12).getTime());
    expect(d.sessions[0].exercises.map((e) => e.rawName)).toEqual([
      "Decline",
      "Marching Lunge",
      "Bench",
    ]);
    expect(parseLooseDate("3 Decline Push Ups")).toBeNull();
    expect(parseLooseDate("November 12, 2026")?.ms).toBe(
      new Date(2026, 10, 12, 12).getTime(),
    );
  });
  it("an unplaced lettered line is reported, not dropped", () => {
    const d = parseWorkoutText(
      "Nov 12, 2026\nBench\n1 100 kg x 5\nfelt strong\nSquat\n1 120 kg x 5",
      { now: NOW },
    );
    expect(d.unparsed).toContain("felt strong");
    expect(d.sessions[0].exercises.map((e) => e.rawName)).toEqual([
      "Bench",
      "Squat",
    ]);
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

describe("imported sessions are always finished", () => {
  // A null endedAt makes sessions:active treat the import as a live workout
  // (Resume pill, 129-hour clock). Every format must land finished.
  const drafts = [
    ...["hevy.csv", "strong.csv", "fitbod.csv", "jefit.csv", "generic.csv"].map(
      (f) => [f, parseImportFile(fx(f)).draft] as const,
    ),
    [
      "pasted text (no Duration line)",
      parseWorkoutText(
        "Push day\nNov 20, 2026\nBench Press\n1  60 kg x 8\n2  60 kg x 7\nOverhead Press\n1  40 kg x 6",
        { now: NOW },
      ),
    ] as const,
    ...[
      "text-apple.txt",
      "text-hevy.txt",
      "text-strong.txt",
      "text-notes.txt",
    ].map((f) => [f, parseWorkoutText(fx(f), { now: NOW })] as const),
  ];
  it.each(drafts)("%s", (_name, draft) => {
    const dated = {
      ...draft,
      sessions: draft.sessions.map((s) => ({
        ...s,
        startedAt: s.startedAt ?? NOW,
      })),
    };
    const out = draftToImportedSessions(dated, (n) => n);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.endedAt).not.toBeNull();
      expect(s.endedAt!).toBeGreaterThanOrEqual(s.startedAt);
    }
  });
});
