// Deterministic questionnaire → program generation, built on SBL's own
// muscle-tier science: slots per split day are filled by the best-tier
// available exercise (curated tiers first, untiered library after), filtered
// by the user's equipment and exclusions.

import { tierRank } from "../domain/anatomy";
import type { RoutineSetInput } from "../repo/types";
import type {
  GeneratedProgram,
  GeneratedRoutine,
  GeneratorConfig,
  SelectableExercise,
} from "./types";

// A slot asks for a primary muscle; compound slots prefer multi-muscle
// exercises, isolation slots prefer single-target ones.
type Slot = { muscle: string; kind: "compound" | "isolation" };

type DayTemplate = { name: string; slots: Slot[] };

const PUSH: DayTemplate = {
  name: "Push",
  slots: [
    { muscle: "pecs", kind: "compound" },
    { muscle: "front-delts", kind: "compound" },
    { muscle: "upper-pecs", kind: "compound" },
    { muscle: "side-delts", kind: "isolation" },
    { muscle: "triceps", kind: "isolation" },
    { muscle: "pecs", kind: "isolation" },
  ],
};

const PULL: DayTemplate = {
  name: "Pull",
  slots: [
    { muscle: "lats", kind: "compound" },
    { muscle: "mid-traps-rhomboids", kind: "compound" },
    { muscle: "lats", kind: "isolation" },
    { muscle: "rear-delts", kind: "isolation" },
    { muscle: "biceps", kind: "isolation" },
    { muscle: "forearms", kind: "isolation" },
  ],
};

const LEGS: DayTemplate = {
  name: "Legs",
  slots: [
    { muscle: "quads", kind: "compound" },
    { muscle: "hamstrings", kind: "compound" },
    { muscle: "glutes", kind: "compound" },
    { muscle: "quads", kind: "isolation" },
    { muscle: "calves", kind: "isolation" },
    { muscle: "abs", kind: "isolation" },
  ],
};

const UPPER: DayTemplate = {
  name: "Upper",
  slots: [
    { muscle: "pecs", kind: "compound" },
    { muscle: "lats", kind: "compound" },
    { muscle: "front-delts", kind: "compound" },
    { muscle: "mid-traps-rhomboids", kind: "compound" },
    { muscle: "biceps", kind: "isolation" },
    { muscle: "triceps", kind: "isolation" },
  ],
};

const LOWER: DayTemplate = {
  name: "Lower",
  slots: [
    { muscle: "quads", kind: "compound" },
    { muscle: "hamstrings", kind: "compound" },
    { muscle: "glutes", kind: "compound" },
    { muscle: "calves", kind: "isolation" },
    { muscle: "erectors", kind: "compound" },
    { muscle: "abs", kind: "isolation" },
  ],
};

const FULL_BODY: DayTemplate = {
  name: "Full body",
  slots: [
    { muscle: "quads", kind: "compound" },
    { muscle: "pecs", kind: "compound" },
    { muscle: "lats", kind: "compound" },
    { muscle: "hamstrings", kind: "compound" },
    { muscle: "front-delts", kind: "compound" },
    { muscle: "abs", kind: "isolation" },
  ],
};

function splitFor(days: GeneratorConfig["daysPerWeek"]): DayTemplate[] {
  switch (days) {
    case 2:
      return [FULL_BODY, FULL_BODY];
    case 3:
      return [FULL_BODY, FULL_BODY, FULL_BODY];
    case 4:
      return [UPPER, LOWER, UPPER, LOWER];
    case 5:
      return [PUSH, PULL, LEGS, UPPER, LOWER];
    case 6:
      return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
  }
}

function exercisesPerDay(
  minutes: GeneratorConfig["minutesPerWorkout"],
): number {
  if (minutes <= 30) return 3;
  if (minutes <= 45) return 4;
  if (minutes <= 60) return 5;
  if (minutes <= 75) return 6;
  return 7;
}

// Prescription per goal/experience. Rep ranges (not fixed reps) so the
// overload rule (generator/overload.ts) can drive progression.
function prescription(
  config: GeneratorConfig,
  kind: "compound" | "isolation",
): { sets: number; repsMin: number; repsMax: number; restSec: number } {
  const hard = config.experience === "advanced";
  if (config.goal === "strength" && kind === "compound") {
    return { sets: hard ? 5 : 4, repsMin: 4, repsMax: 6, restSec: 180 };
  }
  if (kind === "compound") {
    return { sets: hard ? 4 : 3, repsMin: 8, repsMax: 12, restSec: 120 };
  }
  return {
    sets: 3,
    repsMin: config.goal === "strength" ? 8 : 10,
    repsMax: config.goal === "strength" ? 12 : 15,
    restSec: 90,
  };
}

