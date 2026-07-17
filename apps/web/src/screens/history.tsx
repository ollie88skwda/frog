import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDate, formatTime } from "@/lib/format";
import { useSessionHistory } from "@/lib/queries";
import { useVoice } from "@/lib/voice";

export default function HistoryScreen() {
  const { t } = useVoice();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSessionHistory();
  const sessions = data?.pages.flat() ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">History</h1>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-xs text-faint">
            {t("Loading…", "The frog is thinking…")}
          </p>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-faint">
            <p>
              {t("No sessions yet.", "The lab is empty. The frog is waiting.")}
            </p>
            <p className="mt-1">
              {t(
                "Start one from Training and it will show up here.",
                "Log your first set. The frog will begin taking notes immediately, possibly before you finish.",
              )}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/history/${s.id}`}
                  data-testid={`history-row-${s.id}`}
                  className="flex h-11 items-center justify-between px-4 transition-colors md:h-8 duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusRing
                      state={s.endedAt != null ? "done" : "partial"}
                      progress={0.5}
                    />
                    <span className="truncate text-sm">
                      {s.title ?? formatDate(s.startedAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-xs text-faint">
                      {formatDate(s.startedAt)} · {formatTime(s.startedAt)}
                    </span>
                    <ChevronRight className="size-4 text-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
