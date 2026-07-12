import {
  type GhostSet,
  ghostFor,
  type LoggedSet,
  lbToKg,
  type Metric,
  newId,
  toDisplayWeight,
} from "@sbl/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Square, Timer, Trash2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router";
import { ConditionsChip } from "@/components/conditions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusRing } from "@/components/ui/status-ring";
import { useHotkeys } from "@/lib/hotkeys";
import {
  useExercises,
  useGhost,
  useMetrics,
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

type CommitInput = Omit<LoggedSet, "id" | "setNo"> & {
  metricValues?: Record<string, unknown> | null;
};

export type SetPatch = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  note: string | null;
};

export default function SessionScreen() {
  const { id: sessionId = "" } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { unit } = useUnit();
  const { data: restored } = useSessionExercises(sessionId);
  const { data: metrics = [] } = useMetrics();

  const [blocks, setBlocks] = useState<BlockState[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [lastCommitAt, setLastCommitAt] = useState<number | null>(null);

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
    const tempId = newId();
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: [
                ...b.committed,
                { ...set, id: tempId, setNo: b.committed.length },
              ],
            }
          : b,
      ),
    );
    setLastCommitAt(Date.now());
    logSet.mutate({ seId, set, tempId });
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
  const showPicker = picking || blocks.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Session</h1>
        <div className="flex min-w-0 items-center gap-2">
          <ConditionsChip sessionId={sessionId} />
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

      <div className="mt-5 flex flex-col gap-4">
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

        {showPicker ? (
          <ExercisePicker onPick={pickExercise} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setPicking(true)}
          >
            <Plus className="size-3.5" />
            Add exercise
          </Button>
        )}
      </div>
    </div>
  );
}

