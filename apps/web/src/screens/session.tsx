import {
  type Exercise,
  e1rmFromEffort,
  formatWeight,
  type GhostSet,
  ghostFor,
  groupByPrimaryMuscle,
  kgToLb,
  type LoggedSet,
  lbToKg,
  type Machine,
  type Metric,
  newId,
  type Tier,
  toDisplayWeight,
  unitLabel,
} from "@sbl/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  History,
  MoreHorizontal,
  Plus,
  Settings2,
  Square,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router";
import { ExerciseRibbon, ExerciseThumb } from "@/components/anatomy-ui";
import { ConditionsChip } from "@/components/conditions";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { InfoTip } from "@/components/lesson";
import { MachineEditor } from "@/components/machines";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDurationSeconds } from "@/lib/format";
import { useHotkeys } from "@/lib/hotkeys";
import {
  useExercises,
  useGhost,
  useLastSets,
  useMachines,
  useMetrics,
  useSession,
  useSessionExercises,
} from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { type Unit, useUnit } from "@/lib/settings";
import { cn } from "@/lib/utils";

type BlockState = {
  seId: string;
  exerciseId: string;
  name: string;
  committed: LoggedSet[];
};

type CommitInput = Omit<LoggedSet, "id" | "setNo" | "restSec"> & {
  metricValues?: Record<string, unknown> | null;
  restSec?: number | null;
};

export type SetPatch = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  note: string | null;
};

