export { APP_NAME } from "./config";
export * from "./db/schema";
export * from "./db/seed-ids";
export * from "./domain/anatomy";
export * from "./domain/conditions";
export * from "./domain/e1rm";
export * from "./domain/exercise-types";
export * from "./domain/ids";
export * from "./domain/match-exercise";
export * from "./domain/plates";
export * from "./domain/previous";
export * from "./domain/progression";
export * from "./domain/rest-timer";
export * from "./domain/session-reducer";
export * from "./domain/streak";
export * from "./domain/tokens";
export * from "./domain/units";
export * from "./domain/voice-parse";
export * from "./domain/volume";
export * from "./domain/warmup";
export * from "./export/csv";
export * from "./findings/conditions";
export * from "./findings/teaser";
export * from "./findings/types";
export * from "./generator/generate";
// Not barrel-exported: "./domain/match-exercise" (voice logging, merged
// separately) already exports the same names (MatchCandidate,
// matchExerciseName, normalizeExerciseName) with a different shape, and the
// barrel can't disambiguate two same-named exports. Import this module by
// its exact subpath ("@frog/core/generator/match-exercise") instead — see the
// AGENTS.md "Freeform-text → structured-data matching" note for the pending
// dedupe between the two.
export * from "./generator/overload";
export * from "./generator/parse-routine";
export * from "./generator/types";
export * from "./import/fitbit-sleep";
export * from "./import/hevy";
export * from "./import/strong";
export * from "./import/types";
export * from "./records/live";
export * from "./records/records";
export * from "./records/types";
export * from "./repo/types";
export * from "./stats/aggregate";
export * from "./stats/monthly-report";
export * from "./stats/year-review";
