import type { UserPrefs } from "../db/schema";

/**
 * User prefs with the redesign §9.2 defaults applied. The stored row keeps
 * the new fields optional/null (existing rows predate them and Convex needs
 * no backfill), so every reader goes through this instead of repeating
 * `?? default` inline.
 */
export type ResolvedUserPrefs = Omit<
  UserPrefs,
  | "goal"
  | "trainingStatus"
  | "exerciseGrouping"
  | "coachEnabled"
  | "coachRulesOff"
  | "showEvidenceLabels"
  | "hardSetRirMax"
> & {
  goal: NonNullable<UserPrefs["goal"]> | null;
  trainingStatus: NonNullable<UserPrefs["trainingStatus"]> | null;
  exerciseGrouping: NonNullable<UserPrefs["exerciseGrouping"]>;
  coachEnabled: boolean;
  coachRulesOff: string[];
  showEvidenceLabels: boolean;
  /** R6 hard-set definition: a set counts as hard at this RIR or lower. */
  hardSetRirMax: number;
};

/** Defaults for the §9.2 fields (the new-user values). */
export const USER_PREF_DEFAULTS = {
  goal: null,
  trainingStatus: null,
  exerciseGrouping: "joint_action",
  coachEnabled: true,
  coachRulesOff: [] as string[],
  showEvidenceLabels: true,
  hardSetRirMax: 4,
  /** R6/R17b: warm-ups are excluded from stats for NEW users. A saved row
   * keeps its stored value; with no row yet the app-wide fallback is this. */
  includeWarmupsInStats: false,
} as const;

/** Applies the §9.2 defaults over a (possibly missing) stored prefs row. */
export function resolveUserPrefs(
  row: UserPrefs | null | undefined,
): ResolvedUserPrefs {
  const d = USER_PREF_DEFAULTS;
  return {
    id: row?.id ?? "",
    createdAt: row?.createdAt ?? 0,
    updatedAt: row?.updatedAt ?? 0,
    deletedAt: row?.deletedAt ?? null,
    ownerId: row?.ownerId ?? "",
    includeWarmupsInStats:
      row?.includeWarmupsInStats ?? d.includeWarmupsInStats,
    defaultRestSec: row?.defaultRestSec ?? null,
    previousValuesScope: row?.previousValuesScope ?? "any",
    bodyDiagram: row?.bodyDiagram ?? "neutral",
    plateConfig: row?.plateConfig ?? null,
    displayName: row?.displayName ?? null,
    bio: row?.bio ?? null,
    goal: row?.goal ?? d.goal,
    trainingStatus: row?.trainingStatus ?? d.trainingStatus,
    exerciseGrouping: row?.exerciseGrouping ?? d.exerciseGrouping,
    coachEnabled: row?.coachEnabled ?? d.coachEnabled,
    coachRulesOff: row?.coachRulesOff ?? [...d.coachRulesOff],
    showEvidenceLabels: row?.showEvidenceLabels ?? d.showEvidenceLabels,
    hardSetRirMax: row?.hardSetRirMax ?? d.hardSetRirMax,
  };
}
