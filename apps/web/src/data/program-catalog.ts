import type { GeneratorConfig } from "@frog/core";

// Curated program catalog (Hevy-parity M11 "/programs"). Each entry is just a
// GeneratorConfig plus display copy — the actual routines are materialized
// deterministically by generateProgram() against the user's exercise library at
// save time, so the catalog ships zero exercise data and stays a tiny lazy
// chunk. 12 entries: 4 beginner / 4 intermediate / 4 advanced, spread across
// full-gym / dumbbell-only / bodyweight so every equipment profile is covered.

export type ProgramLevel = "beginner" | "intermediate" | "advanced";
export type ProgramGoal = "muscle" | "strength" | "general";

export type ProgramCatalogEntry = {
  key: string;
  name: string;
  level: ProgramLevel;
  goal: ProgramGoal;
  /** EquipmentKind values available; bodyweight is always usable, so an empty
   *  array means a bodyweight-only program. */
  equipment: string[];
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  minutesPerWorkout: 30 | 45 | 60 | 75 | 90;
  focusMuscle?: string;
  /** Honest 2–3 sentence blurb: what it trains, who it's for, what it needs. */
  description: string;
};

// A full commercial-gym kit. Bodyweight is always available to the generator,
// so it isn't listed here.
const FULL_GYM = [
  "barbell",
  "ez_bar",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
];
const DUMBBELL = ["dumbbell"];
const BODYWEIGHT: string[] = [];

