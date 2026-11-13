import { CaretRight } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { DeltaChip } from "@/components/data";
import { summarizeSessions } from "@/components/progress/derive";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/ui/query-state";
import { rowClass } from "@/components/ui/row";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDate } from "@/lib/format";
import { useResolvedUserPrefs } from "@/lib/profile-queries";
import { useSessionHistory } from "@/lib/queries";
import { useRecordsData } from "@/lib/records-queries";
import { useVoice } from "@/lib/voice";

export default function HistoryScreen() {
  const { t } = useVoice();
  const {
    data,
    isPending,
    isLoadingError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useSessionHistory();
  const sessions = data?.pages.flat() ?? [];
  // F9: hard sets, RIR avg and headline e1RM delta per row (C2c, R6). Falls back
  // to the plain row until the full-history query resolves.
  const rec = useRecordsData();
  const prefs = useResolvedUserPrefs();
  const summary = useMemo(
    () =>
      rec.data
        ? summarizeSessions(rec.data.history, prefs.hardSetRirMax)
        : null,
    [rec.data, prefs.hardSetRirMax],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">History</h1>

      <div className="mt-4 overflow-hidden rounded-md bg-surface">
        <QueryState
          isLoading={isPending}
          isError={isLoadingError}
          error={error}
          onRetry={() => void refetch()}
          loadingLabel={t("Loading…", "The frog is thinking…")}
          empty={sessions.length === 0}
          emptyState={
            <div className="px-4 py-6 text-center text-xs text-faint">
              <p>
                {t(
                  "No sessions yet.",
                  "The lab is empty. The frog is waiting.",
                )}
              </p>
              <p className="mt-1">
                {t(
                  "Start one from Training and it will show up here.",
                  "Log your first set. The frog will begin taking notes immediately, possibly before you finish.",
                )}
              </p>
            </div>
          }
        >
          <ul className="[&>*+*]:mt-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  data-testid={`history-row-${s.id}`}
                  className={rowClass()}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusRing
                      state={s.endedAt != null ? "done" : "partial"}
                      progress={0.5}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {s.title ?? formatDate(s.startedAt)}
                      </span>
                      {s.title != null && (
                        <span className="num truncate text-xs text-faint">
                          {formatDate(s.startedAt)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {summary?.get(s.id) && (
                      <span className="num flex items-center justify-end gap-1.5 whitespace-nowrap text-xs text-soft">
                        {summary.get(s.id)?.hardSets}
                        <span className="text-2xs">
                          {summary.get(s.id)?.hardSets === 1 ? "set" : "sets"}
                        </span>
                        {summary.get(s.id)?.rirAvg != null && (
                          <span className="text-2xs">
                            RIR{" "}
                            {Math.round((summary.get(s.id)?.rirAvg ?? 0) * 10) /
                              10}
                          </span>
                        )}
                        {summary.get(s.id)?.headline?.deltaPct != null && (
                          <DeltaChip
                            delta={summary.get(s.id)?.headline?.deltaPct ?? 0}
                            noise={10}
                            unit="%"
                            basis="top-set e1RM vs previous session"
                          />
                        )}
                      </span>
                    )}
                    <CaretRight
                      aria-hidden="true"
                      className="size-4 text-faint"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>

      {hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
