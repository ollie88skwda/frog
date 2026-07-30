import { computeStreak, FIRST_WEEKDAY } from "@frog/core";
import { Flame } from "lucide-react";
import { useVoice } from "@/lib/voice";

// Weekly-streak summary card (Hevy-parity M6). A streak is consecutive calendar
// weeks with ≥1 logged workout; the current week counts even before its first
// workout (it can't be "missed" until it ends), so `currentWeekPending` is a
// gentle "log to keep it alive" nudge, not a broken streak. Shared by Home
// (compact landing card), Profile, and the Calendar header.

export function StreakCard({
  starts,
  className,
}: {
  starts: number[];
  className?: string;
}) {
  const { t } = useVoice();
  const { weeks, currentWeekPending, restDays } = computeStreak(
    starts,
    FIRST_WEEKDAY,
    Date.now(),
  );

  const rest =
    restDays == null
      ? "No workouts yet"
      : restDays === 0
        ? "Trained today"
        : `${restDays} rest ${restDays === 1 ? "day" : "days"}`;

  return (
    <div
      className={`border border-border bg-surface p-4 ${className ?? ""}`}
      data-testid="streak-card"
    >
      <div className="flex items-center gap-1.5 text-2xs font-medium tracking-widest text-faint uppercase">
        <Flame className="size-3.5" />
        {t("Streak", "Consistency")}
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="num text-2xl font-semibold" data-testid="streak-weeks">
          {weeks}
        </span>
        <span className="text-sm text-soft">
          {weeks === 1 ? "week" : "weeks"}
        </span>
        <span className="num text-xs text-soft" data-testid="streak-rest">
          · {rest}
        </span>
      </p>
      {weeks > 0 && currentWeekPending && (
        <p className="mt-0.5 text-2xs text-faint">
          {t(
            "Log this week to keep it going.",
            `Consistency, n=${weeks}. Log this week to keep it.`,
          )}
        </p>
      )}
      {weeks === 0 && (
        <p className="mt-0.5 text-2xs text-faint">
          {t(
            "Log a workout this week to start one.",
            "The frog refuses to speculate. Log a workout this week to start.",
          )}
        </p>
      )}
    </div>
  );
}
