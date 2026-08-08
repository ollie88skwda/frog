import {
  distributionBetween,
  type Exercise,
  FIRST_WEEKDAY,
  MUSCLE_REGION_LABELS,
  MUSCLE_REGIONS,
  type MuscleByExercise,
  mainExercises,
  muscleDistribution,
  muscleLabel,
  type RecordsSessionInput,
  type StatsGranularity,
  type StatsOptions,
  type StatsRange,
  setsPerMuscle,
  sevenDayMuscleSets,
  toDisplayWeight,
  unitLabel,
  weeklyConsistency,
  weekStart,
} from "@frog/core";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CartesianGrid,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
} from "recharts";
import { HumanBodyHeatmap } from "@/components/charts/human-body-heatmap";
import { Card } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatDuration } from "@/lib/format";
import { useExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useUnit } from "@/lib/settings";
import { useLatestBodyweight, useMuscleMap } from "@/lib/stats-queries";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

const DAY = 24 * 60 * 60 * 1000;

const RANGE_LABELS: Record<StatsRange, string> = {
  "30d": "30 days",
  "3m": "3 months",
  "1y": "1 year",
  all: "All time",
};
const RANGES: StatsRange[] = ["30d", "3m", "1y", "all"];
const GRAN_LABELS: Record<StatsGranularity, string> = {
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};
const GRANS: StatsGranularity[] = ["week", "month", "year"];

const monthDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" });

function bucketLabel(start: number, g: StatsGranularity): string {
  const d = new Date(start);
  if (g === "year") return String(d.getFullYear());
  if (g === "month") return monthShort.format(d);
  return monthDay.format(d);
}

// Compact y-axis ticks for weight volume (2 500 → "2.5k").
function compactNumber(v: number): string {
  if (v >= 1000) {
    const s = (v / 1000).toFixed(1).replace(/\.0$/, "");
    return `${s}k`;
  }
  return formatCount(v);
}

export default function StatsScreen() {
  const navigate = useNavigate();
  const { data: recordsData, isLoading: recLoading } = useRecordsData();
  const { data: exercises = [], isLoading: exLoading } = useExercises();
  const muscleMap = useMuscleMap();
  const { unit } = useUnit();
  const { t } = useVoice();

  const opts: StatsOptions = useMemo(
    () => ({
      now: Date.now(),
      includeWarmups: recordsData?.includeWarmups ?? true,
      firstWeekday: FIRST_WEEKDAY,
    }),
    [recordsData?.includeWarmups],
  );
  const history = recordsData?.history ?? [];

  if (recLoading || exLoading) {
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
          data-testid="stats-back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Statistics</h1>
      </div>

      {history.length === 0 && (
        <p
          className="mt-6 border border-border bg-surface p-4 text-xs text-faint"
          data-testid="stats-empty"
        >
          {t(
            "Log a few workouts to see your training analytics here.",
            "No workouts on record. The frog refuses to speculate. Log a few and your analytics appear here.",
          )}
        </p>
      )}

      <SevenDaySection history={history} muscleMap={muscleMap} opts={opts} />
      <SetsPerMuscleSection
        history={history}
        muscleMap={muscleMap}
        opts={opts}
      />
      <DistributionSection
        history={history}
        muscleMap={muscleMap}
        opts={opts}
        unit={unit}
      />
      <WeekBodySection history={history} muscleMap={muscleMap} opts={opts} />
      <MainExercisesSection
        history={history}
        opts={opts}
        exercises={exercises}
      />
      <ReportsRow />
    </div>
  );
}

type SectionProps = {
  history: RecordsSessionInput[];
  muscleMap: MuscleByExercise;
  opts: StatsOptions;
};

