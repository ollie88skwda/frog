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
import { BarChart } from "@/components/charts/bars";
import { BodyHeatmap } from "@/components/charts/body-heatmap";
import { GroupedBarChart } from "@/components/charts/grouped-bars";
import { StackedBarChart, stackColor } from "@/components/charts/stacked-bars";
import { ShareButton } from "@/components/share-card";
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

// ── Section shell ────────────────────────────────────────────────────────────
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
    <section
      className="mt-4 border border-border bg-surface p-4"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          {title}
        </h2>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
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
      return { label, value: w.sessions };
    });
  }, [consistency]);

  return (
    <Section title="Last 7 days" testId="stats-seven-day">
      <p className="text-2xs text-faint">Workouts per week — last 12 weeks</p>
      <div className="mt-1">
        <BarChart
          bars={bars}
          formatValue={(v) => String(v)}
          height={96}
          ariaLabel="Workouts per week"
          testId="consistency-bars"
        />
      </div>
      <p className="mt-3 text-2xs text-faint">Muscles trained — last 7 days</p>
      <BodyHeatmap muscleSets={sevenDay} testId="seven-day-heatmap" />
    </Section>
  );
}

// ── 2. Set count per muscle group over time ──────────────────────────────────
function SetsPerMuscleSection({ history, muscleMap, opts }: SectionProps) {
  const [range, setRange] = useState<StatsRange>("3m");
  const [gran, setGran] = useState<StatsGranularity>("week");
  const [picked, setPicked] = useState<string[] | null>(null);

  const buckets = useMemo(
    () => setsPerMuscle(history, muscleMap, range, gran, opts),
    [history, muscleMap, range, gran, opts],
  );

  // Muscles present in the window, busiest first — the multi-select universe.
  const present = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of buckets)
      for (const [m, n] of Object.entries(b.counts))
        totals.set(m, (totals.get(m) ?? 0) + n);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }, [buckets]);

  const selected = picked ?? present.slice(0, 6);
  const groups = buckets.map((b) => ({
    label: bucketLabel(b.start, gran),
    values: selected.map((m) => b.counts[m] ?? 0),
  }));

  function toggle(m: string) {
    const base = new Set(selected);
    if (base.has(m)) base.delete(m);
    else base.add(m);
    // Preserve busiest-first order for stable colors.
    setPicked(present.filter((p) => base.has(p)));
  }

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

      <div className="mt-3">
        <StackedBarChart
          groups={groups}
          seriesLabels={selected.map(muscleLabel)}
          testId="sets-per-muscle-chart"
        />
      </div>

      {/* Legend + multi-select: every present muscle is a toggle; selected ones
          carry their stack color swatch. */}
      {present.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {present.map((m) => {
            const idx = selected.indexOf(m);
            const on = idx !== -1;
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggle(m)}
                className={cn(
                  "flex h-7 items-center gap-1.5 px-2 text-2xs transition-colors duration-150",
                  on
                    ? "bg-accent-soft text-accent"
                    : "bg-translucent text-faint hover:bg-surface-hover hover:text-soft",
                )}
                data-testid={`spm-muscle-${m}`}
              >
                <span
                  className="inline-block size-2"
                  style={{
                    background: on ? stackColor(idx) : "var(--border-strong)",
                  }}
                />
                {muscleLabel(m)}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── 3. Muscle distribution vs prior equal period ─────────────────────────────
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

  const groups = MUSCLE_REGIONS.map((r) => ({
    label: MUSCLE_REGION_LABELS[r],
    values: [
      toDisplayWeight(current.regionVolumeKg[r], unit),
      toDisplayWeight(previous.regionVolumeKg[r], unit),
    ],
  }));

  const totals: Array<{ label: string; cur: string; delta: number }> = [
    {
      label: "Workouts",
      cur: String(current.totals.workouts),
      delta: current.totals.workouts - previous.totals.workouts,
    },
    {
      label: "Duration",
      cur: formatDuration(current.totals.durationMs),
      delta: current.totals.durationMs - previous.totals.durationMs,
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
        <div className="flex items-center gap-2">
          <span className="text-2xs text-faint">
            vs previous {RANGE_LABELS[range].toLowerCase()}
          </span>
          <ShareButton
            data={{
              kicker: `Last ${RANGE_LABELS[range].toLowerCase()}`,
              title: "Muscle distribution",
              subtitle: `vs previous ${RANGE_LABELS[range].toLowerCase()}`,
              stats: totals.map((t) => ({ label: t.label, value: t.cur })),
            }}
            filename="distribution"
            testId="distribution-share-btn"
            variant="ghost"
            size="icon"
            label={null}
          />
        </div>
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
        <GroupedBarChart
          groups={groups}
          seriesLabels={["This period", "Previous"]}
          ariaLabel="Region volume vs previous period"
          testId="distribution-chart"
        />
      </div>

      <ul
        className="mt-3 divide-y divide-border border border-border"
        data-testid="distribution-totals"
      >
        {totals.map((t) => (
          <li
            key={t.label}
            className="flex items-center justify-between px-3 py-2"
          >
            <span className="text-xs text-soft">{t.label}</span>
            <span className="flex items-baseline gap-2">
              <span className="num text-sm">{t.cur}</span>
              <Delta value={t.delta} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="num text-2xs text-faint">±0</span>;
  const up = value > 0;
  return (
    <span className={cn("num text-2xs", up ? "text-pos" : "text-neg")}>
      {up ? "▲" : "▼"} {formatCount(Math.abs(value))}
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
      <BodyHeatmap muscleSets={distribution.muscleSets} testId="week-heatmap" />
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

// ── 5. Main exercises ────────────────────────────────────────────────────────
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
    <Section title="Main exercises" testId="stats-main-exercises">
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
