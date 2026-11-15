import { useSearchParams } from "react-router";
import { ScopeChips } from "@/components/data";

/** Segment state lives in `?s=` so redirects and deep links land on a segment. */
export function useSegment<T extends string>(
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("s");
  const value = (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : fallback;
  const set = (next: T) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === fallback) p.delete("s");
        else p.set("s", next);
        return p;
      },
      { replace: true },
    );
  return [value, set];
}

export function SegmentBar({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="sticky top-0 z-10 bg-background px-4 pt-3 pb-2">
      <ScopeChips value={value} onChange={onChange} options={options} />
    </div>
  );
}
