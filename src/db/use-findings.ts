import { useCallback } from "react";
import { useQueryFn } from "./use-live";
import { buildExerciseMap } from "./findings";
import { holistic, type HolisticReport } from "../domain/findings";
import { summarizeReport } from "../domain/progressionSummary";
import type { ProgressionSummary } from "../domain/progressionSummary";

type DB = any;

type FindingsResult = { summary: ProgressionSummary; report: HolisticReport };

export function useFindings(db: DB): [FindingsResult, () => void] {
  return useQueryFn(
    useCallback(() => {
      const report = holistic(buildExerciseMap(db));
      return { summary: summarizeReport(report), report };
    }, [db]),
  );
}
