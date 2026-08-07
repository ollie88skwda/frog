import { X } from "lucide-react";
import { useEffect, useReducer } from "react";
import { RestTimerIcon } from "@/components/session/rest-timer-icon";

export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The running rest stopwatch, docked as a floating bar above the mobile tab
 * island (bottom of the content column on desktop). One bar per session — it
 * shows the most recently started stopwatch and names its exercise; any older
 * one keeps ticking in the background (the block header's rest icon keeps
 * glowing while it does) and takes the dock as it frees up. Presentational: ticking here only drives the display, it
 * never times out — there's no target to count down to, just Stop.
 */
export function RestDock({
  since,
  exerciseName,
  onStop,
  testId,
}: {
  since: number;
  exerciseName: string;
  onStop: () => void;
  testId?: string;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((Date.now() - since) / 1000);

  return (
    // Mobile: clears the floating tab island (56px tall + its 12px margin +
    // safe area). Desktop: `left-56` is the sidebar, so `mx-auto max-w-2xl px-4`
    // lands the dock exactly on the content column rather than on the viewport.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4 md:left-56">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div
          className="floating pointer-events-auto relative flex items-center gap-3 px-3 py-2"
          data-testid={testId}
        >
          <RestTimerIcon className="size-5 shrink-0 text-soft" />

          <span
            className="num shrink-0 text-[26px] leading-none font-medium tabular-nums text-ink"
            data-testid={testId ? `${testId}-value` : undefined}
          >
            {mmss(elapsed)}
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-2xs tracking-widest text-faint uppercase">
              Rest
            </span>
            <span className="truncate text-2xs text-soft">{exerciseName}</span>
          </span>

          <button
            type="button"
            onClick={onStop}
            title="Stop"
            className="flex size-10 shrink-0 items-center justify-center border border-border bg-surface-2 text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
            data-testid={testId ? `${testId}-stop` : undefined}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
