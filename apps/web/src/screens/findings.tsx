import type {
  ConditionFinding,
  FindingsSessionInput,
  Recommendation,
  TrendFinding,
} from "@frog/core";
import {
  formatVolume,
  formatVolumeNumber,
  formatWeight,
  rirStatsByExercise,
  sessionTopsByExercise,
  sessionVolumeByExercise,
  toDisplayWeight,
} from "@frog/core";
import { Badge } from "@radix-ui/themes";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CartesianGrid,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { rowClass } from "@/components/ui/row";
import { computeFindings } from "@/lib/findings";
import { formatDate } from "@/lib/format";
import { useFindingsData, useMetrics } from "@/lib/queries";
import { useUnit } from "@/lib/settings";
import { trendYDomain } from "@/lib/trend-domain";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

const DAY_MS = 86_400_000;

// Trend-sheet line charts — one accent series; value/date formatting comes
// from the callers' formatY/formatDate.
const TREND_CONFIG = {
  y: { label: "Value", color: "var(--accent)" },
} satisfies ChartConfig;

export default function FindingsScreen() {
  const { t } = useVoice();
  const { data: sessions = [], isLoading } = useFindingsData();
  const { data: metrics = [] } = useMetrics();
  const {
    trends,
    countdowns,
    conditions,
    conditionCountdowns,
    recommendations,
  } = useMemo(() => computeFindings(sessions, metrics), [sessions, metrics]);
  const [openTrend, setOpenTrend] = useState<TrendFinding | null>(null);
  const [openCondition, setOpenCondition] = useState<ConditionFinding | null>(
    null,
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
        <p className="mt-8 text-center text-xs text-faint">
          {t("Analyzing…", "The frog is thinking…")}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {trends.length > 0 && (
            <section>
              <SectionLabel>Progression</SectionLabel>
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {trends.map((trend) => (
                  <TrendRow
                    key={trend.exerciseId}
                    trend={trend}
                    onOpen={() => setOpenTrend(trend)}
                  />
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
                    onOpen={() => setOpenCondition(c)}
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
                      {c.exerciseName}{" "}
                      {t(
                        "until your first trend",
                        "before the frog will commit to a trend",
                      )}
                    </span>
                    <span className="num text-2xs text-faint">
                      {c.sessionsLogged}/2
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
                      with {c.conditionName} logged{" "}
                      {t(
                        "until a correlation",
                        "before the frog will commit to a correlation",
                      )}
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
              <p className="text-sm text-soft">
                {t("No findings yet.", "The frog refuses to speculate.")}
              </p>
              <p className="mt-1 text-xs text-faint">
                {t(
                  "Log sessions with conditions — trends appear from 2 sessions per exercise.",
                  "A correlation needs roughly 10 sessions before the frog will put its name on it. Keep logging sleep and carbs — it is watching, it is patient, and it has nowhere else to be.",
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {openTrend && (
        <TrendSheet
          trend={openTrend}
          sessions={sessions}
          recs={recommendations[openTrend.exerciseId] ?? []}
          onClose={() => setOpenTrend(null)}
        />
      )}
      {openCondition && (
        <ConditionSheet
          finding={openCondition}
          onClose={() => setOpenCondition(null)}
        />
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

const VERDICT_COLOR: Record<TrendFinding["verdict"], "grass" | "gray" | "red"> =
  {
    PROGRESSING: "grass",
    PLATEAU: "gray",
    REGRESSING: "red",
  };

function TrendRow({
  trend,
  onOpen,
}: {
  trend: TrendFinding;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={rowClass({ className: "w-full gap-3 text-left" })}
      data-testid={`trend-${trend.exerciseName}`}
    >
      <span className="truncate text-sm">{trend.exerciseName}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="num text-xs text-faint">
          {trend.pctChange > 0 ? "+" : ""}
          {trend.pctChange.toFixed(1)}% · {trend.n}{" "}
          {trend.n === 1 ? "session" : "sessions"}
        </span>
        <Badge
          color={trend.confidence === "low" ? "amber" : "gray"}
          variant="soft"
          size="1"
        >
          {trend.confidence === "low" ? "Rough estimate" : "Medium confidence"}
        </Badge>
        <Badge color={VERDICT_COLOR[trend.verdict]} variant="soft" size="1">
          {trend.verdict}
        </Badge>
        <ChevronRight className="size-4 text-faint" />
      </span>
    </button>
  );
}

function ConditionRow({
  finding,
  onOpen,
}: {
  finding: ConditionFinding;
  onOpen: () => void;
}) {
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
    <button
      type="button"
      onClick={onOpen}
      className="w-full px-4 py-2 text-left transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
      data-testid={testId}
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1">
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
          <span className="text-soft">
            on high {finding.conditionName} days
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </p>
      <p className="num mt-0.5 text-2xs text-faint">
        n = {finding.n.high} high / {finding.n.low} low · {finding.confidence}{" "}
        confidence · correlation, not causation
      </p>
    </button>
  );
}

/** One chart block inside the trend sheet. */
function TrendChart({
  label,
  points,
  formatY,
  testId,
}: {
  label: string;
  points: Array<{ x: number; y: number }>;
  formatY: (v: number) => string;
  testId: string;
}) {
  const { t } = useVoice();
  return (
    <div>
      <p className="text-2xs font-medium tracking-widest text-faint uppercase">
        {label}
      </p>
      <div className="mt-1">
        {points.length === 0 ? (
          <div
            className="flex h-30 items-center justify-center text-xs text-faint"
            data-testid={testId}
          >
            {t("No data yet.", "No data yet. The frog refuses to speculate.")}
          </div>
        ) : (
          <ChartContainer
            config={TREND_CONFIG}
            className="h-30 w-full"
            role="img"
            aria-label={label}
            data-testid={testId}
          >
            <RechartsLineChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tickCount={3}
                tickFormatter={(v) => formatDate(Number(v))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                domain={trendYDomain(points)}
                tickFormatter={(v) => formatY(Number(v))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      formatDate(payload?.[0]?.payload?.x)
                    }
                    valueFormatter={(v) => formatY(Number(v))}
                  />
                }
              />
              <RechartsLine
                dataKey="y"
                type="monotone"
                stroke="var(--color-y)"
                strokeWidth={1.5}
                dot={{ r: 2.5, strokeWidth: 0, fill: "var(--color-y)" }}
              />
            </RechartsLineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

function TrendSheet({
  trend,
  sessions,
  recs,
  onClose,
}: {
  trend: TrendFinding;
  sessions: FindingsSessionInput[];
  recs: Recommendation[];
  onClose: () => void;
}) {
  const { t } = useVoice();
  const { unit } = useUnit();

  const tops = useMemo(
    () => sessionTopsByExercise(sessions).get(trend.exerciseId)?.tops ?? [],
    [sessions, trend.exerciseId],
  );
  const volume = useMemo(
    () => sessionVolumeByExercise(sessions).get(trend.exerciseId)?.points ?? [],
    [sessions, trend.exerciseId],
  );
  const rir = useMemo(
    () => rirStatsByExercise(sessions, trend.exerciseId),
    [sessions, trend.exerciseId],
  );

  const e1rmPoints = tops.map((p) => ({ x: p.day * DAY_MS, y: p.e1rm }));
  const volumePoints = volume.map((p) => ({ x: p.day * DAY_MS, y: p.kg }));
  const hasVolume = volumePoints.some((p) => p.y > 0);
  const sign = trend.pctChange > 0 ? "+" : "";
  const weeks = Math.max(1, Math.round(trend.spanDays / 7));
  const coveragePct = Math.round(rir.coverage * 100);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={trend.exerciseName} data-testid="findings-sheet">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={VERDICT_COLOR[trend.verdict]} variant="soft" size="1">
              {trend.verdict}
            </Badge>
            <span className="num text-xs text-soft">
              {sign}
              {trend.pctChange.toFixed(1)}% · n = {trend.n} sessions · ~{weeks}{" "}
              {weeks === 1 ? "week" : "weeks"} · {trend.confidence} confidence
            </span>
          </div>
          {trend.confidence === "low" && (
            <p className="text-2xs text-faint">
              {t(
                `Rough estimate — only ${trend.n} sessions, so the chance of error is high. Keep logging to sharpen it.`,
                `Rough estimate — the frog is guessing from only ${trend.n} sessions, so it could easily be wrong. Keep logging and it will sharpen up.`,
              )}
            </p>
          )}

          <TrendChart
            label={t(
              "Top-set e1RM",
              "Top-set e1RM — what the trend is fit over",
            )}
            points={e1rmPoints}
            formatY={(v) => String(toDisplayWeight(v, unit))}
            testId="trend-sheet-e1rm-chart"
          />
          {hasVolume && (
            <TrendChart
              label={t(
                "Volume per session",
                "Volume per session, warm-ups out",
              )}
              points={volumePoints}
              formatY={(v) => formatVolumeNumber(v, unit)}
              testId="trend-sheet-volume-chart"
            />
          )}

          {rir.coverage > 0 && (
            <p className="num text-xs text-soft">
              RIR logged on {coveragePct}% of sessions
              {rir.medianRir != null && (
                <>
                  {" "}
                  · median @
                  {Number.isInteger(rir.medianRir)
                    ? rir.medianRir
                    : rir.medianRir.toFixed(1)}
                </>
              )}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-2xs font-medium tracking-widest text-faint uppercase">
              Recommendations
            </p>
            {recs.length === 0 ? (
              <p className="text-xs text-soft">
                {t(
                  "No actionable signal yet — keep logging.",
                  "Nothing to change yet — keep logging and the frog will keep watching.",
                )}
              </p>
            ) : (
              recs.map((rec) => (
                <RecommendationBlock key={rec.kind} rec={rec} trend={trend} />
              ))
            )}
            <p className="text-2xs text-faint">Correlation, not causation.</p>
          </div>

          <Link
            to={`/exercises/${trend.exerciseId}`}
            className="mt-1 inline-flex h-9 w-full items-center justify-center border border-border bg-translucent text-xs transition-colors duration-150 hover:bg-surface-hover"
          >
            {t("Full history", "Full history — the frog's ledger")}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecommendationBlock({
  rec,
  trend,
}: {
  rec: Recommendation;
  trend: TrendFinding;
}) {
  const { t } = useVoice();
  const stats = rec.stats;

  if (rec.kind === "keep-going") {
    const sign = trend.pctChange > 0 ? "+" : "";
    return (
      <div className="border border-border bg-surface px-3 py-2">
        <p className="text-sm font-medium">{t("Keep going", "Keep going")}</p>
        <p className="mt-0.5 text-xs text-soft">
          {t(
            `Top-set e1RM is up ${sign}${trend.pctChange.toFixed(1)}% over ${stats.n} sessions.`,
            `Top-set e1RM is up ${sign}${trend.pctChange.toFixed(1)}% over ${stats.n} sessions — the frog approves.`,
          )}
        </p>
        <RecStatsLine stats={stats} />
      </div>
    );
  }

  if (rec.kind === "change-volume") {
    const pct = stats.volumePct ?? 0;
    const falling = pct < 0;
    return (
      <div className="border border-border bg-surface px-3 py-2">
        <p className="text-sm font-medium">
          {t("Consider more volume", "Consider more volume")}
        </p>
        <p className="mt-0.5 text-xs text-soft">
          {falling
            ? t(
                `Volume is down ${Math.abs(pct).toFixed(1)}% while e1RM plateaus. Try adding a set or reps.`,
                `Volume is down ${Math.abs(pct).toFixed(1)}% while e1RM plateaus. The frog suggests adding a set or reps.`,
              )
            : t(
                "Volume is flat while e1RM plateaus. Try adding a set or reps.",
                "Volume is flat while e1RM plateaus. The frog suggests adding a set or reps.",
              )}
        </p>
        <RecStatsLine stats={stats} />
      </div>
    );
  }

  // rir-gap
  const coveragePct = Math.round((stats.rirCoverage ?? 0) * 100);
  return (
    <div className="border border-border bg-surface px-3 py-2">
      <p className="text-sm font-medium">
        {t(
          "Log RIR for intensity advice",
          "Log RIR — the frog will read your effort",
        )}
      </p>
      <p className="mt-0.5 text-xs text-soft">
        {t(
          `RIR is logged on ${coveragePct}% of sessions. Log it on most work sets to compare effort.`,
          `RIR is logged on ${coveragePct}% of sessions. Log it on most work sets and the frog can read how hard you are trying.`,
        )}
      </p>
      <RecStatsLine stats={stats} />
    </div>
  );
}

function RecStatsLine({ stats }: { stats: Recommendation["stats"] }) {
  const parts: string[] = [`n = ${stats.n}`];
  if (stats.volumePct != null)
    parts.push(
      `volume ${stats.volumePct > 0 ? "+" : ""}${stats.volumePct.toFixed(1)}%`,
    );
  if (stats.medianRir != null)
    parts.push(
      `median @${Number.isInteger(stats.medianRir) ? stats.medianRir : stats.medianRir.toFixed(1)} RIR`,
    );
  return <p className="num mt-1 text-2xs text-faint">{parts.join(" · ")}</p>;
}

function ConditionSheet({
  finding,
  onClose,
}: {
  finding: ConditionFinding;
  onClose: () => void;
}) {
  const { t } = useVoice();
  const { unit } = useUnit();
  const outcome =
    finding.outcome.type === "tonnage"
      ? "Session tonnage"
      : `${finding.outcome.exerciseName} top-set e1RM`;
  const sign = finding.pctDiff > 0 ? "+" : "";
  const formatMean = (kg: number) =>
    finding.outcome.type === "tonnage"
      ? formatVolume(kg, unit)
      : formatWeight(kg, unit);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${finding.conditionName} × ${outcome}`}
        data-testid="condition-sheet"
      >
        <div className="flex flex-col gap-3">
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
            <span className="text-soft">
              on high {finding.conditionName} days
            </span>
          </p>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between border border-border bg-surface px-3 py-2">
              <span className="text-xs text-soft">
                High {finding.conditionName} days
              </span>
              <span className="num text-sm">
                {formatMean(finding.highMean)}
              </span>
            </div>
            <div className="flex items-center justify-between border border-border bg-surface px-3 py-2">
              <span className="text-xs text-soft">
                Low {finding.conditionName} days
              </span>
              <span className="num text-sm">{formatMean(finding.lowMean)}</span>
            </div>
          </div>

          <p className="num text-2xs text-faint">
            n = {finding.n.high} high / {finding.n.low} low ·{" "}
            {finding.confidence === "medium" ? "Medium" : "Low"} confidence
          </p>
          <p className="text-2xs text-faint">
            {t(
              "Correlation, not causation.",
              "Correlation, not causation — the frog is counting, not concluding.",
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
