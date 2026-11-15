import { describe, expect, it } from "vitest";
import { sessionConditionsLine } from "./conditions";

// The share card's lab-report conditions strip and the in-session chip share
// this formatter — these cases pin the display line both surfaces paint.
const SLEEP = "00000000-0000-4000-8000-0000000000a1";
const BODYWEIGHT = "00000000-0000-4000-8000-0000000000a2";
const STRESS = "00000000-0000-4000-8000-0000000000a5";

const metrics = [
  { id: SLEEP, name: "Sleep (h)", type: "number", unit: null },
  { id: BODYWEIGHT, name: "Bodyweight", type: "number", unit: "kg" },
  { id: STRESS, name: "Stress (1–10)", type: "scale", unit: null },
] as const;

describe("sessionConditionsLine", () => {
  it("formats seeded conditions with their compact labels", () => {
    expect(
      sessionConditionsLine(
        { [SLEEP]: 7.5, [BODYWEIGHT]: 82, [STRESS]: 3 },
        metrics as never,
      ),
    ).toBe("7.5h · 82kg · stress 3");
  });

  it("skips metrics with no recorded value", () => {
    expect(sessionConditionsLine({ [SLEEP]: 7.5 }, metrics as never)).toBe(
      "7.5h",
    );
  });

  it("falls back to unit-suffixed values for typed metrics", () => {
    expect(sessionConditionsLine({ [BODYWEIGHT]: 82 }, metrics as never)).toBe(
      "82kg",
    );
  });

  it("returns null when nothing was recorded — the card paints no strip", () => {
    expect(sessionConditionsLine({}, metrics as never)).toBeNull();
    expect(sessionConditionsLine({ [SLEEP]: "" }, metrics as never)).toBeNull();
  });

  it("formats checkbox and text metrics without a unit", () => {
    const cb = { id: "cb-1", name: "Ate before", type: "checkbox", unit: null };
    const note = { id: "t-1", name: "Note", type: "text", unit: null };
    expect(
      sessionConditionsLine({ [SLEEP]: 8, "cb-1": true, "t-1": "legs heavy" }, [
        { id: SLEEP, name: "Sleep (h)", type: "number", unit: null },
        cb,
        note,
      ] as never),
    ).toBe("8h · Ate before · Note legs heavy");
  });
});
