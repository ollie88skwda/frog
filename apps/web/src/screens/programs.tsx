import {
  type GeneratedProgram,
  generateProgram,
  PROGRAM_TEMPLATES,
  templateById,
} from "@frog/core";
import { Barbell, MagicWand } from "@phosphor-icons/react";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { scheduleLabel } from "@/components/builder/logic";
import { SectionHeader } from "@/components/data";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  catalogEntry,
  EQUIPMENT_PROFILE_LABELS,
  entryConfig,
  equipmentProfile,
  GOAL_LABELS,
  LEVEL_LABELS,
  PROGRAM_CATALOG,
  type ProgramCatalogEntry,
} from "@/data/program-catalog";
import {
  useActiveBuilderConfig,
  useMaterializeProgram,
} from "@/lib/program-queries";
import { useExercisePrefs, useExercises } from "@/lib/queries";
import { userFacingRepoError } from "@/lib/repo-error";
import { selectableFrom } from "@/lib/trainer";
import { useVoice } from "@/lib/voice";

// Program catalog (F8). It leads with the guided builder and the four research
// templates (J4); the older generator configs live under "More templates"
// (filters removed 2026-11-13, redesign J9). /programs/new and /programs/edit
// render the builder here so no extra route is needed in app.tsx; any other
// :key is a legacy catalog detail, materialized by generateProgram at save.
const ProgramBuilderScreen = lazy(() => import("@/screens/program-builder"));

export default function ProgramsScreen() {
  const { key } = useParams<{ key: string }>();
  if (key === "new" || key === "edit") {
    return (
      <Suspense
        fallback={
          <p role="status" className="py-10 text-center text-sm text-soft">
            Loading…
          </p>
        }
      >
        <ProgramBuilderScreen />
      </Suspense>
    );
  }
  if (key) return <ProgramDetail programKey={key} />;
  return <ProgramCatalog />;
}

