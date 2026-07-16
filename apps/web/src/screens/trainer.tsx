import {
  distributionBetween,
  EQUIPMENT_KINDS,
  EQUIPMENT_LABELS,
  type EquipmentKind,
  formatWeight,
  type GeneratorConfig,
  type GeneratorExperience,
  type GeneratorGoal,
  generateProgram,
  MUSCLE_REGION_LABELS,
  MUSCLE_REGIONS,
  MUSCLES,
  type MuscleByExercise,
  muscleLabel,
  overloadStepKg,
  type Program,
  type Routine,
  type RoutineDetail,
  toDisplayWeight,
  unitLabel,
  weeklyConsistency,
} from "@sbl/core";
import {
  ArrowLeft,
  Check,
  MoreHorizontal,
  Play,
  Settings,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { LineChart } from "@/components/charts/line";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMeasurements } from "@/lib/measure-queries";
import { useUserPrefs } from "@/lib/profile-queries";
import {
  useActiveProgram,
  useDeleteProgram,
  useMaterializeProgram,
  useRegenerateProgram,
  useSetGeneratorExcluded,
} from "@/lib/program-queries";
import { useExercisePrefs, useExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useRepo } from "@/lib/repo";
import { useUpdateRoutine } from "@/lib/routine-queries";
import { type Unit, useUnit } from "@/lib/settings";
import {
  buildRoutineInput,
  type ExerciseOverload,
  editableExercises,
  rankAlternatives,
  selectableFrom,
  startingWeightsFrom,
  useTrainerData,
} from "@/lib/trainer";
import { cn } from "@/lib/utils";

// Rule-based Trainer (Hevy-parity M11 — deterministic generator, no LLM). No
// active program → questionnaire → generated program. Active program → next
// workout card, per-exercise overload prescriptions + modify menu, program
// settings, and a progress report. All logic runs client-side on the same
// generator + overload rule + stats aggregations used elsewhere.
export default function TrainerScreen() {
  const { data: program, isLoading } = useActiveProgram();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <Link
          to="/train"
          aria-label="Back to training"
          className="flex size-8 shrink-0 items-center justify-center text-faint transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Trainer</h1>
          <p className="text-2xs text-faint">
            A rule-based program that progresses your weights automatically.
          </p>
        </div>
      </div>

      {isLoading ? null : program ? (
        <TrainerDashboard program={program} />
      ) : (
        <TrainerOnboarding />
      )}
    </div>
  );
}

