// Grouped (clustered) bar chart — in-house SVG, Radix tokens. Each group holds
// one value per series (e.g. current period vs prior period). Reused by the
// stats hub distribution view (M8). The first series uses the accent; extra
// series step down to quieter neutral fills so the "current" bar stays dominant.

export type BarGroup = { label: string; values: number[] };

const W = 320;
const PAD_T = 14;
const PAD_B = 22;
const SERIES_FILL = ["var(--accent)", "var(--faint)", "var(--border)"];

export function GroupedBarChart({
  groups,
  seriesLabels,
  height = 168,
  ariaLabel = "Grouped bars",
  testId,
}: {
  groups: BarGroup[];
  seriesLabels: string[];
  height?: number;
  ariaLabel?: string;
  testId?: string;
}) {
  if (groups.length === 0) {
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

  const seriesCount = Math.max(1, seriesLabels.length);
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const plotH = height - PAD_T - PAD_B;
  const slot = W / groups.length;
  const groupW = slot * 0.7;
  const barW = groupW / seriesCount;

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
        const left = gi * slot + (slot - groupW) / 2;
        return (
          <g key={g.label}>
            {g.values.map((v, si) => {
              const h = (v / max) * plotH;
              const x = left + si * barW;
              const seriesKey = seriesLabels[si] ?? String(si);
              return (
                <rect
                  key={seriesKey}
                  x={x}
                  y={PAD_T + plotH - h}
                  width={Math.max(barW - 1, 1)}
                  height={Math.max(h, 0)}
                  fill={SERIES_FILL[si] ?? "var(--border)"}
                  data-testid={
                    testId ? `${testId}-${g.label}-${seriesKey}` : undefined
                  }
                />
              );
            })}
            <text
              x={gi * slot + slot / 2}
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
      {/* Legend: series name beside its swatch, top-left. */}
      {seriesLabels.map((label, si) => (
        <g key={label} transform={`translate(${si * 78 + 2}, 6)`}>
          <rect
            width="7"
            height="7"
            fill={SERIES_FILL[si] ?? "var(--border)"}
          />
          <text x="10" y="7" fontSize="8" fill="var(--faint)">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
