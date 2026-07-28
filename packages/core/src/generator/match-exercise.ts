// Fuzzy name matcher for freeform-text imports (paste-a-routine, and
// potentially voice logging — see the AGENTS.md "Freeform-text →
// structured-data matching" note before adding a second near-identical
// matcher elsewhere in the codebase).

export type MatchCandidate = { id: string; name: string };

// Jaccard token overlap only clears a match past this bar; below it we'd
// rather surface "unmatched" than guess wrong.
const MATCH_THRESHOLD = 0.4;

// Below this length, the substring-containment branch is skipped entirely —
// a 1-2 char rawName would otherwise substring-match almost any candidate.
const MIN_SUBSTRING_LEN = 3;

// The single normalization for freeform exercise names — exported so callers
// deciding "do these two typed names mean the same exercise?" stay in step
// with what the matcher itself considers the same string.
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPluralS(token: string): string {
  return token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
    ? token.slice(0, -1)
    : token;
}

function tokenize(name: string): string[] {
  return normalizeExerciseName(name)
    .split(" ")
    .filter(Boolean)
    .map(stripTrailingPluralS);
}

// The matcher's actual notion of "same exercise name" — token equality after
// normalization + plural-stripping, i.e. the same equality matchExerciseName
// itself scores at 1.0. normalizeExerciseName alone is weaker (it keeps
// trailing plurals), so "Tricep Pushdowns" and "Tricep Pushdown" would
// compare unequal there but are the same lift here — use this, not a
// separate normalize-and-compare, for any "are these two typed names the
// same exercise?" decision (e.g. paste-workout twin resolution).
export function sameExerciseName(a: string, b: string): boolean {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  return (
    aTokens.length === bTokens.length &&
    aTokens.every((t, i) => t === bTokens[i])
  );
}

// Word-boundary-aware containment: true only if `needle`'s words appear as a
// contiguous run of WHOLE words inside `haystack` — "row" must not match
// inside "narrow grip pulldown".
function containsWholeWords(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

// Tie-breaker for equally-scored candidates: how far the candidate is from
// the raw name in shape. Word count dominates (a one-word difference matters
// more than a few characters), character length settles the rest. Without it
// "Row" against a library of "Barbell Row"/"Cable Row"/"Seated Row" would be
// resolved by library order — an arbitrary wrong exercise, silently.
function shapeDelta(rawNorm: string, candNorm: string): number {
  const rawWords = rawNorm.split(" ").length;
  const candWords = candNorm.split(" ").length;
  return (
    Math.abs(candWords - rawWords) * 100 +
    Math.abs(candNorm.length - rawNorm.length)
  );
}

export function matchExerciseName<T extends MatchCandidate>(
  raw: string,
  candidates: T[],
): T | null {
  const rawNorm = normalizeExerciseName(raw);
  if (!rawNorm) return null;
  const rawTokens = new Set(tokenize(raw));

  let best: T | null = null;
  let bestScore = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candNorm = normalizeExerciseName(candidate.name);
    if (!candNorm) continue;

    let score: number;
    if (candNorm === rawNorm) {
      score = 1;
    } else if (
      rawNorm.length >= MIN_SUBSTRING_LEN &&
      candNorm.length >= MIN_SUBSTRING_LEN &&
      (containsWholeWords(candNorm.split(" "), rawNorm.split(" ")) ||
        containsWholeWords(rawNorm.split(" "), candNorm.split(" ")))
    ) {
      score = 0.85;
    } else {
      const candTokens = new Set(tokenize(candidate.name));
      const union = new Set([...candTokens, ...rawTokens]);
      const overlap = [...candTokens].filter((t) => rawTokens.has(t)).length;
      score = union.size === 0 ? 0 : overlap / union.size;
    }

    const delta = shapeDelta(rawNorm, candNorm);
    if (score > bestScore || (score === bestScore && delta < bestDelta)) {
      bestScore = score;
      bestDelta = delta;
      best = candidate;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null;
}
