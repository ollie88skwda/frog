import { Select } from "@radix-ui/themes";
import {
  EXERCISE_TYPES,
  type Exercise,
  type ExerciseType,
  groupByPrimaryMuscle,
  lbToKg,
  type NewRoutineInput,
  type RoutineExerciseInput,
  SET_TYPE_LABELS,
  SET_TYPE_MARKERS,
  SET_TYPES,
  type SetType,
  TYPE_FIELDS,
  toDisplayWeight,
  unitLabel,
  weightLabel,
} from "@sbl/core";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMMSS, parseDuration } from "@/lib/format";
import { usePendingExercises } from "@/lib/pending-exercises";
import { useExercises } from "@/lib/queries";
import {
  useCreateRoutine,
  useRoutineDetail,
  useRoutineFolders,
  useUpdateRoutine,
} from "@/lib/routine-queries";
import { useUnit } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

// Draft model for the builder: targets in DISPLAY units (converted to kg on
// save). Rep range mode = repsMax non-empty.
type DraftSet = {
  key: string;
  setType: SetType;
  weight: string;
  reps: string;
  repsMax: string;
  duration: string; // mm:ss or seconds
  distance: string; // km/mi display
};

type DraftExercise = {
  key: string;
  exerciseId: string;
  name: string;
  exerciseType: ExerciseType;
  supersetGroup: number | null;
  restSec: number | null;
  note: string;
  sets: DraftSet[];
};

