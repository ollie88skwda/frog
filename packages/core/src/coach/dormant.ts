// Dormant rules: exported, tested stubs behind a FeatureMap. They never fire
// and never silently pass: each returns a `notEvaluated` entry with reason
// "dormant" and the fields it is waiting for (COACH-LOGIC "Activation").
// C20-C24 (pain) need a clinical wording review before ANY copy renders.

import type { CoachFeature, FeatureMap, NotEvaluated } from "./types";

export const DORMANT_RULES = [
  {
    ruleId: "C9",
    needs: ["caffeineTime"],
    note: "caffeine timing; mg-only dose display is not advice",
  },
  { ruleId: "C9c", needs: ["caffeineTime", "bedtime"], note: "late caffeine" },
  { ruleId: "C16", needs: ["proteinG"], note: "protein ~1.6 g/kg" },
  { ruleId: "C17", needs: ["goal"], note: "cut/bulk weekly rate flags" },
  {
    ruleId: "C20",
    needs: ["pain"],
    note: "red-flag screen; clinical wording review required",
  },
  { ruleId: "C21", needs: ["pain"], note: "tendon niggles" },
  { ruleId: "C22", needs: ["pain"], note: "cross-education" },
  { ruleId: "C23", needs: ["pain"], note: "low-load option" },
  { ruleId: "C24", needs: ["pain"], note: "boundary text" },
  { ruleId: "C25", needs: ["cardioTimes"], note: "cardio spacing" },
  {
    ruleId: "C26",
    needs: ["runningMode"],
    note: "running vs lower-body stalls",
  },
  { ruleId: "C2b", needs: ["repSpeed"], note: "velocity as effort gauge" },
] as const satisfies readonly {
  ruleId: string;
  needs: readonly CoachFeature[];
  note: string;
}[];

/** One `dormant` entry per rule whose fields are not enabled. A rule whose
 * fields ARE enabled still has no implementation here, so it stays dormant
 * with a distinct detail rather than passing silently. */
export function dormantNotEvaluated(features: FeatureMap = {}): NotEvaluated[] {
  return DORMANT_RULES.map((r) => {
    const missing = r.needs.filter((f) => !features[f]);
    return {
      ruleId: r.ruleId,
      reason: "dormant" as const,
      detail: missing.length
        ? `waiting for: ${missing.join(", ")} (${r.note})`
        : `fields present but rule not implemented yet (${r.note})`,
    };
  });
}
