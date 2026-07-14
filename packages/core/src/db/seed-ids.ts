// Fixed UUIDs of globally-seeded condition metrics (supabase/migrations/*_seeds.sql).
// sessions.condition_values is keyed by these ids.
export const SEED_CONDITIONS = {
  sleepH: "00000000-0000-4000-8000-0000000000a1",
  bodyweight: "00000000-0000-4000-8000-0000000000a2",
  preCarbsG: "00000000-0000-4000-8000-0000000000a3",
  caffeineMg: "00000000-0000-4000-8000-0000000000a4",
  stress: "00000000-0000-4000-8000-0000000000a5",
  lastMealH: "00000000-0000-4000-8000-0000000000a6",
  mealNote: "00000000-0000-4000-8000-0000000000a7",
} as const;