function isCompound(e: SelectableExercise): boolean {
  return (e.muscleTargets?.length ?? 0) >= 2;
}

/**
 * Score-based pick for a slot: primary-muscle match required; better tier
 * first (curated S/A beat untiered), curated seeds before library imports,
 * kind match preferred, deterministic name tiebreak.
 */
function pickForSlot(
  slot: Slot,
  pool: SelectableExercise[],
  used: Set<string>,
): SelectableExercise | null {
  const candidates = pool.filter(
    (e) => !used.has(e.id) && e.muscleTargets?.[0]?.muscle === slot.muscle,
  );
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const tierDiff =
      tierRank(a.muscleTargets?.[0]?.tier as never) -
      tierRank(b.muscleTargets?.[0]?.tier as never);
    if (tierDiff !== 0) return tierDiff;
    const kindA = (isCompound(a) ? "compound" : "isolation") === slot.kind;
    const kindB = (isCompound(b) ? "compound" : "isolation") === slot.kind;
    if (kindA !== kindB) return kindA ? -1 : 1;
    if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return candidates[0];
}

export type GenerateOptions = {
  /** exercise_prefs.generatorExcluded ids ("don't recommend again"). */
  excludedIds?: Set<string>;
  /** Starting working weights from records history (exerciseId → kg). */
  startingWeightsKg?: Map<string, number>;
};

export function generateProgram(
  config: GeneratorConfig,
  library: SelectableExercise[],
  opts: GenerateOptions = {},
): GeneratedProgram {
  const excluded = opts.excludedIds ?? new Set();
  const equipment = new Set(config.equipment);
  // Bodyweight movements are always available.
  const pool = library.filter(
    (e) =>
      !excluded.has(e.id) &&
      (e.equipment == null ||
        e.equipment === "bodyweight" ||
        e.equipment === "other" ||
        equipment.has(e.equipment)) &&
      // The generator prescribes rep-based work only in v1.
      (e.exerciseType === "weight_reps" ||
        e.exerciseType === "bodyweight_reps" ||
        e.exerciseType === "weighted_bodyweight"),
  );

  const days = splitFor(config.daysPerWeek);
  const perDay = exercisesPerDay(config.minutesPerWorkout);

  const routines: GeneratedRoutine[] = days.map((day, di) => {
    const used = new Set<string>();
    let slots = day.slots;
    // Focus muscle: inject an extra isolation slot near the front.
    if (config.focusMuscle) {
      slots = [
        slots[0],
        { muscle: config.focusMuscle, kind: "isolation" as const },
        ...slots.slice(1),
      ];
    }
    const chosen: Array<{ e: SelectableExercise; slot: Slot }> = [];
    for (const slot of slots) {
      if (chosen.length >= perDay) break;
      const pick = pickForSlot(slot, pool, used);
      if (!pick) continue;
      used.add(pick.id);
      chosen.push({ e: pick, slot });
    }
    // Repeated templates get A/B/C suffixes ("Push A", "Push B"); a template
    // that appears once keeps its plain name.
    const sameName = days.filter((d) => d.name === day.name).length;
    const nth = days.slice(0, di).filter((d) => d.name === day.name).length;
    return {
      name: sameName > 1 ? `${day.name} ${"ABC"[nth] ?? nth + 1}` : day.name,
      exercises: chosen.map(({ e, slot }, i) => {
        const p = prescription(config, slot.kind);
        const startKg = opts.startingWeightsKg?.get(e.id) ?? null;
        const sets: RoutineSetInput[] = Array.from(
          { length: p.sets },
          (_, si) => ({
            setNo: si,
            setType: "normal",
            targetWeightKg: startKg,
            targetReps: p.repsMin,
            targetRepsMax: p.repsMax,
          }),
        );
        return {
          exerciseId: e.id,
          orderIndex: i,
          restSec: p.restSec,
          note: null,
          supersetGroup: null,
          sets,
        };
      }),
    };
  });

  const goalLabel =
    config.goal === "muscle"
      ? "Hypertrophy"
      : config.goal === "strength"
        ? "Strength"
        : "General fitness";
  return {
    name: `${goalLabel} · ${config.daysPerWeek}×/week`,
    routines,
  };
}
