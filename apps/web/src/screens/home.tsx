import { sevenDayMuscleSets } from "@sbl/core";
import { BarChart3, LibraryBig, Play, Users } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { BodyHeatmap } from "@/components/charts/body-heatmap";
import { ReportPromo } from "@/components/report-promo";
import { StreakCard } from "@/components/streak-card";
import { TrainFindingsCard } from "@/components/train-findings-card";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { useAllSessions, useUserPrefs } from "@/lib/profile-queries";
import { useActiveSession } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useStartSession } from "@/lib/start-session";
import { useMuscleMap } from "@/lib/stats-queries";

export default function HomeScreen() {
  const navigate = useNavigate();
  const { data: active } = useActiveSession();
  const { start, starting } = useStartSession();
  const { data: prefs } = useUserPrefs();
  const { data: sessions = [] } = useAllSessions();
  const { data: recordsData } = useRecordsData();
  const muscleMap = useMuscleMap();
  const starts = sessions.map((s) => s.startedAt);

  // Trailing-7-day muscle map for the mini heat map — deep-links into /stats.
  const sevenDay = useMemo(
    () =>
      recordsData
        ? sevenDayMuscleSets(recordsData.history, muscleMap, {
            now: Date.now(),
            includeWarmups: recordsData.includeWarmups,
            firstWeekday: prefs?.firstWeekday ?? 1,
          })
        : {},
    [recordsData, muscleMap, prefs?.firstWeekday],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Home</h1>

      {/* Quick start — the lightweight entry; the full hub is Training. */}
      <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {active ? "Session in progress" : "Ready to train?"}
          </p>
          <p className="num mt-0.5 text-2xs text-faint">
            {active
              ? `started ${formatTime(active.startedAt)}`
              : "Quick-start here, or open Training."}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          className="shrink-0"
          disabled={starting}
          onClick={() =>
            active ? navigate(`/session/${active.id}`) : void start()
          }
          data-testid="home-start-btn"
        >
          <Play className="size-4" />
          {starting ? "Starting…" : active ? "Resume" : "Start"}
        </Button>
      </div>

      {/* Monthly-report / Year-in-Review nudge (dismissible; time-gated). */}
      <ReportPromo />

      <Link to="/calendar" className="mt-4 block" data-testid="home-streak">
        <StreakCard starts={starts} firstWeekday={prefs?.firstWeekday ?? 1} />
      </Link>

      {/* Trailing-7-day muscle map — a glanceable teaser into full Statistics. */}
      <Link
        to="/stats"
        className="mt-4 block rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-(--ease-out-quad) hover:border-border-strong"
        data-testid="home-heatmap"
      >
        <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
          <BarChart3 className="size-4" />
          This week
        </div>
        <div className="mx-auto mt-2 max-w-56">
          <BodyHeatmap muscleSets={sevenDay} interactive={false} />
        </div>
      </Link>

      <TrainFindingsCard />

      {/* Library lives on Home. */}
      <Link
        to="/library"
        className="mt-4 block rounded-lg border border-border bg-surface p-4 transition-colors duration-150 ease-(--ease-out-quad) hover:border-border-strong"
      >
        <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
          <LibraryBig className="size-4" />
          Library
        </div>
        <p className="mt-2 text-sm text-soft">
          Browse exercises, machines, and tier ratings.
        </p>
      </Link>

      {/* Social + graphs are a future phase — labeled, not faked. */}
      <div className="mt-4 rounded-lg border border-dashed border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-2xs font-medium tracking-widest text-faint uppercase">
          <Users className="size-4" />
          Feed &amp; graphs
        </div>
        <p className="mt-2 text-sm text-faint">
          Coming soon — a training feed and progress charts.
        </p>
      </div>
    </div>
  );
}
