import {
  type Exercise,
  groupByPrimaryMuscle,
  JOINT_ACTIONS,
  jointActionLabel,
  type Machine,
  type Metric,
  MUSCLES,
  type MuscleTarget,
  muscleLabel,
  type NewMetricInput,
  ratingsForMuscle,
  type Tier,
} from "@sbl/core";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { type FormEvent, useState } from "react";
import { JointActionChips, TierBadge } from "@/components/anatomy-ui";
import { MachinesSection } from "@/components/machines";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCreateExercise,
  useCreateMetric,
  useDeleteExercise,
  useDeleteMetric,
  useExercises,
  useMachines,
  useMetrics,
  useSetExerciseClassification,
  useSetExerciseMachine,
  useSetExerciseTags,
  useSetMetricExercises,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

const TIERS: Tier[] = ["S", "A", "B", "C"];

export default function LibraryScreen() {
  const { data: exercises = [], isLoading } = useExercises();
  const { data: metrics = [] } = useMetrics();
  const { data: machines = [] } = useMachines();
  const create = useCreateExercise();
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const setMetrics = metrics.filter(
    (m) => m.scope === "set" && m.ownerId !== null,
  );
  const groups = groupByPrimaryMuscle(exercises);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({
      name: trimmed,
      opts: muscle ? { muscleTargets: [{ muscle, tier: "S" }] } : undefined,
    });
    setName("");
    setMuscle("");
  }

  function toggleGroup(key: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Library</h1>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <Input
          placeholder="New exercise name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="exercise-name-input"
        />
        <select
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
          className="h-8 w-32 shrink-0 border border-border bg-surface px-2 text-xs text-ink"
          data-testid="exercise-muscle-select"
        >
          <option value="">Muscle…</option>
          {MUSCLES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="primary"
          disabled={name.trim().length === 0}
          data-testid="add-exercise-btn"
        >
          Add
        </Button>
      </form>

      <div className="mt-4 overflow-hidden border border-border bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-xs text-faint">Loading…</p>
        ) : exercises.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-faint">
            No exercises yet. Add your first above.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} data-testid={`muscle-group-${group.key}`}>
              <header className="flex h-8 items-center gap-2 border-b border-border bg-surface-2 px-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  data-testid={`muscle-group-toggle-${group.key}`}
                >
                  {collapsed.has(group.key) ? (
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-faint" />
                  )}
                  <span className="truncate text-2xs font-medium tracking-widest uppercase">
                    {group.label}
                  </span>
                  <span className="num text-2xs text-faint">
                    {group.items.length}
                  </span>
                </button>
                {group.key !== "other" && (
                  <BestForMuscle muscle={group.key} exercises={exercises} />
                )}
              </header>
              {!collapsed.has(group.key) && (
                <ul className="divide-y divide-border">
                  {group.items.map((ex) => (
                    <ExerciseRow
                      key={ex.id}
                      exercise={ex}
                      groupMuscle={group.key}
                      setMetrics={setMetrics}
                      machines={machines}
                      expanded={expandedId === ex.id}
                      onToggle={() =>
                        setExpandedId(expandedId === ex.id ? null : ex.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      <MachinesSection machines={machines} />
      <MetricsSection metrics={metrics} />
    </div>
  );
}

// Ranked joint actions (with nuance + citations) and the user's best
// exercises for one muscle — the "pick the best exercise" view.
function BestForMuscle({
  muscle,
  exercises,
}: {
  muscle: string;
  exercises: Exercise[];
}) {
  const ratings = ratingsForMuscle(muscle);
  const ranked = exercises
    .map((e) => ({
      exercise: e,
      target: e.muscleTargets?.find((t) => t.muscle === muscle),
    }))
    .filter((x): x is { exercise: Exercise; target: MuscleTarget } =>
      Boolean(x.target),
    )
    .sort(
      (a, b) => TIERS.indexOf(a.target.tier) - TIERS.indexOf(b.target.tier),
    );

  return (
    <Dialog>
      <DialogTrigger
        className="p-1 text-faint transition-colors duration-100 hover:text-ink"
        title={`Best for ${muscleLabel(muscle)}`}
        data-testid={`best-for-${muscle}`}
      >
        <Info className="size-4" />
      </DialogTrigger>
      <DialogContent title={`Best for ${muscleLabel(muscle)}`}>
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
          <div>
            <h3 className="text-2xs font-medium tracking-widest text-faint uppercase">
              Joint actions, ranked
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {ratings.map((r) => (
                <li key={r.jointAction} className="flex items-start gap-2">
                  <TierBadge tier={r.tier} />
                  <span className="min-w-0 text-xs">
                    <span className="text-ink">
                      {jointActionLabel(r.jointAction)}
                    </span>
                    {r.note && (
                      <span className="block text-2xs text-soft">{r.note}</span>
                    )}
                    {r.citations && r.citations.length > 0 && (
                      <span className="block truncate text-2xs text-faint">
                        {r.citations.join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-2xs font-medium tracking-widest text-faint uppercase">
              Your exercises
            </h3>
            {ranked.length === 0 ? (
              <p className="mt-2 text-2xs text-faint">
                Nothing targets this muscle yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {ranked.map(({ exercise, target }) => (
                  <li key={exercise.id} className="flex items-center gap-2">
                    <TierBadge tier={target.tier} />
                    <span className="truncate text-xs">{exercise.name}</span>
                    <JointActionChips actions={exercise.jointActions} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseRow({
  exercise,
  groupMuscle,
  setMetrics,
  machines,
  expanded,
  onToggle,
}: {
  exercise: Exercise;
  groupMuscle: string;
  setMetrics: Metric[];
  machines: Machine[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const toggleMetric = useSetMetricExercises();
  const setTags = useSetExerciseTags();
  const deleteExercise = useDeleteExercise();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const groupTier = exercise.muscleTargets?.find(
    (t) => t.muscle === groupMuscle,
  )?.tier;
  const machine = machines.find((m) => m.id === exercise.machineId);

  return (
    <li data-testid={`exercise-row-${exercise.name}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm md:h-8 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Chevron className="size-4 shrink-0 text-faint" />
          {groupTier && <TierBadge tier={groupTier} />}
          <span className="truncate">{exercise.name}</span>
          <JointActionChips
            actions={exercise.jointActions}
            className="max-md:hidden"
          />
          {exercise.tags?.map((t) => (
            <span
              key={t}
              className="flex shrink-0 items-center gap-1 bg-accent/10 px-2 text-2xs text-soft"
            >
              <span className="size-1 bg-accent" />
              {t}
            </span>
          ))}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {machine && (
            <span className="max-w-32 truncate bg-translucent px-2 text-2xs text-faint">
              {machine.brand ? `${machine.brand} · ` : ""}
              {machine.name}
            </span>
          )}
          {!exercise.isCustom && (
            <span className="bg-translucent px-2 text-2xs text-faint">
              seed
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border bg-surface-2 px-4 py-2 pl-10">
          {setMetrics.length === 0 ? (
            <p className="text-2xs text-faint">
              No custom set metrics yet — create one below to track it per set
              here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {setMetrics.map((m) => {
                const enabled = m.exerciseIds?.includes(exercise.id) ?? false;
                return (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() =>
                        toggleMetric.mutate({
                          metricId: m.id,
                          exerciseIds: enabled
                            ? (m.exerciseIds ?? []).filter(
                                (id) => id !== exercise.id,
                              )
                            : [...(m.exerciseIds ?? []), exercise.id],
                        })
                      }
                      className="size-4 accent-(--accent)"
                      data-testid={`enable-metric-${m.name}-${exercise.name}`}
                    />
                    <span className={cn(enabled ? "text-ink" : "text-soft")}>
                      {m.name}
                    </span>
                    <span className="text-2xs text-faint">{m.type}</span>
                  </label>
                );
              })}
            </div>
          )}

          {exercise.isCustom && (
            <CustomExerciseEditor exercise={exercise} machines={machines} />
          )}

          {exercise.isCustom && (
            <div className="mt-3 border-t border-border pt-2">
              <TagEditor exercise={exercise} setTags={setTags} />
              <Button
                variant="danger"
                size="sm"
                className="mt-2"
                onClick={() => deleteExercise.mutate(exercise.id)}
                data-testid={`delete-exercise-${exercise.name}`}
              >
                Delete exercise
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// Muscle targets (first = primary), joint-action labels, machine link —
// custom exercises only (seed rows are read-only under RLS).
function CustomExerciseEditor({
  exercise,
  machines,
}: {
  exercise: Exercise;
  machines: Machine[];
}) {
  const classify = useSetExerciseClassification();
  const setMachine = useSetExerciseMachine();
  const [muscleDraft, setMuscleDraft] = useState("");
  const [tierDraft, setTierDraft] = useState<Tier>("S");
  const targets = exercise.muscleTargets ?? [];
  const actions = exercise.jointActions ?? [];

  function setTargets(next: MuscleTarget[]) {
    classify.mutate({
      exerciseId: exercise.id,
      classification: { muscleTargets: next },
    });
  }
  function setActions(next: string[]) {
    classify.mutate({
      exerciseId: exercise.id,
      classification: { jointActions: next },
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-faint">Muscles</span>
        {targets.map((t) => (
          <span
            key={t.muscle}
            className="flex items-center gap-1 border border-border bg-surface px-1 py-0.5 text-2xs text-soft"
          >
            <TierBadge tier={t.tier} />
            {muscleLabel(t.muscle)}
            <button
              type="button"
              title={`Remove ${muscleLabel(t.muscle)}`}
              onClick={() =>
                setTargets(targets.filter((x) => x.muscle !== t.muscle))
              }
              className="text-faint hover:text-neg"
            >
              ×
            </button>
          </span>
        ))}
        <select
          value={muscleDraft}
          onChange={(e) => setMuscleDraft(e.target.value)}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`muscle-select-${exercise.name}`}
        >
          <option value="">+ muscle</option>
          {MUSCLES.filter((m) => !targets.some((t) => t.muscle === m.key)).map(
            (m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ),
          )}
        </select>
        <select
          value={tierDraft}
          onChange={(e) => setTierDraft(e.target.value as Tier)}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          title="Tier for this muscle"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!muscleDraft}
          onClick={() => {
            if (!muscleDraft) return;
            setTargets([...targets, { muscle: muscleDraft, tier: tierDraft }]);
            setMuscleDraft("");
            setTierDraft("S");
          }}
          data-testid={`add-muscle-${exercise.name}`}
        >
          Add
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-faint">Joint actions</span>
        {actions.map((a) => (
          <span
            key={a}
            className="flex items-center gap-1 border border-border bg-surface px-1 py-0.5 text-2xs text-soft"
          >
            {jointActionLabel(a)}
            <button
              type="button"
              title={`Remove ${jointActionLabel(a)}`}
              onClick={() => setActions(actions.filter((x) => x !== a))}
              className="text-faint hover:text-neg"
            >
              ×
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setActions([...actions, e.target.value]);
          }}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`joint-action-select-${exercise.name}`}
        >
          <option value="">+ action</option>
          {JOINT_ACTIONS.filter((a) => !actions.includes(a.key)).map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-2xs text-faint">Machine</span>
        <select
          value={exercise.machineId ?? ""}
          onChange={(e) =>
            setMachine.mutate({
              exerciseId: exercise.id,
              machineId: e.target.value || null,
            })
          }
          className="h-6 max-w-64 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`machine-select-${exercise.name}`}
        >
          <option value="">No machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.brand ? `${m.brand} · ` : ""}
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TagEditor({
  exercise,
  setTags,
}: {
  exercise: Exercise;
  setTags: ReturnType<typeof useSetExerciseTags>;
}) {
  const [tagDraft, setTagDraft] = useState("");

  function addTag() {
    const tag = tagDraft.trim().replace(/,+$/, "");
    setTagDraft("");
    if (!tag) return;
    const current = exercise.tags ?? [];
    if (current.includes(tag)) return;
    setTags.mutate({ exerciseId: exercise.id, tags: [...current, tag] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(exercise.tags ?? []).map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded-sm border border-border bg-surface px-2 py-0.5 text-2xs text-soft"
        >
          {t}
          <button
            type="button"
            title={`Remove tag ${t}`}
            onClick={() =>
              setTags.mutate({
                exerciseId: exercise.id,
                tags: (exercise.tags ?? []).filter((x) => x !== t),
              })
            }
            className="text-faint hover:text-neg"
          >
            ×
          </button>
        </span>
      ))}
      <Input
        value={tagDraft}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) {
            setTagDraft(e.target.value);
            addTag();
          } else {
            setTagDraft(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="+ tag"
        className="h-6 w-24 text-2xs"
        data-testid={`tag-input-${exercise.name}`}
      />
    </div>
  );
}

const METRIC_TYPES: NewMetricInput["type"][] = [
  "number",
  "scale",
  "text",
  "checkbox",
];

function MetricsSection({ metrics }: { metrics: Metric[] }) {
  const create = useCreateMetric();
  const deleteMetric = useDeleteMetric();
  const [name, setName] = useState("");
  const [type, setType] = useState<NewMetricInput["type"]>("number");

  const custom = metrics.filter((m) => m.ownerId !== null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, type, scope: "set" });
    setName("");
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
        Custom metrics
      </h2>
      <p className="mt-0.5 text-2xs text-faint">
        Everything logged is a metric. Set-scope metrics attach to exercises
        above.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input
          placeholder="New metric name (e.g. Tempo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="metric-name-input"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NewMetricInput["type"])}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink"
          data-testid="metric-type-select"
        >
          {METRIC_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="primary"
          disabled={name.trim().length === 0}
          data-testid="add-metric-btn"
        >
          Add
        </Button>
      </form>

      {custom.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {custom.map((m) => (
            <li
              key={m.id}
              data-testid={`metric-row-${m.name}`}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span>{m.name}</span>
              <span className="flex items-center gap-2">
                <span className="num text-2xs text-faint">
                  {m.type} · {m.scope} · {m.exerciseIds?.length ?? 0} exercises
                </span>
                <button
                  type="button"
                  title="Delete metric"
                  onClick={() => deleteMetric.mutate(m.id)}
                  className="rounded-sm p-0.5 text-faint transition-colors duration-100 hover:text-neg"
                  data-testid={`delete-metric-${m.name}`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
