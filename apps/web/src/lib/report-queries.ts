import type { MuscleByExercise, RecordsSessionInput } from "@sbl/core";
import { useMemo } from "react";
import { useMeasurements } from "./measure-queries";
import { useUserPrefs } from "./profile-queries";
import { useExercises } from "./queries";
import { useRecordsData } from "./records-queries";

// Shared data seam for the Monthly report + Year in Review screens (M10). The
// report builders in @sbl/core take (history, muscles, …); everything they need
// is already cached elsewhere — the records-data history (recordsData), the
// exercise list (for the muscle map + exercise names), user prefs (first
// weekday + warm-up inclusion), and the latest bodyweight (for bodyweight-
// exercise volume). This hook assembles them so the screens stay presentational.
export type ReportData = {
  history: RecordsSessionInput[];
  muscles: MuscleByExercise;
  /** exerciseId → display name (PR list, top exercises). */
  nameOf: (exerciseId: string) => string;
  includeWarmups: boolean;
  firstWeekday: number;
  /** Latest logged bodyweight (kg) for bodyweight-exercise volume, or null. */
  bodyweightKg: number | null;
};

export function useReportData(): {
  data: ReportData | undefined;
  isLoading: boolean;
} {
  const { data: records, isLoading: recLoading } = useRecordsData();
  const { data: exercises = [], isLoading: exLoading } = useExercises();
  const { data: prefs } = useUserPrefs();
  const { data: measurements = [] } = useMeasurements();

  const data = useMemo<ReportData | undefined>(() => {
    if (!records) return undefined;
    const muscles: MuscleByExercise = new Map(
      exercises.map((e) => [e.id, e.muscleTargets ?? null]),
    );
    const names = new Map(exercises.map((e) => [e.id, e.name]));
    // measurements arrive newest-first → the first non-null is the latest.
    const bodyweightKg =
      measurements.find((m) => m.bodyweightKg != null)?.bodyweightKg ?? null;
    return {
      history: records.history,
      muscles,
      nameOf: (id) => names.get(id) ?? "Exercise",
      includeWarmups: records.includeWarmups,
      firstWeekday: prefs?.firstWeekday ?? 1,
      bodyweightKg,
    };
  }, [records, exercises, prefs, measurements]);

  return { data, isLoading: recLoading || exLoading };
}
