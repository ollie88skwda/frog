import { ChevronUp, Plus, Square, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type StationSummary = {
  id: string;
  /** Station label — one exercise, or a superset's members joined. */
  label: string;
  /** Physical sets logged across the station's members. */
  done: number;
  /** Sets the routine/copy seed planned (0 = ad-hoc, no plan). */
  planned: number;
  /** "Hoist · Chest Press", or null when nothing is attached. */
  machine: string | null;
};

/** "2/3", or "2" when the station has no planned set count. */
export function progressLabel(s: StationSummary): string {
  return s.planned > 0 ? `${s.done}/${s.planned}` : String(s.done);
}

export function isStationComplete(s: StationSummary): boolean {
  return s.planned > 0 && s.done >= s.planned;
}

/**
 * The pull-up handle that opens the session overview. Focus Deck shows one
 * station at a time, so whole-session visibility is deliberately one tap
 * away rather than always on screen — this is that tap, and it says what it
 * costs (which station you're on, out of how many).
 */
export function OverviewHandle({
  position,
  count,
  onOpen,
}: {
  position: number;
  count: number;
  onOpen: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="lg"
      className="w-full"
      onClick={onOpen}
      data-testid="session-overview-handle"
    >
      <ChevronUp className="size-4" />
      Session overview · station {position} of {count}
    </Button>
  );
}

/**
 * The whole-workout view (session redesign R2, option D): every station with
 * its progress and machine, tap to jump, reorder, add an exercise, finish.
 * A bottom sheet on mobile / centered card on desktop — ui/dialog already is
 * exactly that drawer (Vaul would be a second, redundant bottom-sheet
 * implementation and a new dependency against the bundle budget).
 */
export function SessionOverview({
  open,
  onOpenChange,
  stations,
  activeId,
  onJump,
  onMove,
  onAddExercise,
  addTestId,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stations: StationSummary[];
  activeId: string | null;
  onJump: (id: string) => void;
  /** Move a station one slot up (-1) or down (+1) in the session order. */
  onMove: (id: string, delta: -1 | 1) => void;
  onAddExercise: () => void;
  /** The deck already carries the primary "Add exercise"; this one needs its
   * own id so the two never collide in a query. */
  addTestId: string;
  onFinish: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Session overview" className="md:max-w-md">
        <ul
          className="flex flex-col border border-border"
          data-testid="session-overview-list"
        >
          {stations.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-1 border-border not-first:border-t",
                s.id === activeId ? "bg-accent-soft" : "bg-surface",
              )}
            >
              <button
                type="button"
                onClick={() => onJump(s.id)}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 px-2 py-1.5 text-left transition-colors duration-100 hover:bg-surface-hover"
                data-testid={`overview-jump-${s.label}`}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "num shrink-0 text-2xs tabular-nums",
                      isStationComplete(s) ? "text-accent" : "text-faint",
                    )}
                    data-testid={`overview-progress-${s.label}`}
                  >
                    {progressLabel(s)}
                    {isStationComplete(s) ? " ✓" : ""}
                  </span>
                </span>
                {s.machine && (
                  <span className="flex min-w-0 items-center gap-1 text-2xs text-faint">
                    <Wrench className="size-3 shrink-0" />
                    <span className="truncate">{s.machine}</span>
                  </span>
                )}
              </button>
              <span className="flex shrink-0 items-center gap-1 pr-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === 0}
                  onClick={() => onMove(s.id, -1)}
                  title="Move up"
                  data-testid={`overview-up-${s.label}`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === stations.length - 1}
                  onClick={() => onMove(s.id, 1)}
                  title="Move down"
                  data-testid={`overview-down-${s.label}`}
                >
                  ↓
                </Button>
              </span>
            </li>
          ))}
          {stations.length === 0 && (
            <li className="px-2 py-4 text-xs text-faint">
              No exercises yet — add one below.
            </li>
          )}
        </ul>

        <div className="mt-3 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={onAddExercise}
            data-testid={addTestId}
          >
            <Plus className="size-4" />
            Add exercise
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onFinish}
            data-testid="overview-finish"
          >
            <Square className="size-3" />
            Finish workout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
