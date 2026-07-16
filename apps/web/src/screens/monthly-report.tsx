import {
  type DistributionTotals,
  distributionBetween,
  MUSCLE_REGION_LABELS,
  MUSCLE_REGIONS,
  monthlyReport,
  PR_TYPE_LABELS,
  reportableMonths,
} from "@sbl/core";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { BarChart } from "@/components/charts/bars";
import { GroupedBarChart } from "@/components/charts/grouped-bars";
import { MonthHeatGrid } from "@/components/report-calendar";
import { formatDuration } from "@/lib/format";
import {
  compactVolume,
  formatVolume,
  hoursOf,
  prValue,
} from "@/lib/report-format";
import { type ReportData, useReportData } from "@/lib/report-queries";
import { distanceUnitFor, type Unit, useUnit } from "@/lib/settings";

const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: "short" });

type Metric = "time" | "volume" | "sets";
const METRIC_LABELS: Record<Metric, string> = {
  time: "Time",
  volume: "Volume",
  sets: "Sets",
};

export default function MonthlyReportScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useReportData();
  const { unit } = useUnit();

  const months = useMemo(
    () => (data ? reportableMonths(data.history) : []),
    [data],
  );

  // Default to the latest *completed* month (the newest reportable month
  // strictly before the current calendar month); fall back to the newest month
  // with data if the user has only logged in the current month.
  const defaultKey = useMemo(() => {
    if (months.length === 0) return null;
    const now = new Date();
    const curIdx = now.getFullYear() * 12 + now.getMonth();
    const completed = months.find((m) => m.year * 12 + m.month < curIdx);
    const pick = completed ?? months[0];
    return `${pick.year}-${pick.month}`;
  }, [months]);

  const [selKey, setSelKey] = useState<string | null>(null);
  const activeKey = selKey ?? defaultKey;

  if (isLoading || !data) {
    return (
      <p className="mx-auto max-w-2xl px-4 py-10 text-center text-xs text-faint">
        Loading…
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          title="Back"
          className="flex size-8 shrink-0 items-center justify-center text-faint transition-colors duration-150 hover:text-ink"
          data-testid="monthly-back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Monthly report</h1>
      </div>

      {months.length === 0 || !activeKey ? (
        <p className="mt-8 text-sm text-faint" data-testid="monthly-empty">
          No completed months yet — log a few workouts and your first report
          appears here.
        </p>
      ) : (
        <>
          {/* Month archive picker — SBL keeps every completed month (Hevy shows
              only the latest). Newest first. */}
          <div
            className="mt-4 flex gap-1 overflow-x-auto pb-1"
            data-testid="monthly-picker"
          >
            {months.map((m) => {
              const key = `${m.year}-${m.month}`;
              const selected = key === activeKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelKey(key)}
                  className={`num h-9 shrink-0 whitespace-nowrap px-3 text-xs transition-colors duration-150 ${
                    selected
                      ? "bg-accent-soft text-accent"
                      : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink"
                  }`}
                  data-testid={`monthly-month-${key}`}
                >
                  {monthShortFmt.format(new Date(m.year, m.month, 1))}{" "}
                  {String(m.year).slice(2)}
                </button>
              );
            })}
          </div>

          <ReportBody data={data} monthKey={activeKey} unit={unit} />
        </>
      )}
    </div>
  );
}

