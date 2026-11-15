import { NUDGES_PER_EXERCISE, NUDGES_PER_SESSION } from "./constants";
import type { CoachSuggestion } from "./types";

/**
 * In-set nudges (F4 surface 2): ≤1 line per exercise, ≤3 per session, never on
 * set 1, a dismissed rule stays quiet for the session. Pure: the caller passes
 * what has been logged and already shown this session.
 */
export function selectInSetNudges(
  suggestions: readonly CoachSuggestion[],
  session: {
    /** Working sets committed so far, per exercise. */
    setsLogged: ReadonlyMap<string, number>;
    shownIds?: readonly string[];
    dismissedRules?: readonly string[];
  },
): CoachSuggestion[] {
  const shown = new Set(session.shownIds ?? []);
  const perExercise = new Map<string, number>();
  for (const s of suggestions)
    if (shown.has(s.id) && s.exerciseId)
      perExercise.set(s.exerciseId, (perExercise.get(s.exerciseId) ?? 0) + 1);
  const out: CoachSuggestion[] = [];
  let total = shown.size;
  for (const s of suggestions) {
    if (total >= NUDGES_PER_SESSION) break;
    if (!s.surfaces.includes("in_set") || !s.exerciseId) continue;
    if (shown.has(s.id)) continue;
    if (session.dismissedRules?.includes(s.ruleId)) continue;
    if ((session.setsLogged.get(s.exerciseId) ?? 0) < 1) continue; // never on set 1
    if ((perExercise.get(s.exerciseId) ?? 0) >= NUDGES_PER_EXERCISE) continue;
    out.push(s);
    perExercise.set(s.exerciseId, (perExercise.get(s.exerciseId) ?? 0) + 1);
    total++;
  }
  return out;
}
