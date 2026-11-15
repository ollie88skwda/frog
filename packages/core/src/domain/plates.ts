// Plate calculator (Hevy-parity plan §C): per-side arrangement for a target
// bar weight, greedy from heaviest selected plate. Unit-agnostic — callers
// pass bar/plates/target in the same unit (kg or lb display values).

export type PlateResult =
  | { exact: true; perSide: number[] }
  | { exact: false; perSide: number[]; closest: number };

/**
 * Computes the per-side plate stack: (target − bar) / 2 filled greedily from
 * the selected denominations (each usable unlimited times). If the exact
 * target is unbuildable, returns the closest achievable total ≤ target
 * (Hevy notifies + recommends the closest weight).
 */
export function platesFor(
  target: number,
  bar: number,
  plates: number[],
): PlateResult {
  const perSideTarget = (target - bar) / 2;
  if (perSideTarget < 0) return { exact: false, perSide: [], closest: bar };
  const denoms = [...new Set(plates)]
    .filter((p) => p > 0)
    .sort((a, b) => b - a);

  let remaining = perSideTarget;
  const stack: number[] = [];
  const EPS = 1e-6;
  for (const p of denoms) {
    while (remaining + EPS >= p) {
      stack.push(p);
      remaining -= p;
    }
  }
  if (remaining < EPS) return { exact: true, perSide: stack };
  const achieved = perSideTarget - remaining;
  return { exact: false, perSide: stack, closest: bar + achieved * 2 };
}
