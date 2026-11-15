import type { ReactNode } from "react";
import { userFacingRepoError } from "@/lib/repo-error";
import { Button } from "./button";

/**
 * One loading → error → empty → content ladder, so a failed or in-flight query
 * never renders as an empty one (AGENTS.md). Pass the query's `isPending` as
 * `isLoading` (a query started offline is paused, not loading) and
 * `isLoadingError` as `isError` (a failed background refetch keeps its data);
 * `empty` decides whether `emptyState` shows instead of `children`.
 */
export function QueryState({
  isLoading,
  isError,
  error,
  onRetry,
  empty,
  emptyState,
  loadingLabel = "Loading…",
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  emptyState?: ReactNode;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4">
        <p className="text-sm text-neg">
          {error
            ? userFacingRepoError(error)
            : "Couldn’t load this. Check your connection and try again."}
        </p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (isLoading) {
    return (
      <p role="status" className="p-4 text-sm text-faint">
        {loadingLabel}
      </p>
    );
  }
  if (empty) return <>{emptyState}</>;
  return <>{children}</>;
}