// mm:ss for a rest duration in whole seconds.
function formatRest(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function SessionScreen() {
  const { id: sessionId = "" } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { unit } = useUnit();
  const { data: session } = useSession(sessionId);
  const { data: restored } = useSessionExercises(sessionId);
  const { data: metrics = [] } = useMetrics();

  const [blocks, setBlocks] = useState<BlockState[] | null>(null);
  const [picking, setPicking] = useState(false);
  // Rest is measured per exercise: the timestamp of the last set committed in
  // each block (keyed by seId). Rest between sets of one exercise is the signal
  // a future recommendation wants — switching exercises must not count as rest.
  const [lastCommitByBlock, setLastCommitByBlock] = useState<
    Record<string, number>
  >({});
  // For the live header stopwatch: time since the most recent set anywhere.
  const lastCommitAt = useMemo(() => {
    const vals = Object.values(lastCommitByBlock);
    return vals.length ? Math.max(...vals) : null;
  }, [lastCommitByBlock]);

  // Seed local block state once from the server (restores an open session on reload).
  useEffect(() => {
    if (restored && blocks === null) {
      setBlocks(
        restored.map((se) => ({
          seId: se.id,
          exerciseId: se.exerciseId,
          name: se.exerciseName,
          committed: se.sets,
        })),
      );
    }
  }, [restored, blocks]);

  // Auto-open the exercise picker once when a session loads with no blocks —
  // but let it be dismissed (Escape/X). Not `open={blocks.length === 0}`, which
  // would force it open and block the header (conditions, End).
  const autoOpenedPicker = useRef(false);
  useEffect(() => {
    if (!autoOpenedPicker.current && blocks !== null && blocks.length === 0) {
      autoOpenedPicker.current = true;
      setPicking(true);
    }
  }, [blocks]);

  const logSet = useMutation({
    mutationFn: (input: { seId: string; set: CommitInput; tempId: string }) =>
      repo.logSet(input.seId, input.set),
    // Swap the optimistic temp id for the real one so edit/delete target the
    // actual row.
    onSuccess: (realId, { seId, tempId }) => {
      setBlocks((prev) =>
        (prev ?? []).map((b) =>
          b.seId === seId
            ? {
                ...b,
                committed: b.committed.map((s) =>
                  s.id === tempId ? { ...s, id: realId } : s,
                ),
              }
            : b,
        ),
      );
    },
  });

  const endSession = useCallback(async () => {
    await repo.endSession(sessionId);
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    // Refresh findings so a finished session shows up without a manual reload
    // (findings-data has a 60s staleTime and isn't touched by set logging).
    void qc.invalidateQueries({ queryKey: ["findings-data"] });
    navigate("/");
  }, [repo, sessionId, qc, navigate]);

  useHotkeys(
    useMemo(
      () => ({
        a: () => setPicking(true),
        e: () => void endSession(),
      }),
      [endSession],
    ),
  );

  async function pickExercise(exerciseId: string, name: string) {
    setPicking(false);
    const seId = await repo.addExerciseToSession(sessionId, exerciseId);
    setBlocks((prev) => [
      ...(prev ?? []),
      { seId, exerciseId, name, committed: [] },
    ]);
  }

  function commitSet(seId: string, set: CommitInput) {
    // Optimistic: the row is already correct locally; persist in the background.
    // Rest time = seconds since the previous set of THIS exercise (null for its
    // first set) — a per-exercise rest gap, not a session-wide one.
    const prevAt = lastCommitByBlock[seId];
    const restSec =
      prevAt != null ? Math.round((Date.now() - prevAt) / 1000) : null;
    const withRest = { ...set, restSec };
    const tempId = newId();
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: [
                ...b.committed,
                { ...withRest, id: tempId, setNo: b.committed.length },
              ],
            }
          : b,
      ),
    );
    setLastCommitByBlock((prev) => ({ ...prev, [seId]: Date.now() }));
    logSet.mutate({ seId, set: withRest, tempId });
  }

  function saveSet(seId: string, setId: string, patch: SetPatch) {
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: b.committed.map((s) =>
                s.id === setId ? { ...s, ...patch } : s,
              ),
            }
          : b,
      ),
    );
    void repo.updateSet(setId, patch);
  }

  function removeSet(seId: string, setId: string) {
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? { ...b, committed: b.committed.filter((s) => s.id !== setId) }
          : b,
      ),
    );
    void repo.deleteSet(setId);
  }

  function removeBlock(seId: string) {
    setBlocks((prev) => (prev ?? []).filter((b) => b.seId !== seId));
    void repo.deleteSessionExercise(seId);
  }

  if (blocks === null) return null;

  const setCount = blocks.reduce((n, b) => n + b.committed.length, 0);
  const volumeKg = blocks.reduce(
    (sum, b) =>
      sum +
      b.committed.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0),
    0,
  );
  const volume = Math.round(unit === "lb" ? kgToLb(volumeKg) : volumeKg);
  const restValues = blocks.flatMap((b) =>
    b.committed
      .map((s) => s.restSec)
      .filter((r): r is number => r != null && r > 0),
  );
  const avgRestSec = restValues.length
    ? Math.round(restValues.reduce((a, b) => a + b, 0) / restValues.length)
    : null;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
            {session?.title ?? "Session"}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {session && (
              <SessionDuration
                startedAt={session.startedAt}
                endedAt={session.endedAt}
              />
            )}
            <RestTimer since={lastCommitAt} />
            <Button
              size="sm"
              onClick={() => void endSession()}
              title="End session (e)"
              data-testid="end-session-btn"
            >
              <Square className="size-3" />
              End
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-20 md:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <ConditionsChip sessionId={sessionId} />
          </div>
          <p
            className="num shrink-0 text-xs text-faint"
            data-testid="session-stats"
          >
            {setCount} {setCount === 1 ? "set" : "sets"} ·{" "}
            {volume.toLocaleString()} {unitLabel(unit)}
            {avgRestSec != null && ` · rest ${formatRest(avgRestSec)} avg`}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {blocks.map((block) => (
            <ExerciseBlock
              key={block.seId}
              block={block}
              unit={unit}
              metrics={metrics}
              onCommit={(set) => commitSet(block.seId, set)}
              onSaveSet={(setId, patch) => saveSet(block.seId, setId, patch)}
              onRemoveSet={(setId) => removeSet(block.seId, setId)}
              onRemoveBlock={() => removeBlock(block.seId)}
            />
          ))}

          <Button
            size="lg"
            className="h-12 w-full"
            onClick={() => setPicking(true)}
            data-testid="open-exercise-picker"
          >
            <Plus className="size-4" />
            Add exercise
          </Button>
          <ExercisePicker
            open={picking}
            onOpenChange={setPicking}
            onPick={pickExercise}
          />
        </div>
      </div>
    </>
  );
}

