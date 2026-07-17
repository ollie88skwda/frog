// Minimal fuzzy matcher: normalize + token-overlap scoring. No stemming, no
// edit distance — good enough to resolve a spoken exercise name against a
// short candidate list (a session's own blocks), not a full exercise library.
// NOTE: no existing matcher was found elsewhere in the repo at the time this
// was written (checked packages/core/src and other active branches) — if a
// parallel routine-import task lands packages/core/src/generator/match-exercise.ts
// or similar, the two should be consolidated.

export type MatchCandidate = { id: string; name: string };

export type ExerciseMatch = {
  id: string;
  name: string;
  score: number;
};

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  const normalized = normalizeExerciseName(name);
  return normalized ? normalized.split(" ") : [];
}

// Jaccard-style overlap over token sets — order-independent, tolerant of
// extra/missing words (e.g. "flies" vs "flyes" still shares "rear"/"delt").
export function matchExerciseName(
  query: string,
  candidates: MatchCandidate[],
): ExerciseMatch | null {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || candidates.length === 0) return null;

  let best: ExerciseMatch | null = null;
  for (const candidate of candidates) {
    const candidateTokens = new Set(tokenize(candidate.name));
    if (candidateTokens.size === 0) continue;
    let overlap = 0;
    for (const t of queryTokens) if (candidateTokens.has(t)) overlap += 1;
    const score = overlap / Math.max(queryTokens.size, candidateTokens.size);
    if (!best || score > best.score) {
      best = { id: candidate.id, name: candidate.name, score };
    }
  }
  return best;
}

// Below this, treat the match as unreliable and ask the user instead of guessing.
export const MATCH_CONFIDENCE_THRESHOLD = 0.5;