function ProgramCatalog() {
  const { t } = useVoice();
  const [more, setMore] = useState(false);
  const active = useActiveBuilderConfig();
  const activeTemplate = active.config
    ? templateById(active.config.templateId)
    : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-center gap-3">
        <BackButton to="/routines" label="Back to routines" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Programs</h1>
          <p className="text-xs text-soft">
            Five questions, then a plan you can tune before it saves.
          </p>
        </div>
      </div>

      {active.config && activeTemplate && (
        <Card size="sm" className="mt-5 bg-surface-2">
          <div className="flex items-center gap-3 px-(--card-spacing)">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-soft">Your program</p>
              <p className="truncate text-sm font-semibold text-ink">
                {activeTemplate.name}
              </p>
              <p className="num text-xs text-soft">
                {scheduleLabel(active.config.answers.schedule)}
              </p>
            </div>
            <Link
              to="/programs/edit"
              data-testid="program-edit"
              className="inline-flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-semibold text-on-secondary transition-colors duration-150 hover:bg-hover md:h-8"
            >
              Edit
            </Link>
          </div>
        </Card>
      )}

      <Link
        to="/programs/new"
        data-testid="build-my-program"
        className="mt-5 flex min-h-16 items-center gap-3 rounded-md bg-action px-4 py-3 text-on-action transition-colors duration-150 hover:bg-action-hover"
      >
        <MagicWand
          aria-hidden="true"
          weight="fill"
          className="size-6 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Build my program</span>
          <span className="block text-xs opacity-80">
            Schedule, goal, experience, equipment, time.
          </span>
        </span>
      </Link>

      <SectionHeader title="Templates" />
      <div className="flex flex-col gap-2" data-testid="template-list">
        {PROGRAM_TEMPLATES.map((tp) => (
          <Link
            key={tp.id}
            to={`/programs/new?template=${tp.id}`}
            data-testid={`template-${tp.id}`}
            className="block rounded-md bg-surface-2 p-4 transition-colors duration-150 hover:bg-surface-hover"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{tp.name}</span>
              <span className="num shrink-0 text-xs text-soft">
                {scheduleLabel(tp.schedule).split(" · ")[1]}
              </span>
            </div>
            <p className="mt-1 text-xs text-soft">{tp.summary}</p>
            <p className="num mt-1 text-xs text-soft">
              {tp.minutes.min}-{tp.minutes.max} min
              {tp.block.kind === "fixed" ? " · 6-week block" : ""}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Button
          variant="outline"
          className="w-full"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          data-testid="more-templates"
        >
          More templates ({PROGRAM_CATALOG.length})
        </Button>
        {more && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="px-1 text-xs text-soft">
              Older split programs (push/pull/legs, upper/lower). No weekly set
              meter.
            </p>
            {PROGRAM_CATALOG.map((p) => (
              <ProgramCard key={p.key} entry={p} />
            ))}
            {PROGRAM_CATALOG.length === 0 && (
              <p className="py-8 text-center text-xs text-faint">
                {t(
                  "Nothing here.",
                  "Nothing here. The frog refuses to speculate.",
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgramCard({ entry }: { entry: ProgramCatalogEntry }) {
  return (
    <Link
      to={`/programs/${entry.key}`}
      className="rounded-md block bg-surface p-4 transition-colors duration-150 hover:bg-surface-hover"
      data-testid={`program-card-${entry.key}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{entry.name}</span>
        <span className="num shrink-0 text-2xs text-faint">
          {entry.daysPerWeek}×/week
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-2xs text-faint">
        <span>{LEVEL_LABELS[entry.level]}</span>
        <span>·</span>
        <span>{GOAL_LABELS[entry.goal]}</span>
        <span>·</span>
        <span>
          {EQUIPMENT_PROFILE_LABELS[equipmentProfile(entry.equipment)]}
        </span>
        <span>·</span>
        <span className="num">{entry.minutesPerWorkout} min</span>
      </div>
      <p className="mt-2 text-xs text-soft">{entry.description}</p>
    </Link>
  );
}

function ProgramDetail({ programKey }: { programKey: string }) {
  const { t } = useVoice();
  const navigate = useNavigate();
  const entry = catalogEntry(programKey);
  const exercisesQ = useExercises();
  const exercises = exercisesQ.data ?? [];
  const { data: prefs = [] } = useExercisePrefs();
  const materialize = useMaterializeProgram();

  const generated = useMemo<GeneratedProgram | null>(() => {
    if (!entry || exercises.length === 0) return null;
    const excludedIds = new Set(
      prefs.filter((p) => p.generatorExcluded).map((p) => p.exerciseId),
    );
    return generateProgram(entryConfig(entry), selectableFrom(exercises), {
      excludedIds,
    });
  }, [entry, exercises, prefs]);

  const nameById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.name])),
    [exercises],
  );

  if (!entry) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-soft">
          {t(
            "Program not found.",
            "Program not found. The frog looked everywhere.",
          )}
        </p>
        <Link
          to="/programs"
          className="mt-2 inline-block text-xs text-accent-ink"
        >
          Back to programs
        </Link>
      </div>
    );
  }

  async function save() {
    if (!entry || !generated || materialize.isPending) return;
    await materialize.mutateAsync({
      program: generated,
      source: "library",
      config: null,
      libraryKey: entry.key,
      name: entry.name,
    });
    navigate("/routines");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-start gap-3">
        <BackButton to="/programs" label="Back to programs" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{entry.name}</h1>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-2xs text-faint">
            <span>{LEVEL_LABELS[entry.level]}</span>
            <span>·</span>
            <span>{GOAL_LABELS[entry.goal]} focus</span>
            <span>·</span>
            <span>
              {EQUIPMENT_PROFILE_LABELS[equipmentProfile(entry.equipment)]}
            </span>
            <span>·</span>
            <span className="num">{entry.daysPerWeek}×/week</span>
            <span>·</span>
            <span className="num">{entry.minutesPerWorkout} min</span>
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-soft">{entry.description}</p>

      <Button
        variant="primary"
        className="mt-4 w-full"
        disabled={!generated || materialize.isPending}
        onClick={() => void save()}
        data-testid="save-program-btn"
      >
        {materialize.isPending
          ? t("Saving…", "The frog is filing…")
          : "Save program"}
      </Button>

      {/* Per-routine preview */}
      <div className="mt-6 flex flex-col gap-3">
        {generated?.routines.map((r) => (
          <div key={r.name} className="rounded-md bg-surface p-4">
            <div className="flex items-center gap-2">
              <Barbell className="size-4 text-faint" />
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
                      {ex.restSec ? ` · ${ex.restSec}s rest` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {generated == null && exercisesQ.isError && (
          <div role="alert" className="py-8 text-center">
            <p className="text-sm text-neg">
              {userFacingRepoError(exercisesQ.error)}
            </p>
            <Button className="mt-2" onClick={() => void exercisesQ.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {generated == null && !exercisesQ.isError && (
          <p role="status" className="py-8 text-center text-xs text-faint">
            {t(
              "Loading your exercise library…",
              "The frog is thinking. Your exercise library is on its way.",
            )}
          </p>
        )}
      </div>
    </div>
  );
}
