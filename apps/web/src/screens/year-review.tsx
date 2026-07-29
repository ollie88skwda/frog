import { MUSCLE_REGION_LABELS, PR_TYPE_LABELS, yearReview } from "@frog/core";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { BarChart } from "@/components/charts/bars";
import { MonthDots } from "@/components/report-calendar";
import { formatDuration } from "@/lib/format";
import { formatVolume, prValue } from "@/lib/report-format";
import { type ReportData, useReportData } from "@/lib/report-queries";
import { distanceUnitFor, type Unit, useUnit } from "@/lib/settings";
import { useVoice } from "@/lib/voice";

const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const monthLongFmt = new Intl.DateTimeFormat(undefined, { month: "long" });
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: "short" });

export default function YearReviewScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useReportData();
  const { unit } = useUnit();
  const { t } = useVoice();

  // Years with any logged workout, newest first.
  const years = useMemo(() => {
    if (!data) return [];
    const set = new Set<number>();
    for (const s of data.history) set.add(new Date(s.startedAt).getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [data]);

  const [selYear, setSelYear] = useState<number | null>(null);
  const activeYear = selYear ?? years[0] ?? null;

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
          data-testid="year-back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Year in Review</h1>
      </div>

      {years.length === 0 || activeYear == null ? (
        <p className="mt-8 text-sm text-faint" data-testid="year-empty">
          {t(
            "No workouts logged yet — your year in review appears here once you train.",
            "A year with n=0 workouts. The frog refuses to speculate. Train, and the review appears.",
          )}
        </p>
      ) : (
        <>
          <div
            className="mt-4 flex gap-1 overflow-x-auto pb-1"
            data-testid="year-picker"
          >
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setSelYear(y)}
                className={`num h-9 shrink-0 px-4 text-xs transition-colors duration-150 ${
                  y === activeYear
                    ? "bg-accent-soft text-accent"
                    : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink"
                }`}
                data-testid={`year-tab-${y}`}
              >
                {y}
              </button>
            ))}
          </div>

          <YearBody data={data} year={activeYear} unit={unit} />
        </>
      )}
    </div>
  );
}

function YearBody({
  data,
  year,
  unit,
}: {
  data: ReportData;
  year: number;
  unit: Unit;
}) {
  const distUnit = distanceUnitFor(unit);
  const opts = useMemo(
    () => ({
      now: Date.now(),
      includeWarmups: data.includeWarmups,
      firstWeekday: data.firstWeekday,
    }),
    [data.includeWarmups, data.firstWeekday],
  );

  const review = useMemo(
    () => yearReview(data.history, data.muscles, year, opts, data.bodyweightKg),
    [data, year, opts],
  );

  const workoutDays = useMemo(
    () => new Set(review.workoutDays),
    [review.workoutDays],
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Hero totals. */}
      <Slide title={`${year} in numbers`} testId="year-totals">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Workouts"
            value={String(review.workouts)}
            testId="year-workouts"
          />
          <Stat label="Active time" value={formatDuration(review.activeMs)} />
          <Stat label="Volume" value={formatVolume(review.volumeKg, unit)} />
          <Stat label="Sets" value={String(review.sets)} />
        </div>
      </Slide>

      <Slide title="Most productive month" testId="year-top-month">
        {review.mostProductiveMonth ? (
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold">
              {monthLongFmt.format(
                new Date(year, review.mostProductiveMonth.month, 1),
              )}
            </span>
            <span className="num text-sm text-soft">
              {review.mostProductiveMonth.workouts} workouts
            </span>
          </div>
        ) : (
          <p className="text-xs text-faint">No workouts this year.</p>
        )}
      </Slide>

      <Slide title="Top muscle regions" testId="year-regions">
        {review.topRegions.length === 0 ? (
          <p className="text-xs text-faint">No muscle data this year.</p>
        ) : (
          <BarChart
            bars={review.topRegions.map((r) => ({
              label: MUSCLE_REGION_LABELS[r.region],
              value: Math.round(r.sets * 10) / 10,
            }))}
            formatValue={(v) => String(v)}
            ariaLabel="Top muscle regions by sets"
            testId="year-regions-chart"
          />
        )}
      </Slide>

      <Slide title="Top exercises" testId="year-exercises">
        {review.topExercises.length === 0 ? (
          <p className="text-xs text-faint">No exercises this year.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {review.topExercises.map((ex) => (
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

      <Slide
        title={`Personal records · ${review.prEvents.length}`}
        testId="year-prs"
      >
        {review.prEvents.length === 0 ? (
          <p className="text-xs text-faint">No PRs this year.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {review.prEvents.slice(0, 20).map((e) => (
              <li key={`${e.exerciseId}-${e.prType}-${e.at}`}>
                <Link
                  to={`/history/${e.sessionId}`}
                  className="flex h-11 items-center justify-between px-3 transition-colors duration-150 hover:bg-surface-hover"
                  data-testid={`year-pr-${e.prType}`}
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

      <Slide title="Longest streak" testId="year-streak">
        <div className="num text-lg font-semibold">
          {review.longestStreakWeeks}{" "}
          <span className="text-sm font-normal text-soft">
            {review.longestStreakWeeks === 1 ? "week" : "weeks"}
          </span>
        </div>
      </Slide>

      <Slide title={`${year} calendar`} testId="year-calendar">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {MONTHS.map((m) => (
            <div key={m}>
              <div className="mb-1 text-2xs font-medium text-soft">
                {monthShortFmt.format(new Date(year, m, 1))}
              </div>
              <MonthDots
                year={year}
                month={m}
                firstWeekday={data.firstWeekday}
                workoutDays={workoutDays}
              />
            </div>
          ))}
        </div>
      </Slide>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="border border-border bg-surface-2 p-3" data-testid={testId}>
      <div className="text-2xs font-medium tracking-widest text-faint uppercase">
        {label}
      </div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Slide({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="border border-border bg-surface" data-testid={testId}>
      <div className="border-b border-border px-4 py-2">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
