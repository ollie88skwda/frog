import { isConditionTracked, SEED_CONDITIONS } from "@frog/core";
import { Minus, Plus } from "@phosphor-icons/react";
import { InfoTip } from "@/components/lesson";
import { IconButton } from "@/components/ui/icon-button";
import { ScaleSlider } from "@/components/ui/scale-slider";
import { useTrackedConditions } from "@/lib/queries";

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
          className="inline-flex h-11 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
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
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-soft">Readiness</h2>
          <InfoTip lessonId="readiness" />
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-11 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary md:h-8"
          data-testid="readiness-skip"
        >
          Skip
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm text-ink">Sleep</span>
        <div className="flex items-center gap-2">
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
          <span className="num text-sm font-semibold text-ink">
            {stress == null ? (
              <span className="font-normal text-faint">Not set</span>
            ) : (
              <>
                {stress}
                <span className="font-normal text-faint"> / 10</span>
              </>
            )}
          </span>
        </div>
        <ScaleSlider
          label="Stress, 1 calm to 10 maxed out"
          value={stress}
          onChange={(v) => set(STRESS, v)}
          testId="readiness-stress"
        />
      </div>

      {caffeineOn && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm text-ink">Caffeine</span>
          <div className="flex items-center gap-2">
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
    </section>
  );
}
