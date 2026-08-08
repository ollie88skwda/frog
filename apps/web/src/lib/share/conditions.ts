// Session-conditions display formatting, shared by the in-session Conditions
// chip and the share card's lab-report conditions strip — one formatter, so
// the chip's "7.5h · 82kg · stress 3" and the card's strip can never drift
// (same rule as formatHeroSet: two hand-written copies of display precedence
// drift). Pure, no React.
import { type Metric, SEED_CONDITIONS } from "@frog/core";

// Compact chip labels for the seeded conditions ("7.5h · 82kg · stress 3").
const SHORT: Record<string, (v: unknown) => string> = {
  [SEED_CONDITIONS.sleepH]: (v) => `${v}h`,
  [SEED_CONDITIONS.bodyweight]: (v) => `${v}kg`,
  [SEED_CONDITIONS.preCarbsG]: (v) => `${v}g`,
  [SEED_CONDITIONS.caffeineMg]: (v) => `${v}mg`,
  [SEED_CONDITIONS.stress]: (v) => `stress ${v}`,
  [SEED_CONDITIONS.lastMealH]: (v) => `ate ${v}h ago`,
};

/** One display line of every recorded session-scoped condition, or null when
 * none were recorded — null means "no conditions strip", never a fabricated
 * one. Mirrors the in-session chip's summarization exactly (same SHORT
 * labels, same unit/name fallbacks, same " · " join). */
export function sessionConditionsLine(
  values: Record<string, unknown>,
  metrics: Metric[],
): string | null {
  const parts: string[] = [];
  for (const m of metrics) {
    const v = values[m.id];
    if (v == null || v === "") continue;
    const short = SHORT[m.id];
    if (short) parts.push(short(v));
    else if (m.type === "checkbox") {
      if (v === true) parts.push(m.name);
    } else if (m.unit) parts.push(`${v}${m.unit}`);
    else parts.push(`${m.name} ${v}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
