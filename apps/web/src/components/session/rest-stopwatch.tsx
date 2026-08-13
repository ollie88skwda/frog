import { useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";

// mm:ss for an elapsed second count. The one formatter the rest stopwatch and
// its committed-set stamp share, so a running clock and the number it
// freezes into can never disagree.
export function mmss(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The rest stopwatch — the ONLY clock a rest period gets (session redesign
 * R3, "The Spotlight"). It counts UP from the moment a set was committed and
 * occupies the action zone's Log-button slot until it's stopped, naming the
 * set it measures. There is no target and no countdown: rest is measured,
 * not prescribed.
 *
 * Stopping (the first touch of the next set's input, or this button) stamps
 * the measured seconds onto the set it followed — see `stopRest` in the
 * session screen. Presentational: ticking here only drives the readout.
 */
export function RestStopwatch({
  startedAt,
  setNumber,
  onStop,
}: {
  startedAt: number;
  /** 1-based number of the set this rest FOLLOWS. */
  setNumber: number;
  onStop: () => void;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  return (
    <div
      role="status"
      className="flex h-13 w-full items-center gap-2.5 border border-accent bg-accent-soft px-3"
      data-testid="rest-stopwatch"
    >
      {/* Square, not a dot: circles are reserved for avatars and the frog
          mark. The pulse is the only motion here and it sits beside the
          numerals, never on them. */}
      <span
        aria-hidden="true"
        className="size-2 shrink-0 animate-pulse bg-accent"
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className="num shrink-0 text-2xl leading-none font-bold tabular-nums text-accent"
          data-testid="rest-elapsed"
        >
          {mmss(elapsed)}
        </span>
        <span className="min-w-0 text-2xs leading-tight text-accent">
          after set {setNumber} · stops on your next set
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onStop}
        title="Stop the rest stopwatch"
        data-testid="rest-stop"
      >
        Stop
      </Button>
    </div>
  );
}