// ── Shared form controls ─────────────────────────────────────────────────────

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  labelOf,
  testId,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf?: (v: T) => string;
  testId?: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-0.5" data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          data-testid={testId ? `${testId}-${o}` : undefined}
          className={cn(
            "h-9 flex-1 shrink-0 px-3 text-xs whitespace-nowrap transition-colors duration-150",
            value === o
              ? "bg-accent-soft text-accent"
              : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
          )}
        >
          {labelOf ? labelOf(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-2xs font-medium tracking-widest text-faint uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

const GOALS: GeneratorGoal[] = ["muscle", "strength", "general"];
const GOAL_LABEL: Record<GeneratorGoal, string> = {
  muscle: "Muscle",
  strength: "Strength",
  general: "General",
};
const EXPERIENCES: GeneratorExperience[] = [
  "beginner",
  "intermediate",
  "advanced",
];
const EXPERIENCE_LABEL: Record<GeneratorExperience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
const DAYS = [2, 3, 4, 5, 6] as const;
const MINUTES = [30, 45, 60, 75, 90] as const;
// Selectable equipment (bodyweight is always available; plate/other aren't
// meaningful generator inputs).
const SELECTABLE_EQUIPMENT = EQUIPMENT_KINDS.filter(
  (e) => e !== "bodyweight" && e !== "plate" && e !== "other",
);

const DEFAULT_CONFIG: GeneratorConfig = {
  goal: "muscle",
  experience: "intermediate",
  equipment: ["barbell", "dumbbell", "machine", "cable"],
  daysPerWeek: 4,
  minutesPerWorkout: 60,
  focusMuscle: null,
};

function QuestionnaireForm({
  config,
  setConfig,
}: {
  config: GeneratorConfig;
  setConfig: (c: GeneratorConfig) => void;
}) {
  const equipSet = new Set(config.equipment);
  function toggleEquip(k: EquipmentKind) {
    const next = new Set(equipSet);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setConfig({ ...config, equipment: [...next] });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Goal">
        <Segmented
          options={GOALS}
          value={config.goal}
          onChange={(v) => setConfig({ ...config, goal: v })}
          labelOf={(v) => GOAL_LABEL[v]}
          testId="q-goal"
        />
      </Field>
      <Field label="Experience">
        <Segmented
          options={EXPERIENCES}
          value={config.experience}
          onChange={(v) => setConfig({ ...config, experience: v })}
          labelOf={(v) => EXPERIENCE_LABEL[v]}
          testId="q-experience"
        />
      </Field>
      <Field label="Equipment">
        <div className="flex flex-wrap gap-1" data-testid="q-equipment">
          {SELECTABLE_EQUIPMENT.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleEquip(k)}
              aria-pressed={equipSet.has(k)}
              data-testid={`q-equip-${k}`}
              className={cn(
                "h-8 px-3 text-xs transition-colors duration-150",
                equipSet.has(k)
                  ? "bg-accent-soft text-accent"
                  : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
              )}
            >
              {EQUIPMENT_LABELS[k]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-2xs text-faint">
          Bodyweight movements are always included.
        </p>
      </Field>
      <Field label="Days per week">
        <Segmented
          options={DAYS}
          value={config.daysPerWeek}
          onChange={(v) => setConfig({ ...config, daysPerWeek: v })}
          testId="q-days"
        />
      </Field>
      <Field label="Minutes per workout">
        <Segmented
          options={MINUTES}
          value={config.minutesPerWorkout}
          onChange={(v) => setConfig({ ...config, minutesPerWorkout: v })}
          testId="q-minutes"
        />
      </Field>
      <Field label="Focus muscle (optional)">
        <select
          value={config.focusMuscle ?? ""}
          onChange={(e) =>
            setConfig({ ...config, focusMuscle: e.target.value || null })
          }
          data-testid="q-focus"
          className="h-9 w-full border border-border bg-surface px-2 text-xs text-ink"
        >
          <option value="">None</option>
          {MUSCLES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// Preview of a freshly generated program (routine list + exercise lines).
function GeneratedPreview({
  config,
  library,
  excludedIds,
  startingWeights,
  nameById,
}: {
  config: GeneratorConfig;
  library: ReturnType<typeof selectableFrom>;
  excludedIds: Set<string>;
  startingWeights: Map<string, number>;
  nameById: Map<string, string>;
}) {
  const program = useMemo(
    () =>
      generateProgram(config, library, {
        excludedIds,
        startingWeightsKg: startingWeights,
      }),
    [config, library, excludedIds, startingWeights],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="generated-preview">
      {program.routines.map((r) => (
        <div key={r.name} className="border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{r.name}</span>
            <span className="num text-2xs text-faint">
              {r.exercises.length} exercises
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {r.exercises.map((ex) => {
              const first = ex.sets[0];
              const reps =
                first?.targetRepsMax != null
                  ? `${first.targetReps}–${first.targetRepsMax}`
                  : `${first?.targetReps ?? ""}`;
              return (
                <div
                  key={ex.exerciseId}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="truncate text-ink">
                    {nameById.get(ex.exerciseId) ?? "Exercise"}
                  </span>
                  <span className="num shrink-0 text-faint">
                    {ex.sets.length} × {reps}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Onboarding (no active program) ───────────────────────────────────────────

function TrainerOnboarding() {
  const [config, setConfig] = useState<GeneratorConfig>(DEFAULT_CONFIG);
  const { data: exercises = [] } = useExercises();
  const { data: prefs = [] } = useExercisePrefs();
  const { data: records } = useRecordsData();
  const materialize = useMaterializeProgram();

  const library = useMemo(() => selectableFrom(exercises), [exercises]);
  const nameById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.name])),
    [exercises],
  );
  const excludedIds = useMemo(
    () =>
      new Set(
        prefs.filter((p) => p.generatorExcluded).map((p) => p.exerciseId),
      ),
    [prefs],
  );
  const startingWeights = useMemo(
    () => (records ? startingWeightsFrom(records.records) : new Map()),
    [records],
  );

  async function start() {
    if (materialize.isPending || library.length === 0) return;
    const program = generateProgram(config, library, {
      excludedIds,
      startingWeightsKg: startingWeights,
    });
    await materialize.mutateAsync({ program, source: "generated", config });
    // active-program invalidates → dashboard renders in place.
  }

  return (
    <div className="mt-4 flex flex-col gap-5">
      <div className="border border-border bg-surface p-4">
        <p className="text-sm text-soft">
          Answer a few questions and the Trainer builds a full program from
          SBL's exercise tiers. Each week it prescribes a small weight increase
          on lifts where you hit the top of the rep range — no guesswork, no AI.
        </p>
      </div>

      <QuestionnaireForm config={config} setConfig={setConfig} />

      <Button
        variant="primary"
        className="w-full"
        disabled={materialize.isPending || library.length === 0}
        onClick={() => void start()}
        data-testid="start-program-btn"
      >
        {materialize.isPending ? "Building…" : "Start program"}
      </Button>

      <div>
        <p className="mb-2 text-2xs font-medium tracking-widest text-faint uppercase">
          Preview
        </p>
        {library.length > 0 && (
          <GeneratedPreview
            config={config}
            library={library}
            excludedIds={excludedIds}
            startingWeights={startingWeights}
            nameById={nameById}
          />
        )}
      </div>
    </div>
  );
}

// ── Dashboard (active program) ───────────────────────────────────────────────

function estMinutes(detail: RoutineDetail | undefined): number {
  if (!detail) return 0;
  let sec = 0;
  for (const ex of detail.exercises) {
    const rest = ex.restSec ?? 90;
    sec += ex.sets.length * (rest + 45);
  }
  return Math.max(1, Math.round(sec / 60));
}

function TrainerDashboard({ program }: { program: Program }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const td = useTrainerData(program);
  const { data: exercises = [] } = useExercises();

  const nameById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.name])),
    [exercises],
  );

  const next = td.nextRoutine;
  const nextDetail = next ? td.detailByRoutine.get(next.id) : undefined;
  const nextOverloads = next ? (td.overloadByRoutine.get(next.id) ?? []) : [];

  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Your program</p>
          <p className="num text-2xs text-faint">
            {td.routines.length} workouts ·{" "}
            {program.source === "generated" ? "Generated" : "From catalog"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          data-testid="program-settings-btn"
        >
          <Settings className="size-4" /> Settings
        </Button>
      </div>

      {next && nextDetail ? (
        <NextWorkoutCard
          routine={next}
          detail={nextDetail}
          overloads={nextOverloads}
          lastAt={td.lastByRoutine.get(next.id)?.endedAt ?? null}
          nameById={nameById}
        />
      ) : (
        <p className="text-xs text-faint">Loading your next workout…</p>
      )}

      <ProgressReport program={program} td={td} nameById={nameById} />

      <ProgramSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        program={program}
      />
    </div>
  );
}

function NextWorkoutCard({
  routine,
  detail,
  overloads,
  lastAt,
  nameById,
}: {
  routine: Routine;
  detail: RoutineDetail;
  overloads: ExerciseOverload[];
  lastAt: number | null;
  nameById: Map<string, string>;
}) {
  const navigate = useNavigate();
  const repo = useRepo();
  const { unit } = useUnit();
  const { data: exercises = [] } = useExercises();
  const { data: prefs = [] } = useExercisePrefs();
  const updateRoutine = useUpdateRoutine();
  const setExcluded = useSetGeneratorExcluded();
  const [starting, setStarting] = useState(false);
  const [replace, setReplace] = useState<{ detailId: string } | null>(null);

  const library = useMemo(() => selectableFrom(exercises), [exercises]);
  const equipById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.equipment])),
    [exercises],
  );
  const muscleById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.muscleTargets])),
    [exercises],
  );
  const excludedIds = useMemo(
    () =>
      new Set(
        prefs.filter((p) => p.generatorExcluded).map((p) => p.exerciseId),
      ),
    [prefs],
  );

  const overloadByDetailId = useMemo(
    () => new Map(overloads.map((o) => [o.detailId, o.result])),
    [overloads],
  );
  const canProgress = overloads.some((o) => o.result.advance);

  async function startWorkout() {
    if (starting) return;
    setStarting(true);
    try {
      const session = await repo.startRoutineSession(routine.id);
      navigate(`/session/${session.id}`);
    } finally {
      setStarting(false);
    }
  }

  function applyProgression() {
    const exs = editableExercises(detail).map((ex) => {
      const res = overloadByDetailId.get(ex.detailId);
      if (!res?.advance) return ex;
      return {
        ...ex,
        sets: ex.sets.map((s, i) => ({
          ...s,
          targetWeightKg: res.nextWeightKg[i] ?? s.targetWeightKg,
        })),
      };
    });
    updateRoutine.mutate({
      routineId: routine.id,
      patch: buildRoutineInput(routine, exs),
    });
  }

  function removeExercise(detailId: string) {
    const exs = editableExercises(detail).filter(
      (e) => e.detailId !== detailId,
    );
    updateRoutine.mutate({
      routineId: routine.id,
      patch: buildRoutineInput(routine, exs),
    });
  }

  function replaceExercise(detailId: string, newExerciseId: string) {
    const exs = editableExercises(detail).map((e) =>
      e.detailId === detailId
        ? {
            ...e,
            exerciseId: newExerciseId,
            sets: e.sets.map((s) => ({ ...s, targetWeightKg: null })),
          }
        : e,
    );
    updateRoutine.mutate({
      routineId: routine.id,
      patch: buildRoutineInput(routine, exs),
    });
  }

  async function dontRecommend(detailId: string, exerciseId: string) {
    await setExcluded.mutateAsync({ exerciseId, excluded: true });
    const muscle = muscleById.get(exerciseId)?.[0]?.muscle;
    const used = new Set(detail.exercises.map((e) => e.exerciseId));
    used.add(exerciseId);
    const alt = muscle
      ? rankAlternatives(library, muscle, {
          excludeIds: new Set([...used, ...excludedIds]),
          limit: 1,
        })[0]
      : undefined;
    if (alt) replaceExercise(detailId, alt.id);
    else removeExercise(detailId);
  }

  const est = estMinutes(detail);

  return (
    <div
      className="border border-border bg-surface p-4"
      data-testid="next-workout-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xs font-medium tracking-widest text-accent uppercase">
            Next workout
          </p>
          <p className="mt-0.5 text-base font-semibold">{routine.name}</p>
          <p className="num mt-0.5 text-2xs text-faint">
            {detail.exercises.length} exercises · ~{est} min
            {lastAt == null ? " · not started yet" : ""}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={starting}
          onClick={() => void startWorkout()}
          data-testid="start-next-workout-btn"
        >
          <Play className="size-4" /> {starting ? "Starting…" : "Start"}
        </Button>
      </div>

      {canProgress && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={applyProgression}
          data-testid="apply-progression-btn"
        >
          <TrendingUp className="size-4" /> Apply progression to routine
        </Button>
      )}

      <div className="mt-3 flex flex-col divide-y divide-border">
        {editableExercises(detail).map((ex) => (
          <ExerciseRow
            key={ex.detailId}
            name={nameById.get(ex.exerciseId) ?? ex.exerciseName}
            sets={ex.sets.length}
            reps={
              ex.sets[0]?.targetRepsMax != null
                ? `${ex.sets[0]?.targetReps}–${ex.sets[0]?.targetRepsMax}`
                : `${ex.sets[0]?.targetReps ?? ""}`
            }
            overload={overloadByDetailId.get(ex.detailId)}
            step={overloadStepKg(equipById.get(ex.exerciseId))}
            unit={unit}
            onReplace={() => setReplace({ detailId: ex.detailId })}
            onRemove={() => removeExercise(ex.detailId)}
            onExclude={() => void dontRecommend(ex.detailId, ex.exerciseId)}
          />
        ))}
      </div>

      {replace && (
        <ReplaceDialog
          open
          onOpenChange={(o) => !o && setReplace(null)}
          library={library}
          muscle={
            muscleById.get(
              detail.exercises.find((e) => e.id === replace.detailId)
                ?.exerciseId ?? "",
            )?.[0]?.muscle ?? null
          }
          excludeIds={
            new Set([
              ...detail.exercises.map((e) => e.exerciseId),
              ...excludedIds,
            ])
          }
          onPick={(id) => {
            replaceExercise(replace.detailId, id);
            setReplace(null);
          }}
        />
      )}
    </div>
  );
}

