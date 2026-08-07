import type { Machine, MachineCatalogEntry } from "@frog/core";
import { Wrench } from "lucide-react";
import { useState } from "react";
import { MachineCatalogPicker } from "@/components/machine-catalog-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  useCreateMachine,
  useMachines,
  useUpdateExercise,
} from "@/lib/queries";

// In-workout machine attach (machine-DB plan §6, phase 3): the block header
// shows this strip when the exercise has no machine set, instead of nothing —
// the SetupStrip slot. Tapping it opens the catalog-search dialog (same
// picker AddMachine uses) plus the user's own machines, so the remembered
// setup ("my gym" settings) is one tap away rather than forcing a fresh
// catalog create.
export function AttachMachineStrip({
  exerciseId,
  blockName,
}: {
  exerciseId: string;
  blockName: string;
}) {
  const { data: machines = [] } = useMachines();
  const createMachine = useCreateMachine();
  const updateExercise = useUpdateExercise();
  const [open, setOpen] = useState(false);

  function attach(machineId: string) {
    updateExercise.mutate({ exerciseId, patch: { machineId } });
    setOpen(false);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="flex h-10 w-full items-center gap-2 border-b border-border bg-surface-2 px-4 text-left text-2xs text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover md:h-8"
        data-testid={`setup-attach-${blockName}`}
      >
        <Wrench className="size-4 shrink-0 text-faint" />
        <span className="truncate">Attach machine</span>
        <span className="ml-auto shrink-0 text-faint">set up…</span>
      </DialogTrigger>
      <DialogContent title={`Attach a machine — ${blockName}`}>
        {machines.length > 0 && (
          <>
            <p className="mb-1 text-2xs font-medium tracking-widest text-faint uppercase">
              From your gym
            </p>
            <ul className="divide-y divide-border border border-border bg-surface">
              {machines.map((m) => (
                <MachineRow
                  key={m.id}
                  machine={m}
                  onPick={() => attach(m.id)}
                />
              ))}
            </ul>
            <p className="mt-3 mb-1 text-2xs font-medium tracking-widest text-faint uppercase">
              …or search the catalog
            </p>
          </>
        )}
        <MachineCatalogPicker onPick={pickFromCatalog} pickLabel="attach" />
      </DialogContent>
    </Dialog>
  );
}

function MachineRow({
  machine,
  onPick,
}: {
  machine: Machine;
  onPick: () => void;
}) {
  const summary = (machine.settings ?? [])
    .filter((s) => s.value != null)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex h-10 w-full items-center gap-2 px-2 text-left text-xs transition-colors duration-100 hover:bg-surface-hover md:h-8"
        data-testid={`attach-existing-${machine.name}`}
      >
        <span className="truncate">
          {machine.brand && (
            <span className="text-soft">{machine.brand} · </span>
          )}
          {machine.name}
        </span>
        {summary && (
          <span className="num ml-auto shrink-0 truncate text-2xs text-faint">
            {summary}
          </span>
        )}
      </button>
    </li>
  );
}
