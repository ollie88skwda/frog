import {
  computeRecords,
  type RecordsResult,
  type RecordsSessionInput,
} from "@frog/core";
import { useQuery } from "@tanstack/react-query";
import { useRepo } from "./repo";

export type RecordsData = {
  /** Raw per-session history (chronological) — feeds charts + the history tab. */
  history: RecordsSessionInput[];
  /** Computed PR taxonomy + set-records + the PR event timeline. */
  records: RecordsResult;
  /** The warm-ups-in-stats pref the records were computed under — the charts
   * apply the same filtering so they never disagree with the records panel. */
  includeWarmups: boolean;
};

// Records/PRs are computed client-side (docs/DECISIONS.md 2026-07-15): one
// full-history fetch (recordsData, mirroring findingsData) feeds computeRecords.
// Retroactive edits/imports and the warm-ups-in-stats toggle become cache
// invalidations, never a server recompute. The include-warmups pref comes from
// user_prefs (server, cross-device) and defaults to true. Both the raw sessions
// and the computed result are returned: charts + the history breakdown read the
// raw per-session sets, the records panel + set-records read the computed bests.
export function useRecordsData(): {
  data: RecordsData | undefined;
  isLoading: boolean;
} {
  const repo = useRepo();

  const prefs = useQuery({
    queryKey: ["user-prefs"],
    queryFn: () => repo.getUserPrefs(),
    staleTime: 60_000,
  });
  const includeWarmups = prefs.data?.includeWarmupsInStats ?? true;

  const records = useQuery({
    queryKey: ["records-data", includeWarmups],
    queryFn: async (): Promise<RecordsData> => {
      const history = await repo.recordsData();
      return {
        history,
        records: computeRecords(history, { includeWarmups }),
        includeWarmups,
      };
    },
    staleTime: 60_000,
  });

  return {
    data: records.data,
    isLoading: prefs.isLoading || records.isLoading,
  };
}