// ── Section shell (shadcn/ui Card) ───────────────────────────────────────────
function Section({
  title,
  children,
  right,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card
      className="mt-4 border-border bg-surface px-4 py-4 ring-border"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          {title}
        </h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  labels,
  testIdPrefix,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
  testIdPrefix: string;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "h-8 flex-1 whitespace-nowrap px-2 text-2xs transition-colors duration-150",
            o === value
              ? "bg-accent-soft text-accent"
              : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
          )}
          data-testid={`${testIdPrefix}-${o}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

// ── 1. Last 7 days: consistency mini-bars + rolling body heat map ─────────────
const CONSISTENCY_CONFIG = {
  sessions: { label: "Workouts", color: "var(--accent)" },
} satisfies ChartConfig;

function SevenDaySection({ history, muscleMap, opts }: SectionProps) {
  const consistency = useMemo(
    () => weeklyConsistency(history, 12, opts),
    [history, opts],
  );
  const sevenDay = useMemo(
    () => sevenDayMuscleSets(history, muscleMap, opts),
    [history, muscleMap, opts],
  );

  const bars = useMemo(() => {
    let prevMonth = -1;
    return consistency.map((w) => {
      const d = new Date(w.weekStart);
      const label = d.getMonth() !== prevMonth ? monthShort.format(d) : "";
      prevMonth = d.getMonth();
      return { weekStart: w.weekStart, label, sessions: w.sessions };
    });
  }, [consistency]);
  // Recharts category axes dedupe identical values, so the sparse month labels
  // ("" for most weeks) must be a *display* transform, not the category key —
  // the unique weekStart is the key, the formatter re-applies the sparse rule.
  const labelOf = useMemo(
    () => new Map(bars.map((b) => [b.weekStart, b.label])),
    [bars],
  );

  return (
    <Section title="Last 7 days" testId="stats-seven-day">
      <p className="text-2xs text-faint">Workouts per week — last 12 weeks</p>
      <div className="mt-1">
        <ChartContainer
          config={CONSISTENCY_CONFIG}
          className="h-24 w-full"
          data-testid="consistency-bars"
        >
          <RechartsBarChart
            data={bars}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="weekStart"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(v) => labelOf.get(Number(v)) ?? ""}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={24}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    monthDay.format(new Date(payload?.[0]?.payload?.weekStart))
                  }
                />
              }
            />
            <RechartsBar
              dataKey="sessions"
              fill="var(--color-sessions)"
              maxBarSize={40}
            />
          </RechartsBarChart>
        </ChartContainer>
      </div>
      <p className="mt-3 text-2xs text-faint">Muscles trained — last 7 days</p>
      <HumanBodyHeatmap muscleSets={sevenDay} testId="seven-day-heatmap" />
    </Section>
  );
}

// ── 2. Set count per muscle group over time ──────────────────────────────────
const SETS_CONFIG = {
  sets: { label: "Total sets", color: "var(--accent)" },
} satisfies ChartConfig;

// Note 6: per-muscle stack colors failed once many muscles carried one set
// each, so the representation no longer encodes muscle as color at all — a
// single-accent total-sets bar per bucket, with the per-muscle breakdown as a
// ranked list below (docs/DECISIONS.md 2026-08-08, stats-screen batch).
function SetsPerMuscleSection({ history, muscleMap, opts }: SectionProps) {
  const [range, setRange] = useState<StatsRange>("3m");
  const [gran, setGran] = useState<StatsGranularity>("week");
  const { t } = useVoice();

  const buckets = useMemo(
    () => setsPerMuscle(history, muscleMap, range, gran, opts),
    [history, muscleMap, range, gran, opts],
  );

  // Muscles present in the window, busiest first — the ranked breakdown.
  const breakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of buckets)
      for (const [m, n] of Object.entries(b.counts))
        totals.set(m, (totals.get(m) ?? 0) + n);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [buckets]);

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        start: b.start,
        label: bucketLabel(b.start, gran),
        sets: Object.values(b.counts).reduce((a, n) => a + n, 0),
      })),
    [buckets, gran],
  );
  const labelOf = useMemo(
    () => new Map(chartData.map((b) => [b.start, b.label])),
    [chartData],
  );

  return (
    <Section title="Sets per muscle group" testId="stats-sets-per-muscle">
      <Chips
        options={RANGES}
        value={range}
        onChange={setRange}
        labels={RANGE_LABELS}
        testIdPrefix="spm-range"
      />
      <div className="mt-1">
        <Chips
          options={GRANS}
          value={gran}
          onChange={setGran}
          labels={GRAN_LABELS}
          testIdPrefix="spm-gran"
        />
      </div>

      <p className="mt-3 text-2xs text-faint">
        Total sets per {GRAN_LABELS[gran].toLowerCase()}
      </p>
      <div className="mt-1">
        {chartData.length === 0 ? (
          <div
            className="flex h-44 items-center justify-center text-xs text-faint"
            data-testid="sets-per-muscle-chart"
          >
            {t("No data yet.", "No data yet. The frog refuses to speculate.")}
          </div>
        ) : (
          <ChartContainer
            config={SETS_CONFIG}
            className="h-44 w-full"
            data-testid="sets-per-muscle-chart"
          >
            <RechartsBarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="start"
                type="category"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => labelOf.get(Number(v)) ?? ""}
              />
              <YAxis tickLine={false} axisLine={false} width={26} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      bucketLabel(payload?.[0]?.payload?.start, gran)
                    }
                  />
                }
              />
              <RechartsBar
                dataKey="sets"
                fill="var(--color-sets)"
                maxBarSize={40}
              />
            </RechartsBarChart>
          </ChartContainer>
        )}
      </div>

      {breakdown.length > 0 && (
        <ul
          className="mt-3 divide-y divide-border border border-border"
          data-testid="sets-per-muscle-breakdown"
        >
          {breakdown.map(([m, n]) => (
            <li
              key={m}
              className="flex items-center justify-between px-3 py-1.5"
              data-testid={`spm-row-${m}`}
            >
              <span className="text-xs text-soft">{muscleLabel(m)}</span>
              <span className="num text-sm">{formatCount(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 3. Muscle distribution vs prior equal period ─────────────────────────────
const DIST_CONFIG = {
  current: { label: "This period", color: "var(--accent)" },
  previous: { label: "Previous", color: "var(--faint)" },
} satisfies ChartConfig;

function DistributionSection({
  history,
  muscleMap,
  opts,
  unit,
}: SectionProps & { unit: "kg" | "lb" }) {
  const [range, setRange] = useState<StatsRange>("30d");
  const bodyweightKg = useLatestBodyweight();
  const { current, previous } = useMemo(
    () => muscleDistribution(history, muscleMap, range, opts, bodyweightKg),
    [history, muscleMap, range, opts, bodyweightKg],
  );

  const chartData = useMemo(
    () =>
      MUSCLE_REGIONS.map((r) => ({
        region: MUSCLE_REGION_LABELS[r],
        current: toDisplayWeight(current.regionVolumeKg[r], unit),
        previous: toDisplayWeight(previous.regionVolumeKg[r], unit),
      })),
    [current, previous, unit],
  );

  const totals: Array<{
    label: string;
    cur: string;
    delta: number;
    formatDelta?: (n: number) => string;
  }> = [
    {
      label: "Workouts",
      cur: String(current.totals.workouts),
      delta: current.totals.workouts - previous.totals.workouts,
    },
    {
      label: "Duration",
      cur: formatDuration(current.totals.durationMs),
      delta: current.totals.durationMs - previous.totals.durationMs,
      formatDelta: formatDuration,
    },
    {
      label: "Volume",
      cur: `${toDisplayWeight(current.totals.volumeKg, unit)} ${unitLabel(unit)}`,
      delta:
        toDisplayWeight(current.totals.volumeKg, unit) -
        toDisplayWeight(previous.totals.volumeKg, unit),
    },
    {
      label: "Sets",
      cur: formatCount(current.totals.sets),
      delta: current.totals.sets - previous.totals.sets,
    },
  ];

  return (
    <Section
      title="Muscle distribution"
      testId="stats-distribution"
      right={
        <span className="text-2xs text-faint">
          vs previous {RANGE_LABELS[range].toLowerCase()}
        </span>
      }
    >
      <Chips
        options={RANGES}
        value={range}
        onChange={setRange}
        labels={RANGE_LABELS}
        testIdPrefix="dist-range"
      />
      <div className="mt-3">
        <ChartContainer
          config={DIST_CONFIG}
          className="h-40 w-full"
          data-testid="distribution-chart"
        >
          <RechartsBarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="region"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
            />
            {/* Note 7c: the grouped bars gain a real y-axis (kg/lb volume),
                compact-formatted so 2 500 reads as "2.5k". */}
            <YAxis
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={compactNumber}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            {/* Note 7a+b: the legend lives BELOW the plot (shadcn
                ChartLegendContent), so bar tops can never collide with the
                "This period"/"Previous" labels again. */}
            <ChartLegend content={<ChartLegendContent />} />
            <RechartsBar
              dataKey="current"
              fill="var(--color-current)"
              maxBarSize={40}
            />
            <RechartsBar
              dataKey="previous"
              fill="var(--color-previous)"
              maxBarSize={40}
            />
          </RechartsBarChart>
        </ChartContainer>
      </div>

      <ul
        className="mt-3 divide-y divide-border border border-border"
        data-testid="distribution-totals"
      >
        {totals.map((t) => (
          <li
            key={t.label}
            className="flex items-center justify-between px-3 py-2"
            data-testid={`dist-total-${t.label.toLowerCase()}`}
          >
            <span className="text-xs text-soft">{t.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="num text-sm">{t.cur}</span>
              <Delta value={t.delta} format={t.formatDelta} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Delta({
  value,
  format = formatCount,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  if (value === 0) return <span className="num text-2xs text-faint">±0</span>;
  const up = value > 0;
  return (
    <span className={cn("num text-2xs", up ? "text-pos" : "text-neg")}>
      {up ? "▲" : "▼"} {format(Math.abs(value))}
    </span>
  );
}

// ── 4. Body view by calendar week (set counts) ───────────────────────────────
function WeekBodySection({ history, muscleMap, opts }: SectionProps) {
  const [offset, setOffset] = useState(0); // weeks back from the current week
  const base = weekStart(opts.now, opts.firstWeekday);
  const from = weekStart(base - offset * 7 * DAY + DAY / 2, opts.firstWeekday);
  const to = weekStart(from + 7 * DAY + DAY / 2, opts.firstWeekday);

  const bodyweightKg = useLatestBodyweight();
  const distribution = useMemo(
    () => distributionBetween(history, muscleMap, from, to, opts, bodyweightKg),
    [history, muscleMap, from, to, opts, bodyweightKg],
  );

  const rows = useMemo(
    () =>
      Object.entries(distribution.muscleSets)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]),
    [distribution],
  );

  return (
    <Section
      title="Body view by week"
      testId="stats-week-body"
      right={
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            title="Previous week"
            className="flex size-7 items-center justify-center bg-translucent text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
            data-testid="week-prev"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            title="Next week"
            className="flex size-7 items-center justify-center bg-translucent text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink disabled:opacity-40"
            data-testid="week-next"
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      }
    >
      <p className="num text-2xs text-faint" data-testid="week-range">
        {monthDay.format(from)} – {monthDay.format(to - DAY)}
      </p>
      <HumanBodyHeatmap
        muscleSets={distribution.muscleSets}
        testId="week-heatmap"
      />
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-faint">No sets logged this week.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border border-border">
          {rows.map(([m, n]) => (
            <li
              key={m}
              className="flex items-center justify-between px-3 py-1.5"
            >
              <span className="text-xs text-soft">{muscleLabel(m)}</span>
              <span className="num text-sm">{formatCount(n)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 5. Favorite exercises ────────────────────────────────────────────────────
function MainExercisesSection({
  history,
  opts,
  exercises,
}: {
  history: RecordsSessionInput[];
  opts: StatsOptions;
  exercises: Exercise[];
}) {
  const [range, setRange] = useState<StatsRange>("3m");
  const ranked = useMemo(
    () => mainExercises(history, range, opts),
    [history, range, opts],
  );
  const nameOf = useMemo(() => {
    const m = new Map(exercises.map((e) => [e.id, e.name]));
    return (id: string) => m.get(id) ?? "Unknown exercise";
  }, [exercises]);

  return (
    <Section title="Favorite Exercises" testId="stats-main-exercises">
      <Chips
        options={RANGES}
        value={range}
        onChange={setRange}
        labels={RANGE_LABELS}
        testIdPrefix="main-range"
      />
      {ranked.length === 0 ? (
        <p className="mt-3 text-xs text-faint">No exercises logged yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border border border-border">
          {ranked.slice(0, 15).map((ex, i) => (
            <li key={ex.exerciseId}>
              <Link
                to={`/exercises/${ex.exerciseId}`}
                className="flex h-11 items-center justify-between px-3 transition-colors duration-150 hover:bg-surface-hover"
                data-testid={`main-exercise-${ex.exerciseId}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num w-4 text-2xs text-faint">{i + 1}</span>
                  <span className="truncate text-sm">
                    {nameOf(ex.exerciseId)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="num text-xs text-faint">
                    {ex.sessions} {ex.sessions === 1 ? "session" : "sessions"}
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 6. Reports row → the M10 report screens ──────────────────────────────────
function ReportsRow() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2" data-testid="stats-reports">
      <ReportButton to="/stats/monthly" label="Monthly report" />
      <ReportButton to="/stats/year" label="Year in review" />
    </div>
  );
}

function ReportButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex h-14 items-center justify-between border border-border bg-surface px-4 transition-colors duration-150 hover:border-border-strong"
      data-testid={`report-${label.split(" ")[0].toLowerCase()}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <ChevronRight className="size-4 text-faint" />
    </Link>
  );
}

// Fractional set counts: show the ".5" only when present.
function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
