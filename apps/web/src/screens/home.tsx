import { FIRST_WEEKDAY, muscleLabel, sevenDayMuscleSets } from "@frog/core";
import { CaretRight } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { MuscleMeter, SectionHeader } from "@/components/data";
import { HomeHero } from "@/components/home-hero";
import { rowClass } from "@/components/ui/row";
import { formatDate } from "@/lib/format";
import { useAllSessions, useResolvedUserPrefs } from "@/lib/profile-queries";
import { useRecordsData } from "@/lib/records-queries";
import { useMuscleMap } from "@/lib/stats-queries";

// Today (redesign F5/§8.1), replacing Home + Train: readiness, the session with
// its prescription, Start, a compact week meter, the last session. Cut: feed
// placeholder, exercises promo, report promo, streak card (moves to You).
// Coach cards render when useCoach yields them (J3); none exist while stubbed.

const todayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const WEEK_METERS = 6;

export default function TodayScreen() {
  const { data: sessions = [] } = useAllSessions();
  const { data: recordsData } = useRecordsData();
  const { includeWarmupsInStats } = useResolvedUserPrefs();
  const muscleMap = useMuscleMap();

  // R6/R7: rolling 7-day fractional hard sets. Warm-ups are excluded unless
  // the user opted in (they are a minor part of Frog).
  const sevenDay = useMemo(
    () =>
      recordsData
        ? sevenDayMuscleSets(recordsData.history, muscleMap, {
            now: Date.now(),
            includeWarmups: includeWarmupsInStats,
            firstWeekday: FIRST_WEEKDAY,
          })
        : {},
    [recordsData, muscleMap, includeWarmupsInStats],
  );
  const top = useMemo(
    () =>
      Object.entries(sevenDay)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, WEEK_METERS),
    [sevenDay],
  );
  const last = sessions.find((s) => s.endedAt != null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Today</h1>
      <p className="num text-xs text-soft">{todayFmt.format(Date.now())}</p>

      <HomeHero />

      <section className="mt-4 overflow-hidden rounded-md bg-surface">
        <SectionHeader
          title="This week"
          to="/progress"
          seeAllLabel="All muscles"
        />
        {top.length === 0 ? (
          <p className="px-4 py-4 text-xs text-soft">
            Hard sets per muscle show up here after your first logged session.
          </p>
        ) : (
          top.map(([muscle, n]) => (
            <MuscleMeter key={muscle} label={muscleLabel(muscle)} sets={n} />
          ))
        )}
      </section>

      {last && (
        <Link
          to={`/history/${last.id}`}
          className={rowClass({ className: "mt-4 rounded-md bg-surface" })}
          data-testid="today-last-session"
        >
          <span className="min-w-0 truncate text-sm text-ink">
            Last: {last.title ?? "Workout"}
          </span>
          <span className="num flex shrink-0 items-center gap-1 text-xs text-soft">
            {formatDate(last.startedAt)}
            <CaretRight className="size-3.5" />
          </span>
        </Link>
      )}
    </div>
  );
}
