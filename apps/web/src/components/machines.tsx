import type { Machine, MachineSetting } from "@sbl/core";
import { Camera, ChevronDown, ChevronRight, Search } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateMachine,
  useDeleteMachine,
  useMachinePhotoUrl,
  useUpdateMachine,
  useUploadMachinePhoto,
} from "@/lib/queries";

type CatalogModule = typeof import("@sbl/core/data/machine-catalog");

// The catalog is a lazy chunk — loaded on first search keystroke, never part
// of the initial bundle (AGENTS.md budget).
let catalogPromise: Promise<CatalogModule> | null = null;
function loadCatalog(): Promise<CatalogModule> {
  catalogPromise ??= import("@sbl/core/data/machine-catalog");
  return catalogPromise;
}

export function MachinesSection({ machines }: { machines: Machine[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
        My gym — machines
      </h2>
      <p className="mt-0.5 text-2xs text-faint">
        Settings entered once show up in every session. Photos: shoot your own
        machine.
      </p>

      <AddMachine />

      {machines.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden border border-border bg-surface">
          {machines.map((m) => (
            <MachineRow
              key={m.id}
              machine={m}
              expanded={expandedId === m.id}
              onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddMachine() {
  const create = useCreateMachine();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { key: string; brand: string; model: string; category: string }[]
  >([]);
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void loadCatalog().then((mod) => {
      if (!cancelled) setResults(mod.searchCatalog(q, 8));
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function addFromCatalog(entry: {
    key: string;
    brand: string;
    model: string;
  }) {
    create.mutate({
      name: entry.model,
      brand: entry.brand,
      catalogKey: entry.key,
    });
    setQuery("");
  }

  function addCustom(e: FormEvent) {
    e.preventDefault();
    const name = customName.trim();
    if (!name) return;
    create.mutate({ name, brand: customBrand.trim() || null });
    setCustomName("");
    setCustomBrand("");
  }

  return (
    <div className="mt-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-2 left-2 size-4 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the machine catalog (brand, model, type)"
          className="pl-8"
          data-testid="machine-catalog-search"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-1 divide-y divide-border border border-border bg-surface">
          {results.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => addFromCatalog(r)}
                className="flex h-8 w-full items-center gap-2 px-2 text-left text-xs transition-colors duration-100 hover:bg-surface-hover"
                data-testid={`catalog-result-${r.key}`}
              >
                <span className="bg-translucent px-1 text-2xs text-faint">
                  {r.category.replace(/-/g, " ")}
                </span>
                <span className="truncate">
                  <span className="text-soft">{r.brand}</span> · {r.model}
                </span>
                <span className="ml-auto shrink-0 text-2xs text-faint">
                  add to my gym
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addCustom} className="mt-2 flex gap-2">
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="…or custom machine name"
          data-testid="machine-name-input"
        />
        <Input
          value={customBrand}
          onChange={(e) => setCustomBrand(e.target.value)}
          placeholder="Brand"
          className="w-28 shrink-0"
          data-testid="machine-brand-input"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={customName.trim().length === 0}
          data-testid="add-machine-btn"
        >
          Add
        </Button>
      </form>
    </div>
  );
}

function MachineRow({
  machine,
  expanded,
  onToggle,
}: {
  machine: Machine;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const settingsSummary = (machine.settings ?? [])
    .filter((s) => s.value != null)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");

  return (
    <li data-testid={`machine-row-${machine.name}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-11 w-full items-center gap-2 px-2 text-left text-sm md:h-8 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
      >
        <Chevron className="size-4 shrink-0 text-faint" />
        <span className="truncate">
          {machine.brand && (
            <span className="text-soft">{machine.brand} · </span>
          )}
          {machine.name}
        </span>
        {settingsSummary && (
          <span className="num ml-auto shrink-0 truncate text-2xs text-faint">
            {settingsSummary}
          </span>
        )}
      </button>
      {expanded && <MachineEditor machine={machine} />}
    </li>
  );
}

export function MachineEditor({ machine }: { machine: Machine }) {
  const update = useUpdateMachine();
  const deleteMachine = useDeleteMachine();
  const uploadPhoto = useUploadMachinePhoto();
  const { data: photoUrl } = useMachinePhotoUrl(machine);
  const settings = machine.settings ?? [];
  const [labelDraft, setLabelDraft] = useState("");

  function setSettings(next: MachineSetting[]) {
    update.mutate({ id: machine.id, patch: { settings: next } });
  }

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const resized = await resizePhoto(file, 1280);
    uploadPhoto.mutate({ machineId: machine.id, file: resized });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-surface-2 px-4 py-2">
      {settings.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-32 truncate text-xs text-soft">{s.label}</span>
          <Input
            inputMode="decimal"
            value={s.value ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const value = raw === "" ? null : Number(raw);
              if (raw !== "" && Number.isNaN(value)) return;
              setSettings(
                settings.map((x, j) => (j === i ? { ...x, value } : x)),
              );
            }}
            className="num h-6 w-20 text-xs"
            data-testid={`setting-value-${machine.name}-${s.label}`}
          />
          <button
            type="button"
            title={`Remove ${s.label}`}
            onClick={() => setSettings(settings.filter((_, j) => j !== i))}
            className="p-1 text-faint hover:text-neg"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const label = labelDraft.trim();
              if (!label || settings.some((s) => s.label === label)) return;
              setSettings([...settings, { label, value: null }]);
              setLabelDraft("");
            }
          }}
          placeholder="+ setting (e.g. Seat height)"
          className="h-6 w-48 text-2xs"
          data-testid={`add-setting-${machine.name}`}
        />
      </div>

      <textarea
        defaultValue={machine.notes ?? ""}
        onBlur={(e) => {
          const notes = e.target.value.trim() || null;
          if (notes !== machine.notes)
            update.mutate({ id: machine.id, patch: { notes } });
        }}
        placeholder="Setup notes (grip, position…)"
        rows={2}
        className="w-full border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-faint"
        data-testid={`machine-notes-${machine.name}`}
      />

      <div className="flex items-center gap-2">
        {photoUrl && (
          <img
            src={photoUrl}
            alt={machine.name}
            loading="lazy"
            className="h-16 w-16 border border-border object-cover"
          />
        )}
        <label className="flex h-8 cursor-pointer items-center gap-2 bg-translucent px-2 text-xs text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink">
          <Camera className="size-4" />
          {machine.photoPath
            ? "Replace photo"
            : "Add photo (shoot your machine)"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void onPhotoPicked(e)}
            className="hidden"
            data-testid={`machine-photo-input-${machine.name}`}
          />
        </label>
        <Button
          variant="danger"
          size="sm"
          className="ml-auto"
          onClick={() => deleteMachine.mutate(machine.id)}
          data-testid={`delete-machine-${machine.name}`}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

// Downscale to fit maxDim and re-encode as JPEG — keeps uploads small
// without a dependency.
async function resizePhoto(file: File, maxDim: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85),
  );
}
