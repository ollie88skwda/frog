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

  it("hands an Apple summary screen to the shared text parser (no sets invented)", () => {
    const d = ocrLinesToDraft(LINES["apple-dark"], "kg");
    expect(
      d.sessions.flatMap((x) => x.exercises.flatMap((e) => e.sets)),
    ).toHaveLength(0);
  });
});
