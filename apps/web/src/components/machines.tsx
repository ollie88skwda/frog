import type { Machine, MachineCatalogEntry, MachineSetting } from "@frog/core";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronDown, ChevronRight } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { MachineCatalogPicker } from "@/components/machine-catalog-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateMachine,
  useDeleteMachine,
  useMachinePhotoUrl,
  useMachineSettingPhotoUrl,
  useUpdateMachine,
  useUploadMachinePhoto,
  useUploadMachineSettingPhoto,
} from "@/lib/queries";

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
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("");

  function addFromCatalog(entry: MachineCatalogEntry) {
    create.mutate({
      name: entry.model,
      brand: entry.brand,
      // The catalog row's id — machines.catalog_key (text) is the
      // denormalized link to machine_catalog now that the search is a DB
      // query (the old static-array key is gone; docs/DECISIONS.md).
      catalogKey: entry.id,
    });
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
      <MachineCatalogPicker onPick={addFromCatalog} />

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
        <SettingRow
          key={s.label}
          machine={machine}
          settings={settings}
          index={i}
          onChange={setSettings}
        />
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

// One numbered setup value — label, number input, and an optional per-setting
// photo (e.g. a picture of the seat-notch position it refers to). The photo
// path rides in the setting's jsonb, so it survives reorders and removals.
function SettingRow({
  machine,
  settings,
  index,
  onChange,
}: {
  machine: Machine;
  settings: MachineSetting[];
  index: number;
  onChange: (next: MachineSetting[]) => void;
}) {
  const qc = useQueryClient();
  const s = settings[index];
  const upload = useUploadMachineSettingPhoto();
  const { data: photoUrl } = useMachineSettingPhotoUrl(s.photoPath);

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const resized = await resizePhoto(file, 1280);
    try {
      const path = await upload.mutateAsync({
        machineId: machine.id,
        file: resized,
        existingPath: s.photoPath ?? null,
      });
      // The array captured at click time is stale by the time the upload
      // lands — writing it back whole would clobber a concurrent add/edit.
      // Resolve the freshest copy from the cache and write through that.
      const latest =
        qc
          .getQueryData<Machine[]>(["machines"])
          ?.find((m) => m.id === machine.id)?.settings ?? settings;
      onChange(
        latest.map((x) =>
          x.label === s.label ? { ...x, photoPath: path } : x,
        ),
      );
    } catch {
      // A failed photo upload leaves the setting untouched — no partial state.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-32 truncate text-xs text-soft">{s.label}</span>
      <Input
        inputMode="decimal"
        value={s.value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const value = raw === "" ? null : Number(raw);
          if (raw !== "" && Number.isNaN(value)) return;
          onChange(settings.map((x, j) => (j === index ? { ...x, value } : x)));
        }}
        className="num h-6 w-20 text-xs"
        data-testid={`setting-value-${machine.name}-${s.label}`}
      />
      <label
        className="flex h-6 cursor-pointer items-center gap-1 border border-border bg-surface px-1.5 text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
        title={s.photoPath ? "Replace setting photo" : "Add setting photo"}
        data-testid={`setting-photo-${machine.name}-${s.label}`}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt={`${s.label} setting`}
            loading="lazy"
            className="h-5 w-5 border border-border object-cover"
            data-testid={`setting-photo-img-${machine.name}-${s.label}`}
          />
        )}
        <Camera className="size-3.5" />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onPhotoPicked(e)}
          className="hidden"
          data-testid={`setting-photo-input-${machine.name}-${s.label}`}
        />
      </label>
      <button
        type="button"
        title={`Remove ${s.label}`}
        onClick={() => onChange(settings.filter((_, j) => j !== index))}
        className="p-1 text-faint hover:text-neg"
      >
        ×
      </button>
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
