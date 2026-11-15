// Rule-based program generator (Hevy-parity plan §C — deliberately NOT an
// LLM; scope decision 2026-07-14). Deterministic: same config + same exercise
// library → same program.

import type { RoutineExerciseInput } from "../repo/types";

export type GeneratorGoal = "muscle" | "strength" | "general";
export type GeneratorExperience = "beginner" | "intermediate" | "advanced";

export type GeneratorConfig = {
  goal: GeneratorGoal;
  experience: GeneratorExperience;
  /** Equipment available to the user (values from `EQUIPMENT_KINDS`; legacy
   *  removed kinds may appear in configs saved before 2026-08-08). */
  equipment: string[];
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  minutesPerWorkout: 30 | 45 | 60 | 75 | 90;
  /** Optional extra-volume muscle (muscle key from anatomy). */
  focusMuscle?: string | null;
};

export type GeneratedRoutine = {
  name: string;
  exercises: RoutineExerciseInput[];
};

export type GeneratedProgram = {
  name: string;
  routines: GeneratedRoutine[];
};

/** Minimal exercise shape the generator selects from. */
export type SelectableExercise = {
  id: string;
  name: string;
  isCustom: boolean;
  equipment: string | null;
  exerciseType: string;
  muscleTargets: Array<{ muscle: string; tier: string | null }> | null;
  /** Explicit compound/isolation; null falls back to the muscle-count proxy. */
  mechanic: string | null;
};
