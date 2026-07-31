import {
  buildPrCard,
  buildSessionCard,
  buildStreakCard,
  computeStreak,
  type ExerciseType,
  epley,
  FIRST_WEEKDAY,
  PR_TYPE_LABELS,
  type SessionCardBlock,
  setVolumeKg,
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
import { ShareButton, type ShareSource } from "@/components/share-sheet";
import { formatDate } from "@/lib/format";
import { useAllSessions, useUserPrefs } from "@/lib/profile-queries";
import { useExercises, useSession, useSessionExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useUnit } from "@/lib/settings";
import { ordinalFor } from "@/lib/share/ordinal";
import { useLatestBodyweightQuery, useMuscleMap } from "@/lib/stats-queries";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Post-save celebration (Hevy-parity M9, plan §D; redesigned per the share
// system rebuild — docs/DECISIONS.md). Shown once, over the fresh history
// detail, when the finish flow lands on `/history/:id?summary=1`: the
// ordinal workout number, the weekly streak (only when this is the first
// workout of the week), then up to THREE swipeable share slides — Session
// (always), PR (only when one landed this session), Streak (only when the
// streak extended). The old overview/exercise-list slides are cut: they
// repeated the Session slide's own numbers, or listed exercise names nobody
// reads at thumbnail size (report §5.4 "carousel discipline").
export function PostSaveSummary({
  sessionId,
  onDismiss,
}: {
  sessionId: string;
  onDismiss: () => void;
}) {
  const { t } = useVoice();
  const { unit } = useUnit();
  const { data: session, isPending: sessionPending } = useSession(sessionId);
  const { data: blocks = [], isPending: blocksPending } =
    useSessionExercises(sessionId);
  const { data: allSessions = [], isPending: sessionsPending } =
    useAllSessions();
  const { data: recordsData, isLoading: recordsPending } = useRecordsData();
  const { data: exercises = [], isPending: exercisesPending } = useExercises();
  const { data: prefs, isPending: prefsPending } = useUserPrefs();
  const muscleMap = useMuscleMap();
  const { data: bodyweightKg = null, isPending: bodyweightPending } =
    useLatestBodyweightQuery();

  // Every query a card reads, not just the ones that happen to be racy: the
  // finish flow lands here straight from a session, so `sessions-all` (only
  // warmed by home/profile/calendar) can be cold, `session-exercises` is
  // guaranteed cold (gcTime 0, dropped when the session screen unmounts), and
  // `records-data` is the heaviest fetch in the app. Each feeds a number a card
  // states as fact — the ordinal, the date and duration, every set and its
  // volume, the week's totals, the identity handle. Hold the Share affordance,
  // not the truth (the same gate history-detail.tsx applies to the same card).
  const shareDataPending =
    sessionPending ||
    blocksPending ||
    sessionsPending ||
    recordsPending ||
    exercisesPending ||
    prefsPending ||
    bodyweightPending;

  const startedAt = session?.startedAt ?? Date.now();
  const identity = useMemo(
    () => ({ displayName: prefs?.displayName ?? null }),
    [prefs],
  );

  const ordinal = useMemo(
    () => ordinalFor(allSessions, sessionId, startedAt),
    [allSessions, sessionId, startedAt],
  );

  // Streak — celebrated (and only offered as a share slide) on the first
  // workout of the current week.
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

  const durationMs =
    session?.endedAt != null
      ? Math.max(
          0,
          session.endedAt - session.startedAt - (session.pausedMs ?? 0),
        )
      : 0;

  const exerciseTypeById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.exerciseType as ExerciseType])),
    [exercises],
  );
  const shareBlocks: SessionCardBlock[] = useMemo(
    () =>
      blocks.map((b) => ({
        exerciseId: b.exerciseId,
        exerciseName: b.exerciseName,
        exerciseType: exerciseTypeById.get(b.exerciseId) ?? "weight_reps",
        sets: b.sets,
      })),
    [blocks, exerciseTypeById],
  );

  const buildShareCard = useMemo(
    () => (heroSet?: Parameters<typeof buildSessionCard>[0]["heroSet"]) =>
      buildSessionCard({
        ordinal,
        title: session?.title || "Workout",
        date: formatDate(startedAt),
        durationMs,
        blocks: shareBlocks,
        muscles: muscleMap,
        bodyweightKg,
        unit,
        identity,
        heroSet,
      }),
    [
      ordinal,
      session,
      startedAt,
      durationMs,
      shareBlocks,
      muscleMap,
      bodyweightKg,
      unit,
      identity,
    ],
  );
  const sessionSource: ShareSource = useMemo(
    () => ({ kind: "session", blocks: shareBlocks, build: buildShareCard }),
    [shareBlocks, buildShareCard],
  );

  // PRs earned this session (from the client-computed records timeline).
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of blocks) m.set(b.exerciseId, b.exerciseName);
    return m;
  }, [blocks]);
  const sessionPrEvents = useMemo(
    () =>
      (recordsData?.records.events ?? []).filter(
        (e) => e.sessionId === sessionId,
      ),
    [recordsData, sessionId],
  );
  // Hero = the largest delta (or raw value, when there's no previous best to
  // delta against) — report §5.2 Type 2 "hero = the largest delta".
  const heroPrEvent = useMemo(() => {
    if (sessionPrEvents.length === 0) return null;
    return [...sessionPrEvents].sort((a, b) => {
      const da = a.previous != null ? a.value - a.previous : a.value;
      const db = b.previous != null ? b.value - b.previous : b.value;
      return db - da;
    })[0];
  }, [sessionPrEvents]);
  // e1RM sparkline for the hero PR's exercise, last 12 sessions.
  const prSparkline = useMemo(() => {
    if (!heroPrEvent) return [];
    const out: Array<{ at: number; value: number }> = [];
    for (const s of recordsData?.history ?? []) {
      const block = s.exercises.find(
        (e) => e.exerciseId === heroPrEvent.exerciseId,
      );
      if (!block) continue;
      let best: number | null = null;
      for (const set of block.sets) {
        if (set.weightKg == null || set.reps == null || set.reps < 1) continue;
        const e = epley(set.weightKg, set.reps);
        if (e != null && (best == null || e > best)) best = e;
      }
      if (best != null) out.push({ at: s.startedAt, value: best });
    }
    return out.slice(-12);
  }, [heroPrEvent, recordsData]);
  const prSource: ShareSource | null = useMemo(() => {
    if (!heroPrEvent) return null;
    const extraPrLabels = sessionPrEvents
      .filter((e) => e !== heroPrEvent)
      .map(
        (e) =>
          `${nameById.get(e.exerciseId) ?? "Exercise"} · ${PR_TYPE_LABELS[e.prType]}`,
      );
    return {
      kind: "static",
      card: buildPrCard({
        event: heroPrEvent,
        prTypeLabel: PR_TYPE_LABELS[heroPrEvent.prType],
        exerciseName: nameById.get(heroPrEvent.exerciseId) ?? "Exercise",
        unit,
        distUnit: unit === "lb" ? "mi" : "km",
        estOneRmKg:
          heroPrEvent.prType === "best_e1rm" ? heroPrEvent.value : null,
        sparkline: prSparkline,
        extraPrLabels,
        identity,
      }),
    };
  }, [heroPrEvent, sessionPrEvents, nameById, unit, prSparkline, identity]);

  // Streak share slide: this week's volume comes from the same records
  // history the PR sparkline above already reads (no extra fetch).
  const streakSource: ShareSource | null = useMemo(() => {
    if (!showStreak) return null;
    const thisWeekStart = weekStart(startedAt, FIRST_WEEKDAY);
    const weekSessions = (recordsData?.history ?? []).filter(
      (s) => s.startedAt >= thisWeekStart && s.startedAt <= startedAt,
    );
    const volumeKgThisWeek = weekSessions.reduce(
      (sum, s) =>
        sum +
        s.exercises.reduce(
          (s2, e) =>
            s2 +
            e.sets.reduce(
              (s3, set) =>
                s3 +
                setVolumeKg(e.exerciseType as ExerciseType, set, bodyweightKg),
              0,
            ),
          0,
        ),
      0,
    );
    const weeksWithWork = new Set(
      allSessions.map((s) => weekStart(s.startedAt, FIRST_WEEKDAY)),
    );
    weeksWithWork.add(thisWeekStart);
    let cursor = weekStart(startedAt, FIRST_WEEKDAY);
    const last13Weeks: boolean[] = [];
    for (let i = 0; i < 13; i++) {
      last13Weeks.unshift(weeksWithWork.has(cursor));
      cursor = weekStart(cursor - WEEK_MS / 2, FIRST_WEEKDAY);
    }
    return {
      kind: "static",
      card: buildStreakCard({
        weeksStreak: streak.weeks,
        workoutsThisWeek: weekSessions.length,
        volumeKgThisWeek,
        restDays: streak.restDays,
        last13Weeks,
        unit,
        identity,
      }),
    };
  }, [
    showStreak,
    startedAt,
    recordsData,
    bodyweightKg,
    allSessions,
    streak,
    unit,
    identity,
  ]);

  const title = session?.title || "Workout";
  const subtitle = formatDate(startedAt);

  const slides: { key: string; node: ReactElement }[] = [
    {
      key: "session",
      node: (
        <SlideShell
          source={sessionSource}
          sessionId={sessionId}
          sharePending={shareDataPending}
          filename={`workout-${ordinal}`}
          testId="share-slide-hero"
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
    },
  ];

  if (prSource && heroPrEvent) {
    slides.push({
      key: "pr",
      node: (
        <SlideShell
          source={prSource}
          tone="pr"
          sharePending={shareDataPending}
          filename={`workout-${ordinal}-pr`}
          testId="share-slide-pr"
        >
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-accent" />
            <p className="text-sm font-semibold" data-testid="summary-pr-count">
              {t(
                `${sessionPrEvents.length} new record${sessionPrEvents.length === 1 ? "" : "s"}`,
                `${sessionPrEvents.length} new record${sessionPrEvents.length === 1 ? "" : "s"}. The frog is, on this occasion, impressed.`,
              )}
            </p>
          </div>
          <ul className="mt-4 flex w-full flex-col gap-2">
            {sessionPrEvents.map((e) => (
              <li
                key={`${e.exerciseId}-${e.prType}`}
                className="flex items-center gap-2 border border-border bg-surface-2 px-3 py-2 text-left text-sm"
              >
                <Medal className="size-4 shrink-0 text-accent" />
                <span className="truncate">
                  {nameById.get(e.exerciseId) ?? "Exercise"} ·{" "}
                  {PR_TYPE_LABELS[e.prType]}
                </span>
              </li>
            ))}
          </ul>
        </SlideShell>
      ),
    });
  }

  if (streakSource) {
    slides.push({
      key: "streak",
      node: (
        <SlideShell
          source={streakSource}
          tone="streak"
          sharePending={shareDataPending}
          filename={`workout-${ordinal}-streak`}
          testId="share-slide-streak"
        >
          <p className="text-sm font-semibold">
            {t("Streak extended", "The streak holds, n>0.")}
          </p>
          <p
            className="num mt-4 text-5xl font-bold tracking-tight"
            data-testid="summary-streak-weeks"
          >
            {streak.weeks}
            <span className="ml-2 text-lg font-normal text-soft">
              {streak.weeks === 1 ? "week" : "weeks"}
            </span>
          </p>
        </SlideShell>
      ),
    });
  }

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
  source,
  sessionId,
  tone,
  sharePending,
  filename,
  testId,
}: {
  children: ReactNode;
  source: ShareSource;
  sessionId?: string;
  tone?: "pr" | "streak" | "heavy" | "normal";
  sharePending: boolean;
  filename: string;
  testId: string;
}) {
  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
      <div className="flex w-full flex-col items-center">{children}</div>
      <div className="mt-8">
        <ShareButton
          source={source}
          sessionId={sessionId}
          tone={tone}
          disabled={sharePending}
          filename={filename}
          testId={testId}
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
