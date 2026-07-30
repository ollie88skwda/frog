import {
  computeStreak,
  FIRST_WEEKDAY,
  type MuscleByExercise,
  muscleCredits,
  PR_TYPE_LABELS,
  toDisplayWeight,
  unitLabel,
  weekStart,
} from "@frog/core";
import { Flame, Medal, Trophy, X } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { BodyHeatmap } from "@/components/charts/body-heatmap";
import { ShareButton, type ShareCardData } from "@/components/share-card";
import { formatDate, formatDuration } from "@/lib/format";
import { useAllSessions } from "@/lib/profile-queries";
import { useSession, useSessionExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useUnit } from "@/lib/settings";
import { useMuscleMap } from "@/lib/stats-queries";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

// Post-save celebration (Hevy-parity M9, plan §D). Shown once, over the fresh
// history detail, when the finish flow lands on `/history/:id?summary=1`:
// the ordinal workout number, the weekly streak (only when this is the first
// workout of the week), then swipeable stat slides — PRs, 7-day consistency,
// the workout overview, and the exercise list beside a session body heat map.
// Every slide carries a Share button (client-rendered PNG, no hosting).
export function PostSaveSummary({
  sessionId,
  onDismiss,
}: {
  sessionId: string;
  onDismiss: () => void;
}) {
  const { t } = useVoice();
  const { unit } = useUnit();
  const { data: session } = useSession(sessionId);
  const { data: blocks = [] } = useSessionExercises(sessionId);
  const { data: allSessions = [] } = useAllSessions();
  const { data: recordsData } = useRecordsData();
  const muscleMap = useMuscleMap();

  const startedAt = session?.startedAt ?? Date.now();

  // Ordinal workout number: how many workouts up to and including this one.
  const ordinal = useMemo(() => {
    const earlierOrEqual = allSessions.filter(
      (s) => s.startedAt <= startedAt,
    ).length;
    const present = allSessions.some((s) => s.id === sessionId);
    return Math.max(1, present ? earlierOrEqual : earlierOrEqual + 1);
  }, [allSessions, startedAt, sessionId]);

  // Streak — celebrated only on the first workout of the current week.
  const streak = useMemo(() => {
    const starts = [...allSessions.map((s) => s.startedAt), startedAt];
    return computeStreak(starts, FIRST_WEEKDAY, Date.now());
  }, [allSessions, startedAt]);
  const firstOfWeek = useMemo(() => {
    const wk = weekStart(startedAt, FIRST_WEEKDAY);
    const inWeek = allSessions.filter(
      (s) => s.id !== sessionId && weekStart(s.startedAt, FIRST_WEEKDAY) === wk,
    );
    return inWeek.every((s) => s.startedAt >= startedAt);
  }, [allSessions, startedAt, sessionId]);
  const showStreak = firstOfWeek && streak.weeks >= 1;

  // Overview totals.
  const setCount = blocks.reduce((n, b) => n + b.sets.length, 0);
  const volumeKg = blocks.reduce(
    (sum, b) =>
      sum + b.sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0),
    0,
  );
  const volume = toDisplayWeight(volumeKg, unit);
  const durationMs =
    session?.endedAt != null
      ? Math.max(
          0,
          session.endedAt - session.startedAt - (session.pausedMs ?? 0),
        )
      : 0;

  // PRs earned this session (from the client-computed records timeline).
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) m.set(b.exerciseId, b.exerciseName);
    return m;
  }, [blocks]);
  const prLines = useMemo(() => {
    const events = recordsData?.records.events ?? [];
    return events
      .filter((e) => e.sessionId === sessionId)
      .map(
        (e) =>
          `${nameById.get(e.exerciseId) ?? "Exercise"} · ${PR_TYPE_LABELS[e.prType]}`,
      );
  }, [recordsData, sessionId, nameById]);

  // 7-day consistency: trailing week of days, count of workouts each day.
  const week = useMemo(
    () =>
      sevenDayCounts(
        allSessions.map((s) => s.startedAt),
        Date.now(),
      ),
    [allSessions],
  );

  // Per-muscle set credit for this session's body heat map.
  const sessionMuscleSets = useMemo(
    () => muscleSetsFor(blocks, muscleMap),
    [blocks, muscleMap],
  );

  const title = session?.title || "Workout";
  const subtitle = formatDate(startedAt);
  const overviewStats: ShareCardData["stats"] = [
    { label: "Duration", value: formatDuration(durationMs) },
    { label: "Exercises", value: String(blocks.length) },
    { label: "Sets", value: String(setCount) },
    { label: "Volume", value: `${volume.toLocaleString()} ${unitLabel(unit)}` },
  ];

  // Slides — PRs slide only when at least one PR landed.
  const slides: { key: string; node: ReactElement }[] = [];

  slides.push({
    key: "hero",
    node: (
      <SlideShell
        share={{
          data: {
            kicker: `Workout #${ordinal}`,
            title,
            subtitle,
            stats: overviewStats,
            strong: prLines.length > 0,
          },
          filename: `workout-${ordinal}`,
          testId: "share-slide-hero",
        }}
      >
        <p className="text-2xs font-medium tracking-widest text-accent uppercase">
          {t("Workout complete", "Workout recorded")}
        </p>
        <p
          className="num mt-2 text-5xl font-bold tracking-tight"
          data-testid="summary-ordinal"
        >
          #{ordinal}
        </p>
        <p className="mt-1 text-sm text-soft">{title}</p>
        <p className="num mt-0.5 text-xs text-faint">{subtitle}</p>
        {showStreak && (
          <div
            className="mt-6 flex items-center gap-2 border border-border bg-surface-2 px-4 py-3"
            data-testid="summary-streak"
          >
            <Flame className="size-5 text-accent" />
            <span className="num text-sm">
              <span className="font-semibold">{streak.weeks}</span>
              <span className="text-soft">
                {" "}
                {t(
                  `week${streak.weeks === 1 ? "" : "s"} in a row`,
                  `week${streak.weeks === 1 ? "" : "s"} in a row. Consistency, n=${streak.weeks}.`,
                )}
              </span>
            </span>
          </div>
        )}
      </SlideShell>
    ),
  });

  if (prLines.length > 0) {
    slides.push({
      key: "prs",
      node: (
        <SlideShell
          share={{
            data: {
              kicker: `${prLines.length} new PR${prLines.length === 1 ? "" : "s"}`,
              title,
              subtitle,
              lines: prLines,
              strong: true,
            },
            filename: `workout-${ordinal}-prs`,
            testId: "share-slide-prs",
          }}
        >
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-accent" />
            <p className="text-sm font-semibold" data-testid="summary-pr-count">
              {t(
                `${prLines.length} new record${prLines.length === 1 ? "" : "s"}`,
                `${prLines.length} new record${prLines.length === 1 ? "" : "s"}. The frog is, on this occasion, impressed.`,
              )}
            </p>
          </div>
          <ul className="mt-4 flex w-full flex-col gap-2">
            {prLines.map((line) => (
              <li
                key={line}
                className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-2 text-left text-sm"
              >
                <Medal className="size-4 shrink-0 text-accent" />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </SlideShell>
      ),
    });
  }

  slides.push({
    key: "consistency",
    node: (
      <SlideShell
        share={{
          data: {
            kicker: "7-day consistency",
            title,
            subtitle,
            stats: [
              {
                label: "Workouts this week",
                value: String(week.filter((d) => d.count > 0).length),
              },
            ],
            strong: prLines.length > 0,
          },
          filename: `workout-${ordinal}-consistency`,
          testId: "share-slide-consistency",
        }}
      >
        <p className="text-sm font-semibold">Last 7 days</p>
        <div
          className="mt-6 flex items-end justify-center gap-3"
          data-testid="summary-consistency"
        >
          {week.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-2">
              <div className="flex h-16 items-end">
                <div
                  className={cn(
                    "w-6 transition-all duration-150",
                    d.count > 0 ? "bg-accent" : "bg-surface-3",
                  )}
                  style={{
                    height:
                      d.count > 0
                        ? `${Math.min(64, 24 + d.count * 20)}px`
                        : "6px",
                  }}
                />
              </div>
              <span className="num text-2xs text-faint">
                {WEEKDAY[new Date(d.key).getDay()]}
              </span>
            </div>
          ))}
        </div>
      </SlideShell>
    ),
  });

  slides.push({
    key: "overview",
    node: (
      <SlideShell
        share={{
          data: {
            kicker: "Workout summary",
            title,
            subtitle,
            stats: overviewStats,
            strong: prLines.length > 0,
          },
          filename: `workout-${ordinal}-summary`,
          testId: "share-slide-overview",
        }}
      >
        <p className="text-sm font-semibold">Overview</p>
        <dl
          className="mt-5 grid w-full grid-cols-2 gap-3"
          data-testid="summary-overview"
        >
          {overviewStats.map((s) => (
            <div
              key={s.label}
              className="border border-border bg-surface-2 px-3 py-3"
            >
              <dt className="text-2xs font-medium tracking-wide text-faint uppercase">
                {s.label}
              </dt>
              <dd className="num mt-1 text-2xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </SlideShell>
    ),
  });

  slides.push({
    key: "muscles",
    node: (
      <SlideShell
        share={{
          data: {
            kicker: "Muscles trained",
            title,
            subtitle,
            lines: blocks.map(
              (b) =>
                `${b.exerciseName} · ${b.sets.length} set${b.sets.length === 1 ? "" : "s"}`,
            ),
            strong: prLines.length > 0,
          },
          filename: `workout-${ordinal}-exercises`,
          testId: "share-slide-muscles",
        }}
      >
        <p className="text-sm font-semibold">Exercises</p>
        <div className="mt-3 w-full">
          <ul className="flex flex-col gap-1.5" data-testid="summary-exercises">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{b.exerciseName}</span>
                <span className="num shrink-0 text-2xs text-faint">
                  {b.sets.length} {b.sets.length === 1 ? "set" : "sets"}
                </span>
              </li>
            ))}
          </ul>
          <BodyHeatmap
            muscleSets={sessionMuscleSets}
            interactive={false}
            className="mx-auto mt-4 max-w-56"
            testId="summary-heatmap"
          />
        </div>
      </SlideShell>
    ),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      data-testid="post-save-summary"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">
          {t("Nice work", "The frog nods, slowly.")}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss"
          className="flex size-8 items-center justify-center text-soft transition-colors duration-150 hover:text-ink"
          data-testid="summary-dismiss"
        >
          <X className="size-5" />
        </button>
      </div>
      <SlideDeck slideKeys={slides.map((s) => s.key)}>
        {slides.map((s) => (
          <div
            key={s.key}
            className="w-full shrink-0 snap-center overflow-y-auto px-6 py-8"
          >
            {s.node}
          </div>
        ))}
      </SlideDeck>
    </div>
  );
}

// A single slide's centered content plus its Share action.
function SlideShell({
  children,
  share,
}: {
  children: ReactNode;
  share: { data: ShareCardData; filename: string; testId: string };
}) {
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
      <div className="flex w-full flex-col items-center">{children}</div>
      <div className="mt-8">
        <ShareButton
          data={share.data}
          filename={share.filename}
          testId={share.testId}
          variant="outline"
          size="sm"
        />
      </div>
    </div>
  );
}

