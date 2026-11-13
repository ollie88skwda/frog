// Equipment -> stability rank, a static map (no schema column; redesign §9.5).
// R13: stability makes an exercise easier to load and progress, NOT better for
// growth, so this orders swaps and defaults only and carries no growth claim.

/** Higher = more stable (easier to load and progress). */
export const STABILITY_RANK: Record<string, number> = {
  machine: 5,
  cable: 4,
  plate: 3,
  dumbbell: 3,
  ez_bar: 2,
  barbell: 2,
  bodyweight: 1,
  other: 2,
  // legacy display-only kinds
  suspension: 0,
  band: 2,
  kettlebell: 1,
};

/** Rank for an equipment string; unknown or null is the middle (2). */
export function stabilityRank(equipment: string | null | undefined): number {
  return equipment != null ? (STABILITY_RANK[equipment] ?? 2) : 2;
}

/** Comparator: most stable first, then by name for a deterministic order. */
export function compareByStability<
  T extends { equipment?: string | null; name?: string },
>(a: T, b: T): number {
  return (
    stabilityRank(b.equipment) - stabilityRank(a.equipment) ||
    (a.name ?? "").localeCompare(b.name ?? "")
  );
}
