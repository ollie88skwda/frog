// Coach engine barrel. Narrow exports only: this barrel is spread into
// packages/core/src/index.ts, so generic names (median, brzycki, constants)
// that J1's domain modules may also export stay internal.

export { COACH_WEEK_START } from "./constants";
export { DORMANT_RULES, dormantNotEvaluated } from "./dormant";
export { evaluateCoach, evaluateExercise } from "./evaluate";
export { selectInSetNudges } from "./nudges";
export { isDismissed } from "./resolve";
export type * from "./types";