// Horizontal snap deck with dot pagination. Native scroll = swipe on touch.
function SlideDeck({
  children,
  slideKeys,
}: {
  children: ReactNode;
  slideKeys: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {children}
      </div>
      {slideKeys.length > 1 && (
        <div
          className="flex shrink-0 items-center justify-center gap-2 py-4"
          data-testid="summary-dots"
        >
          {slideKeys.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() =>
                ref.current?.scrollTo({
                  left: i * ref.current.clientWidth,
                  behavior: "smooth",
                })
              }
              className={cn(
                "size-2 transition-colors duration-150",
                i === active ? "bg-accent" : "bg-surface-3",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Count workouts per day for the trailing 7 calendar days (oldest → newest).
function sevenDayCounts(
  starts: number[],
  now: number,
): { key: string; count: number }[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days: { key: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    days.push({ key: dayKey(d), count: 0 });
  }
  const index = new Map(days.map((d, i) => [d.key, i]));
  for (const s of starts) {
    const i = index.get(dayKey(new Date(s)));
    if (i !== undefined) days[i].count += 1;
  }
  return days;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Fractional per-muscle set counts for one session's blocks (primary 1 /
// secondary 0.5 via muscleCredits), for the summary body heat map.
function muscleSetsFor(
  blocks: { exerciseId: string; sets: unknown[] }[],
  muscleMap: MuscleByExercise,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of blocks) {
    const credits = muscleCredits(muscleMap.get(b.exerciseId));
    if (!credits.length || b.sets.length === 0) continue;
    for (const { muscle, credit } of credits) {
      out[muscle] = (out[muscle] ?? 0) + b.sets.length * credit;
    }
  }
  return out;
}
