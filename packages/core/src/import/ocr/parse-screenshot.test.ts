import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "../../../../../scripts/ocr/fixtures";
import { isLowConfidence } from "../draft";
import { scoreParse } from "./accuracy";
import {
  parseDate,
  parseDurationMin,
  parseScreenshotLines,
} from "./parse-screenshot";
import type { OcrLine } from "./types";

// ocr-lines.json is real tesseract output over the committed fixture PNGs
// (regenerate: bun scripts/ocr/run-ocr.ts), so these tests cover genuine OCR noise.
const LINES: Record<string, OcrLine[]> = JSON.parse(
  readFileSync(new URL("./fixtures/ocr-lines.json", import.meta.url), "utf8"),
);

describe("parseScreenshotLines on OCR'd synthetic fixtures", () => {
  for (const f of FIXTURES.filter((x) => x.truth.exercises.length > 0)) {
    it(`${f.id} matches ground truth`, () => {
      const parse = parseScreenshotLines(LINES[f.id]);
      const s = scoreParse(parse, f.truth);
      expect(s.names.ok).toBe(s.names.total);
      expect(s.sets.ok).toBe(s.sets.total);
      expect(s.reps.ok).toBe(s.reps.total);
      expect(s.load.ok).toBe(s.load.total);
      expect(parse.unit).toBe(f.truth.unit);
      expect(parse.session.date).toBe(f.truth.date);
      expect(parse.session.durationMin).toBe(f.truth.durationMin);
    });
  }

  it("marks the warm-up set", () => {
    const p = parseScreenshotLines(LINES["hevy-light"]);
    expect(p.session.exercises[0].sets[0].warmup).toBe(true);
    expect(p.session.exercises[0].sets[1].warmup).toBe(false);
  });

  it("returns no exercises for an Apple summary screen", () => {
    const p = parseScreenshotLines(LINES["apple-dark"]);
    expect(p.app).toBe("apple");
    expect(p.session.date).toBe("2026-11-11");
    expect(p.session.durationMin).toBe(46);
    expect(p.session.exercises).toEqual([]);
  });
});

describe("OCR noise handling", () => {
  const L = (...t: string[]): OcrLine[] =>
    t.map((text) => ({ text, confidence: 0.9 }));

  it("repairs Ib/O/l glyph confusions and docks their confidence", () => {
    const p = parseScreenshotLines(
      L("Squat", "Set 1: l0O Ib x 5", "Set 2: 100 lb x 5"),
    );
    const [a, b] = p.session.exercises[0].sets;
    expect(a).toMatchObject({ weight: 100, reps: 5, unit: "lb" });
    expect(a.confidence).toBeLessThan(b.confidence);
  });

  it("flags implausible numbers as low confidence", () => {
    const p = parseScreenshotLines(L("Curl", "Set 1: 9000 kg x 8"));
    expect(isLowConfidence(p.session.exercises[0].sets[0].confidence)).toBe(
      true,
    );
  });

  it("scales by engine confidence", () => {
    const p = parseScreenshotLines([
      { text: "Curl", confidence: 0.9 },
      { text: "Set 1: 20 kg x 8", confidence: 0.4 },
    ]);
    expect(isLowConfidence(p.session.exercises[0].sets[0].confidence)).toBe(
      true,
    );
  });

  it("keeps an unreadable-sets exercise visible with low confidence", () => {
    const p = parseScreenshotLines(L("Leg Press", "#%@ ~~"));
    expect(p.session.exercises[0].sets).toHaveLength(0);
    expect(isLowConfidence(p.session.exercises[0].nameConfidence)).toBe(true);
  });

  it("reads RPE as RIR", () => {
    const p = parseScreenshotLines(L("Bench Press", "1 100 kg x 5 @ 9"));
    expect(p.session.exercises[0].sets[0].rir).toBe(1);
  });

  it("expands NxM summaries", () => {
    const p = parseScreenshotLines(
      L("Dips 3x10", "Row 4 sets x 8 reps @ 70 kg"),
    );
    expect(p.session.exercises.map((e) => e.sets.length)).toEqual([3, 4]);
  });

  it("empty input parses to nothing", () => {
    expect(parseScreenshotLines([]).session.exercises).toEqual([]);
  });
});

describe("helpers", () => {
  it("parses dates", () => {
    const sure = (date: string) => ({ date, ambiguous: false });
    expect(parseDate("Nov 3, 2026")).toEqual(sure("2026-11-03"));
    expect(parseDate("3 November 2026")).toEqual(sure("2026-11-03"));
    expect(parseDate("2026-11-03")).toEqual(sure("2026-11-03"));
    expect(parseDate("13/11/2026")).toEqual(sure("2026-11-13"));
    expect(parseDate("05/11/2026")).toEqual({
      date: "2026-05-11",
      ambiguous: true,
    });
    expect(parseDate("hello")).toBeNull();
  });
  it("parses durations", () => {
    expect(parseDurationMin("1h 12m")).toBe(72);
    expect(parseDurationMin("58min")).toBe(58);
    expect(parseDurationMin("Workout Time 0:46:08")).toBe(46);
  });
});
