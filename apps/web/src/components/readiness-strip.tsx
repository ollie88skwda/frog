import { isConditionTracked, SEED_CONDITIONS } from "@frog/core";
import { Minus, Plus } from "@phosphor-icons/react";
import { IconButton } from "@/components/ui/icon-button";
import { useTrackedConditions } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Today's check-in (F5, C7/C9d: readiness before the first set). Values are
 * keyed by seeded condition metric id, the same shape as
 * `sessions.conditionValues`, so they are written straight onto the session at
 * start. Optional: leaving it untouched writes nothing. */
export type Readiness = Record<string, number | undefined>;

const SLEEP = SEED_CONDITIONS.sleepH;
const STRESS = SEED_CONDITIONS.stress;
const CAFFEINE = SEED_CONDITIONS.caffeineMg;

/** Drop undefined entries so the written values are exactly what was entered. */
export function readinessToConditions(r: Readiness): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) if (v != null) out[k] = v;
  return out;
}

export function ReadinessStrip({
  value,
  onChange,
  onSkip,
  skipped,
}: {
  value: Readiness;
  onChange: (next: Readiness) => void;
  onSkip: () => void;
  skipped: boolean;
}) {
  const { data: prefs = [] } = useTrackedConditions();
  const prefsSimple = prefs.map((p) => ({
    metricId: p.metricId,
    tracked: p.tracked,
  }));
  const caffeineOn = isConditionTracked(CAFFEINE, prefsSimple, []);
  const sleep = value[SLEEP];
  const stress = value[STRESS];
  const set = (id: string, v: number | undefined) =>
    onChange({ ...value, [id]: v });
  const stepSleep = (d: number) =>
    set(SLEEP, Math.min(14, Math.max(0, (sleep ?? 7.5) + d)));

  if (skipped) {
    return (
      <div className="mt-4 flex items-center justify-between rounded-md bg-surface px-4 py-2">
        <span className="text-xs text-soft">Check-in skipped</span>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
        >
          Add
        </button>
      </div>
    );
  }

  return (
    <section
      className="mt-4 rounded-md bg-surface px-4 py-3"
      data-testid="readiness-strip"
      aria-label="Readiness check-in"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-soft">Readiness</h2>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
          data-testid="readiness-skip"
        >
          Skip
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm text-ink">Sleep</span>
        <div className="flex items-center gap-1">
          <IconButton title="Less sleep" onClick={() => stepSleep(-0.5)}>
            <Minus className="size-4" />
          </IconButton>
          <span
            className="num w-16 text-center text-sm font-semibold text-ink"
            data-testid="readiness-sleep"
          >
            {sleep == null ? "–" : `${sleep} h`}
          </span>
          <IconButton title="More sleep" onClick={() => stepSleep(0.5)}>
            <Plus className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink">Stress</span>
          <span className="num text-2xs text-faint">
            {stress == null ? "1 calm · 10 maxed" : `${stress} of 10`}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Stress ${n}`}
              aria-pressed={stress === n}
              data-testid={`readiness-stress-${n}`}
              onClick={() => set(STRESS, stress === n ? undefined : n)}
              className={cn(
                "num h-10 rounded-sm text-xs font-semibold transition-colors duration-150 md:h-8",
                stress === n
                  ? "bg-accent text-accent-fg"
                  : "bg-translucent text-soft hover:bg-surface-hover",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {caffeineOn && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm text-ink">Caffeine</span>
          <div className="flex items-center gap-1">
            <IconButton
              title="Less caffeine"
              onClick={() =>
                set(CAFFEINE, Math.max(0, (value[CAFFEINE] ?? 0) - 50))
              }
            >
              <Minus className="size-4" />
            </IconButton>
            <span className="num w-16 text-center text-sm font-semibold text-ink">
              {value[CAFFEINE] ?? 0} mg
            </span>
            <IconButton
              title="More caffeine"
              onClick={() => set(CAFFEINE, (value[CAFFEINE] ?? 0) + 50)}
            >
              <Plus className="size-4" />
            </IconButton>
          </div>
        </div>
      )}

      {/* R22/C8: a bad night is a note, not a reason to cut weekly volume. */}
      <p className="mt-3 text-2xs text-faint">
        One rough night never changes your weekly volume. Frog only notes it.
      </p>
    </section>
  );
}