function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string, name: string) => void;
}) {
  const { data: exercises = [], isLoading } = useExercises();
  const { data: machines = [] } = useMachines();
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  // Muscle-grouped, tier-sorted — same reading order as the Library ribbon.
  const filtered = filterExercises(exercises, query, filterMuscle);
  const groups = groupByPrimaryMuscle(filtered);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add exercise" className="md:max-w-lg">
        <div className="flex flex-col gap-3">
          <ExerciseFilterBar
            query={query}
            onQuery={setQuery}
            muscle={filterMuscle}
            onMuscle={setFilterMuscle}
            autoFocus
          />
          {isLoading ? (
            <p className="px-4 py-6 text-center text-xs text-faint">Loading…</p>
          ) : exercises.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-faint">
              No exercises yet — add one in Library.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-faint">
              No exercises match your search.
            </p>
          ) : (
            <div className="overflow-hidden border border-border bg-surface">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="border-b border-border bg-surface-2 px-4 py-1 text-2xs font-medium tracking-widest text-faint uppercase">
                    {group.label}
                  </p>
                  <ul className="divide-y divide-border">
                    {group.items.map((ex) => (
                      <PickerRow
                        key={ex.id}
                        exercise={ex}
                        tier={
                          ex.muscleTargets?.find((t) => t.muscle === group.key)
                            ?.tier
                        }
                        machine={machines.find((m) => m.id === ex.machineId)}
                        onPick={onPick}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One picker row: the ribbon picks the exercise; a separate toggle reveals the
// last-session history. The history query only mounts once expanded, so opening
// the picker doesn't fire a lookup for every exercise at once.
function PickerRow({
  exercise,
  tier,
  machine,
  onPick,
}: {
  exercise: Exercise;
  tier?: Tier;
  machine?: Machine;
  onPick: (id: string, name: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <li>
      <div className="flex items-stretch">
        <button
          type="button"
          data-testid={`pick-exercise-${exercise.name}`}
          onClick={() => onPick(exercise.id, exercise.name)}
          className="flex-1 px-4 py-3 text-left transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
        >
          <ExerciseRibbon exercise={exercise} tier={tier} machine={machine} />
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Last session"
          aria-expanded={showHistory}
          className="flex shrink-0 items-center gap-1 border-l border-border px-3 text-faint transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
          data-testid={`pick-history-toggle-${exercise.name}`}
        >
          <History className="size-4" />
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-150",
              showHistory && "rotate-180",
            )}
          />
        </button>
      </div>
      {showHistory && (
        <PickerHistory exerciseId={exercise.id} name={exercise.name} />
      )}
    </li>
  );
}

// Lazily-loaded last-session sets for one picker row (mounted only when the
// history dropdown is open).
function PickerHistory({
  exerciseId,
  name,
}: {
  exerciseId: string;
  name: string;
}) {
  const { unit } = useUnit();
  const { data: sets = [], isLoading } = useLastSets(exerciseId);
  const summary = sets
    .map((s) =>
      s.weightKg != null && s.reps != null
        ? `${formatWeight(s.weightKg, unit)}\u00d7${s.reps}`
        : null,
    )
    .filter((s): s is string => s != null)
    .join(", ");
  return (
    <div
      className="border-t border-border bg-surface-2 px-4 py-2 text-2xs text-soft"
      data-testid={`pick-history-${name}`}
    >
      {isLoading ? (
        <span className="text-faint">Loading…</span>
      ) : summary ? (
        <span className="flex items-center gap-1">
          <History className="size-3 shrink-0 text-faint" />
          Last: {summary}
        </span>
      ) : (
        <span className="text-faint">No history yet.</span>
      )}
    </div>
  );
}

function ExerciseBlock({
  block,
  unit,
  metrics,
  onCommit,
  onSaveSet,
  onRemoveSet,
  onRemoveBlock,
}: {
  block: BlockState;
  unit: Unit;
  metrics: Metric[];
  onCommit: (set: CommitInput) => void;
  onSaveSet: (setId: string, patch: SetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveBlock: () => void;
}) {
  const { data: ghost = [] } = useGhost(block.exerciseId, block.seId);
  const { data: exercises = [] } = useExercises();
  const { data: machines = [] } = useMachines();
  const activeIndex = block.committed.length;
  const enabledMetrics = metrics.filter(
    (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
  );
  const exercise = exercises.find((e) => e.id === block.exerciseId);
  const machine = machines.find((m) => m.id === exercise?.machineId);

  return (
    <section
      className="rounded-lg border border-border bg-surface"
      data-testid={`block-${block.name}`}
    >
      <header className="group flex h-8 items-center justify-between border-b border-border px-4">
        <span className="flex min-w-0 items-center gap-2">
          <ExerciseThumb imageUrl={exercise?.imageUrl} name={block.name} />
          <h2 className="truncate text-sm font-medium">{block.name}</h2>
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-2xs text-faint">
            {block.committed.length}{" "}
            {block.committed.length === 1 ? "set" : "sets"}
          </span>
          <button
            type="button"
            onClick={onRemoveBlock}
            title="Remove exercise from session"
            className="rounded-sm p-1 text-faint transition-opacity duration-150 ease-(--ease-out-quad) hover:text-neg max-md:opacity-100 md:p-0.5 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
            data-testid={`remove-block-${block.name}`}
          >
            <X className="size-4" />
          </button>
        </span>
      </header>

      {machine && <SetupStrip machine={machine} blockName={block.name} />}

      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2 px-4 py-1 text-2xs font-medium tracking-widest text-faint uppercase">
        <span>#</span>
        <span>{unitLabel(unit)}</span>
        <span>reps</span>
        <span />
      </div>

      {block.committed.map((set, i) => (
        <CommittedRow
          key={set.id}
          set={set}
          index={i}
          unit={unit}
          onSave={(patch) => onSaveSet(set.id, patch)}
          onDelete={() => onRemoveSet(set.id)}
        />
      ))}

      <ActiveRow
        key={activeIndex}
        index={activeIndex}
        unit={unit}
        ghost={ghostFor(ghost, activeIndex)}
        hasGhost={ghost.length > 0}
        enabledMetrics={enabledMetrics}
        autoFocusWeight={activeIndex > 0}
        onCommit={onCommit}
      />
    </section>
  );
}

// Machine setup memory: the strip shows the remembered settings; the dialog
// edits them on the machine row itself, so the same setup appears in every
// future session.
function SetupStrip({
  machine,
  blockName,
}: {
  machine: Machine;
  blockName: string;
}) {
  const summary = (machine.settings ?? [])
    .filter((s) => s.value != null)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");
  return (
    <Dialog>
      <DialogTrigger
        className="flex h-8 w-full items-center gap-2 border-b border-border bg-surface-2 px-4 text-left text-2xs text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
        data-testid={`setup-strip-${blockName}`}
      >
        <Settings2 className="size-4 shrink-0 text-faint" />
        <span className="truncate">
          {machine.brand ? `${machine.brand} · ` : ""}
          {machine.name}
        </span>
        {summary ? (
          <span className="num ml-auto shrink-0 truncate text-faint">
            {summary}
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-faint">set up…</span>
        )}
      </DialogTrigger>
      <DialogContent
        title={`Setup — ${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`}
      >
        <MachineEditor machine={machine} />
      </DialogContent>
    </Dialog>
  );
}

function CommittedRow({
  set,
  index,
  unit,
  onSave,
  onDelete,
}: {
  set: LoggedSet;
  index: number;
  unit: Unit;
  onSave: (patch: SetPatch) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [rpe, setRpe] = useState("");
  const [note, setNote] = useState("");
  const [focusField, setFocusField] = useState<
    "weight" | "rir" | "rpe" | "note"
  >("weight");
  const [menuOpen, setMenuOpen] = useState(false);

  function startEdit(focus: "weight" | "rir" | "rpe" | "note" = "weight") {
    setWeight(
      set.weightKg != null ? String(toDisplayWeight(set.weightKg, unit)) : "",
    );
    setReps(set.reps != null ? String(set.reps) : "");
    setRir(set.rir != null ? String(set.rir) : "");
    setRpe(set.rpe != null ? String(set.rpe) : "");
    setNote(set.note ?? "");
    setFocusField(focus);
    setEditing(true);
  }

  function save() {
    const display = weight.trim() === "" ? null : Number.parseFloat(weight);
    const displayOk =
      display != null && !Number.isNaN(display) ? display : null;
    const repsN = reps.trim() === "" ? null : Number.parseInt(reps, 10);
    onSave({
      weightKg:
        displayOk == null
          ? null
          : unit === "lb"
            ? lbToKg(displayOk)
            : displayOk,
      reps: repsN != null && Number.isNaN(repsN) ? null : repsN,
      rir: rir.trim() === "" ? null : Number.parseInt(rir, 10),
      rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
      note: note.trim() === "" ? null : note.trim(),
    });
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="border-t border-border bg-surface-2 px-4 py-2">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2">
          <span className="flex items-center gap-2">
            <StatusRing state="done" />
            <span className="num text-2xs text-faint">{index + 1}</span>
          </span>
          <Input
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus={focusField === "weight"}
            className="num h-10 md:h-8"
            data-testid={`edit-${index}-weight`}
          />
          <Input
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onKeyDown={onKeyDown}
            className="num h-10 md:h-8"
            data-testid={`edit-${index}-reps`}
          />
          <button
            type="button"
            onClick={save}
            title="Save (Enter)"
            className="justify-self-center rounded-md p-1 text-accent transition-colors duration-100 hover:bg-accent-soft"
            data-testid={`edit-${index}-save`}
          >
            <Check className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-3 pl-10">
          <div className="flex flex-col gap-1">
            <span className="text-2xs font-medium tracking-wide text-faint uppercase">
              RIR
            </span>
            <Input
              inputMode="numeric"
              placeholder="—"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus={focusField === "rir"}
              className="num h-8 w-16 bg-surface text-xs text-soft"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xs font-medium tracking-wide text-faint uppercase">
              RPE
            </span>
            <RpeSelect
              value={rpe}
              onChange={setRpe}
              autoFocus={focusField === "rpe"}
              testId={`edit-${index}-rpe`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-2xs font-medium tracking-wide text-faint uppercase">
              Note
            </span>
            <Input
              placeholder="// note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus={focusField === "note"}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
    );
  }

  const e1rm = e1rmFromEffort(set.weightKg, set.reps, {
    rir: set.rir,
    rpe: set.rpe,
  });

  return (
    <div className="relative border-t border-border">
      <div
        className="group commit-flash grid h-11 grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2 bg-surface px-4 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover md:h-8"
        data-testid={`committed-${index}`}
      >
        <span className="flex items-center gap-2">
          <StatusRing state="done" />
          <span className="num text-2xs text-faint">{index + 1}</span>
        </span>
        <button
          type="button"
          onClick={() => startEdit("weight")}
          className="num cursor-text text-left text-sm"
          title="Edit set"
          data-testid={`committed-${index}-weight`}
        >
          {set.weightKg != null ? toDisplayWeight(set.weightKg, unit) : "—"}
        </button>
        <button
          type="button"
          onClick={() => startEdit("weight")}
          className="num cursor-text text-left text-sm"
          data-testid={`committed-${index}-reps`}
        >
          {set.reps ?? "—"}
        </button>
        <span className="relative flex items-center justify-center gap-1">
          <span className="num text-2xs text-faint max-md:hidden md:group-hover:hidden">
            {[
              set.rir != null ? `@${set.rir}` : null,
              set.rpe != null ? `RPE ${set.rpe}` : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Set options"
            className="rounded-sm p-1 text-faint transition-colors duration-150 hover:text-ink max-md:block md:hidden md:p-0.5 md:group-hover:block"
            data-testid={`set-menu-${index}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="floating absolute top-full right-0 z-20 mt-1 min-w-36 py-1">
                {e1rm != null && (
                  <div className="num border-b border-border px-3 py-1.5 text-2xs text-faint">
                    e1RM ≈ {toDisplayWeight(e1rm, unit)} {unitLabel(unit)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    startEdit("rir");
                  }}
                  data-testid={`set-menu-${index}-rir`}
                  className="block w-full px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                >
                  {set.rir != null ? "Edit RIR" : "Add RIR"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    startEdit("rpe");
                  }}
                  data-testid={`set-menu-${index}-rpe`}
                  className="block w-full px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                >
                  {set.rpe != null ? "Edit RPE" : "Add RPE"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    startEdit("note");
                  }}
                  data-testid={`set-menu-${index}-note`}
                  className="block w-full px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                >
                  {set.note ? "Edit note" : "Add note"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  data-testid={`set-menu-${index}-delete`}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg"
                >
                  <Trash2 className="size-3.5" />
                  Delete set
                </button>
              </div>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// RPE is a fixed 0.5-step scale (1–10), not a free-form number — a small
// select keeps it a quick pick and reads as clearly secondary to weight/reps.
const RPE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5);

function RpeSelect({
  value,
  onChange,
  autoFocus,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  testId: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // biome-ignore lint/a11y/noAutofocus: focuses the just-added RPE field
      autoFocus={autoFocus}
      data-testid={testId}
      className="num h-8 w-16 rounded-md border border-border-strong bg-surface px-1.5 text-xs text-soft transition-colors duration-150 ease-(--ease-out-quad) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
    >
      <option value="">—</option>
      {RPE_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function ActiveRow({
  index,
  unit,
  ghost,
  hasGhost,
  enabledMetrics,
  autoFocusWeight,
  onCommit,
}: {
  index: number;
  unit: Unit;
  ghost: GhostSet;
  hasGhost: boolean;
  enabledMetrics: Metric[];
  autoFocusWeight: boolean;
  onCommit: (set: CommitInput) => void;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [rpe, setRpe] = useState("");
  const [note, setNote] = useState("");
  const [metricDraft, setMetricDraft] = useState<Record<string, string>>({});
  // Optional per-set fields the user opts into via the ⋯ menu (RIR / RPE /
  // note / custom metrics). Nothing shows until explicitly added.
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const done = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const extraOptions = [
    { key: "rir", label: "RIR" },
    { key: "rpe", label: "RPE" },
    { key: "note", label: "Note" },
    ...enabledMetrics.map((m) => ({ key: m.id, label: m.name })),
  ];

  function toggleExtra(key: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastAdded(key);
    setMenuOpen(false);
  }

  const ghostWeight =
    ghost.weightKg != null ? toDisplayWeight(ghost.weightKg, unit) : null;

  function parse(w: string, r: string) {
    const display = w.trim() === "" ? null : Number.parseFloat(w);
    const repsN = r.trim() === "" ? null : Number.parseInt(r, 10);
    const displayOk =
      display != null && !Number.isNaN(display) ? display : null;
    return {
      weightKg:
        displayOk == null
          ? null
          : unit === "lb"
            ? lbToKg(displayOk)
            : displayOk,
      reps: repsN != null && Number.isNaN(repsN) ? null : repsN,
    };
  }

  function metricValues(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const m of enabledMetrics) {
      const raw = (metricDraft[m.id] ?? "").trim();
      if (raw === "") continue;
      out[m.id] =
        m.type === "number" || m.type === "scale"
          ? Number.parseFloat(raw)
          : m.type === "checkbox"
            ? raw === "true"
            : raw;
    }
    return Object.keys(out).length ? out : null;
  }

  function commit(adoptGhost: boolean) {
    if (done.current) return;
    let { weightKg, reps: repsN } = parse(weight, reps);
    if (adoptGhost && hasGhost) {
      // Enter on an empty field accepts the ghost value (tap-to-accept).
      weightKg = weightKg ?? ghost.weightKg;
      repsN = repsN ?? ghost.reps;
    }
    if (weightKg === null && repsN === null) return;
    done.current = true;
    onCommit({
      weightKg,
      reps: repsN,
      rir: rir.trim() === "" ? null : Number.parseInt(rir, 10),
      rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
      note: note.trim() === "" ? null : note.trim(),
      metricValues: metricValues(),
    });
  }

  function onBlur(e: React.FocusEvent) {
    // Finalize only when focus truly leaves the row. Moving to another control
    // inside this row (the ⋯ menu, the RIR / RPE / note / metric fields) must not
    // commit the set out from under the user — committing swaps this draft row
    // for a fresh one, which reads as a phantom "new set" and hides the popup.
    const next = e.relatedTarget as Node | null;
    if (next && rowRef.current?.contains(next)) return;
    if (weight.trim() !== "" && reps.trim() !== "") commit(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(true);
    }
  }

  return (
    <div ref={rowRef} className="border-t border-border px-4 py-2">
      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2">
        <span className="flex items-center gap-2">
          <StatusRing state="empty" />
          <span className="num text-2xs text-faint">{index + 1}</span>
        </span>
        <Input
          inputMode="decimal"
          placeholder={ghostWeight != null ? String(ghostWeight) : unit}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus={autoFocusWeight}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-weight`}
        />
        <Input
          inputMode="numeric"
          placeholder={ghost.reps != null ? String(ghost.reps) : "reps"}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-reps`}
        />
        <span className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            // Keep the weight/reps input focused so tapping never fires the
            // blur-to-commit — Safari doesn't focus buttons on tap.
            onMouseDown={(e) => e.preventDefault()}
            title="Add RIR / RPE / note / metrics"
            className="rounded-md border border-border bg-surface-2 p-1.5 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
            data-testid={`set-${index}-more`}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="floating absolute top-full right-0 z-20 mt-1 min-w-36 py-1">
                {extraOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleExtra(o.key)}
                    data-testid={`set-${index}-add-${o.key}`}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                  >
                    {o.label}
                    {extras.has(o.key) && (
                      <Check className="size-3.5 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </span>
      </div>
      {extras.size > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {(extras.has("rir") || extras.has("rpe")) && (
            <div className="flex items-end gap-3 pl-10">
              {extras.has("rir") && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-2xs font-medium tracking-wide text-faint uppercase">
                    RIR
                    <InfoTip lessonId="rir" />
                  </span>
                  <Input
                    inputMode="numeric"
                    placeholder="—"
                    value={rir}
                    onChange={(e) => setRir(e.target.value)}
                    onKeyDown={onKeyDown}
                    autoFocus={lastAdded === "rir"}
                    className="num h-8 w-16 bg-surface text-xs text-soft"
                    data-testid={`set-${index}-rir`}
                  />
                </div>
              )}
              {extras.has("rpe") && (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                    RPE
                  </span>
                  <RpeSelect
                    value={rpe}
                    onChange={setRpe}
                    autoFocus={lastAdded === "rpe"}
                    testId={`set-${index}-rpe`}
                  />
                </div>
              )}
            </div>
          )}
          {extras.has("note") && (
            <div className="grid grid-cols-[2rem_1fr_2fr_2.5rem] items-center gap-x-2">
              <span />
              <Input
                placeholder="// note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={onKeyDown}
                autoFocus={lastAdded === "note"}
                className="col-span-2 h-10 md:h-8"
                data-testid={`set-${index}-note`}
              />
              <span />
            </div>
          )}
          {enabledMetrics
            .filter((m) => extras.has(m.id))
            .map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[2rem_1fr_2fr_2.5rem] items-center gap-x-2"
              >
                <span />
                <span className="truncate text-2xs text-faint">{m.name}</span>
                {m.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={metricDraft[m.id] === "true"}
                    onChange={(e) =>
                      setMetricDraft((d) => ({
                        ...d,
                        [m.id]: e.target.checked ? "true" : "",
                      }))
                    }
                    className="size-4 justify-self-start accent-(--accent)"
                    data-testid={`set-${index}-metric-${m.id}`}
                  />
                ) : (
                  <Input
                    inputMode={m.type === "text" ? undefined : "decimal"}
                    placeholder={m.type === "text" ? m.name : "0"}
                    value={metricDraft[m.id] ?? ""}
                    onChange={(e) =>
                      setMetricDraft((d) => ({ ...d, [m.id]: e.target.value }))
                    }
                    onKeyDown={onKeyDown}
                    autoFocus={lastAdded === m.id}
                    className="num h-10 md:h-8"
                    data-testid={`set-${index}-metric-${m.id}`}
                  />
                )}
                <span />
              </div>
            ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(true)}
        className="mt-2 h-8 w-full"
        data-testid={`set-${index}-add`}
      >
        <Plus className="size-3" />
        Add set
      </Button>
    </div>
  );
}

function SessionDuration({
  startedAt,
  endedAt,
}: {
  startedAt: number;
  endedAt: number | null;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (endedAt != null) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endedAt]);

  return (
    <span
      className="num shrink-0 text-xs text-soft"
      data-testid="session-duration"
    >
      {formatDurationSeconds((endedAt ?? Date.now()) - startedAt)}
    </span>
  );
}

function RestTimer({ since }: { since: number | null }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);

  if (since === null) return null;
  const total = Math.floor((Date.now() - since) / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return (
    <span className="num flex h-8 shrink-0 items-center gap-2 rounded-md bg-translucent px-2 text-xs text-soft shadow-(--inset-control)">
      <Timer className="size-4" />
      {m}:{s}
    </span>
  );
}
