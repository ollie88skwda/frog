import { useRef, useState } from "react";
import { useVoice } from "@/lib/voice";

// In-house SVG chart kit (Hevy-parity §D) — zero dependencies, Radix color
// tokens (theme-safe in light + dark), tabular numerals, container-driven width
// (fixed viewBox scaled by `w-full`). Reused by the exercise-detail Summary
// chart now and the stats/report screens (M8/M10) later, so the prop shapes
// stay generic: a series of {x, y} numbers plus value formatters.

export type ChartPoint = { x: number; y: number };

const W = 320;
const PAD_L = 34; // y-axis value labels
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 18; // x-axis date labels

export function LineChart({
  points,
  formatX,
  formatY,
  height = 168,
  ariaLabel = "Trend",
  testId,
}: {
  points: ChartPoint[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  height?: number;
  ariaLabel?: string;
  testId?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const { t } = useVoice();

  if (points.length === 0) {
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
  const xs = points.map((p) => p.x);
  const x0 = xs[0];
  const span = xs[xs.length - 1] - x0 || 1;
  const plotW = W - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const px = (x: number) =>
    points.length === 1 ? PAD_L + plotW / 2 : PAD_L + ((x - x0) / span) * plotW;
  const py = (y: number) => PAD_T + (1 - (y - min) / (max - min)) * plotH;

  const path = points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");
  const grid = [0, 0.5, 1]; // top / mid / bottom gridlines + y labels

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(px(points[i].x) - vbX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setActive(best);
  }

  const cur = active != null ? points[active] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${height}`}
      className="w-full touch-none select-none"
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setActive(null)}
    >
      {grid.map((g) => {
        const y = PAD_T + g * plotH;
        return (
          <g key={g}>
            <line
              x1={PAD_L}
              y1={y}
              x2={W - PAD_R}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 4}
              y={y + 3}
              textAnchor="end"
              className="num"
              fontSize="8"
              fill="var(--faint)"
            >
              {formatY(min + (1 - g) * (max - min))}
            </text>
          </g>
        );
      })}

      {points.length > 1 && (
        <polyline
          points={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.map((p) => (
        <circle
          key={p.x}
          cx={px(p.x)}
          cy={py(p.y)}
          r="2.5"
          fill="var(--accent)"
        />
      ))}

      <text
        x={PAD_L}
        y={height - 5}
        className="num"
        fontSize="8"
        fill="var(--faint)"
      >
        {formatX(xs[0])}
      </text>
      {points.length > 1 && (
        <text
          x={W - PAD_R}
          y={height - 5}
          textAnchor="end"
          className="num"
          fontSize="8"
          fill="var(--faint)"
        >
          {formatX(xs[xs.length - 1])}
        </text>
      )}

      {cur && (
        <g>
          <line
            x1={px(cur.x)}
            y1={PAD_T}
            x2={px(cur.x)}
            y2={PAD_T + plotH}
            stroke="var(--soft)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={px(cur.x)}
            cy={py(cur.y)}
            r="3.5"
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
          <text
            x={Math.min(Math.max(px(cur.x), PAD_L + 30), W - PAD_R - 30)}
            y={PAD_T - 4}
            textAnchor="middle"
            className="num"
            fontSize="9"
            fill="var(--ink)"
            data-testid={testId ? `${testId}-readout` : undefined}
          >
            {formatY(cur.y)} · {formatX(cur.x)}
          </text>
        </g>
      )}
    </svg>
  );
}
