import {
  type GhostSet,
  ghostFor,
  type LoggedSet,
  lbToKg,
  type Metric,
  newId,
  toDisplayWeight,
} from "@sbl/core";
import { useMutation } from "@tanstack/react-query";
import { Plus, Timer } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import { useParams } from "react-router";
import { ConditionsChip } from "@/components/conditions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function SessionScreen() {
  const { id: sessionId = "" } = useParams();
  const repo = useRepo();
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
    mutationFn: (input: { seId: string; set: CommitInput }) =>
      repo.logSet(input.seId, input.set),
  });

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
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: [
                ...b.committed,
                { ...set, id: newId(), setNo: b.committed.length },
              ],
            }
          : b,
      ),
    );
    setLastCommitAt(Date.now());
    logSet.mutate({ seId, set });
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
      <p className="border-b border-border px-3.5 py-2 text-2xs font-medium tracking-wide text-faint uppercase">
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
                className="w-full px-3.5 py-2.5 text-left text-sm transition-colors duration-100 hover:bg-surface-hover"
              >
                {ex.name}
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
}: {
  block: BlockState;
  unit: Unit;
  metrics: Metric[];
  onCommit: (set: CommitInput) => void;
}) {
  const { data: ghost = [] } = useGhost(block.exerciseId, block.seId);
  const activeIndex = block.committed.length;
  const enabledMetrics = metrics.filter(
    (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-3.5 py-2">
        <h2 className="text-sm font-medium">{block.name}</h2>
        <span className="num text-2xs text-faint">
          {block.committed.length}{" "}
          {block.committed.length === 1 ? "set" : "sets"}
        </span>
      </header>

      <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 px-3.5 py-1.5 text-2xs font-medium tracking-wide text-faint uppercase">
        <span>#</span>
        <span>{unit}</span>
        <span>reps</span>
        <span />
      </div>

      {block.committed.map((set) => (
        <div
          key={set.id}
          className="commit-flash grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2 border-t border-border px-3.5 py-2"
        >
          <span className="num text-xs text-faint">{set.setNo + 1}</span>
          <span className="num text-sm">
            {set.weightKg != null ? toDisplayWeight(set.weightKg, unit) : "—"}
          </span>
          <span className="num text-sm">{set.reps ?? "—"}</span>
          <span className="num text-2xs text-faint">
            {set.rir != null ? `@${set.rir}` : ""}
          </span>
        </div>
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
      <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-x-2">
        <span className="num text-xs text-faint">{index + 1}</span>
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
    <span className="num flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs text-soft">
      <Timer className="size-3.5" />
      {m}:{s}
    </span>
  );
}
