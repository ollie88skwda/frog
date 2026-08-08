import {
  EQUIPMENT_LABELS,
  MUSCLES,
  type MuscleTarget,
  muscleLabelMatches,
  type Tier,
} from "@frog/core";
import { Select } from "@radix-ui/themes";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

// Radix Select forbids an empty-string item value, so the "All muscles" option
// uses a sentinel that maps to "" (the filter's "no muscle") at the boundary.
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
>(items: T[], query: string, muscle: string, tier: TierFilter = ""): T[] {
  const q = query.trim().toLowerCase();
  return items.filter((e) => {
    if (q && !matchesQuery(e, q)) return false;
    if (muscle && primaryMuscleKey(e) !== muscle) return false;
    if (tier) {
      const t = primaryTier(e);
      if (tier === "unrated" ? t !== null : t !== tier) return false;
    }
    return true;
  });
}

// Search box + muscle-group filter, shared by the Library and the session
// exercise picker so both stay in sync.
export function ExerciseFilterBar({
  query,
  onQuery,
  muscle,
  onMuscle,
  autoFocus,
  after,
}: {
  query: string;
  onQuery: (v: string) => void;
  muscle: string;
  onMuscle: (v: string) => void;
  autoFocus?: boolean;
  /** Extra control appended after the muscle select (e.g. a "Yours" toggle). */
  after?: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
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
          {MUSCLES.map((m) => (
            <Select.Item key={m.key} value={m.key}>
              {m.label}
            </Select.Item>
          ))}
          <Select.Item value="other">Other</Select.Item>
        </Select.Content>
      </Select.Root>
      {after}
    </div>
  );
}
