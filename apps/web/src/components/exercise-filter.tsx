import {
  EQUIPMENT_KINDS,
  EQUIPMENT_LABELS,
  MUSCLE_REGION_LABELS,
  MUSCLE_REGIONS,
  MUSCLES,
  type MuscleTarget,
  muscleLabelMatches,
  musclesInRegion,
  type Tier,
} from "@frog/core";
import { Select } from "@radix-ui/themes";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

// Radix Select forbids an empty-string item value, so the "All …" options use
// a sentinel that maps to "" (the filter's "no value") at the boundary.
const ALL = "all";

const MUSCLE_KEYS = new Set(MUSCLES.map((m) => m.key));

// Same bucketing rule as groupByPrimaryMuscle: primary target muscle, or
// "other" when it has none / an unknown key. Keeps the filter consistent with
// the group headers it filters within.
export function primaryMuscleKey(e: {
  muscleTargets: MuscleTarget[] | null;
}): string {
  const primary = e.muscleTargets?.[0]?.muscle;
  return primary && MUSCLE_KEYS.has(primary) ? primary : "other";
}

// Quality filter values: a tier, or "unrated" for exercises with no rating on
// their primary muscle ("" = no filter).
export type TierFilter = Tier | "unrated" | "";

// The tier the library row shows is the exercise's rating for its primary
// muscle (same index-0 rule as grouping) — filtering on it keeps the filter
// consistent with the name-brightness encoding TierLegend explains.
export function primaryTier(e: {
  muscleTargets: MuscleTarget[] | null;
}): Tier | null {
  return e.muscleTargets?.[0]?.tier ?? null;
}

// Matches the name, any alias ("OHP" finds "Overhead Press"), the equipment
// label, or any target muscle's label/alias ("chest" finds pec work, via
// MUSCLE_ALIASES) — one function, so the library, session picker, and
// routine editor all pick up new match surfaces for free.
function matchesQuery(
  e: {
    name: string;
    aliases?: string[] | null;
    equipment?: string | null;
    muscleTargets: MuscleTarget[] | null;
  },
  q: string,
): boolean {
  if (e.name.toLowerCase().includes(q)) return true;
  if (e.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
  const equipmentLabel = e.equipment
    ? EQUIPMENT_LABELS[e.equipment as keyof typeof EQUIPMENT_LABELS]
    : null;
  if (equipmentLabel?.toLowerCase().includes(q)) return true;
  return e.muscleTargets?.some((t) => muscleLabelMatches(t.muscle, q)) ?? false;
}

export function filterExercises<
  T extends {
    name: string;
    muscleTargets: MuscleTarget[] | null;
    aliases?: string[] | null;
    equipment?: string | null;
  },
>(
  items: T[],
  query: string,
  muscle: string,
  tier: TierFilter = "",
  equipment = "",
): T[] {
  const q = query.trim().toLowerCase();
  return items.filter((e) => {
    if (q && !matchesQuery(e, q)) return false;
    if (muscle && primaryMuscleKey(e) !== muscle) return false;
    if (equipment && e.equipment !== equipment) return false;
    if (tier) {
      const t = primaryTier(e);
      if (tier === "unrated" ? t !== null : t !== tier) return false;
    }
    return true;
  });
}

// Search box + region/muscle/equipment filters, shared by the Library and the
// session exercise picker so both stay in sync. The region and equipment
// selects are optional — the picker passes only the muscle filter.
export function ExerciseFilterBar({
  query,
  onQuery,
  muscle,
  onMuscle,
  region,
  onRegion,
  equipment,
  onEquipment,
  autoFocus,
  after,
}: {
  query: string;
  onQuery: (v: string) => void;
  muscle: string;
  onMuscle: (v: string) => void;
  /** Coarse region; narrows the muscle options ("" = all regions). */
  region?: string;
  onRegion?: (v: string) => void;
  /** Equipment kind key, e.g. "barbell" ("" = all equipment). */
  equipment?: string;
  onEquipment?: (v: string) => void;
  autoFocus?: boolean;
  /** Extra control appended after the muscle select (e.g. a "Yours" toggle). */
  after?: ReactNode;
}) {
  const muscles = region
    ? musclesInRegion(region as (typeof MUSCLE_REGIONS)[number])
    : MUSCLES;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-faint" />
        <Input
          placeholder="Search exercises…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus={autoFocus}
          className="pl-8"
          data-testid="exercise-search-input"
        />
      </div>
      {onRegion && (
        <Select.Root
          value={region || ALL}
          onValueChange={(v) => {
            const next = v === ALL ? "" : v;
            onRegion(next);
            // A region change can invalidate the current muscle — clear it so
            // the muscle select never shows an option outside the region.
            if (
              next &&
              muscle &&
              !musclesInRegion(next as (typeof MUSCLE_REGIONS)[number]).some(
                (m) => m.key === muscle,
              )
            )
              onMuscle("");
          }}
          size="2"
        >
          <Select.Trigger
            variant="surface"
            className="w-28 shrink-0"
            data-testid="exercise-region-select"
          />
          <Select.Content>
            <Select.Item value={ALL}>All regions</Select.Item>
            {MUSCLE_REGIONS.map((r) => (
              <Select.Item key={r} value={r}>
                {MUSCLE_REGION_LABELS[r]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
      <Select.Root
        value={muscle || ALL}
        onValueChange={(v) => onMuscle(v === ALL ? "" : v)}
        size="2"
      >
        <Select.Trigger
          variant="surface"
          className="w-32 shrink-0"
          data-testid="exercise-filter-select"
        />
        <Select.Content>
          <Select.Item value={ALL}>All muscles</Select.Item>
          {muscles.map((m) => (
            <Select.Item key={m.key} value={m.key}>
              {m.label}
            </Select.Item>
          ))}
          {!region && <Select.Item value="other">Other</Select.Item>}
        </Select.Content>
      </Select.Root>
      {onEquipment && (
        <Select.Root
          value={equipment || ALL}
          onValueChange={(v) => onEquipment(v === ALL ? "" : v)}
          size="2"
        >
          <Select.Trigger
            variant="surface"
            className="w-28 shrink-0"
            data-testid="exercise-equipment-select"
          />
          <Select.Content>
            <Select.Item value={ALL}>All equipment</Select.Item>
            {EQUIPMENT_KINDS.map((k) => (
              <Select.Item key={k} value={k}>
                {EQUIPMENT_LABELS[k]}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
      {after}
    </div>
  );
}
