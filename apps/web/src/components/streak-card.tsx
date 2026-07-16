import { computeStreak } from "@sbl/core";
import { Flame } from "lucide-react";

// Weekly-streak summary card (Hevy-parity M6). A streak is consecutive calendar
// weeks with ≥1 logged workout; the current week counts even before its first
// workout (it can't be "missed" until it ends), so `currentWeekPending` is a
// gentle "log to keep it alive" nudge, not a broken streak. Shared by Home
// (compact landing card), Profile, and the Calendar header.

export function StreakCard({
  starts,
  firstWeekday,
  className,
}: {
  starts: number[];
  firstWeekday: number;
  className?: string;
}) {
  const { weeks, currentWeekPending, restDays } = computeStreak(
    starts,
    firstWeekday,
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
      className={`flex items-center justify-between gap-4 border border-border bg-surface p-4 ${className ?? ""}`}
      data-testid="streak-card"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-2xs font-medium tracking-widest text-faint uppercase">
          <Flame className="size-3.5" />
          Streak
        </div>
        <p className="mt-1 flex items-baseline gap-1">
          <span
            className="num text-2xl font-semibold"
            data-testid="streak-weeks"
          >
            {weeks}
          </span>
          <span className="text-sm text-soft">
            {weeks === 1 ? "week" : "weeks"}
          </span>
        </p>
        {weeks > 0 && currentWeekPending && (
          <p className="mt-0.5 text-2xs text-faint">
            Log this week to keep it going.
          </p>
        )}
        {weeks === 0 && (
          <p className="mt-0.5 text-2xs text-faint">
            Log a workout this week to start one.
          </p>
        )}
      </div>
      <span
        className="num shrink-0 text-xs text-soft"
        data-testid="streak-rest"
      >
        {rest}
      </span>
    </div>
  );
}