function ExercisePicker({
  onPick,
}: {
  onPick: (id: string, name: string) => void;
}) {
  const { data: exercises = [], isLoading } = useExercises();
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <p className="border-b border-border px-3.5 py-2 text-2xs font-medium tracking-widest text-faint uppercase">
        Pick an exercise
      </p>
      {isLoading ? (
        <p className="px-3.5 py-5 text-center text-xs text-faint">Loading…</p>
      ) : exercises.length === 0 ? (
        <p className="px-3.5 py-5 text-center text-xs text-faint">
          No exercises yet — add one in Library.
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {exercises.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                data-testid={`pick-exercise-${ex.name}`}
                onClick={() => onPick(ex.id, ex.name)}
                className="flex h-9 w-full items-center gap-2 px-3.5 text-left text-sm transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
              >
                {ex.name}
                {ex.tags?.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full bg-accent/10 px-2 text-2xs text-soft"
                  >
                    <span className="size-1 rounded-full bg-accent" />
                    {t}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
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
  const activeIndex = block.committed.length;
  const enabledMetrics = metrics.filter(
    (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="group flex h-9 items-center justify-between border-b border-border px-3.5">
        <h2 className="text-sm font-medium">{block.name}</h2>
        <span className="flex items-center gap-2">
          <span className="num text-2xs text-faint">
            {block.committed.length}{" "}
            {block.committed.length === 1 ? "set" : "sets"}
          </span>
          <button
            type="button"
            onClick={onRemoveBlock}
            title="Remove exercise from session"
            className="rounded-sm p-0.5 text-faint opacity-0 transition-opacity duration-150 ease-(--ease-out-quad) group-hover:opacity-100 hover:text-neg focus-visible:opacity-100"
            data-testid={`remove-block-${block.name}`}
          >
            <X className="size-3.5" />
          </button>
        </span>
      </header>

      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2 px-3.5 py-1.5 text-2xs font-medium tracking-widest text-faint uppercase">
        <span>#</span>
        <span>{unit}</span>
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
  const [note, setNote] = useState("");

  function startEdit() {
    setWeight(
      set.weightKg != null ? String(toDisplayWeight(set.weightKg, unit)) : "",
    );
    setReps(set.reps != null ? String(set.reps) : "");
    setRir(set.rir != null ? String(set.rir) : "");
    setNote(set.note ?? "");
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
      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2 border-t border-border bg-surface-2 px-3.5 py-2">
        <span className="flex items-center gap-1.5">
          <StatusRing state="done" />
          <span className="num text-2xs text-faint">{index + 1}</span>
        </span>
        <Input
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          className="num h-8"
          data-testid={`edit-${index}-weight`}
        />
        <Input
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onKeyDown={onKeyDown}
          className="num h-8"
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
        <span />
        <Input
          inputMode="numeric"
          placeholder="RIR"
          value={rir}
          onChange={(e) => setRir(e.target.value)}
          onKeyDown={onKeyDown}
          className="num col-start-2 mt-2 h-8"
        />
        <Input
          placeholder="// note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onKeyDown}
          className="mt-2 h-8"
        />
        <span />
      </div>
    );
  }

  return (
    <div
      className="group commit-flash grid h-9 grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2 border-t border-border px-3.5 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
      data-testid={`committed-${index}`}
    >
      <span className="flex items-center gap-1.5">
        <StatusRing state="done" />
        <span className="num text-2xs text-faint">{index + 1}</span>
      </span>
      <button
        type="button"
        onClick={startEdit}
        className="num cursor-text text-left text-sm"
        title="Edit set"
        data-testid={`committed-${index}-weight`}
      >
        {set.weightKg != null ? toDisplayWeight(set.weightKg, unit) : "—"}
      </button>
      <button
        type="button"
        onClick={startEdit}
        className="num cursor-text text-left text-sm"
        data-testid={`committed-${index}-reps`}
      >
        {set.reps ?? "—"}
      </button>
      <span className="flex items-center justify-center gap-1">
        <span className="num text-2xs text-faint group-hover:hidden">
          {set.rir != null ? `@${set.rir}` : ""}
        </span>
        <button
          type="button"
          onClick={onDelete}
          title="Delete set"
          className="hidden rounded-sm p-0.5 text-faint transition-colors duration-100 group-hover:block hover:text-neg"
          data-testid={`delete-${index}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>
    </div>
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
  const [note, setNote] = useState("");
  const [metricDraft, setMetricDraft] = useState<Record<string, string>>({});
  const [expanded, toggleExpanded] = useReducer((v: boolean) => !v, false);
  const done = useRef(false);

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
      note: note.trim() === "" ? null : note.trim(),
      metricValues: metricValues(),
    });
  }

  function onBlur() {
    if (weight.trim() !== "" && reps.trim() !== "") commit(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(true);
    }
  }

  return (
    <div className="border-t border-border px-3.5 py-2">
      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-x-2">
        <span className="flex items-center gap-1.5">
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
          className="num h-8"
          data-testid={`set-${index}-weight`}
        />
        <Input
          inputMode="numeric"
          placeholder={ghost.reps != null ? String(ghost.reps) : "reps"}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="num h-8"
          data-testid={`set-${index}-reps`}
        />
        <button
          type="button"
          onClick={toggleExpanded}
          title="RIR / note / metrics"
          className={cn(
            "justify-self-center rounded-md px-1.5 py-1 text-2xs font-medium transition-colors duration-100",
            expanded
              ? "bg-accent-soft text-ink"
              : "text-faint hover:bg-surface-hover hover:text-ink",
          )}
        >
          +RIR
        </button>
      </div>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-[2rem_1fr_2fr_2.5rem] items-center gap-x-2">
            <span />
            <Input
              inputMode="numeric"
              placeholder="RIR"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              onKeyDown={onKeyDown}
              className="num h-8"
              data-testid={`set-${index}-rir`}
            />
            <Input
              placeholder="// note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-8"
              data-testid={`set-${index}-note`}
            />
            <span />
          </div>
          {enabledMetrics.map((m) => (
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
                  className="num h-8"
                  data-testid={`set-${index}-metric-${m.id}`}
                />
              )}
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
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
    <span className="num flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-translucent px-2 text-xs text-soft shadow-(--inset-control)">
      <Timer className="size-3.5" />
      {m}:{s}
    </span>
  );
}
