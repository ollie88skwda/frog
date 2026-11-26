import { resolveUserPrefs, type UserPrefs } from "@frog/core";
import { describe, expect, it } from "vitest";
import { planUnitSync } from "./settings";

// Units follow the account (2026-11-25). The cross-device behaviour is
// e2e/unit-account.spec.ts; this pins the one-time device → account upload.
const row = (p: Partial<UserPrefs>) =>
  ({ ...resolveUserPrefs(null), weightUnit: null, ...p }) as UserPrefs;
const local = { weightUnit: "kg", distanceUnit: null, measurementUnit: "in" };

describe("planUnitSync", () => {
  it("uploads this device's units once when the account has none", () => {
    expect(
      planUnitSync(row({ distanceUnit: null, measurementUnit: null }), local),
    ).toEqual({
      kind: "upload",
      patch: { weightUnit: "kg", measurementUnit: "in" },
    });
  });

  it("account value wins over the device cache", () => {
    expect(
      planUnitSync(
        row({ weightUnit: "lb", distanceUnit: null, measurementUnit: null }),
        local,
      ),
    ).toEqual({
      kind: "cache",
      values: { weightUnit: "lb", distanceUnit: null, measurementUnit: null },
    });
  });
});
