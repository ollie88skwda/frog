/**
 * Y-domain for trend line charts — the legacy in-house kit's autoscale,
 * preserved for visual parity: 8% headroom around the data band (or ±1 when
 * every point is identical), so a 100→120 kg trend fills the plot instead of
 * flattening against a 0-baseline. Recharts' default `[0, "auto"]` domain
 * would do exactly that flattening.
 */
export function trendYDomain(
  points: Array<{ x: number; y: number }>,
): [number, number] {
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) {
    min -= 1;
    max += 1;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }
  return [min, max];
}
