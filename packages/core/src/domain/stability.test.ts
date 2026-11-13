import { describe, expect, it } from "vitest";
import { compareByStability, stabilityRank } from "./stability";

describe("stability (R13: easier to load, not a growth claim)", () => {
  it("machine/cable > dumbbell > barbell > bodyweight", () => {
    expect(stabilityRank("machine")).toBeGreaterThan(stabilityRank("cable"));
    expect(stabilityRank("cable")).toBeGreaterThan(stabilityRank("dumbbell"));
    expect(stabilityRank("dumbbell")).toBeGreaterThan(stabilityRank("barbell"));
    expect(stabilityRank("barbell")).toBeGreaterThan(
      stabilityRank("bodyweight"),
    );
  });
  it("unknown equipment is the middle", () => {
    expect(stabilityRank(null)).toBe(2);
    expect(stabilityRank("zzz")).toBe(2);
  });
  it("sorts most stable first, names break ties", () => {
    const l = [
      { equipment: "barbell", name: "Squat" },
      { equipment: "machine", name: "Leg press" },
      { equipment: "dumbbell", name: "Lunge" },
      { equipment: "dumbbell", name: "Goblet" },
    ].sort(compareByStability);
    expect(l.map((x) => x.name)).toEqual([
      "Leg press",
      "Goblet",
      "Lunge",
      "Squat",
    ]);
  });
});
