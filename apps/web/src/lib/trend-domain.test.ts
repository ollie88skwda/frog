import { describe, expect, test } from "vitest";
import { trendYDomain } from "./trend-domain";

describe("trendYDomain", () => {
  test("pads 8% around a non-flat band", () => {
    const [min, max] = trendYDomain([
      { x: 1, y: 100 },
      { x: 2, y: 120 },
    ]);
    expect(min).toBeCloseTo(98.4);
    expect(max).toBeCloseTo(121.6);
  });

  test("flat series gets ±1", () => {
    expect(
      trendYDomain([
        { x: 1, y: 75 },
        { x: 2, y: 75 },
      ]),
    ).toEqual([74, 76]);
  });

  test("single point is flat", () => {
    expect(trendYDomain([{ x: 1, y: 42 }])).toEqual([41, 43]);
  });
});
