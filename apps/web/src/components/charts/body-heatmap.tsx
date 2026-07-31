import { MUSCLE_REGION_LABELS, type MuscleRegion } from "@frog/core";
import { useState } from "react";
import {
  type BodyView,
  NEUTRAL_PARTS,
  opacityFor,
  PART,
  REGION_ORDER,
  regionSetsOf,
  VIEW_REGIONS,
} from "./body-paths";

// Body heat map (Hevy-parity M8, plan §D) — a hand-authored front/back
// schematic figure, zero dependencies, Radix tokens (theme-safe). Six coarse
// regions (chest/back/legs/shoulders/arms/core) roll up from the 23-muscle
// vocabulary via regionOf. Each region's fill opacity scales with its set count
// (0 → the neutral silhouette shows through; max → accent at ~0.85). Neutral,
// gender-agnostic figure v1 (deliberate deviation — see docs/DECISIONS.md).
//
// This is a legibility-first schematic, not anatomy art: proportions are blocky
// on purpose so the region a set lands in is unmistakable at a glance.
//
// The path geometry itself lives in ./body-paths.ts — the share card's canvas
// painter (lib/share/graphics.ts) draws the same figure from that one module.

function Figure({
  view,
  regionSets,
  max,
  selected,
  onSelect,
  interactive,
  xOffset,
}: {
  view: BodyView;
  regionSets: Record<MuscleRegion, number>;
  max: number;
  selected: MuscleRegion | null;
  onSelect: (r: MuscleRegion) => void;
  interactive: boolean;
  xOffset: number;
}) {
  const regions = VIEW_REGIONS[view];
  return (
    <g transform={`translate(${xOffset}, 2)`}>
      {/* Neutral silhouette (head, neck, and every region part) — always
          visible so 0-set regions still read as body, not empty space. */}
      {NEUTRAL_PARTS.map((d) => (
        <path
          key={d}
          d={d}
          fill="var(--surface-3)"
          stroke="var(--border-strong)"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      ))}
      {Object.values(regions)
        .flat()
        .map((part) => (
          <path
            key={part}
            d={PART[part]}
            fill="var(--surface-3)"
            stroke="var(--border-strong)"
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
        ))}
      {/* Heat overlay + hit target, one group per region. When interactive the
          group is a real focusable button (keyboard-operable); otherwise it is
          inert and passes pointer events through. */}
      {(Object.entries(regions) as [MuscleRegion, string[]][]).map(
        ([region, parts]) => {
          const isSel = selected === region;
          const interact = interactive
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": `${region} region`,
                onClick: () => onSelect(region),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(region);
                  }
                },
                style: { cursor: "pointer", pointerEvents: "all" as const },
              }
            : { style: { pointerEvents: "none" as const } };
          return (
            <g
              key={region}
              data-testid={`heatmap-${view}-${region}`}
              {...interact}
            >
              {parts.map((part) => (
                <path
                  key={part}
                  d={PART[part]}
                  fill="var(--accent)"
                  fillOpacity={opacityFor(regionSets[region], max)}
                  stroke={isSel ? "var(--accent)" : "none"}
                  strokeWidth={isSel ? 1.4 : 0}
                  strokeLinejoin="round"
                  style={{ transition: "fill-opacity 150ms" }}
                />
              ))}
            </g>
          );
        },
      )}
      <text x={36} y={158} textAnchor="middle" fontSize="9" fill="var(--faint)">
        {view === "front" ? "Front" : "Back"}
      </text>
    </g>
  );
}

export function BodyHeatmap({
  muscleSets,
  interactive = true,
  max: maxProp,
  className,
  testId,
}: {
  muscleSets: Record<string, number>;
  /** Tap a region to read out its label + set count (default true). */
  interactive?: boolean;
  /** Explicit opacity-scaling ceiling; defaults to the busiest region. */
  max?: number;
  className?: string;
  testId?: string;
}) {
  const [selected, setSelected] = useState<MuscleRegion | null>(null);
  const regionSets = regionSetsOf(muscleSets);
  const max = maxProp ?? Math.max(1, ...Object.values(regionSets));
  const selectedValue = selected ? regionSets[selected] : null;

  return (
    <div className={className} data-testid={testId}>
      <svg
        viewBox="0 0 168 168"
        className="w-full"
        role="img"
        aria-label="Muscles trained — front and back"
      >
        <Figure
          view="front"
          regionSets={regionSets}
          max={max}
          selected={selected}
          onSelect={setSelected}
          interactive={interactive}
          xOffset={2}
        />
        <Figure
          view="back"
          regionSets={regionSets}
          max={max}
          selected={selected}
          onSelect={setSelected}
          interactive={interactive}
          xOffset={90}
        />
      </svg>
      {interactive && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {REGION_ORDER.map((region) => {
            const isSel = selected === region;
            return (
              <button
                key={region}
                type="button"
                onClick={() => setSelected(region)}
                className={
                  isSel
                    ? "num h-7 bg-accent-soft px-2 text-2xs text-accent"
                    : "num h-7 bg-translucent px-2 text-2xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                }
                data-testid={`heatmap-chip-${region}`}
              >
                {MUSCLE_REGION_LABELS[region]}{" "}
                <span className="text-faint">
                  {formatSets(regionSets[region])}
                </span>
              </button>
            );
          })}
          {selected && (
            <span
              className="num ml-auto text-2xs text-soft"
              data-testid="heatmap-readout"
            >
              {MUSCLE_REGION_LABELS[selected]} ·{" "}
              {formatSets(selectedValue ?? 0)} sets
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Fractional set counts (primary 1.0 / secondary 0.5) — show the ".5" only when
// present so whole counts stay clean.
function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
