import {
  jointActionLabel,
  muscleLabel,
  primaryMuscles,
  rankSwaps,
  type SlotOverride,
  type SwapCandidate,
  secondaryMuscles,
  stabilityRank,
  type ViewSlot,
} from "@frog/core";
import { Minus, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChipItem } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { creditDelta, formatReps, REP_PRESETS, RIR_PRESETS } from "./logic";

const STABILITY_WORD: Record<number, string> = {
  5: "Machine",
  4: "Cable",
  3: "Free weight",
  2: "Barbell",
  1: "Bodyweight",
};

/** Sets ±, rep and RIR presets for one slot (R8b, R10). Edits apply on Done. */
export function EditSlotSheet({
  open,
  onOpenChange,
  title,
  slot,
  sessionId,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  slot: ViewSlot;
  sessionId?: string;
  onApply: (o: SlotOverride) => void;
}) {
  const [sets, setSets] = useState(slot.rx.sets);
  const [reps, setReps] = useState<[number, number]>(slot.rx.reps);
  const [rir, setRir] = useState<[number, number]>(slot.rx.rir);
  const repId = REP_PRESETS.find(
    (p) => p.reps[0] === reps[0] && p.reps[1] === reps[1],
  )?.id;
  const rirId = RIR_PRESETS.find(
    (p) => p.rir[0] === rir[0] && p.rir[1] === rir[1],
  )?.id;
  // Two presets share 4-8 (compound, isolation); pick by role for display.
  const shownRep =
    reps[0] === 4 && reps[1] === 8
      ? slot.role === "isolation"
        ? "iso-heavy"
        : "compound"
      : repId;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} aria-describedby={undefined}>
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-soft">Sets</h3>
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                aria-label="Fewer sets"
                disabled={sets <= 1}
                onClick={() => setSets((n) => Math.max(1, n - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <span
                className="num w-8 text-center text-lg font-bold"
                data-testid="slot-sets"
              >
                {sets}
              </span>
              <Button
                size="icon"
                aria-label="More sets"
                disabled={sets >= 8}
                onClick={() => setSets((n) => Math.min(8, n + 1))}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-soft">Reps</h3>
            <ChipGroup
              value={shownRep ?? ""}
              onValueChange={(v) => {
                const p = REP_PRESETS.find((x) => x.id === v);
                if (p) setReps([...p.reps]);
              }}
              aria-label="Rep range"
            >
              {REP_PRESETS.map((p) => (
                <ChipItem key={p.id} value={p.id}>
                  {p.label}
                </ChipItem>
              ))}
            </ChipGroup>
            <p className="text-xs text-soft">
              Now <span className="num">{formatReps(reps)}</span> reps. Any load
              near failure can grow muscle; these are practical ranges.
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-soft">Reps in reserve</h3>
            <ChipGroup
              value={rirId ?? ""}
              onValueChange={(v) => {
                const p = RIR_PRESETS.find((x) => x.id === v);
                if (p) setRir([...p.rir]);
              }}
              aria-label="Reps in reserve"
            >
              {RIR_PRESETS.map((p) => (
                <ChipItem key={p.id} value={p.id}>
                  {p.label}
                </ChipItem>
              ))}
            </ChipGroup>
          </section>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-testid="slot-apply"
              onClick={() => {
                onApply({
                  slot: slot.slot,
                  session: sessionId,
                  sets,
                  reps,
                  rir,
                });
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Swap sheet (F14): same primary muscle, ranked region cell → joint action →
 * stability (R12b, R13), each row showing how the weekly meter moves.
 */
export function SwapSheet({
  open,
  onOpenChange,
  current,
  library,
  slot,
  currentRegion,
  regionOf,
  perWeek,
  excludeIds,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: SwapCandidate;
  library: readonly SwapCandidate[];
  slot: ViewSlot;
  currentRegion: string | null;
  regionOf: (exerciseId: string) => string | null;
  perWeek: number;
  excludeIds: ReadonlySet<string>;
  onPick: (e: SwapCandidate) => void;
}) {
  const [q, setQ] = useState("");
  const ranked = useMemo(
    () =>
      rankSwaps(current, library, {
        currentRegion,
        regionOf,
        excludeIds,
      }),
    [current, library, currentRegion, regionOf, excludeIds],
  );
  const shown = ranked
    .filter((r) =>
      r.exercise.name.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .slice(0, 40);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Swap ${current.name}`}
        aria-describedby={undefined}
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-soft">
            Same main muscle, easiest to load first. Stable means easier to load
            and progress, not faster growth (R13).
          </p>
          <Input
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search swaps"
          />
          <ul className="flex flex-col gap-1" data-testid="swap-list">
            {shown.map((r) => {
              const next = {
                direct: primaryMuscles(r.exercise.muscleTargets as never),
                indirect: secondaryMuscles(r.exercise.muscleTargets as never),
              };
              const delta = creditDelta(slot, next, perWeek);
              return (
                <li key={r.exercise.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r.exercise);
                      onOpenChange(false);
                    }}
                    data-testid={`swap-${r.exercise.name}`}
                    className="flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-md bg-surface-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
                  >
                    <span className="text-sm font-semibold text-ink">
                      {r.exercise.name}
                    </span>
                    <span className="text-xs text-soft">
                      {[
                        r.sameRegion ? "Same region" : null,
                        r.sharedActions.length
                          ? jointActionLabel(r.sharedActions[0])
                          : null,
                        STABILITY_WORD[stabilityRank(r.exercise.equipment)] ??
                          null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="num text-xs text-soft">
                      {delta.length === 0
                        ? "Weekly sets unchanged"
                        : `${delta
                            .slice(0, 3)
                            .map(
                              (d) =>
                                `${d.label} ${d.delta > 0 ? "+" : ""}${d.delta}`,
                            )
                            .join(" · ")} sets/wk`}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="py-6 text-center text-xs text-soft">
                No other{" "}
                {primaryMuscles(current.muscleTargets as never)
                  .map(muscleLabel)
                  .join(", ") || "matching"}{" "}
                exercises to swap in.
              </li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
