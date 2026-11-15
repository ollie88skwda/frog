// Shapes for the exercise-classification backfill (redesign plan §9.7, job
// J12). MuscleTarget extras (`weight`, `lengthened`, `region`) are the shape
// agreed with J2 (convex/schema.ts muscleTargets validator): `role` already
// exists; the other three are optional additions.
import type {
  Mechanic,
  MovementPattern,
} from "../../packages/core/src/domain/exercise-types";

export type ClassifiedTarget = {
  muscle: string;
  tier: string | null;
  role: "primary" | "secondary";
  /** Fractional weekly-set credit per hard set (R7: direct 1, indirect 0.5). */
  weight: number;
  /** R14 copy only: descriptive "long-length" chip, never a ranking gate. */
  lengthened?: boolean;
  /** R12b regional head, e.g. "vasti", "rectus-femoris", "long-head". */
  region?: string;
};

export type ClassificationSource = "curated" | "model" | "rules";

export type Classification = {
  name: string; // review aid only; the merge keys on the exercise id
  source: ClassificationSource;
  mechanic: Mechanic;
  movementPattern: MovementPattern | null;
  /** jointActions[0] is the primary joint action (the grouping key). */
  jointActions: string[];
  muscleTargets: ClassifiedTarget[];
};

export type ClassificationFile = {
  meta: {
    mode: "model" | "mock";
    generatedBy: string;
    counts: Record<ClassificationSource, number>;
  };
  byId: Record<string, Classification>;
};

/** The slice of a seed exercise row the classifier reads. */
export type SeedExercise = {
  id: string;
  name: string;
  equipment: string | null;
  exerciseType: string | null;
  laterality: string | null;
  muscleTargets: { muscle: string; tier: string | null }[] | null;
};