function ExerciseRow({
  name,
  sets,
  reps,
  overload,
  step,
  unit,
  onReplace,
  onRemove,
  onExclude,
}: {
  name: string;
  sets: number;
  reps: string;
  overload: ExerciseOverload["result"] | undefined;
  step: number;
  unit: Unit;
  onReplace: () => void;
  onRemove: () => void;
  onExclude: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="flex items-center gap-2 py-2"
      data-testid={`trainer-ex-${name}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-ink">{name}</p>
        <p className="num text-2xs text-faint">
          {sets} × {reps}
        </p>
      </div>
      {overload?.advance ? (
        <span
          className="num shrink-0 text-2xs text-pos"
          data-testid="overload-badge"
        >
          +{formatWeight(step, unit)}
        </span>
      ) : overload?.status === "maintaining" ? (
        <span className="shrink-0 text-2xs text-faint">hold</span>
      ) : null}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Exercise menu"
          onClick={() => setMenuOpen((o) => !o)}
          data-testid={`trainer-ex-menu-${name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col border border-border bg-surface p-1 shadow-md">
            <MenuItem
              label="Replace exercise"
              onClick={() => {
                setMenuOpen(false);
                onReplace();
              }}
            />
            <MenuItem
              label="Don't recommend again"
              onClick={() => {
                setMenuOpen(false);
                onExclude();
              }}
            />
            <MenuItem
              label="Remove"
              destructive
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 items-center px-2 text-left text-xs hover:bg-surface-hover",
        destructive && "text-neg",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ReplaceDialog({
  open,
  onOpenChange,
  library,
  muscle,
  excludeIds,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  library: ReturnType<typeof selectableFrom>;
  muscle: string | null;
  excludeIds: Set<string>;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const alternatives = useMemo(
    () =>
      muscle ? rankAlternatives(library, muscle, { excludeIds, limit: 4 }) : [],
    [library, muscle, excludeIds],
  );
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 20);
  }, [library, query]);

  const list = query.trim() ? searchResults : alternatives;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Replace exercise">
        {muscle && !query.trim() && (
          <p className="mb-2 text-2xs text-faint">
            Top {muscleLabel(muscle)} alternatives by SBL tier.
          </p>
        )}
        <Input
          placeholder="Search all exercises…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="replace-search"
        />
        <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e.id)}
              data-testid={`replace-pick-${e.name}`}
              className="flex h-10 items-center px-2 text-left text-xs hover:bg-surface-hover"
            >
              {e.name}
            </button>
          ))}
          {list.length === 0 && (
            <p className="py-4 text-center text-2xs text-faint">
              {query.trim() ? "No matches." : "No alternatives available."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Program settings ─────────────────────────────────────────────────────────

function ProgramSettingsDialog({
  open,
  onOpenChange,
  program,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  program: Program;
}) {
  const { data: exercises = [] } = useExercises();
  const { data: prefs = [] } = useExercisePrefs();
  const { data: records } = useRecordsData();
  const regenerate = useRegenerateProgram();
  const del = useDeleteProgram();

  const generated = program.source === "generated";
  const [config, setConfig] = useState<GeneratorConfig>(() =>
    generated && program.config
      ? (program.config as unknown as GeneratorConfig)
      : DEFAULT_CONFIG,
  );

  const library = useMemo(() => selectableFrom(exercises), [exercises]);
  const excludedIds = useMemo(
    () =>
      new Set(
        prefs.filter((p) => p.generatorExcluded).map((p) => p.exerciseId),
      ),
    [prefs],
  );

  function doRegenerate() {
    if (
      !window.confirm(
        "Rebuild this program's workouts from the new settings? Current routines are replaced.",
      )
    )
      return;
    const startingWeights = records
      ? startingWeightsFrom(records.records)
      : new Map();
    const newProgram = generateProgram(config, library, {
      excludedIds,
      startingWeightsKg: startingWeights,
    });
    regenerate.mutate(
      {
        programId: program.id,
        folderId: program.folderId,
        program: newProgram,
        config,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function doRemove() {
    if (
      !window.confirm(
        "Remove this program from the Trainer? Its routines stay in your Training tab.",
      )
    )
      return;
    del.mutate(program.id, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Program settings">
        {generated ? (
          <>
            <div className="max-h-[60vh] overflow-y-auto">
              <QuestionnaireForm config={config} setConfig={setConfig} />
            </div>
            <Button
              variant="primary"
              className="mt-4 w-full"
              disabled={regenerate.isPending}
              onClick={doRegenerate}
              data-testid="regenerate-btn"
            >
              {regenerate.isPending ? "Rebuilding…" : "Regenerate program"}
            </Button>
          </>
        ) : (
          <p className="text-xs text-soft">
            This program was saved from the catalog. Edit its routines in the
            Training tab, or remove it from the Trainer below.
          </p>
        )}
        <Button
          variant="danger"
          className="mt-2 w-full"
          onClick={doRemove}
          data-testid="remove-program-btn"
        >
          Remove program
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── Progress report ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function ProgressReport({
  program,
  td,
  nameById,
}: {
  program: Program;
  td: ReturnType<typeof useTrainerData>;
  nameById: Map<string, string>;
}) {
  const { unit } = useUnit();
  const { data: exercises = [] } = useExercises();
  const { data: prefs } = useUserPrefs();
  const { data: records } = useRecordsData();
  const { data: measurements = [] } = useMeasurements();

  const muscles: MuscleByExercise = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.muscleTargets ?? null])),
    [exercises],
  );

  // Pinned once per mount so the report doesn't jitter (and the memos below
  // stay stable): now + the stats options.
  const now = useMemo(() => Date.now(), []);
  const firstWeekday = prefs?.firstWeekday ?? 1;
  const includeWarmups = records?.includeWarmups ?? true;
  const opts = useMemo(
    () => ({ now, firstWeekday, includeWarmups }),
    [now, firstWeekday, includeWarmups],
  );

  const consistency = useMemo(
    () => (records ? weeklyConsistency(records.history, 8, opts) : []),
    [records, opts],
  );

  const totals = useMemo(
    () =>
      records
        ? distributionBetween(
            records.history,
            muscles,
            program.createdAt,
            now + 1,
            opts,
            measurements.find((m) => m.bodyweightKg != null)?.bodyweightKg ??
              null,
          ).totals
        : null,
    [records, muscles, program.createdAt, now, opts, measurements],
  );

  // Weekly sets per body region, for the recommended 10–20 band.
  const regionSets = useMemo(
    () =>
      records
        ? distributionBetween(
            records.history,
            muscles,
            now - 7 * DAY_MS,
            now + 1,
            opts,
          ).regionSets
        : null,
    [records, muscles, now, opts],
  );

  // Per-exercise progressing/maintaining flags across the whole program.
  const exerciseFlags = useMemo(() => {
    const byId = new Map<string, "progressing" | "maintaining" | "no_data">();
    const rank = { progressing: 2, maintaining: 1, no_data: 0 } as const;
    for (const list of td.overloadByRoutine.values()) {
      for (const o of list) {
        const cur = byId.get(o.exerciseId);
        if (!cur || rank[o.result.status] > rank[cur])
          byId.set(o.exerciseId, o.result.status);
      }
    }
    return [...byId.entries()].sort((a, b) => rank[b[1]] - rank[a[1]]);
  }, [td.overloadByRoutine]);

  const bodyweightPoints = useMemo(
    () =>
      measurements
        .filter((m) => m.bodyweightKg != null)
        .map((m) => ({
          x: new Date(`${m.measuredOn}T00:00:00`).getTime(),
          y: toDisplayWeight(m.bodyweightKg as number, unit),
        }))
        .sort((a, b) => a.x - b.x),
    [measurements, unit],
  );

  if (!records) return null;

  return (
    <div className="flex flex-col gap-5" data-testid="progress-report">
      <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
        Progress report
      </h2>

      {/* Totals since program start */}
      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Workouts" value={String(totals.workouts)} />
          <Stat
            label="Time"
            value={`${Math.round(totals.durationMs / 3_600_000)}h`}
          />
          <Stat label="Volume" value={formatWeight(totals.volumeKg, unit)} />
          <Stat label="Sets" value={String(Math.round(totals.sets))} />
        </div>
      )}

      {/* Weekly consistency */}
      <div>
        <p className="mb-2 text-2xs text-faint">Weekly consistency (8 weeks)</p>
        <div className="flex items-end gap-1" data-testid="consistency-bars">
          {consistency.map((w) => {
            const maxS = Math.max(...consistency.map((c) => c.sessions), 1);
            return (
              <div
                key={w.weekStart}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full bg-accent"
                  style={{ height: `${8 + (w.sessions / maxS) * 40}px` }}
                />
                <span className="num text-2xs text-faint">{w.sessions}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sets per body region with recommended 10–20 band */}
      {regionSets && (
        <div>
          <p className="mb-2 text-2xs text-faint">
            Weekly sets per muscle group ·{" "}
            <span className="text-pos">green band = 10–20 recommended</span>
          </p>
          <SetsPerRegionBars regionSets={regionSets} />
        </div>
      )}

      {/* Per-exercise progression flags */}
      {exerciseFlags.length > 0 && (
        <div>
          <p className="mb-2 text-2xs text-faint">Exercise progression</p>
          <div className="flex flex-col divide-y divide-border">
            {exerciseFlags.map(([id, status]) => (
              <div
                key={id}
                className="flex items-center justify-between py-1.5"
                data-testid={`flag-${nameById.get(id) ?? id}`}
              >
                <span className="truncate text-xs text-ink">
                  {nameById.get(id) ?? "Exercise"}
                </span>
                <FlagBadge status={status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bodyweight trend */}
      <div>
        <p className="mb-2 text-2xs text-faint">
          Bodyweight trend ({unitLabel(unit)})
        </p>
        <LineChart
          points={bodyweightPoints}
          formatX={(x) =>
            new Date(x).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          }
          formatY={(y) => y.toFixed(1)}
          ariaLabel="Bodyweight trend"
          testId="bodyweight-trend"
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface p-3">
      <p className="text-2xs tracking-widest text-faint uppercase">{label}</p>
      <p className="num mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function FlagBadge({
  status,
}: {
  status: "progressing" | "maintaining" | "no_data";
}) {
  if (status === "progressing")
    return (
      <span className="flex items-center gap-1 text-2xs text-pos">
        <Check className="size-3" /> Progressing
      </span>
    );
  if (status === "maintaining")
    return <span className="text-2xs text-faint">Maintaining</span>;
  return <span className="text-2xs text-faint">No data</span>;
}

// Horizontal bars per region with a shaded 10–20 recommended band. Scale caps
// at max(24, highest count) so the band sits in a stable spot.
function SetsPerRegionBars({
  regionSets,
}: {
  regionSets: Record<string, number>;
}) {
  const max = Math.max(24, ...MUSCLE_REGIONS.map((r) => regionSets[r] ?? 0));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="flex flex-col gap-1.5" data-testid="sets-per-region">
      {MUSCLE_REGIONS.map((r) => {
        const v = regionSets[r] ?? 0;
        const inBand = v >= 10 && v <= 20;
        return (
          <div key={r} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-2xs text-faint">
              {MUSCLE_REGION_LABELS[r]}
            </span>
            <div className="relative h-4 flex-1 bg-translucent">
              {/* recommended band */}
              <div
                className="absolute inset-y-0 bg-pos/15"
                style={{ left: pct(10), width: pct(10) }}
              />
              <div
                className={cn(
                  "absolute inset-y-0 left-0",
                  inBand ? "bg-pos" : "bg-accent",
                )}
                style={{ width: pct(v) }}
              />
            </div>
            <span className="num w-8 shrink-0 text-right text-2xs text-soft">
              {v % 1 === 0 ? v : v.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
