import { Badge } from "@radix-ui/themes";
import type { ConditionFinding, TrendFinding } from "@sbl/core";
import { useMemo } from "react";
import { computeFindings } from "@/lib/findings";
import { useFindingsData, useMetrics } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function FindingsScreen() {
  const { data: sessions = [], isLoading } = useFindingsData();
  const { data: metrics = [] } = useMetrics();
  const { trends, countdowns, conditions, conditionCountdowns } = useMemo(
    () => computeFindings(sessions, metrics),
    [sessions, metrics],
  );

  const empty = !isLoading && trends.length === 0 && conditions.length === 0;
  const nothingOnTheWay =
    countdowns.length === 0 && conditionCountdowns.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Findings</h1>
      <p className="mt-1 text-xs text-soft">
        What your data says so far.{" "}
        <span className="text-faint">Correlation, not causation.</span>
      </p>

      {isLoading ? (
        <p className="mt-8 text-center text-xs text-faint">Analyzing…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {trends.length > 0 && (
            <section>
              <SectionLabel>Progression</SectionLabel>
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {trends.map((t) => (
                  <TrendRow key={t.exerciseId} trend={t} />
                ))}
              </div>
            </section>
          )}

          {conditions.length > 0 && (
            <section>
              <SectionLabel>Conditions</SectionLabel>
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {conditions.map((c) => (
                  <ConditionRow
                    key={`${c.conditionId}-${JSON.stringify(c.outcome)}`}
                    finding={c}
                  />
                ))}
              </div>
            </section>
          )}

          {!nothingOnTheWay && (
            <section>
              <SectionLabel>On the way</SectionLabel>
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {countdowns.map((c) => (
                  <div
                    key={c.exerciseId}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                    data-testid={`countdown-${c.exerciseName}`}
                  >
                    <span className="text-soft">
                      <span className="num text-ink">{c.sessionsNeeded}</span>{" "}
                      more {c.sessionsNeeded === 1 ? "session" : "sessions"} of{" "}
                      {c.exerciseName} until your first trend
                    </span>
                    <span className="num text-2xs text-faint">
                      {c.sessionsLogged}/5
                    </span>
                  </div>
                ))}
                {conditionCountdowns.map((c) => (
                  <div
                    key={c.conditionId}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                    data-testid={`condition-countdown-${c.conditionName}`}
                  >
                    <span className="text-soft">
                      <span className="num text-ink">{c.sessionsNeeded}</span>{" "}
                      more {c.sessionsNeeded === 1 ? "session" : "sessions"}{" "}
                      with {c.conditionName} logged until a correlation
                    </span>
                    <span className="num text-2xs text-faint">
                      {c.sessionsLogged}/10
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {empty && nothingOnTheWay && (
            <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
              <p className="text-sm text-soft">No findings yet.</p>
              <p className="mt-1 text-xs text-faint">
                Log sessions with conditions — trends appear after 5 sessions
                per exercise.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
      {children}
    </h2>
  );
}

const VERDICT_COLOR: Record<
  TrendFinding["verdict"],
  "green" | "gray" | "red"
> = {
  PROGRESSING: "green",
  PLATEAU: "gray",
  REGRESSING: "red",
};

function TrendRow({ trend }: { trend: TrendFinding }) {
  return (
    <div
      className="flex h-11 items-center justify-between gap-3 px-4 transition-colors md:h-8 duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
      data-testid={`trend-${trend.exerciseName}`}
    >
      <span className="truncate text-sm">{trend.exerciseName}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="num text-xs text-faint">
          {trend.pctChange > 0 ? "+" : ""}
          {trend.pctChange.toFixed(1)}% · n={trend.n}
        </span>
        <Badge color={VERDICT_COLOR[trend.verdict]} variant="soft" size="1">
          {trend.verdict}
        </Badge>
      </span>
    </div>
  );
}

function ConditionRow({ finding }: { finding: ConditionFinding }) {
  const outcome =
    finding.outcome.type === "tonnage"
      ? "Session tonnage"
      : `${finding.outcome.exerciseName} top-set e1RM`;
  const sign = finding.pctDiff > 0 ? "+" : "";
  const testId =
    finding.outcome.type === "tonnage"
      ? `condition-${finding.conditionName}-tonnage`
      : `condition-${finding.conditionName}-e1rm-${finding.outcome.exerciseName}`;
  return (
    <div className="px-4 py-2" data-testid={testId}>
      <p className="text-sm">
        {outcome}{" "}
        <span
          className={cn(
            "num font-medium",
            finding.pctDiff > 0 ? "text-pos" : "text-neg",
          )}
        >
          {sign}
          {finding.pctDiff.toFixed(1)}%
        </span>{" "}
        <span className="text-soft">on high {finding.conditionName} days</span>
      </p>
      <p className="num mt-0.5 text-2xs text-faint">
        n = {finding.n.high} high / {finding.n.low} low · {finding.confidence}{" "}
        confidence · correlation, not causation
      </p>
    </div>
  );
}
