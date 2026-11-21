// Import rule: an exercise whose name has the word "uni" or "unilateral"
// (case-insensitive, whole word) is one-sided. Its sets become left/right
// pairs sharing a set_no (see set-nos.ts, domain/volume.ts groupSetsBySetNo).

const UNI_WORD = /(^|[^a-z0-9])(uni|unilateral)(?![a-z0-9])/i;

export const isUnilateralName = (name: string): boolean => UNI_WORD.test(name);

/**
 * Doubles each side-less set into a left row and a right row (same numbers).
 * Rows that already carry a side are left alone, so sources that know their
 * sides (Frog export, the screenshot table) are never touched.
 */
export function pairUnilateralSets<T extends { side?: string | null }>(
  sets: T[],
): T[] {
  if (sets.some((s) => s.side === "left" || s.side === "right")) return sets;
  return sets.flatMap((s) => [
    { ...s, side: "left" },
    { ...s, side: "right" },
  ]);
}
