import { type PlateConfig, platesFor } from "@frog/core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Unit } from "@/lib/settings";
import { cn } from "@/lib/utils";

// Per-unit fallbacks when the user has no saved plate config (Hevy defaults).
const DEFAULTS: Record<Unit, { bar: number; plates: number[] }> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

function configFor(
  cfg: PlateConfig | null | undefined,
  unit: Unit,
): { bar: number; plates: number[] } {
  if (!cfg) return DEFAULTS[unit];
  if (unit === "kg")
    return {
      bar: cfg.barKg ?? DEFAULTS.kg.bar,
      plates: cfg.platesKg?.length ? cfg.platesKg : DEFAULTS.kg.plates,
    };
  return {
    bar: cfg.barLb ?? DEFAULTS.lb.bar,
    plates: cfg.platesLb?.length ? cfg.platesLb : DEFAULTS.lb.plates,
  };
}

// Merge an edited bar/plate set for one unit back into the full PlateConfig,
// preserving the other unit's values and the dumbbell step.
function mergeConfig(
  cfg: PlateConfig | null | undefined,
  unit: Unit,
  bar: number,
  plates: number[],
): PlateConfig {
  const base: PlateConfig = cfg ?? {
    barKg: DEFAULTS.kg.bar,
    platesKg: DEFAULTS.kg.plates,
    barLb: DEFAULTS.lb.bar,
    platesLb: DEFAULTS.lb.plates,
  };
  return unit === "kg"
    ? { ...base, barKg: bar, platesKg: plates }
    : { ...base, barLb: bar, platesLb: plates };
}

/**
 * Plate calculator sheet for bar-loaded exercises: shows the per-side stack for
 * the focused weight, or the closest achievable weight when the exact target
 * can't be built. "Manage" edits the bar + plate denominations for the active
 * display unit (persisted to user_prefs.plateConfig).
 */
export function PlateSheet({
  open,
  onOpenChange,
  target,
  unit,
  plateConfig,
  onSaveConfig,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: number | null;
  unit: Unit;
  plateConfig: PlateConfig | null | undefined;
  onSaveConfig: (cfg: PlateConfig) => void;
  testId?: string;
}) {
  const [managing, setManaging] = useState(false);
  const { bar, plates } = configFor(plateConfig, unit);
  const result =
    target != null && target > 0 ? platesFor(target, bar, plates) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Plate calculator" className="md:max-w-sm">
        <div className="flex flex-col gap-4" data-testid={testId}>
          {target == null || target <= 0 ? (
            <p className="text-xs text-faint">
              Enter a weight to see the plate breakdown.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between border-b border-border pb-3">
                <span className="num text-sm text-soft">
                  Target{" "}
                  <span className="text-ink">
                    {target} {unit}
                  </span>
                </span>
                <span className="num text-2xs text-faint">
                  {bar} {unit} bar
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                  Per side
                </span>
                {result && result.perSide.length > 0 ? (
                  <div
                    className="flex flex-wrap gap-1.5"
                    data-testid={testId ? `${testId}-perside` : undefined}
                  >
                    {result.perSide.map((p, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: plates repeat (e.g. 25,25) so position is the identity
                        key={`${p}-${i}`}
                        className="num flex h-8 min-w-8 items-center justify-center border border-border-strong bg-surface-2 px-2 text-xs text-ink"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="num text-xs text-faint">Just the bar.</p>
                )}
              </div>

              {result && !result.exact && (
                <p
                  className="num text-xs text-warn"
                  data-testid={testId ? `${testId}-closest` : undefined}
                >
                  Not buildable from your plates. Closest: {result.closest}{" "}
                  {unit}
                </p>
              )}
            </>
          )}

          <div className="border-t border-border pt-3">
            {managing ? (
              <ManagePlates
                unit={unit}
                bar={bar}
                plates={plates}
                onSave={(nextBar, nextPlates) => {
                  onSaveConfig(
                    mergeConfig(plateConfig, unit, nextBar, nextPlates),
                  );
                  setManaging(false);
                }}
                onCancel={() => setManaging(false)}
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManaging(true)}
                data-testid={testId ? `${testId}-manage` : undefined}
              >
                Manage plates & bar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManagePlates({
  unit,
  bar,
  plates,
  onSave,
  onCancel,
}: {
  unit: Unit;
  bar: number;
  plates: number[];
  onSave: (bar: number, plates: number[]) => void;
  onCancel: () => void;
}) {
  const [barDraft, setBarDraft] = useState(String(bar));
  const [platesDraft, setPlatesDraft] = useState(plates.join(", "));
  const labelCls = "text-2xs font-medium tracking-wide text-faint uppercase";

  function save() {
    const b = Number.parseFloat(barDraft);
    const p = platesDraft
      .split(",")
      .map((s) => Number.parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, z) => z - a);
    onSave(Number.isFinite(b) && b >= 0 ? b : bar, p.length ? p : plates);
  }

  return (
    <div className={cn("flex flex-col gap-3")}>
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Bar weight ({unit})</span>
        <Input
          inputMode="decimal"
          value={barDraft}
          onChange={(e) => setBarDraft(e.target.value)}
          className="num"
          data-testid="plate-manage-bar"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className={labelCls}>Available plates ({unit}, per side)</span>
        <Input
          inputMode="text"
          value={platesDraft}
          onChange={(e) => setPlatesDraft(e.target.value)}
          placeholder="25, 20, 15, 10, 5, 2.5"
          className="num"
          data-testid="plate-manage-plates"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          data-testid="plate-manage-save"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
