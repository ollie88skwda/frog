// Exercise measurement types (Hevy-parity plan §B/§C). The type decides which
// logging columns an exercise shows and how volume + records are computed.
// Immutable once sets exist (app-enforced); duplicate-as-custom is the reset.

export const EXERCISE_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "weight_duration",
  "distance_duration",
  "weight_distance",
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: "Weight & reps",
  bodyweight_reps: "Bodyweight reps",
  weighted_bodyweight: "Weighted bodyweight",
  assisted_bodyweight: "Assisted bodyweight",
  duration: "Duration",
  weight_duration: "Weight & duration",
  distance_duration: "Distance & duration",
  weight_distance: "Weight & distance",
};

// Which set-log fields a type uses. `weight` semantics vary by type — see
// weightLabel below (added weight vs assistance vs plain load).
export type TypeFields = {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
};

export const TYPE_FIELDS: Record<ExerciseType, TypeFields> = {
  weight_reps: { weight: true, reps: true, duration: false, distance: false },
  bodyweight_reps: {
    weight: false,
    reps: true,
    duration: false,
    distance: false,
  },
  weighted_bodyweight: {
    weight: true,
    reps: true,
    duration: false,
    distance: false,
  },
  assisted_bodyweight: {
    weight: true,
    reps: true,
    duration: false,
    distance: false,
  },
  duration: { weight: false, reps: false, duration: true, distance: false },
  weight_duration: {
    weight: true,
    reps: false,
    duration: true,
    distance: false,
  },
  distance_duration: {
    weight: false,
    reps: false,
    duration: true,
    distance: true,
  },
  weight_distance: {
    weight: true,
    reps: false,
    duration: false,
    distance: true,
  },
};

// Column header for the weight field, reflecting its per-type meaning.
export function weightLabel(type: ExerciseType, unit: string): string {
  if (type === "weighted_bodyweight") return `+${unit}`;
  if (type === "assisted_bodyweight") return `-${unit}`;
  return unit;
}

// Rep-based types allow RPE/RIR effort logging; duration-only ones don't.
export function supportsEffort(type: ExerciseType): boolean {
  return TYPE_FIELDS[type].reps;
}

export function isDurationType(type: ExerciseType): boolean {
  return TYPE_FIELDS[type].duration;
}

// A set is loggable when every field the type uses has a value (reps must be
// ≥1 — zero-rep sets are rejected; failure sets log the last completed rep).
export function isCompletableSet(
  type: ExerciseType,
  set: {
    weightKg?: number | null;
    reps?: number | null;
    durationSec?: number | null;
    distanceM?: number | null;
  },
): boolean {
  const f = TYPE_FIELDS[type];
  if (f.reps && !(set.reps != null && set.reps >= 1)) return false;
  if (f.duration && !(set.durationSec != null && set.durationSec > 0))
    return false;
  if (f.distance && !(set.distanceM != null && set.distanceM > 0)) return false;
  // Weight may legitimately be 0 (empty bar handled upstream, assistance 0),
  // but must be present for weight-bearing types.
  if (f.weight && set.weightKg == null) return false;
  return true;
}

export const EQUIPMENT_KINDS = [
  "barbell",
  "ez_bar",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "band",
  "suspension",
  "bodyweight",
  "plate",
  "other",
] as const;

export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  barbell: "Barbell",
  ez_bar: "EZ bar",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  machine: "Machine",
  cable: "Cable",
  band: "Band",
  suspension: "Suspension",
  bodyweight: "Bodyweight",
  plate: "Plate",
  other: "Other",
};

// Plate-calculator eligibility: bar-loaded equipment only (never dumbbells).
export function isBarLoaded(equipment: string | null | undefined): boolean {
  return equipment === "barbell" || equipment === "ez_bar";
}

export const SET_TYPES = ["normal", "warmup", "failure", "drop"] as const;
export type SetType = (typeof SET_TYPES)[number];

// Marker letter shown in the set-number cell ('' = plain number).
export const SET_TYPE_MARKERS: Record<SetType, string> = {
  normal: "",
  warmup: "W",
  failure: "F",
  drop: "D",
};

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: "Normal",
  warmup: "Warm-up",
  failure: "Failure",
  drop: "Drop set",
};
