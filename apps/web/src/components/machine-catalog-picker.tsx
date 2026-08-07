import type { MachineCatalogEntry } from "@frog/core";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMachineCatalogSearch, useMachineCategories } from "@/lib/queries";
import { useVoice } from "@/lib/voice";

// Catalog result identity for tests: the old static catalog's `key` was
// exactly slug(brand)-slug(model), so deriving it keeps the picker's testids
// stable across the array→DB switch (e2e/machines.spec.ts etc.).
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resultTestId(r: MachineCatalogEntry): string {
  return `catalog-result-${slug(r.brand)}-${slug(r.model)}`;
}

/**
 * Catalog search + category browse, server-side against `machine_catalog`
 * (the lookup-UX phase of the machine-DB plan — the old client scan over the
 * static TS array is gone, so that file ships in no bundle). Shared by the
 * Library's AddMachine and the session's in-workout attach dialog so the
 * interaction stays identical everywhere. `onPick` is called with the picked
 * row; the picker resets itself afterwards.
 */
export function MachineCatalogPicker({
  onPick,
  pickLabel = "add to my gym",
  autoFocus,
}: {
  onPick: (entry: MachineCatalogEntry) => void;
  pickLabel?: string;
  autoFocus?: boolean;
}) {
  const { t } = useVoice();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const { data: categories = [] } = useMachineCategories();
  const {
    data: results = [],
    isError,
    isPending,
    refetch,
  } = useMachineCatalogSearch(debounced, category);

  // Search-as-you-type: debounce keystrokes so each term change costs one
  // server round trip, not one per character.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(id);
  }, [query]);

  // Two modes, one results list: typing searches the whole catalog (and
  // clears any browse category); picking a category browses it (and clears
  // the query). Composable filters would be marginal here — the picker is a
  // lookup, not a report.
  function pickCategory(cat: string | null) {
    setCategory(cat);
    if (cat) setQuery("");
  }

  const searching = debounced !== "" || category != null;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-2 left-2 size-4 text-faint" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) setCategory(null);
          }}
          autoFocus={autoFocus}
          placeholder="Search the machine catalog (brand, model, type)"
          className="pl-8"
          data-testid="machine-catalog-search"
        />
      </div>

      {!searching && (
        <div className="mt-2">
          <p className="mb-1 text-2xs font-medium tracking-widest text-faint uppercase">
            Browse by type
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => pickCategory(cat)}
                className="h-8 shrink-0 rounded-md border border-border bg-surface-2 px-2 text-2xs text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
                data-testid={`catalog-category-${cat}`}
              >
                {cat.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="mt-1 flex items-center justify-between gap-2 px-2">
          <p className="text-xs text-neg">
            Couldn't search the catalog. Check your connection.
          </p>
          <Button variant="ghost" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isError && searching && isPending && results.length === 0 && (
        <p className="mt-1 px-2 text-xs text-faint">Searching…</p>
      )}

      {!isError && searching && !isPending && results.length === 0 && (
        <p className="mt-1 px-2 text-xs text-faint">
          {t("No matches in the catalog.", "No specimens match the catalog.")}
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-border border border-border bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery("");
                  setDebounced("");
                  setCategory(null);
                }}
                className="flex h-10 w-full items-center gap-2 px-2 text-left text-xs transition-colors duration-100 hover:bg-surface-hover md:h-8"
                data-testid={resultTestId(r)}
              >
                <span className="bg-translucent px-1 text-2xs text-faint">
                  {r.category.replace(/-/g, " ")}
                </span>
                <span className="truncate">
                  <span className="text-soft">{r.brand}</span> · {r.model}
                </span>
                <span className="ml-auto shrink-0 text-2xs text-faint">
                  {pickLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
