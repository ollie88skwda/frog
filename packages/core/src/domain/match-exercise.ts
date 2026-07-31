// The repo's one fuzzy name matcher for freeform-text → structured-data
// matching (AGENTS.md) — voice logging and the routine builder's "Paste
// workout" import both score against this module; a candidate's own
// aliases are scored alongside its name so a custom exercise's alternate
// names ("OHP" for "Overhead Press") resolve the same way. Do not add a
// third implementation; extend this one.
//
// Until the custom-exercise-adder feature, this and
// packages/core/src/generator/match-exercise.ts were two independently-built
// matchers with the same exported names and different shapes — voice
// logging's ExerciseMatch (matchType/tied disambiguation, token-overlap
// scoring, subset-exempt) vs the paste importer's plain "best candidate or
// null" (Jaccard scoring, whole-word substring at a flat 0.85, a
// shapeDelta tie-break). This file is the merge: the richer diagnostic
// shape won out because callers need to tell "confidently the one" from
// "ambiguous, ask" apart, and it already handles both jobs correctly (see
// the domain-vs-paste analysis in git history / the custom-exercise plan).
// Each caller still sets its own confidence bar via isConfidentMatch's
// threshold param — voice logging's default (0.6) stays strict because a
// misheard word is unverifiable, while paste-import callers can pass a
// looser bar since a pasted line stays on screen for the user to check.

export type MatchCandidate = {
  id: string;
  name: string;
  aliases?: string[] | null;
};

export type ExerciseMatch<T extends MatchCandidate = MatchCandidate> = T & {
  // Always the real overlap ratio against the best-scoring label (name or
  // an alias), never a sentinel — how confident to be in it depends on
  // matchType, so read that (or isConfidentMatch) rather than comparing
  // this number on its own.
  score: number;
  // "subset": the query's tokens sit inside this candidate's name or one of
  // its aliases, and no other candidate's, which is trustworthy however low
  // the ratio ("bench" inside "Bench Press" scores 0.5). "overlap": the
  // ratio is all there is to go on.
  matchType: "subset" | "overlap";
  // Every candidate sharing this winning score, in candidate order. More
  // than one means the query doesn't single out a candidate (two
  // identically named session blocks, say) — the caller must ask instead
  // of taking the first.
  tied: T[];
};

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Applied identically to the query and every candidate label, so the fold
// stays symmetric: "squats"/"Squat" and "pull up"/"Pull Ups" both land on
// the same token set either way — including a double-s word like "press"
// folding to "pres", which is harmless precisely because it's symmetric.
function tokenize(name: string): string[] {
  const normalized = normalizeExerciseName(name);
  if (!normalized) return [];
  return normalized.split(" ").map((t) => t.replace(/(.)s$/, "$1"));
}

// The matcher's own notion of "same exercise name" — token-sequence equality
// after normalization + plural-fold. Exported so callers deciding "do these
// two typed names mean the same exercise?" (twin resolution in a pasted
// routine, say) stay in step with what matchExerciseName itself considers
// the same string, rather than drifting with a separate normalize-and-compare.
export function sameExerciseName(a: string, b: string): boolean {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  return (
    aTokens.length === bTokens.length &&
    aTokens.every((t, i) => t === bTokens[i])
  );
}

// Jaccard-ish overlap over token sets — order-independent, tolerant of
// extra/missing words. Scores a candidate against every one of its labels
// (its own name, plus any aliases) and keeps the best, so "OHP" resolves
// against an exercise whose name is "Overhead Press" but whose alias list
// contains "OHP".
export function matchExerciseName<T extends MatchCandidate>(
  query: string,
  candidates: readonly T[],
): ExerciseMatch<T> | null {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0 || candidates.length === 0) return null;

  const scored: { candidate: T; score: number; inside: boolean }[] = [];
  for (const candidate of candidates) {
    const labels = [candidate.name, ...(candidate.aliases ?? [])];
    let best: { score: number; inside: boolean } | null = null;
    for (const label of labels) {
      const labelTokens = new Set(tokenize(label));
      if (labelTokens.size === 0) continue;
      let overlap = 0;
      for (const t of queryTokens) if (labelTokens.has(t)) overlap += 1;
      const score = overlap / Math.max(queryTokens.size, labelTokens.size);
      const inside = overlap === queryTokens.size;
      if (!best || score > best.score) best = { score, inside };
    }
    if (best)
      scored.push({ candidate, score: best.score, inside: best.inside });
  }
  if (scored.length === 0) return null;

  // Asymmetric accept: the symmetric score punishes a short query for the
  // words it left out, so a shorthand ("bench") never clears the threshold
  // against "Bench Press". When the query's tokens sit inside exactly one
  // candidate's best label there is nothing to be ambiguous about, so
  // accept it outright regardless of score. Two or more containers
  // ("press" -> "Bench Press" / "Overhead Press") is genuinely ambiguous
  // and falls through to plain scoring.
  const inside = scored.filter((s) => s.inside);
  if (inside.length === 1) {
    const only = inside[0];
    return {
      ...only.candidate,
      score: only.score,
      matchType: "subset",
      tied: [only.candidate],
    } as ExerciseMatch<T>;
  }

  const top = Math.max(...scored.map((s) => s.score));
  const tiedScored = scored.filter((s) => s.score === top);
  const tied = tiedScored.map((s) => s.candidate);
  return {
    ...tiedScored[0].candidate,
    score: top,
    matchType: "overlap",
    tied,
  } as ExerciseMatch<T>;
}

// Voice logging's bar — a misheard word can't be double-checked against the
// original (there is no original, just what the speech API returned), so it
// asks rather than guesses. Other callers (paste import) can pass a looser
// threshold to isConfidentMatch, since a pasted line stays visible for the
// user to spot-check either way.
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

// The one place that decides whether a match is good enough to act on, so
// callers never have to know which of "subset" or "overlap" they were handed.
export function isConfidentMatch<T extends MatchCandidate>(
  match: ExerciseMatch<T>,
  threshold: number = MATCH_CONFIDENCE_THRESHOLD,
): boolean {
  return match.matchType === "subset" || match.score >= threshold;
}
