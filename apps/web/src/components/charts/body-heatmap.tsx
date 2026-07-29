import { MUSCLE_REGION_LABELS, type MuscleRegion, regionOf } from "@frog/core";
import { useState } from "react";

// Body heat map (Hevy-parity M8, plan §D) — a hand-authored front/back
// schematic figure, zero dependencies, Radix tokens (theme-safe). Six coarse
// regions (chest/back/legs/shoulders/arms/core) roll up from the 23-muscle
// vocabulary via regionOf. Each region's fill opacity scales with its set count
// (0 → the neutral silhouette shows through; max → accent at ~0.85). Neutral,
// gender-agnostic figure v1 (deliberate deviation — see docs/DECISIONS.md).
//
// This is a legibility-first schematic, not anatomy art: proportions are blocky
// on purpose so the region a set lands in is unmistakable at a glance.

// One figure's parts in local coordinates (x 0–72, y 0–152). The silhouette is
// shared by both views; only the region→parts mapping differs (front shows the
// chest/abs, back shows the lats/lower back — everything else is common).
const PART: Record<string, string> = {
  leftDelt: "M20,24 L28,25 L27,33 L18,33 Q16,28 20,24 Z",
  rightDelt: "M52,24 L44,25 L45,33 L54,33 Q56,28 52,24 Z",
  chest: "M26,25 L46,25 L47,44 L25,44 Z",
  core: "M25,44 L47,44 L45,74 L27,74 Z",
  upperBack: "M26,25 L46,25 L47,47 L25,47 Z",
  lowerBack: "M25,47 L47,47 L45,74 L27,74 Z",
  leftUpperArm: "M18,33 L26,34 L24,58 L15,57 Z",
  rightUpperArm: "M54,33 L46,34 L48,58 L57,57 Z",
  leftForearm: "M15,57 L24,58 L22,82 L13,80 Z",
  rightForearm: "M57,57 L48,58 L50,82 L59,80 Z",
  leftThigh: "M27,74 L35,74 L33,110 L24,108 Z",
  rightThigh: "M37,74 L45,74 L48,108 L39,110 Z",
  leftShin: "M24,108 L33,110 L31,148 L23,146 Z",
  rightShin: "M48,108 L39,110 L41,148 L49,146 Z",
};

const ARMS = ["leftUpperArm", "rightUpperArm", "leftForearm", "rightForearm"];
const LEGS = ["leftThigh", "rightThigh", "leftShin", "rightShin"];

type View = "front" | "back";

// Region → part names per view. A region absent from a view (chest on the back,
// back on the front) simply isn't drawn there.
const VIEW_REGIONS: Record<View, Partial<Record<MuscleRegion, string[]>>> = {
  front: {
    shoulders: ["leftDelt", "rightDelt"],
    chest: ["chest"],
    core: ["core"],
    arms: ARMS,
    legs: LEGS,
  },
  back: {
    shoulders: ["leftDelt", "rightDelt"],
    back: ["upperBack", "lowerBack"],
    arms: ARMS,
    legs: LEGS,
  },
};

// Head + neck: neutral outline, never a region (drawn once per figure).
const NEUTRAL_PARTS = [
  "M28,11 A8,8 0 1,1 44,11 A8,8 0 1,1 28,11 Z", // head
  "M32,18 L40,18 L40,23 L32,23 Z", // neck
];

const REGION_ORDER: MuscleRegion[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "legs",
];

/** Roll per-muscle set counts up to the six coarse regions. */
export function regionSetsOf(
  muscleSets: Record<string, number>,
): Record<MuscleRegion, number> {
  const out = {
    chest: 0,
    back: 0,
    legs: 0,
    shoulders: 0,
    arms: 0,
    core: 0,
  } as Record<MuscleRegion, number>;
  for (const [muscle, n] of Object.entries(muscleSets)) {
    const region = regionOf(muscle);
    if (region) out[region] += n;
  }
  return out;
}

function opacityFor(value: number, max: number): number {
  if (value <= 0) return 0;
  return 0.15 + 0.7 * Math.min(1, value / max);
}

function Figure({
  view,
  regionSets,
  max,
  selected,
  onSelect,
  interactive,
  xOffset,
}: {
  view: View;
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