export const PROGRAM_CATALOG: ProgramCatalogEntry[] = [
  // ── Beginner ────────────────────────────────────────────────────────────
  {
    key: "full-body-foundations",
    name: "Full Body Foundations",
    level: "beginner",
    goal: "general",
    equipment: FULL_GYM,
    daysPerWeek: 3,
    minutesPerWorkout: 45,
    description:
      "Three full-body days a week that hit every major muscle group with the highest-rated compound lifts. Built for someone new to the gym who wants a simple, balanced starting point. Needs a standard gym.",
  },
  {
    key: "barbell-strength-basics",
    name: "Barbell Strength Basics",
    level: "beginner",
    goal: "strength",
    equipment: FULL_GYM,
    daysPerWeek: 3,
    minutesPerWorkout: 60,
    description:
      "A strength-first full-body plan centered on heavy barbell work in the 4–6 rep range with long rests. For a beginner who wants to get strong on the main lifts rather than chase a pump. Needs a barbell and rack.",
  },
  {
    key: "dumbbell-kickstart",
    name: "Dumbbell Kickstart",
    level: "beginner",
    goal: "muscle",
    equipment: DUMBBELL,
    daysPerWeek: 3,
    minutesPerWorkout: 45,
    description:
      "A hypertrophy-focused full-body routine that only ever needs a pair of dumbbells. Ideal for a home lifter or anyone starting out with limited equipment. Three sessions a week keep it easy to stay consistent.",
  },
  {
    key: "bodyweight-basics",
    name: "Bodyweight Basics",
    level: "beginner",
    goal: "general",
    equipment: BODYWEIGHT,
    daysPerWeek: 3,
    minutesPerWorkout: 30,
    description:
      "Short full-body sessions using nothing but your bodyweight — squats, push-ups, rows and core. Great for training at home, while travelling, or as an on-ramp to the gym. Thirty minutes, three times a week.",
  },
  // ── Intermediate ────────────────────────────────────────────────────────
  {
    key: "upper-lower-hypertrophy",
    name: "Upper / Lower Hypertrophy",
    level: "intermediate",
    goal: "muscle",
    equipment: FULL_GYM,
    daysPerWeek: 4,
    minutesPerWorkout: 60,
    description:
      "A four-day upper/lower split built for muscle growth, alternating upper- and lower-body days with moderate rep ranges. Suits a lifter past the beginner stage who can train four times a week. Needs a full gym.",
  },
  {
    key: "push-pull-legs",
    name: "Push Pull Legs",
    level: "intermediate",
    goal: "muscle",
    equipment: FULL_GYM,
    daysPerWeek: 6,
    minutesPerWorkout: 60,
    description:
      "The classic six-day push/pull/legs rotation, run twice through the week for high weekly volume per muscle. For an intermediate who genuinely trains six days and recovers well. Needs a full gym.",
  },
  {
    key: "dumbbell-hypertrophy",
    name: "Dumbbell Hypertrophy",
    level: "intermediate",
    goal: "muscle",
    equipment: DUMBBELL,
    daysPerWeek: 4,
    minutesPerWorkout: 60,
    description:
      "A four-day upper/lower split that runs entirely on dumbbells, for building muscle without a barbell or machines. Aimed at a home-gym lifter with an adjustable set. Four hour-long sessions a week.",
  },
  {
    key: "calisthenics-builder",
    name: "Calisthenics Builder",
    level: "intermediate",
    goal: "muscle",
    equipment: BODYWEIGHT,
    daysPerWeek: 4,
    minutesPerWorkout: 45,
    description:
      "A four-day bodyweight split that pushes calisthenics volume for real muscle growth — a pull-up bar helps but isn't strictly required. For someone comfortable with the basics who wants more from bodyweight training.",
  },
  // ── Advanced ──────────────────────────────────────────────────────────────
  {
    key: "ppl-volume-block",
    name: "PPL Volume Block",
    level: "advanced",
    goal: "muscle",
    equipment: FULL_GYM,
    daysPerWeek: 6,
    minutesPerWorkout: 75,
    description:
      "A high-volume six-day push/pull/legs block with longer sessions and more sets per muscle. Built for an advanced lifter who can handle and recover from a heavy weekly workload. Needs a full gym.",
  },
  {
    key: "advanced-strength",
    name: "Advanced Strength",
    level: "advanced",
    goal: "strength",
    equipment: FULL_GYM,
    daysPerWeek: 5,
    minutesPerWorkout: 90,
    description:
      "A five-day strength program with heavy low-rep compounds, long rests and full accessory work. For an experienced lifter chasing maximal strength who has ninety minutes to train. Needs a barbell, rack and full gym.",
  },
  {
    key: "dumbbell-advanced-split",
    name: "Dumbbell Advanced Split",
    level: "advanced",
    goal: "muscle",
    equipment: DUMBBELL,
    daysPerWeek: 5,
    minutesPerWorkout: 60,
    description:
      "A demanding five-day dumbbell-only split for an advanced home lifter, spreading high volume across push, pull and leg days. Proves you don't need a full gym to keep progressing. Needs a good adjustable dumbbell set.",
  },
  {
    key: "advanced-calisthenics",
    name: "Advanced Calisthenics",
    level: "advanced",
    goal: "muscle",
    equipment: BODYWEIGHT,
    daysPerWeek: 5,
    minutesPerWorkout: 45,
    description:
      "A five-day bodyweight split at high frequency and volume for an advanced calisthenics athlete. A pull-up bar and dip station round it out. For someone who trains hard with minimal equipment.",
  },
];

export function catalogEntry(key: string): ProgramCatalogEntry | undefined {
  return PROGRAM_CATALOG.find((p) => p.key === key);
}

/** GeneratorConfig for an entry (level → experience). */
export function entryConfig(entry: ProgramCatalogEntry): GeneratorConfig {
  return {
    goal: entry.goal,
    experience: entry.level,
    equipment: entry.equipment,
    daysPerWeek: entry.daysPerWeek,
    minutesPerWorkout: entry.minutesPerWorkout,
    focusMuscle: entry.focusMuscle ?? null,
  };
}

export type EquipmentProfile = "gym" | "dumbbell" | "bodyweight";

/** Coarse equipment bucket for the catalog filter chips. */
export function equipmentProfile(equipment: string[]): EquipmentProfile {
  if (equipment.length === 0) return "bodyweight";
  if (equipment.length === 1 && equipment[0] === "dumbbell") return "dumbbell";
  return "gym";
}

export const EQUIPMENT_PROFILE_LABELS: Record<EquipmentProfile, string> = {
  gym: "Full gym",
  dumbbell: "Dumbbells",
  bodyweight: "Bodyweight",
};

export const LEVEL_LABELS: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const GOAL_LABELS: Record<ProgramGoal, string> = {
  muscle: "Muscle",
  strength: "Strength",
  general: "General",
};
