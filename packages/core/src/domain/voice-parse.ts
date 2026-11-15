// Parses one spoken set-logging utterance ("rear delt flies 250 lbs for 5
// reps") into structured fields. Plain regex, no NLP — Web Speech API already
// hands back clean digit-form numbers, so word-number conversion is out of
// scope. Never guesses an exercise: matching the parsed name against a real
// exercise list is the caller's job (see match-exercise.ts).

export type ParsedSetUtterance = {
  name: string;
  weightDisplay: number | null;
  unit: "kg" | "lb";
  // False when the unit fell back to defaultUnit because no unit word was
  // spoken — lets the caller re-resolve against a per-exercise unit override.
  unitExplicit: boolean;
  reps: number | null;
};

const UNIT_WORDS: Record<string, "kg" | "lb"> = {
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
};

// name, weight, optional unit word, optional (optional connector + reps +
// optional "reps" word). The connector (for/x/by) is optional because speech
// engines often drop it: "bench press 225 8" must read as weight 225, reps 8.
const FULL_RE =
  /^(.+?)\s+(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?)?(?:(?:\s*(?:for|x|by)\s*|\s+)(\d+(?:\.\d+)?)\s*(reps?)?)?\s*$/i;

// name + reps only, no weight mentioned at all. The single number must be
// labelled as reps by a connector (for/x/by), a trailing "reps" word, or both
// — a bare "<name> N" stays weight-only (FULL_RE catches it first).
const REPS_ONLY_RE =
  /^(.+?)\s+(?:(for|x|by)\s*)?(\d+(?:\.\d+)?)\s*(reps?)?\s*$/i;

// Both name groups are lazy, so on a single-number utterance they backtrack far
// enough to eat the connector ("pull ups for 10" → name "pull ups for"). A
// connector is never part of an exercise name, so it always belongs to the
// number that follows it.
const EATEN_CONNECTOR_RE = /\s+(?:for|x|by)$/i;

export function parseSetUtterance(
  text: string,
  defaultUnit: "kg" | "lb",
): ParsedSetUtterance | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const full = cleaned.match(FULL_RE);
  if (full) {
    const rawName = full[1].trim();
    const ateConnector = EATEN_CONNECTOR_RE.test(rawName);
    const name = rawName.replace(EATEN_CONNECTOR_RE, "").trim();
    if (!name) return null;
    // "<name> for 10" — the connector labels the only number as reps. A unit
    // word ("for 100 kg") or a second number ("squat 5 x 5") still means the
    // first number is the weight.
    if (ateConnector && full[3] == null && full[4] == null) {
      return {
        name,
        weightDisplay: null,
        unit: defaultUnit,
        unitExplicit: false,
        reps: Number.parseInt(full[2], 10),
      };
    }
    return {
      name,
      weightDisplay: Number.parseFloat(full[2]),
      unit: full[3] ? UNIT_WORDS[full[3].toLowerCase()] : defaultUnit,
      unitExplicit: full[3] != null,
      reps: full[4] != null ? Number.parseInt(full[4], 10) : null,
    };
  }

  const repsOnly = cleaned.match(REPS_ONLY_RE);
  if (repsOnly && (repsOnly[2] != null || repsOnly[4] != null)) {
    const name = repsOnly[1].trim().replace(EATEN_CONNECTOR_RE, "").trim();
    if (!name) return null;
    return {
      name,
      weightDisplay: null,
      unit: defaultUnit,
      unitExplicit: false,
      reps: Number.parseInt(repsOnly[3], 10),
    };
  }

  return null;
}
