import { cn } from "@/lib/utils";
import { sparkGeometry } from "./logic";

/**
 * Hand-SVG sparkline (the one allowed exception to "library first": recharts
 * x30 rows is heavy; recorded in DECISIONS). null = gap, never interpolated.
 * aria-hidden: the row text carries the meaning.
 */
export function Spark({
  points,
  band,
  width = 64,
  height = 24,
  confidence = "ok",
  lastDot = true,
  className,
}: {
  points: (number | null)[];
  band?: [number, number];
  width?: number;
  height?: number;
  confidence?: "low" | "ok";
  lastDot?: boolean;
  className?: string;
}) {
  const g = sparkGeometry(points, width, height, band);
  const low = confidence === "low";
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("shrink-0 text-chart-mark", low && "opacity-50", className)}
    >
      {g.band && (
        <rect
          x={0}
          y={g.band.y}
          width={width}
          height={g.band.h}
          rx={2}
          className="fill-hover"
        />
      )}
      {g.segments.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={low ? "3 2" : undefined}
        />
      ))}
      {g.bridges.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="2 2"
          opacity={0.6}
        />
      ))}
      {lastDot && g.last && (
        <circle cx={g.last.x} cy={g.last.y} r={2.5} fill="currentColor" />
      )}
    </svg>
  );
}
