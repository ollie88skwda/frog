import { useEffect, useReducer, useRef, useState } from "react";
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
 * Press-and-hold on the top-bar clock: after ~450 ms it reports `held` (the
 * caller reveals the session length while it's true) and swallows the click
 * that follows the release, so a hold never also stops rest / opens a menu.
 */
export function useHoldReveal() {
  const [held, setHeld] = useState(false);
  const t = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const end = () => {
    window.clearTimeout(t.current);
    setHeld(false);
  };
  return {
    held,
    bind: {
      onPointerDown: (e: { pointerType: string; button: number }) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        fired.current = false;
        window.clearTimeout(t.current);
        t.current = window.setTimeout(() => {
          fired.current = true;
          setHeld(true);
        }, 450);
      },
      onPointerUp: end,
      onPointerLeave: end,
      onPointerCancel: end,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
    /** True (once) when the click that just happened ended a hold. */
    consumeHold: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}

/** The floating "Session 12:04" readout a hold on the clock reveals. */
export function SessionLengthReveal({ text }: { text: string }) {
  return (
    <span
      role="status"
      className="floating num pointer-events-none absolute top-full left-0 z-30 mt-1 flex items-baseline gap-2 px-3 py-2 whitespace-nowrap"
      data-testid="session-length-reveal"
    >
      <span className="text-2xs font-bold tracking-widest text-soft uppercase">
        Session
      </span>
      <span className="text-lg font-bold text-ink">{text}</span>
    </span>
  );
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
  compact = false,
  sessionText,
}: {
  /** Total session length, revealed while the compact clock is held. */
  sessionText?: () => string;
  startedAt: number;
  /** 1-based number of the set this rest FOLLOWS. */
  setNumber: number;
  onStop: () => void;
  /** Top-bar clock form: one pill, tap to stop. */
  compact?: boolean;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const hold = useHoldReveal();

  if (compact) {
    return (
      <span className="relative shrink-0">
        <button
          type="button"
          {...hold.bind}
          onClick={() => {
            if (hold.consumeHold()) return;
            onStop();
          }}
          title={`Resting after set ${setNumber} — tap to stop, hold for session length`}
          className="rounded-sm num flex h-11 touch-manipulation items-center gap-2 bg-accent-soft px-3 text-sm font-semibold text-accent-ink select-none [-webkit-touch-callout:none]"
          data-testid="rest-stopwatch"
          data-clock-kind="rest"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-xs bg-accent-ink"
          />
          <span
            className="text-2xs font-bold tracking-widest uppercase"
            data-testid="clock-kind"
          >
            Rest
          </span>
          <span data-testid="rest-elapsed" className="tabular-nums">
            {mmss(elapsed)}
          </span>
          <span data-testid="rest-stop" className="sr-only">
            Stop
          </span>
        </button>
        {hold.held && sessionText && (
          <SessionLengthReveal text={sessionText()} />
        )}
      </span>
    );
  }

  return (
    <div
      role="status"
      className="rounded-md flex h-13 w-full items-center gap-2.5 bg-accent-soft px-3"
      data-testid="rest-stopwatch"
    >
      {/* Square, not a dot: circles are reserved for avatars and the frog
          mark. The pulse is the only motion here and it sits beside the
          numerals, never on them. */}
      <span
        aria-hidden="true"
        className="size-2 shrink-0 animate-pulse rounded-xs bg-accent-ink"
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className="num shrink-0 text-2xl leading-none font-bold tabular-nums text-accent-ink"
          data-testid="rest-elapsed"
        >
          {mmss(elapsed)}
        </span>
        <span className="min-w-0 text-2xs leading-tight text-accent-ink">
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
