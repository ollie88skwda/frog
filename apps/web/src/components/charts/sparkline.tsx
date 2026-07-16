// Minimal inline trend line — no axes, no labels, no interaction. For dense
// contexts (cards, list rows) where only the shape matters. In-house SVG,
// Radix accent token, container-driven width.

export function Sparkline({
  values,
  width = 96,
  height = 24,
  ariaLabel = "Sparkline",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
  className?: string;
}) {
  if (values.length < 2) return null;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);
  const y = (v: number) =>
    pad + (1 - (v - min) / (max - min)) * (height - pad * 2);
  const path = values.map((v, i) => `${pad + i * stepX},${y(v)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <polyline
        points={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