function ReportBody({
  data,
  monthKey,
  unit,
}: {
  data: ReportData;
  monthKey: string;
  unit: Unit;
}) {
  const [year, month] = monthKey.split("-").map(Number);
  const distUnit = distanceUnitFor(unit);

  const opts = useMemo(
    () => ({
      now: Date.now(),
      includeWarmups: data.includeWarmups,
      firstWeekday: data.firstWeekday,
    }),
    [data.includeWarmups, data.firstWeekday],
  );

  const report = useMemo(
    () =>
      monthlyReport(
        data.history,
        data.muscles,
        year,
        month,
        opts,
        data.bodyweightKg,
      ),
    [data, year, month, opts],
  );

  // Trailing 6 months (incl. selected) for the header comparison chart.
  const trailing = useMemo(() => {
    const out: Array<{
      month: number;
      label: string;
      totals: DistributionTotals;
    }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const from = new Date(y, m, 1).getTime();
      const to = new Date(y, m + 1, 1).getTime();
      const dist = distributionBetween(
        data.history,
        data.muscles,
        from,
        to,
        opts,
        data.bodyweightKg,
      );
      out.push({
        month: m,
        label: monthShortFmt.format(new Date(y, m, 1)),
        totals: dist.totals,
      });
    }
    return out;
  }, [data, year, month, opts]);

  const workoutDays = useMemo(
    () => new Set(report.workoutDays),
    [report.workoutDays],
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      <TrendSlide trailing={trailing} unit={unit} />

      <TotalsSlide
        totals={report.totals}
        previous={report.previous.totals}
        prCount={report.prEvents.length}
        unit={unit}
      />

      <Slide title="Personal records" testId="monthly-prs">
        {report.prEvents.length === 0 ? (
          <p className="text-xs text-faint">No PRs this month.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {report.prEvents.map((e) => (
              <li key={`${e.exerciseId}-${e.prType}-${e.at}`}>
                <Link
                  to={`/history/${e.sessionId}`}
                  className="flex h-11 items-center justify-between px-3 transition-colors duration-150 hover:bg-surface-hover"
                  data-testid={`monthly-pr-${e.prType}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-ink">
                      {data.nameOf(e.exerciseId)}
                    </span>
                    <span className="block text-2xs text-faint">
                      {PR_TYPE_LABELS[e.prType]}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-sm">
                      {prValue(e.prType, e.value, unit, distUnit)}
                    </span>
                    <ChevronRight className="size-4 text-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Slide>

      <Slide title="Training days" testId="monthly-calendar">
        <MonthHeatGrid
          year={year}
          month={month}
          firstWeekday={data.firstWeekday}
          workoutDays={workoutDays}
        />
        <p className="num mt-3 text-2xs text-faint">
          {workoutDays.size} training {workoutDays.size === 1 ? "day" : "days"}{" "}
          in {monthYearFmt.format(new Date(year, month, 1))}
        </p>
      </Slide>

      <Slide title="Muscle split vs prior month" testId="monthly-distribution">
        <GroupedBarChart
          groups={MUSCLE_REGIONS.map((r) => ({
            label: MUSCLE_REGION_LABELS[r],
            values: [
              round1(report.distribution.regionSets[r]),
              round1(report.previous.regionSets[r]),
            ],
          }))}
          seriesLabels={["This month", "Prior"]}
          ariaLabel="Muscle split vs prior month"
          testId="monthly-dist-chart"
        />
      </Slide>

      <Slide title="Top exercises" testId="monthly-top">
        {report.topExercises.length === 0 ? (
          <p className="text-xs text-faint">No exercises logged this month.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {report.topExercises.map((ex) => (
              <li
                key={ex.exerciseId}
                className="flex h-10 items-center justify-between px-3"
              >
                <span className="truncate text-xs text-soft">
                  {data.nameOf(ex.exerciseId)}
                </span>
                <span className="num shrink-0 text-2xs text-faint">
                  {ex.sessions}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </Slide>
    </div>
  );
}

// ── Header comparison: metric-switchable bars across trailing months ─────────
function TrendSlide({
  trailing,
  unit,
}: {
  trailing: Array<{ month: number; label: string; totals: DistributionTotals }>;
  unit: Unit;
}) {
  const [metric, setMetric] = useState<Metric>("volume");
  const bars = trailing.map((t) => ({
    label: t.label,
    value:
      metric === "time"
        ? t.totals.durationMs
        : metric === "volume"
          ? t.totals.volumeKg
          : t.totals.sets,
  }));
  const fmt = (v: number) =>
    metric === "time"
      ? hoursOf(v)
      : metric === "volume"
        ? compactVolume(v, unit)
        : String(Math.round(v));

  return (
    <Slide
      title="Monthly trend"
      testId="monthly-trend"
      action={
        <div className="flex gap-1">
          {(["time", "volume", "sets"] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`h-7 px-2 text-2xs transition-colors duration-150 ${
                metric === m
                  ? "bg-accent-soft text-accent"
                  : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink"
              }`}
              data-testid={`monthly-metric-${m}`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      }
    >
      <BarChart
        bars={bars}
        formatValue={fmt}
        ariaLabel={`${METRIC_LABELS[metric]} by month`}
        testId="monthly-trend-chart"
      />
      <p className="mt-1 text-2xs text-faint">
        {metric === "time"
          ? "Active hours per month"
          : metric === "volume"
            ? `Total volume per month (${unit === "kg" ? "kg" : "lbs"})`
            : "Working sets per month"}
      </p>
    </Slide>
  );
}

function TotalsSlide({
  totals,
  previous,
  prCount,
  unit,
}: {
  totals: DistributionTotals;
  previous: DistributionTotals;
  prCount: number;
  unit: Unit;
}) {
  return (
    <Slide title="This month" testId="monthly-totals">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Workouts"
          value={String(totals.workouts)}
          delta={totals.workouts - previous.workouts}
          fmtDelta={(d) => String(d)}
        />
        <Stat
          label="Active time"
          value={formatDuration(totals.durationMs)}
          delta={totals.durationMs - previous.durationMs}
          fmtDelta={(d) => `${hoursOf(Math.abs(d))}h`}
        />
        <Stat
          label="Volume"
          value={formatVolume(totals.volumeKg, unit)}
          delta={totals.volumeKg - previous.volumeKg}
          fmtDelta={(d) => compactVolume(Math.abs(d), unit)}
        />
        <Stat
          label="Sets"
          value={String(totals.sets)}
          delta={totals.sets - previous.sets}
          fmtDelta={(d) => String(d)}
        />
      </div>
      <div className="mt-2 border border-border bg-surface-2 p-3">
        <div className="text-2xs font-medium tracking-widest text-faint uppercase">
          Personal records
        </div>
        <div
          className="num mt-1 text-lg font-semibold"
          data-testid="monthly-pr-count"
        >
          {prCount}
        </div>
      </div>
    </Slide>
  );
}

function Stat({
  label,
  value,
  delta,
  fmtDelta,
}: {
  label: string;
  value: string;
  delta: number;
  fmtDelta: (d: number) => string;
}) {
  return (
    <div className="border border-border bg-surface-2 p-3">
      <div className="text-2xs font-medium tracking-widest text-faint uppercase">
        {label}
      </div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
      {delta === 0 ? (
        <div className="num mt-0.5 text-2xs text-faint">±0 vs last month</div>
      ) : (
        <div
          className={`num mt-0.5 text-2xs ${delta > 0 ? "text-pos" : "text-neg"}`}
        >
          {delta > 0 ? "▲" : "▼"} {fmtDelta(delta)} vs last month
        </div>
      )}
    </div>
  );
}

function Slide({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="border border-border bg-surface" data-testid={testId}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
