import type { Machine, MachineCatalogEntry } from "@frog/core";
import { Command } from "cmdk";
import { Plus, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  useCreateMachine,
  useMachineCatalogSearch,
  useMachines,
} from "@/lib/queries";
import { useVoice } from "@/lib/voice";

// Catalog result identity for tests — mirrors machine-catalog-picker's
// derivation so the existing `catalog-result-*` testids keep working from
// this surface too.
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function machineLabel(machine: Machine): string {
  return machine.brand ? `${machine.brand} · ${machine.name}` : machine.name;
}

/**
 * The station card's machine control (session redesign R2, requirement 3):
 * machine is FIRST-CLASS, so it is a visible chip in the card header next to
 * the exercise name — never an item inside a ⋯ menu. Unset it reads
 * "+ machine"; set it reads "Hoist · Chest Press" and one tap changes it.
 *
 * The write itself (and the seed-exercise copy-on-write fork it can trigger)
 * stays with the caller: this component only reports the picked machine id,
 * exactly as MachineAttachDialog did.
 */
export function MachineChip({
  machine,
  blockName,
  disabled,
  onPick,
}: {
  machine: Machine | null;
  blockName: string;
  /** True while a copy-on-write fork is in flight — the write would target a
   * not-yet-inserted exercise row. */
  disabled?: boolean;
  onPick: (machineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={machine ? "Change machine" : "Pick the machine you're on"}
        className="max-w-full self-start"
        data-testid={`station-${blockName}-machine`}
      >
        {machine ? (
          <Wrench className="size-3.5 shrink-0" />
        ) : (
          <Plus className="size-3.5 shrink-0" />
        )}
        <span className="truncate">
          {machine ? machineLabel(machine) : "machine"}
        </span>
      </Button>
      <MachineCommandDialog
        open={open}
        onOpenChange={setOpen}
        blockName={blockName}
        onPick={(id) => {
          onPick(id);
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * One Command (cmdk) search over both sources the old two-step attach sheet
 * separated: the machines already in your gym, and the global
 * `machine_catalog`. Catalog matching is server-side (`searchMachineCatalog`),
 * so cmdk's own fuzzy filter is off — it would re-filter an already-ranked
 * server result set.
 */
function MachineCommandDialog({
  open,
  onOpenChange,
  blockName,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockName: string;
  onPick: (machineId: string) => void;
}) {
  const { t } = useVoice();
  const { data: machines = [] } = useMachines();
  const createMachine = useCreateMachine();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(id);
  }, [query]);

  const {
    data: results = [],
    isError,
    isPending,
    refetch,
  } = useMachineCatalogSearch(debounced, null);

  const q = query.trim().toLowerCase();
  const mine = q
    ? machines.filter((m) =>
        `${m.brand ?? ""} ${m.name}`.toLowerCase().includes(q),
      )
    : machines;

  // Catalog pick: reuse the user's existing row when the same brand+model is
  // already in "my gym" (keeps its remembered settings instead of minting a
  // duplicate), otherwise create it. The attach awaits the create —
  // exercises.machine_id is a real FK, so firing both together could race.
  async function pickFromCatalog(entry: MachineCatalogEntry) {
    const existing = machines.find(
      (m) => m.name === entry.model && m.brand === entry.brand,
    );
    if (existing) return onPick(existing.id);
    const created = await createMachine.mutateAsync({
      name: entry.model,
      brand: entry.brand,
      catalogKey: entry.id,
    });
    onPick(created.id);
  }

  const headingCls =
    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase";
  const itemCls =
    "flex min-h-10 cursor-default items-center gap-2 px-2 text-sm text-ink data-[selected=true]:bg-surface-hover";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Machine — ${blockName}`} className="md:max-w-md">
        <Command shouldFilter={false} label="Search machines">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder="Search your gym or the catalog…"
            className="h-11 w-full border border-border bg-surface-2 px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-ring/70"
            data-testid="machine-search"
          />
          <Command.List className="mt-2 max-h-72 overflow-y-auto">
            {mine.length > 0 && (
              <Command.Group heading="From your gym" className={headingCls}>
                {mine.map((m) => (
                  <Command.Item
                    key={m.id}
                    value={`mine:${m.id}`}
                    onSelect={() => onPick(m.id)}
                    className={itemCls}
                    data-testid={`attach-existing-${m.name}`}
                  >
                    <Wrench className="size-3.5 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">
                      {machineLabel(m)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {/* A failed catalog search must never render as an empty one
                (AGENTS.md) — say so and offer a retry. */}
            {isError ? (
              <div className="flex flex-col items-start gap-2 px-2 py-4">
                <p className="text-xs text-neg">
                  {t(
                    "Couldn't search the catalog.",
                    "The frog couldn't reach the catalog.",
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                  data-testid="machine-search-retry"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Command.Group heading="Catalog" className={headingCls}>
                {results.map((r) => (
                  <Command.Item
                    key={r.id}
                    value={`catalog:${r.id}`}
                    onSelect={() => void pickFromCatalog(r)}
                    className={itemCls}
                    data-testid={`catalog-result-${slug(r.brand)}-${slug(r.model)}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-soft">{r.brand} · </span>
                      {r.model}
                    </span>
                    <span className="shrink-0 text-2xs text-faint">
                      {r.category}
                    </span>
                  </Command.Item>
                ))}
                {!isPending && results.length === 0 && (
                  <p className="px-2 py-4 text-xs text-faint">
                    {debounced
                      ? "Nothing in the catalog matches."
                      : "Type to search the machine catalog."}
                  </p>
                )}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
