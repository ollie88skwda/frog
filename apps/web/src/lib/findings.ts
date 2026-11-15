import {
  type ConditionCountdown,
  type ConditionFinding,
  type CountdownFinding,
  conditionCountdowns,
  conditionFindings,
  type FindingsSessionInput,
  type Metric,
  type NotEstimableFinding,
  progressionFindings,
  type Recommendation,
  recommendationsForExercise,
  type TrendFinding,
} from "@frog/core";

export type ComputedFindings = {
  trends: TrendFinding[];
  countdowns: CountdownFinding[];
  /** Lifts logged only above 10 total reps: kept visible, no estimate (C2c-e1rm). */
  notEstimable: NotEstimableFinding[];
  conditions: ConditionFinding[];
  conditionCountdowns: ConditionCountdown[];
  /** Recommendations per trend-bearing exercise (note 12). */
  recommendations: Record<string, Recommendation[]>;
};

/** Runs the pure findings engine over fetched data (milliseconds at v1 scale). */
export function computeFindings(
  sessions: FindingsSessionInput[],
  metrics: Metric[],
): ComputedFindings {
  const { trends, countdowns, notEstimable } = progressionFindings(sessions);
  const numericConditions = metrics
    .filter(
      (m) =>
        m.scope === "session" && (m.type === "number" || m.type === "scale"),
    )
    .map((m) => ({ id: m.id, name: m.name }));
  const conditions = conditionFindings(sessions, numericConditions);
  // Only nudge on metrics with no correlation yet (a finding already covers it).
  const covered = new Set(conditions.map((c) => c.conditionId));
  const recommendations: Record<string, Recommendation[]> = {};
  for (const trend of trends) {
    recommendations[trend.exerciseId] = recommendationsForExercise(
      trend.exerciseId,
      sessions,
      trend,
    );
  }
  return {
    trends,
    countdowns: [...countdowns].sort(
      (a, b) => a.sessionsNeeded - b.sessionsNeeded,
    ),
    notEstimable,
    conditions,
    conditionCountdowns: conditionCountdowns(
      sessions,
      numericConditions,
    ).filter((c) => !covered.has(c.conditionId)),
    recommendations,
  };
}
