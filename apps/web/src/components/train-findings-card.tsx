import { FlaskConical } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { computeFindings } from "@/lib/findings";
import { useFindingsData, useMetrics } from "@/lib/queries";

/** Findings teaser on Train: the payoff is visible from day one. */
export function TrainFindingsCard() {
  const { data: sessions = [], isLoading } = useFindingsData();
  const { data: metrics = [] } = useMetrics();
  const { trends, countdowns, conditions } = useMemo(
    () => computeFindings(sessions, metrics),
    [sessions, metrics],
  );

  if (isLoading) return null;

  const top = conditions[0];
  const trend = trends[0];
  const next = countdowns[0];

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
    body = (
      <p className="text-sm text-soft" data-testid="findings-countdown">
        <span className="num text-ink">{next.sessionsNeeded}</span> more{" "}
        {next.sessionsNeeded === 1 ? "session" : "sessions"} of{" "}
        {next.exerciseName} until your first finding
      </p>
    );
  } else {
    body = (
      <p className="text-sm text-soft" data-testid="findings-countdown">
        Log <span className="num text-ink">5</span> sessions of any exercise to
        earn your first finding
      </p>
    );
  }

  return (
    <Link
      to="/findings"
      className="mt-4 block rounded-lg border border-border bg-surface p-4 transition-colors duration-100 hover:border-border-strong"
      data-testid="train-findings-card"
    >
      <div className="flex items-center gap-2 text-2xs font-medium tracking-wide text-faint uppercase">
        <FlaskConical className="size-3.5" />
        Findings
      </div>
      <div className="mt-2">{body}</div>
    </Link>
  );
}
