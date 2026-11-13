import type { Exercise, RecordsSessionInput } from "@frog/core";
import { useMemo } from "react";
import { useMeasurements } from "@/lib/measure-queries";
import { useResolvedUserPrefs } from "@/lib/profile-queries";
import { useExercises } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useMuscleMap } from "@/lib/stats-queries";

/** One data seam for every Progress section: history, exercises, prefs, body. */
export function useProgressData() {
  const rec = useRecordsData();
  const exQ = useExercises();
  const measQ = useMeasurements();
  const muscles = useMuscleMap();
  const prefs = useResolvedUserPrefs();
  const exercises: Exercise[] = exQ.data ?? [];
  const names = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.name])),
    [exercises],
  );
  const history: RecordsSessionInput[] = rec.data?.history ?? [];
  return {
    history,
    exercises,
    names,
    muscles,
    measurements: measQ.data ?? [],
    rirMax: prefs.hardSetRirMax,
    isLoading: rec.isLoading || exQ.isPending,
    isError: rec.isLoadingError || exQ.isLoadingError,
    error: rec.error ?? exQ.error,
    refetch: () => {
      rec.refetch();
      void exQ.refetch();
    },
  };
}
export type ProgressData = ReturnType<typeof useProgressData>;
