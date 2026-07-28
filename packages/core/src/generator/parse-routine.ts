// Freeform-text routine parser for the "paste/dictate a workout" import path.
// Deliberately dumb and generic — no exercise/routine content is known or
// hardcoded here, only line shape. Out of v1 scope (documented, not solved):
//   - multiple exercises comma-joined on one line (only the first NxM token
//     per line is read; anything after it is discarded)
//   - AMRAP / 5-3-1 / percentage-based schemes (no NxM token to match on)
//   - weight embedded in the text ("@ 80kg") — ignored as trailing noise

export type ParsedExercise = {
  rawName: string;
  sets: number;
  reps: number | null;
  repsMax: number | null;
};

export type ParsedRoutine = {
  name: string | null;
  exercises: ParsedExercise[];
  // Non-blank lines that yielded neither an exercise nor the routine name, in
  // source order. Reported rather than discarded so a caller can tell the user
  // exactly what a partial import left behind.
  unparsed: string[];
};

const BULLET_RE = /^(?:[-*•]|\d+[.)])\s*/;
// Requires an x/× separator so plain numbers (distances, tempo, weights)
// never false-match as a set×rep token.
const SET_REP_RE = /(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?/i;
const EDGE_PUNCT_RE = /^[\s:\-–—,]+|[\s:\-–—,]+$/g;

function cleanNameSide(s: string): string {
  return s.replace(EDGE_PUNCT_RE, "").trim();
}

function nameFromSides(before: string, after: string): string | null {
  const b = cleanNameSide(before);
  if (/[a-zA-Z]/.test(b)) return b;
  const a = cleanNameSide(after);
  if (/[a-zA-Z]/.test(a)) return a;
  return null;
}

export function parseRoutineText(text: string): ParsedRoutine {
  let name: string | null = null;
  const exercises: ParsedExercise[] = [];
  const unparsed: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(BULLET_RE, "").trim();
    if (!line) continue;

    const match = SET_REP_RE.exec(line);
    if (match) {
      const rawName = nameFromSides(
        line.slice(0, match.index),
        line.slice(match.index + match[0].length),
      );
      if (rawName) {
        exercises.push({
          rawName,
          sets: Number.parseInt(match[1], 10),
          reps: Number.parseInt(match[2], 10),
          repsMax: match[3] ? Number.parseInt(match[3], 10) : null,
        });
      } else {
        unparsed.push(line);
      }
      continue;
    }

    // First lettered preamble line wins the routine name; later text-only
    // lines before the exercises ("Week 3 — heavy") are noise, not a rename.
    if (name === null && exercises.length === 0 && /[a-zA-Z]/.test(line)) {
      name = cleanNameSide(line);
      continue;
    }

    unparsed.push(line);
  }

  return { name, exercises, unparsed };
}
