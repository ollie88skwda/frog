import type { SessionMediaRow } from "@frog/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRepo } from "./repo";

// Workout photos (Hevy-parity M9): ≤3 per session, uploaded at finish and shown
// in the history-detail carousel. Rows are fetched then resolved to short-lived
// signed URLs (private `session-media` bucket) in one query so the carousel has
// everything it needs to render.

export type SessionPhoto = { row: SessionMediaRow; url: string | null };

export function useSessionMedia(sessionId: string) {
  const repo = useRepo();
  return useQuery<SessionPhoto[]>({
    queryKey: ["session-media", sessionId],
    queryFn: async () => {
      const rows = await repo.listSessionMedia(sessionId);
      return Promise.all(
        rows.map(async (row) => ({
          row,
          url: await repo.sessionMediaUrl(row),
        })),
      );
    },
    // Signed URLs expire in an hour; refetch on remount rather than serving a
    // dead link, but don't hammer storage while the screen stays open.
    staleTime: 5 * 60_000,
    enabled: sessionId !== "",
  });
}

export function useDeleteSessionMedia(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteSessionMedia(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["session-media", sessionId] }),
  });
}
