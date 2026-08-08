import type { Session, UserPrefs, UserPrefsPatch } from "@frog/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

// Profile / Calendar / Home streak all read the same two things: the user's
// preferences (display name, …) and their full session history (starts feed
// the streak + activity bars + calendar). One cheap fetch each, cached and
// shared across the three screens.

// A high ceiling on the session fetch: computeStreak only walks back to the
// first gap, and the calendar/activity views cover recent months, so this
// comfortably covers any realistic streak or window without paging. Extreme
// power-users (>1000 sessions) would cap the very oldest history — acceptable
// for these consistency views (findingsData/recordsData own full history).
const ALL_SESSIONS_LIMIT = 1000;

/** User preferences (display name, …); shares the cache key with
 * records-queries so the two never double-fetch. */
export function useUserPrefs() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["user-prefs"],
    queryFn: () => repo.getUserPrefs(),
    staleTime: 60_000,
  });
}

/** Patch user preferences with an optimistic cache write so edits (e.g.
 * display name) reflect instantly. */
export function useUpdateUserPrefs() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["user-prefs"];
  return useMutation({
    mutationFn: (patch: UserPrefsPatch) => repo.updateUserPrefs(patch),
    onMutate: (patch) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<UserPrefs | null>(key);
      const now = Date.now();
      qc.setQueryData<UserPrefs | null>(key, (old) =>
        old
          ? { ...old, ...patch, updatedAt: now }
          : // No row yet: synthesize one so the UI reflects the change before
            // the insert lands (getUserPrefs defaults mirror the server).
            ({
              id: "optimistic",
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              ownerId: "",
              includeWarmupsInStats: true,
              defaultRestSec: null,
              previousValuesScope: "any",
              bodyDiagram: "neutral",
              plateConfig: null,
              displayName: null,
              bio: null,
              ...patch,
            } as UserPrefs),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Full session history (newest-first), for the streak, activity bars, and the
 * calendar. Shared cache key so Profile/Calendar/Home fetch it once. */
export function useAllSessions() {
  const repo = useRepo();
  return useQuery<Session[]>({
    queryKey: ["sessions-all"],
    queryFn: () => repo.listSessions(ALL_SESSIONS_LIMIT, 0),
    staleTime: 60_000,
  });
}
