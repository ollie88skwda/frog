// Model-family alias table: known short/marketing names for a model-name
// substring, feeding straight into `aliases` (same shape/purpose as
// `MatchCandidate.aliases` in packages/core/src/domain/match-exercise.ts —
// report.md §4's "Rogue Monster Lite" ↔ "RML" example, applied to the
// greenlit Tier 1 brands).
//
// Starter set only — illustrative of the mechanism, not an exhaustive pass
// over every current Tier 1 line. Extend as real batches surface more
// family names worth aliasing (voice/search users typing the short name).
//
// Matching is substring-based against the model string (case-insensitive):
// any entry whose `match` appears in a model adds `alias` to that row's
// aliases. A model can pick up more than one alias if more than one
// pattern matches.
export type ModelAlias = { match: string; alias: string };

export const MODEL_ALIASES: readonly ModelAlias[] = [
  { match: "iso-lateral", alias: "ISO-Lateral" },
  { match: "iso lateral", alias: "ISO-Lateral" },
  { match: "signature series", alias: "Signature" },
  { match: "insignia series", alias: "Insignia" },
  { match: "discovery series", alias: "Discovery" },
  { match: "selection pro", alias: "Selection" },
  { match: "ultra series", alias: "Ultra" },
  { match: "eagle nx", alias: "Eagle" },
  { match: "pendulum-x", alias: "Pendulum X" },
  { match: "v-squat", alias: "V-Squat" },
];

export function aliasesForModel(model: string): string[] {
  const lower = model.toLowerCase();
  const found: string[] = [];
  for (const { match, alias } of MODEL_ALIASES) {
    if (lower.includes(match.toLowerCase()) && !found.includes(alias)) {
      found.push(alias);
    }
  }
  return found;
}
