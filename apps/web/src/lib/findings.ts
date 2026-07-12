import {
  type ConditionFinding,
  type CountdownFinding,
  conditionFindings,
  type FindingsSessionInput,
  type Metric,
  progressionFindings,
  type TrendFinding,
} from "@sbl/core";

export type ComputedFindings = {
  trends: TrendFinding[];
  countdowns: CountdownFinding[];
  conditions: ConditionFinding[];
};

/** Runs the pure findings engine over fetched data (milliseconds at v1 scale). */
export function computeFindings(
  sessions: FindingsSessionInput[],
  metrics: Metric[],
): ComputedFindings {
  const { trends, countdowns } = progressionFindings(sessions);
  const numericConditions = metrics
    .filter(
      (m) =>
        m.scope === "session" && (m.type === "number" || m.type === "scale"),
    )
    .map((m) => ({ id: m.id, name: m.name }));
  const conditions = conditionFindings(sessions, numericConditions);
  return {
    trends,
    countdowns: [...countdowns].sort(
      (a, b) => a.sessionsNeeded - b.sessionsNeeded,
    ),
    conditions,
  };
}
