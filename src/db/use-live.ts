import { useEffect, useState, useCallback } from "react";
// Minimal: re-run a query function and expose a refetch. (Swap for drizzle useLiveQuery later if desired.)
export function useQueryFn<T>(fn: () => T): [T, () => void] {
  const [data, setData] = useState<T>(fn);
  const refetch = useCallback(() => setData(fn()), [fn]);
  useEffect(() => { refetch(); }, [refetch]);
  return [data, refetch];
}
