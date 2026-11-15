import { resolveUserPrefs, USER_PREF_DEFAULTS } from "@frog/core";
import { describe, expect, it } from "vitest";

// R6/R17b + boss preference 2026-11-13: warm-ups are excluded from stats
// unless a saved pref says otherwise (settings.tsx falls back to this).
describe("warm-up stats default", () => {
  it("is false with no saved row", () => {
    expect(USER_PREF_DEFAULTS.includeWarmupsInStats).toBe(false);
    expect(resolveUserPrefs(null).includeWarmupsInStats).toBe(false);
  });
});
