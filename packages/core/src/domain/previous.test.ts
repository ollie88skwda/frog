import { describe, expect, it } from "vitest";
import { formatPrevious, previousCells } from "./previous";

const fmtKg = (kg: number) => String(kg);

describe("formatPrevious", () => {
  it("formats a plain (non-paired) set", () => {
    expect(formatPrevious({ weightKg: 100, reps: 8 }, fmtKg)).toBe("100 × 8");
    expect(formatPrevious({ weightKg: null, reps: 12 }, fmtKg)).toBe("12 reps");
    expect(formatPrevious({ weightKg: null, reps: null }, fmtKg)).toBeNull();
  });

  it("collapses to one string when a unilateral pair matched", () => {
    expect(
      formatPrevious(
        { weightKg: 30, reps: 10, otherSide: { weightKg: 30, reps: 10 } },
        fmtKg,
      ),
    ).toBe("30 × 10");
  });

  it("shows both sides for an uneven pair", () => {
    expect(
      formatPrevious(
        { weightKg: 30, reps: 10, otherSide: { weightKg: 28, reps: 8 } },
        fmtKg,
      ),
    ).toBe("30 × 10 / 28 × 8");
  });
});

describe("previousCells", () => {
  it("carries otherSide through per-index (uneven pair ghosts correctly)", () => {
    const cells = previousCells(
      [{ weightKg: 30, reps: 10, otherSide: { weightKg: 28, reps: 8 } }],
      [],
    );
    expect(cells[0].previous?.otherSide).toEqual({ weightKg: 28, reps: 8 });
  });
});