const REST_CHOICES = [null, 0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

// Radix Select forbids empty-string values; these sentinels stand in for the
// null cases (no folder / default rest) and map back to null at the boundary.
const NO_FOLDER = "__none__";
const REST_DEFAULT = "__default__";

function emptySet(): DraftSet {
  return {
    key: crypto.randomUUID(),
    setType: "normal",
    weight: "",
    reps: "",
    repsMax: "",
    duration: "",
    distance: "",
  };
}

function exerciseTypeOf(e: Exercise | undefined): ExerciseType {
  const t = e?.exerciseType as ExerciseType | undefined;
  return t && (EXERCISE_TYPES as readonly string[]).includes(t)
    ? t
    : "weight_reps";
}

export default function RoutineEditScreen() {
  const { id } = useParams(); // undefined on /routines/new
  const navigate = useNavigate();
  const { unit } = useUnit();
  const { t } = useVoice();
  const { data: exercises = [] } = useExercises();
  // Saving the routine inserts routine_exercises against a real FK, so a row
  // whose own create is still queued can't be drafted in.
  const pendingExercises = usePendingExercises();
  const { data: folders = [] } = useRoutineFolders();
  const { data: detail } = useRoutineDetail(id ?? null);
  const createRoutine = useCreateRoutine();
  const updateRoutine = useUpdateRoutine();

  const [name, setName] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null | undefined>(
    undefined,
  );
  const [drafts, setDrafts] = useState<DraftExercise[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  // Seed the draft once when editing an existing routine.
  const seeded = detail && drafts === null && id;
  if (seeded) {
    setName(detail.routine.name);
    setFolderId(detail.routine.folderId);
    setDrafts(
      detail.exercises.map((re) => ({
        key: crypto.randomUUID(),
        exerciseId: re.exerciseId,
        name: re.exerciseName,
        exerciseType: exerciseTypeOf(byId.get(re.exerciseId)),
        supersetGroup: re.supersetGroup,
        restSec: re.restSec,
        note: re.note ?? "",
        sets: re.sets.map((s) => ({
          key: crypto.randomUUID(),
          setType: (s.setType as SetType) ?? "normal",
          weight:
            s.targetWeightKg != null
              ? String(toDisplayWeight(s.targetWeightKg, unit))
              : "",
          reps: s.targetReps != null ? String(s.targetReps) : "",
          repsMax: s.targetRepsMax != null ? String(s.targetRepsMax) : "",
          duration:
            s.targetDurationSec != null ? formatMMSS(s.targetDurationSec) : "",
          distance:
            s.targetDistanceM != null
              ? String(
                  Math.round(
                    (s.targetDistanceM / (unit === "kg" ? 1000 : 1609.344)) *
                      100,
                  ) / 100,
                )
              : "",
        })),
      })),
    );
  }

  const list = drafts ?? [];
  const routineName = name ?? "";

  function patchExercise(i: number, patch: Partial<DraftExercise>) {
    setDrafts((prev) =>
      (prev ?? []).map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );
  }

  function patchSet(i: number, si: number, patch: Partial<DraftSet>) {
    setDrafts((prev) =>
      (prev ?? []).map((d, j) =>
        j === i
          ? {
              ...d,
              sets: d.sets.map((s, k) => (k === si ? { ...s, ...patch } : s)),
            }
          : d,
      ),
    );
  }

  function move(i: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const arr = [...(prev ?? [])];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  // Superset toggle: joins this exercise with the NEXT one (Hevy pairs any
  // two exercises; adjacent pairing covers the common case without a second
  // picker — reorder first, then link).
  function toggleSupersetWithNext(i: number) {
    setDrafts((prev) => {
      const arr = [...(prev ?? [])];
      if (i + 1 >= arr.length) return arr;
      const cur = arr[i];
      const next = arr[i + 1];
      if (
        cur.supersetGroup != null &&
        cur.supersetGroup === next.supersetGroup
      ) {
        // Unlink the pair (next keeps group if a third member follows it).
        arr[i] = { ...cur, supersetGroup: null };
        const third = arr[i + 2];
        if (!third || third.supersetGroup !== next.supersetGroup)
          arr[i + 1] = { ...next, supersetGroup: null };
        return arr;
      }
      const group =
        cur.supersetGroup ??
        next.supersetGroup ??
        Math.max(0, ...arr.map((d) => (d.supersetGroup ?? -1) + 1));
      arr[i] = { ...cur, supersetGroup: group };
      arr[i + 1] = { ...next, supersetGroup: group };
      return arr;
    });
  }

  function toInput(): NewRoutineInput {
    const exercisesInput: RoutineExerciseInput[] = list.map((d, i) => ({
      exerciseId: d.exerciseId,
      orderIndex: i,
      supersetGroup: d.supersetGroup,
      restSec: d.restSec,
      note: d.note.trim() || null,
      sets: d.sets.map((s, si) => {
        const fields = TYPE_FIELDS[d.exerciseType];
        const w = s.weight.trim() === "" ? null : Number.parseFloat(s.weight);
        const reps = s.reps.trim() === "" ? null : Number.parseInt(s.reps, 10);
        const repsMax =
          s.repsMax.trim() === "" ? null : Number.parseInt(s.repsMax, 10);
        return {
          setNo: si,
          setType: s.setType,
          targetWeightKg:
            fields.weight && w != null && Number.isFinite(w)
              ? unit === "kg"
                ? w
                : lbToKg(w)
              : null,
          targetReps: fields.reps ? reps : null,
          targetRepsMax: fields.reps ? repsMax : null,
          targetDurationSec: fields.duration ? parseDuration(s.duration) : null,
          targetDistanceM: (() => {
            if (!fields.distance || s.distance.trim() === "") return null;
            const v = Number.parseFloat(s.distance);
            if (!Number.isFinite(v)) return null;
            return unit === "kg" ? v * 1000 : v * 1609.344;
          })(),
        };
      }),
    }));
    return {
      name: routineName.trim() || "Untitled routine",
      folderId: folderId ?? null,
      exercises: exercisesInput,
    };
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = toInput();
      if (id) await updateRoutine.mutateAsync({ routineId: id, patch: input });
      else await createRoutine.mutateAsync(input);
      navigate("/train");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSaving(false);
    }
  }

  const grouped = useMemo(
    () => groupByPrimaryMuscle(filterExercises(exercises, query, muscle)),
    [exercises, query, muscle],
  );

  // Superset color coding: group index → accent border tint.
  const supersetClass = (g: number | null) =>
    g == null ? "" : "border-l-2 border-l-accent";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">
          {id ? "Edit routine" : "New routine"}
        </h1>
        {/* TODO(lessons): <InfoTip lessonId="programming-a-routine" /> once copy exists */}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/train")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={saving || list.length === 0}
            data-testid="routine-save-btn"
          >
            {saving ? "Saving…" : "Save routine"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Routine name"
          value={routineName}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
          data-testid="routine-name-input"
        />
        <Select.Root
          value={folderId ?? NO_FOLDER}
          onValueChange={(v) => setFolderId(v === NO_FOLDER ? null : v)}
          size="2"
        >
          <Select.Trigger
            variant="surface"
            className="w-full sm:w-40"
            data-testid="routine-folder-select"
          />
          <Select.Content>
            <Select.Item value={NO_FOLDER}>No folder</Select.Item>
            {folders.map((f) => (
              <Select.Item key={f.id} value={f.id}>
                {f.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>

      {/* Frog frames the failure; the exact error stays outside t() so the
          fact survives every register. */}
      {error && (
        <p className="mt-3 text-xs text-neg">
          {t("Save failed.", "The frog is annoyed (your draft is safe).")}{" "}
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {list.map((d, i) => {
          const fields = TYPE_FIELDS[d.exerciseType];
          const linkedWithNext =
            i + 1 < list.length &&
            d.supersetGroup != null &&
            list[i + 1].supersetGroup === d.supersetGroup;
          return (
            <div
              key={d.key}
              className={cn(
                "rounded-lg border border-border bg-surface p-3",
                supersetClass(d.supersetGroup),
              )}
              data-testid={`routine-ex-${i}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium">
                  {d.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    linkedWithNext ? "Remove superset" : "Superset with next"
                  }
                  className={cn(linkedWithNext && "text-accent")}
                  onClick={() => toggleSupersetWithNext(i)}
                  disabled={i === list.length - 1 && !linkedWithNext}
                  data-testid={`routine-ex-${i}-superset`}
                >
                  <Link2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove exercise"
                  onClick={() =>
                    setDrafts((prev) => (prev ?? []).filter((_, j) => j !== i))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-2xs text-soft">
                  Rest
                  <Select.Root
                    value={d.restSec == null ? REST_DEFAULT : String(d.restSec)}
                    onValueChange={(v) =>
                      patchExercise(i, {
                        restSec:
                          v === REST_DEFAULT ? null : Number.parseInt(v, 10),
                      })
                    }
                    size="2"
                  >
                    <Select.Trigger
                      variant="surface"
                      aria-label="Rest"
                      data-testid={`routine-ex-${i}-rest`}
                    />
                    <Select.Content>
                      {REST_CHOICES.map((r) => (
                        <Select.Item
                          key={String(r)}
                          value={r == null ? REST_DEFAULT : String(r)}
                        >
                          {r == null
                            ? "Default"
                            : r === 0
                              ? "Off"
                              : formatMMSS(r)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </span>
                <Input
                  placeholder="Exercise note (shows every session)"
                  value={d.note}
                  onChange={(e) => patchExercise(i, { note: e.target.value })}
                  className="h-8 min-w-40 flex-1 text-xs"
                />
              </div>

              <div className="num mt-2 grid grid-cols-[2.5rem_1fr_1fr_2rem] items-center gap-1 text-2xs text-faint">
                <span>SET</span>
                {fields.weight ? (
                  <span>{weightLabel(d.exerciseType, unitLabel(unit))}</span>
                ) : fields.duration ? (
                  <span>TIME</span>
                ) : (
                  <span />
                )}
                {fields.reps ? (
                  <span>REPS</span>
                ) : fields.distance ? (
                  <span>{unit === "kg" ? "KM" : "MI"}</span>
                ) : fields.weight && fields.duration ? (
                  <span>TIME</span>
                ) : (
                  <span />
                )}
                <span />
              </div>

              {d.sets.map((s, si) => (
                <div
                  key={s.key}
                  className="mt-1 grid grid-cols-[2.5rem_1fr_1fr_2rem] items-center gap-1"
                >
                  <SetTypeCell
                    value={s.setType}
                    index={si}
                    onChange={(t) => patchSet(i, si, { setType: t })}
                    testId={`routine-ex-${i}-set-${si}-type`}
                  />
                  {fields.weight ? (
                    <Input
                      inputMode="decimal"
                      placeholder="—"
                      value={s.weight}
                      onChange={(e) =>
                        patchSet(i, si, { weight: e.target.value })
                      }
                      className="num h-8"
                      data-testid={`routine-ex-${i}-set-${si}-weight`}
                    />
                  ) : fields.duration ? (
                    <Input
                      inputMode="numeric"
                      placeholder="mm:ss"
                      value={s.duration}
                      onChange={(e) =>
                        patchSet(i, si, { duration: e.target.value })
                      }
                      className="num h-8"
                    />
                  ) : (
                    <span />
                  )}
                  {fields.reps ? (
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="numeric"
                        placeholder="reps"
                        value={s.reps}
                        onChange={(e) =>
                          patchSet(i, si, { reps: e.target.value })
                        }
                        className="num h-8"
                        data-testid={`routine-ex-${i}-set-${si}-reps`}
                      />
                      <span className="text-2xs text-faint">–</span>
                      <Input
                        inputMode="numeric"
                        placeholder="max"
                        title="Optional rep-range max"
                        value={s.repsMax}
                        onChange={(e) =>
                          patchSet(i, si, { repsMax: e.target.value })
                        }
                        className="num h-8"
                        data-testid={`routine-ex-${i}-set-${si}-repsmax`}
                      />
                    </div>
                  ) : fields.distance ? (
                    <Input
                      inputMode="decimal"
                      placeholder="—"
                      value={s.distance}
                      onChange={(e) =>
                        patchSet(i, si, { distance: e.target.value })
                      }
                      className="num h-8"
                    />
                  ) : fields.weight && fields.duration ? (
                    <Input
                      inputMode="numeric"
                      placeholder="mm:ss"
                      value={s.duration}
                      onChange={(e) =>
                        patchSet(i, si, { duration: e.target.value })
                      }
                      className="num h-8"
                    />
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove set"
                    onClick={() =>
                      patchExercise(i, {
                        sets: d.sets.filter((_, k) => k !== si),
                      })
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() =>
                  patchExercise(i, { sets: [...d.sets, emptySet()] })
                }
                data-testid={`routine-ex-${i}-add-set`}
              >
                <Plus className="size-4" /> Add set
              </Button>
            </div>
          );
        })}
      </div>

      <Button
        variant="outline"
        className="mt-4 w-full"
        onClick={() => setPicking(true)}
        data-testid="routine-add-exercise-btn"
      >
        <Plus className="size-4" /> Add exercise
      </Button>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent
          title="Add exercise"
          className="max-h-[80vh] overflow-y-auto"
        >
          <ExerciseFilterBar
            query={query}
            onQuery={setQuery}
            muscle={muscle}
            onMuscle={setMuscle}
            autoFocus
          />
          <div className="mt-2 flex flex-col gap-3">
            {grouped.length === 0 && (
              <p className="text-xs text-faint">
                {t(
                  "No exercises match your search.",
                  "No exercises match. The frog refuses to speculate.",
                )}
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.key}>
                <p className="text-2xs font-medium tracking-widest text-faint uppercase">
                  {g.label}
                </p>
                <div className="mt-1 flex flex-col">
                  {g.items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      disabled={pendingExercises.has(e.id)}
                      title={
                        pendingExercises.has(e.id)
                          ? `${e.name} is still saving`
                          : undefined
                      }
                      className="flex h-10 items-center rounded-md px-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                      onClick={() => {
                        setDrafts((prev) => [
                          ...(prev ?? []),
                          {
                            key: crypto.randomUUID(),
                            exerciseId: e.id,
                            name: e.name,
                            exerciseType: exerciseTypeOf(e),
                            supersetGroup: null,
                            restSec: null,
                            note: "",
                            sets: [emptySet(), emptySet(), emptySet()],
                          },
                        ]);
                        setPicking(false);
                      }}
                      data-testid={`routine-pick-${e.name}`}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetTypeCell({
  value,
  index,
  onChange,
  testId,
}: {
  value: SetType;
  index: number;
  onChange: (t: SetType) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const marker = SET_TYPE_MARKERS[value];
  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "num flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-xs",
          value === "warmup" && "text-warn",
          value === "failure" && "text-neg",
          value === "drop" && "text-accent",
        )}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        {marker || index + 1}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 flex w-32 flex-col rounded-md border border-border bg-surface p-1 shadow-md">
          {SET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="flex h-8 items-center px-2 text-left text-xs hover:bg-surface-2"
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              data-testid={testId ? `${testId}-${t}` : undefined}
            >
              {SET_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
