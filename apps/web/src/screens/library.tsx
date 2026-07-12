import type { Exercise, Metric, NewMetricInput } from "@sbl/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateExercise,
  useCreateMetric,
  useExercises,
  useMetrics,
  useSetMetricExercises,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function LibraryScreen() {
  const { data: exercises = [], isLoading } = useExercises();
  const { data: metrics = [] } = useMetrics();
  const create = useCreateExercise();
  const [name, setName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setMetrics = metrics.filter(
    (m) => m.scope === "set" && m.ownerId !== null,
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed);
    setName("");
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
        <Button
          type="submit"
          variant="primary"
          disabled={name.trim().length === 0}
          data-testid="add-exercise-btn"
        >
          Add
        </Button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {isLoading ? (
          <p className="px-3.5 py-6 text-center text-xs text-faint">Loading…</p>
        ) : exercises.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-faint">
            No exercises yet. Add your first above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {exercises.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                setMetrics={setMetrics}
                expanded={expandedId === ex.id}
                onToggle={() =>
                  setExpandedId(expandedId === ex.id ? null : ex.id)
                }
              />
            ))}
          </ul>
        )}
      </div>

      <MetricsSection metrics={metrics} />
    </div>
  );
}

function ExerciseRow({
  exercise,
  setMetrics,
  expanded,
  onToggle,
}: {
  exercise: Exercise;
  setMetrics: Metric[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const toggleMetric = useSetMetricExercises();
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li data-testid={`exercise-row-${exercise.name}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors duration-100 hover:bg-surface-hover"
      >
        <span className="flex items-center gap-2">
          <Chevron className="size-3.5 text-faint" />
          {exercise.name}
        </span>
        {!exercise.isCustom && (
          <span className="text-2xs text-faint uppercase">seed</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border bg-surface-2 px-3.5 py-2.5 pl-9">
          {setMetrics.length === 0 ? (
            <p className="text-2xs text-faint">
              No custom set metrics yet — create one below to track it per set
              here.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
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
                      className="size-3.5 accent-(--accent)"
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
        </div>
      )}
    </li>
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
      <h2 className="text-sm font-medium">Custom metrics</h2>
      <p className="mt-0.5 text-2xs text-faint">
        Everything logged is a metric. Set-scope metrics attach to exercises
        above.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input
          placeholder="New metric name (e.g. Seat height)"
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
              className="flex items-center justify-between px-3.5 py-2 text-sm"
            >
              <span>{m.name}</span>
              <span className="num text-2xs text-faint">
                {m.type} · {m.scope} · {m.exerciseIds?.length ?? 0} exercises
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
