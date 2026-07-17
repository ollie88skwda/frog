// Vertical bar chart — in-house SVG, Radix tokens, tabular numerals, container
// width. Generic {label, value} bars with a value formatter; reused by the
// stats hub (sets-per-muscle etc., M8) and reports (M10).

import { useVoice } from "@/lib/voice";

export type Bar = { label: string; value: number };

const W = 320;
const PAD_T = 14;
const PAD_B = 22; // category labels

export function BarChart({
  bars,
  formatValue,
  height = 160,
  ariaLabel = "Bars",
  testId,
}: {
  bars: Bar[];
  formatValue: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  testId?: string;
}) {
  const { t } = useVoice();
  if (bars.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-faint"
        style={{ height }}
        data-testid={testId}
      >
        {t("No data yet.", "No data yet. The frog refuses to speculate.")}
      </div>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);
  const plotH = height - PAD_T - PAD_B;
  const slot = W / bars.length;
  const barW = Math.min(slot * 0.6, 40);

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
      {bars.map((b, i) => {
        const h = (b.value / max) * plotH;
        const cx = i * slot + slot / 2;
        return (
          <g
            key={b.label}
            data-testid={testId ? `${testId}-bar-${b.label}` : undefined}
          >
            <rect
              x={cx - barW / 2}
              y={PAD_T + plotH - h}
              width={barW}
              height={Math.max(h, 0)}
              fill="var(--accent)"
            />
            {b.value > 0 && (
              <text
                x={cx}
                y={PAD_T + plotH - h - 3}
                textAnchor="middle"
                className="num"
                fontSize="8"
                fill="var(--soft)"
              >
                {formatValue(b.value)}
              </text>
            )}
            <text
              x={cx}
              y={height - 8}
              textAnchor="middle"
              fontSize="8"
              fill="var(--faint)"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
