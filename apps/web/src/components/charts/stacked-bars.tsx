// Stacked bar chart — in-house SVG, Radix tokens. Each group (a time bucket) is
// one bar; its value array stacks segment-on-segment (a muscle per series).
// Reused by the stats hub "sets per muscle group over time" module (M8). The
// green-monochrome palette steps through grass + sage scale entries so up to
// ~8 stacked series stay distinguishable while keeping the single-hue identity.

export type BarGroup = { label: string; values: number[] };

const W = 320;
const PAD_T = 8;
const PAD_B = 22;

// Distinguishable steps within the grass/sage monochrome family (legend maps
// each back to its muscle). Cycles if a caller exceeds the palette length.
const PALETTE = [
  "var(--grass-9)",
  "var(--sage-8)",
  "var(--grass-6)",
  "var(--sage-11)",
  "var(--grass-11)",
  "var(--sage-6)",
  "var(--grass-4)",
  "var(--sage-9)",
];

export function stackColor(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function StackedBarChart({
  groups,
  seriesLabels,
  height = 180,
  ariaLabel = "Stacked bars",
  testId,
}: {
  groups: BarGroup[];
  seriesLabels: string[];
  height?: number;
  ariaLabel?: string;
  testId?: string;
}) {
  if (groups.length === 0 || seriesLabels.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-faint"
        style={{ height }}
        data-testid={testId}
      >
        No data yet.
      </div>
    );
  }

  const totals = groups.map((g) => g.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const plotH = height - PAD_T - PAD_B;
  const slot = W / groups.length;
  const barW = Math.min(slot * 0.62, 44);

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <line
        x1={0}
        y1={PAD_T + plotH}
        x2={W}
        y2={PAD_T + plotH}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {groups.map((g, gi) => {
        const cx = gi * slot + slot / 2;
        let acc = 0; // running height from the baseline up
        return (
          <g
            key={g.label}
            data-testid={testId ? `${testId}-bar-${g.label}` : undefined}
          >
            {g.values.map((v, si) => {
              const h = (v / max) * plotH;
              const y = PAD_T + plotH - acc - h;
              acc += h;
              const seriesKey = seriesLabels[si] ?? String(si);
              if (v <= 0) return null;
              return (
                <rect
                  key={seriesKey}
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={h}
                  fill={stackColor(si)}
                />
              );
            })}
            <text
              x={cx}
              y={height - 8}
              textAnchor="middle"
              fontSize="8"
              fill="var(--faint)"
            >
              {g.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
