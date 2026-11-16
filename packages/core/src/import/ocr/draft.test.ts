import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ocrLinesToDraft } from "./draft";
import type { OcrLine } from "./types";

const LINES: Record<string, OcrLine[]> = JSON.parse(
  readFileSync(new URL("./fixtures/ocr-lines.json", import.meta.url), "utf8"),
);

describe("ocrLinesToDraft", () => {
  it("builds a reviewable draft from a Strong screenshot (lb, warm-up, date)", () => {
    const d = ocrLinesToDraft(LINES["strong-dark"], "kg");
    expect(d.unit).toBe("lb");
    expect(d.unitDetected).toBe(true);
    const s = d.sessions[0];
    expect(s.title).toBe("Leg Day");
    expect(s.startedAt).toBe(new Date(2026, 10, 6, 12).getTime());
    expect(s.hasTime).toBe(false);
    expect(s.exercises.map((e) => e.sets.length)).toEqual([4, 2, 2]);
    expect(s.exercises[0].sets[0].setType).toBe("warmup");
    expect(d.notes.join(" ")).toMatch(/screenshot/i);
  });

  it("falls back to the shared text parser when the layout is unknown", () => {
    const d = ocrLinesToDraft(
      [
        { text: "Squat", confidence: 0.9 },
        { text: "100 kg x 5", confidence: 0.9 },
      ],
      "kg",
    );
    expect(d.sessions.length + d.routines.length).toBeGreaterThan(0);
  });

  it("hands an Apple summary screen to the shared text parser (no exercises invented)", () => {
    const d = ocrLinesToDraft(LINES["apple-dark"], "kg");
    expect(d.sessions.flatMap((x) => x.exercises)).toEqual([]);
  });

  it("falls back when lettered lines yield no set rows", () => {
    const d = ocrLinesToDraft(
      [
        { text: "Push day", confidence: 0.9 },
        { text: "Bench press", confidence: 0.9 },
        { text: "100 x 5, 5, 5", confidence: 0.9 },
      ],
      "kg",
    );
    const sets = d.sessions.flatMap((x) => x.exercises.flatMap((e) => e.sets));
    expect(sets.length).toBeGreaterThan(0);
  });

  it("finds no workout in a non-workout screenshot", () => {
    const d = ocrLinesToDraft(
      [
        { text: "Messages", confidence: 0.9 },
        { text: "Hey are you coming tonight", confidence: 0.9 },
        { text: "Yes see you there", confidence: 0.9 },
      ],
      "kg",
    );
    expect(d.sessions.length + d.routines.length).toBe(0);
  });

  it("converts a minority-unit row to the draft unit", () => {
    const d = ocrLinesToDraft(
      [
        { text: "Squat", confidence: 0.9 },
        { text: "Set 1: 100 kg x 5", confidence: 0.9 },
        { text: "Set 2: 30 lb x 8", confidence: 0.9 },
        { text: "Set 3: 30 lb x 8", confidence: 0.9 },
      ],
      "kg",
    );
    expect(d.unit).toBe("lb");
    expect(d.sessions[0].exercises[0].sets.map((s) => s.weight)).toEqual([
      220.5, 30, 30,
    ]);
    expect(d.notes.join(" ")).toMatch(/converted/);
  });

  it("notes an assumed month-first date", () => {
    const d = ocrLinesToDraft(
      [
        { text: "05/11/2026", confidence: 0.9 },
        { text: "Squat", confidence: 0.9 },
        { text: "Set 1: 100 kg x 5", confidence: 0.9 },
      ],
      "kg",
    );
    expect(d.sessions[0].startedAt).toBe(new Date(2026, 4, 11, 12).getTime());
    expect(d.notes.join(" ")).toMatch(/month-first was assumed/);
  });
});
