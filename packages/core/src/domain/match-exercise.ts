// Minimal fuzzy matcher: normalize + trailing-s plural fold + token-overlap
// scoring. No real stemming, no edit distance — good enough to resolve a
// spoken exercise name against a short candidate list (a session's own
// blocks), not a full exercise library.
// NOTE: no existing matcher was found elsewhere in the repo at the time this
// was written (checked packages/core/src and other active branches) — if a
// parallel routine-import task lands packages/core/src/generator/match-exercise.ts
// or similar, the two should be consolidated.

export type MatchCandidate = { id: string; name: string };

export type ExerciseMatch = {
  id: string;
  name: string;
  score: number;
  // Every candidate sharing this winning score, in candidate order. More than
  // one means the spoken name doesn't single out a candidate (two identically
  // named blocks, say) — the caller must ask instead of taking the first.
  tied: MatchCandidate[];
};

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Applied identically to query and candidates, so the fold stays symmetric:
// "squats" and "Squat" both tokenize to "squat".
function tokenize(name: string): string[] {
  const normalized = normalizeExerciseName(name);
  if (!normalized) return [];
  return normalized.split(" ").map((t) => t.replace(/(.)s$/, "$1"));
}

// Jaccard-style overlap over token sets — order-independent, tolerant of
// extra/missing words (e.g. "flies" vs "flyes" still shares "rear"/"delt").
export function matchExerciseName(
  query: string,
  candidates: MatchCandidate[],
): ExerciseMatch | null {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || candidates.length === 0) return null;

  const scored: { candidate: MatchCandidate; score: number; inside: boolean }[] =
    [];
  for (const candidate of candidates) {
    const candidateTokens = new Set(tokenize(candidate.name));
    if (candidateTokens.size === 0) continue;
    let overlap = 0;
    for (const t of queryTokens) if (candidateTokens.has(t)) overlap += 1;
    scored.push({
      candidate: { id: candidate.id, name: candidate.name },
      score: overlap / Math.max(queryTokens.size, candidateTokens.size),
      inside: overlap === queryTokens.size,
    });
  }
  if (scored.length === 0) return null;

  // Asymmetric accept: the symmetric score punishes a short query for the words
  // it left out, so a spoken shorthand ("bench") never clears the threshold
  // against "Bench Press". When the query's tokens sit inside exactly one
  // candidate there is nothing to be ambiguous about, so accept it outright.
  // Two or more containers ("press" → "Bench Press" / "Overhead Press") is a
  // genuinely ambiguous shorthand and falls through to plain scoring.
  const inside = scored.filter((s) => s.inside);
  if (inside.length === 1) {
    const only = inside[0];
    return { ...only.candidate, score: 1, tied: [only.candidate] };
  }

  const top = Math.max(...scored.map((s) => s.score));
  const tied = scored.filter((s) => s.score === top).map((s) => s.candidate);
  return { ...tied[0], score: top, tied };
}

// Below this, treat the match as unreliable and ask the user instead of
// guessing. 0.6 accepts a two-of-three wording variant ("rear delt flies" vs
// "rear delt flyes" ≈ 0.67) but rejects a single shared token out of two
// words ("incline press" vs "bench press" = 0.5).
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;
