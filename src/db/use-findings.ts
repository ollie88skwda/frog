import { useCallback } from "react";
import { useQueryFn } from "./use-live";
import { buildExerciseMap } from "./findings";
import { holistic } from "../domain/findings";
import { summarizeReport } from "../domain/progressionSummary";
import type { ProgressionSummary } from "../domain/progressionSummary";

type DB = any;

export function useFindings(db: DB): [ProgressionSummary, () => void] {
  return useQueryFn(
    useCallback(() => summarizeReport(holistic(buildExerciseMap(db))), [db]),
  );
}
