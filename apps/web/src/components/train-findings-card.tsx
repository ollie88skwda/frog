import { FlaskConical } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { computeFindings } from "@/lib/findings";
import { useFindingsData, useMetrics } from "@/lib/queries";
import { useVoice } from "@/lib/voice";

/** Findings teaser on Train: the payoff is visible from day one. */
export function TrainFindingsCard() {
  const { t } = useVoice();
  const { data: sessions = [], isLoading } = useFindingsData();
  const { data: metrics = [] } = useMetrics();
  const { trends, countdowns, conditions, conditionCountdowns } = useMemo(
    () => computeFindings(sessions, metrics),
    [sessions, metrics],
  );

  if (isLoading) return null;

  const top = conditions[0];
  const trend = trends[0];
  const next = countdowns[0];
  const nextCond = conditionCountdowns[0];

  let body: React.ReactNode;
  if (top) {
    const outcome =
      top.outcome.type === "tonnage"
        ? "Session tonnage"
        : `${top.outcome.exerciseName} e1RM`;
    body = (
      <p className="text-sm text-soft">
        {outcome}{" "}
        <span className="num text-ink">
          {top.pctDiff > 0 ? "+" : ""}
          {top.pctDiff.toFixed(1)}%
        </span>{" "}
        on high {top.conditionName} days
      </p>
    );
  } else if (trend) {
    body = (
      <p className="text-sm text-soft">
        {trend.exerciseName} is{" "}
        <span className="num text-ink">{trend.verdict.toLowerCase()}</span> (
        {trend.pctChange > 0 ? "+" : ""}
        {trend.pctChange.toFixed(1)}%)
      </p>
    );
  } else if (next) {
    const word = next.sessionsNeeded === 1 ? "session" : "sessions";
    body = (
      <p className="text-sm text-soft" data-testid="findings-countdown">
        <span className="num text-ink">{next.sessionsNeeded}</span>{" "}
        {t(
          `more ${word} of ${next.exerciseName} until your first finding`,
          `more ${word} of ${next.exerciseName} before the frog will comment.`,
        )}
      </p>
    );
  } else if (nextCond) {
    const word = nextCond.sessionsNeeded === 1 ? "session" : "sessions";
    body = (
      <p className="text-sm text-soft" data-testid="findings-countdown">
        <span className="num text-ink">{nextCond.sessionsNeeded}</span>{" "}
        {t(
          `more ${word} with ${nextCond.conditionName} logged until a correlation`,
          `more ${word} with ${nextCond.conditionName} logged. Then the frog looks for a correlation.`,
        )}
      </p>
    );
  } else {
    body = (
      <p className="text-sm text-soft" data-testid="findings-countdown">
        {t("Log", "The frog refuses to speculate. Log")}{" "}
        <span className="num text-ink">5</span>{" "}
        {t(
          "sessions of any exercise to earn your first finding",
          "sessions of any exercise and it will reconsider.",
        )}
      </p>
    );
  }

  return (
    <Link
      to="/findings"
      className="mt-4 block rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-(--ease-out-quad) hover:border-border-strong"
      data-testid="train-findings-card"
    >
      <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
        <FlaskConical className="size-4" />
        Findings
      </div>
      <div className="mt-2">{body}</div>
    </Link>
  );
}
