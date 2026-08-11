import type { Machine, MachineCatalogEntry } from "@frog/core";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { MachineCatalogPicker } from "@/components/machine-catalog-picker";
import { MachineEditor } from "@/components/machines";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCreateMachine, useMachines } from "@/lib/queries";

// The session's machine surface (redesign option E, R3: machine is
// first-class). One dialog behind the block's visible machine chip:
//
//  - a machine is attached → its remembered setup opens straight away, with
//    Change to swap it,
//  - nothing attached (or Change tapped) → a Command search over "from your
//    gym" plus the server-side machine_catalog lookup.
//
// The write (and the seed-exercise copy-on-write fork) lives in the session
// screen; this dialog only reports the picked machine id.
export function MachineDialog({
  blockName,
  machine,
  open,
  onOpenChange,
  onAttach,
}: {
  blockName: string;
  machine: Machine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (machineId: string) => void;
}) {
  const { data: machines = [] } = useMachines();
  const createMachine = useCreateMachine();
  const [changing, setChanging] = useState(false);

  // Re-opening always lands on the machine's own setup again (Change is a
  // per-visit intent, not a sticky mode).
  useEffect(() => {
    if (!open) setChanging(false);
  }, [open]);

  function attach(machineId: string) {
    onAttach(machineId);
    setChanging(false);
    onOpenChange(false);
  }

  // Catalog pick: reuse the user's existing row when it's already in "my
  // gym" (same brand+model — keeps its remembered settings instead of
  // creating a duplicate), otherwise create it from the catalog entry.
  // The attach awaits the create: exercises.machine_id is a real FK to
  // machines.id, so firing both writes together could race the update into
  // a constraint error.
  async function pickFromCatalog(entry: MachineCatalogEntry) {
    const existing = machines.find(
      (m) => m.name === entry.model && m.brand === entry.brand,
    );
    if (existing) return attach(existing.id);
    const created = await createMachine.mutateAsync({
      name: entry.model,
      brand: entry.brand,
      catalogKey: entry.id,
    });
    attach(created.id);
  }

  const showSetup = machine != null && !changing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          showSetup
            ? `Setup — ${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`
            : `Machine — ${blockName}`
        }
      >
        {showSetup ? (
          <div className="flex flex-col gap-3">
            <MachineEditor machine={machine} />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setChanging(true)}
              data-testid={`machine-change-${blockName}`}
            >
              <Search className="size-3.5" />
              Change machine
            </Button>
          </div>
        ) : (
          <MachineSearch
            machines={machines}
            onPickOwn={attach}
            onPickCatalog={pickFromCatalog}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// "From your gym" as a cmdk Command list, with the server-side catalog
// lookup below it. Two lookups, one surface: the Command filters the user's
// own (small, already-loaded) machine list client-side, while the catalog
// stays a debounced server query — 867+ rows never come to the client.
function MachineSearch({
  machines,
  onPickOwn,
  onPickCatalog,
}: {
  machines: Machine[];
  onPickOwn: (machineId: string) => void;
  onPickCatalog: (entry: MachineCatalogEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {machines.length > 0 && (
        <Command
          label="From your gym"
          className="border border-border bg-surface"
        >
          <CommandInput
            placeholder="From your gym…"
            data-testid="machine-own-search"
          />
          <CommandList className="max-h-40">
            <CommandEmpty>Nothing in your gym matches.</CommandEmpty>
            <CommandGroup heading="From your gym">
              {machines.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.brand ?? ""} ${m.name}`}
                  onSelect={() => onPickOwn(m.id)}
                  data-testid={`attach-existing-${m.name}`}
                >
                  <span className="min-w-0 truncate">
                    {m.brand && <span className="text-soft">{m.brand} · </span>}
                    {m.name}
                  </span>
                  <span className="num ml-auto shrink-0 truncate text-2xs text-faint">
                    {(m.settings ?? [])
                      .filter((s) => s.value != null)
                      .map((s) => `${s.label} ${s.value}`)
                      .join(" · ")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
      <div>
        {machines.length > 0 && (
          <p className="mb-1 text-2xs font-medium tracking-widest text-faint uppercase">
            …or search the catalog
          </p>
        )}
        <MachineCatalogPicker onPick={onPickCatalog} pickLabel="attach" />
      </div>
    </div>
  );
}
