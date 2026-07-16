import {
  kgToLb,
  lbToKg,
  type Measurement,
  type MeasurementPatch,
  toDisplayLength,
  unitLabel,
} from "@sbl/core";
import { Camera, Trash2 } from "lucide-react";
import { type ChangeEvent, useMemo, useState } from "react";
import { ShareButton } from "@/components/share-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  useClearProgressPhoto,
  useDeleteMeasurement,
  useMeasurements,
  useProgressPhotoUrl,
  useUploadProgressPhoto,
  useUpsertMeasurement,
} from "@/lib/measure-queries";
import { type Unit, useUnit } from "@/lib/settings";

// ── Metric catalog ────────────────────────────────────────────────────────
// Body weight + body fat + the 14 circumferences, in the schema's order. All
// stored canonically (weight = kg, girths = cm); displayed per the unit setting
// at 0.1 precision. Girths use cm labels in v1 (implementation-plan §D).
type MetricKey = keyof MeasurementPatch;
type Kind = "weight" | "pct" | "length";
type MetricDef = { key: MetricKey; label: string; chip: string; kind: Kind };

const METRICS: MetricDef[] = [
  { key: "bodyweightKg", label: "Body weight", chip: "Weight", kind: "weight" },
  { key: "bodyfatPct", label: "Body fat", chip: "Body fat", kind: "pct" },
  { key: "neckCm", label: "Neck", chip: "Neck", kind: "length" },
  { key: "shouldersCm", label: "Shoulders", chip: "Shoulders", kind: "length" },
  { key: "chestCm", label: "Chest", chip: "Chest", kind: "length" },
  { key: "waistCm", label: "Waist", chip: "Waist", kind: "length" },
  { key: "abdomenCm", label: "Abdomen", chip: "Abdomen", kind: "length" },
  { key: "hipsCm", label: "Hips", chip: "Hips", kind: "length" },
  { key: "bicepLCm", label: "Bicep (L)", chip: "Bicep L", kind: "length" },
  { key: "bicepRCm", label: "Bicep (R)", chip: "Bicep R", kind: "length" },
  {
    key: "forearmLCm",
    label: "Forearm (L)",
    chip: "Forearm L",
    kind: "length",
  },
  {
    key: "forearmRCm",
    label: "Forearm (R)",
    chip: "Forearm R",
    kind: "length",
  },
  { key: "thighLCm", label: "Thigh (L)", chip: "Thigh L", kind: "length" },
  { key: "thighRCm", label: "Thigh (R)", chip: "Thigh R", kind: "length" },
  { key: "calfLCm", label: "Calf (L)", chip: "Calf L", kind: "length" },
  { key: "calfRCm", label: "Calf (R)", chip: "Calf R", kind: "length" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

// Does this entry carry any measurement value (i.e. is it more than a bare
// photo)? Decides the photo-delete path: keep the row vs. drop it entirely.
const hasMeasurements = (m: Measurement) =>
  METRICS.some((d) => m[d.key] != null);

function metricSuffix(kind: Kind, unit: Unit): string {
  if (kind === "weight") return unitLabel(unit);
  if (kind === "pct") return "%";
  return "cm";
}

// Stored value → display number (unit-converted, 0.1 precision).
function metricValue(
  m: Measurement,
  def: MetricDef,
  unit: Unit,
): number | null {
  const raw = m[def.key];
  if (raw == null) return null;
  if (def.kind === "weight") return round1(unit === "kg" ? raw : kgToLb(raw));
  if (def.kind === "pct") return round1(raw);
  return toDisplayLength(raw, "cm");
}

function metricDisplay(m: Measurement | undefined, def: MetricDef, unit: Unit) {
  if (!m) return "";
  const v = metricValue(m, def, unit);
  return v == null ? "" : String(v);
}

// Display string → canonical stored value (kg / cm / %), or null to clear.
function metricStore(input: string, def: MetricDef, unit: Unit): number | null {
  const t = input.trim();
  if (t === "") return null;
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return null;
  if (def.kind === "weight") return unit === "kg" ? n : lbToKg(n);
  return n;
}

// ── Local dates (measuredOn is a local YYYY-MM-DD, never UTC) ───────────────
function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const parseLocal = (on: string) => new Date(`${on}T00:00:00`).getTime();
const formatDay = (on: string) => formatDate(parseLocal(on));

export default function MeasuresScreen() {
  const { unit } = useUnit();
  const { data: measurements = [] } = useMeasurements();
  const upsert = useUpsertMeasurement();

  const [selectedDate, setSelectedDate] = useState(localDate());
  const [metricKey, setMetricKey] = useState<MetricKey>("bodyweightKg");

  const entry = measurements.find((m) => m.measuredOn === selectedDate);
  const def = METRICS.find((d) => d.key === metricKey) ?? METRICS[0];

  const photos = useMemo(
    () => measurements.filter((m) => m.photoPath),
    [measurements],
  );

  function commit(key: MetricKey, value: number | null) {
    upsert.mutate({
      measuredOn: selectedDate,
      patch: { [key]: value } as MeasurementPatch,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Measures</h1>
      <p className="mt-0.5 text-2xs text-faint">
        Body weight, body fat, and girths — one entry per day. Progress photos
        stay private.
      </p>

      {photos.length > 0 && <PhotoStrip photos={photos} />}

      <Editor
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        entry={entry}
        unit={unit}
        onCommit={commit}
      />

      <Trends
        measurements={measurements}
        def={def}
        unit={unit}
        metricKey={metricKey}
        onMetricChange={setMetricKey}
        onEdit={setSelectedDate}
      />
    </div>
  );
}

// ── Entry editor ────────────────────────────────────────────────────────────
function Editor({
  selectedDate,
  onDateChange,
  entry,
  unit,
  onCommit,
}: {
  selectedDate: string;
  onDateChange: (d: string) => void;
  entry: Measurement | undefined;
  unit: Unit;
  onCommit: (key: MetricKey, value: number | null) => void;
}) {
  const upsert = useUpsertMeasurement();
  const uploadPhoto = useUploadProgressPhoto();
  const { data: photoUrl } = useProgressPhotoUrl(entry);

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const resized = await resizePhoto(file, 1280);
    // A photo belongs to the day's entry — create it if this day is empty so
    // there's a measurement id to attach to.
    const id =
      entry?.id ??
      (await upsert.mutateAsync({ measuredOn: selectedDate, patch: {} })).id;
    uploadPhoto.mutate({ measurementId: id, file: resized });
  }

  return (
    <div className="mt-4 border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <label
          htmlFor="measure-date"
          className="text-2xs font-medium tracking-widest text-faint uppercase"
        >
          Date
        </label>
        <Input
          id="measure-date"
          type="date"
          value={selectedDate}
          max={localDate()}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="num h-11 w-44"
          data-testid="measure-date"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {METRICS.map((def) => (
          <Field
            // Remount on date change so the field reloads that day's value.
            key={`${selectedDate}-${def.key}`}
            def={def}
            entry={entry}
            unit={unit}
            onCommit={onCommit}
            wide={def.kind !== "length"}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Progress"
            loading="lazy"
            className="h-16 w-16 border border-border object-cover"
          />
        )}
        <label className="flex h-11 min-h-11 cursor-pointer items-center gap-2 bg-translucent px-3 text-xs text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink">
          <Camera className="size-4" />
          {entry?.photoPath ? "Replace photo" : "Add progress photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void onPhotoPicked(e)}
            className="hidden"
            data-testid="measure-photo-input"
          />
        </label>
      </div>
    </div>
  );
}

function Field({
  def,
  entry,
  unit,
  onCommit,
  wide,
}: {
  def: MetricDef;
  entry: Measurement | undefined;
  unit: Unit;
  onCommit: (key: MetricKey, value: number | null) => void;
  wide: boolean;
}) {
  const initial = metricDisplay(entry, def, unit);

  function commit(el: HTMLInputElement) {
    if (el.value.trim() === initial) return; // no change → no write
    onCommit(def.key, metricStore(el.value, def, unit));
  }

  return (
    <label
      htmlFor={`measure-field-${def.key}`}
      className={wide ? "col-span-2 block" : "block"}
    >
      <span className="text-2xs text-faint">{def.label}</span>
      <div className="relative mt-0.5">
        <Input
          id={`measure-field-${def.key}`}
          defaultValue={initial}
          inputMode="decimal"
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="num h-11 pr-9"
          data-testid={`measure-field-${def.key}`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-2xs text-faint">
          {metricSuffix(def.kind, unit)}
        </span>
      </div>
    </label>
  );
}

// ── Trend graph + metric switcher + value list ──────────────────────────────
function Trends({
  measurements,
  def,
  unit,
  metricKey,
  onMetricChange,
  onEdit,
}: {
  measurements: Measurement[];
  def: MetricDef;
  unit: Unit;
  metricKey: MetricKey;
  onMetricChange: (k: MetricKey) => void;
  onEdit: (d: string) => void;
}) {
  const del = useDeleteMeasurement();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Entries carrying the selected metric, with its display value attached.
  const rows = useMemo(() => {
    return measurements
      .map((m) => ({ m, value: metricValue(m, def, unit) }))
      .filter((r): r is { m: Measurement; value: number } => r.value != null);
  }, [measurements, def, unit]);

  // Chart wants chronological; the list is newest-first (measurements already
  // arrive sorted desc).
  const series = useMemo(
    () =>
      [...rows].sort((a, b) => a.m.measuredOn.localeCompare(b.m.measuredOn)),
    [rows],
  );
  const latest = rows[0]?.value ?? null;
  const suffix = metricSuffix(def.kind, unit);

  return (
    <div className="mt-4 border border-border bg-surface">
      {/* Metric chips */}
      <div className="flex gap-1 overflow-x-auto border-b border-border p-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onMetricChange(m.key)}
            className={`h-9 shrink-0 whitespace-nowrap px-3 text-xs transition-colors duration-150 ${
              m.key === metricKey
                ? "bg-accent-soft text-accent"
                : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink"
            }`}
            data-testid={`metric-chip-${m.key}`}
          >
            {m.chip}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{def.label}</span>
          <div className="flex items-center gap-2">
            <span className="num text-sm text-soft" data-testid="trend-latest">
              {latest == null ? "—" : `${latest} ${suffix}`}
            </span>
            {latest != null && (
              <ShareButton
                data={{
                  kicker: "Measurement",
                  title: def.label,
                  subtitle: rows[0] ? formatDate(rows[0].m.createdAt) : "",
                  stats: [
                    { label: "Latest", value: `${latest} ${suffix}` },
                    { label: "Entries", value: String(rows.length) },
                  ],
                }}
                filename={`measure-${def.key}`}
                testId="measures-share-btn"
                variant="ghost"
                size="icon"
                label={null}
              />
            )}
          </div>
        </div>
        <TrendChart series={series} />
      </div>

      {/* Dated value list, newest first */}
      {rows.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map(({ m, value }) => (
            <li
              key={m.id}
              className="flex items-center"
              data-testid={`measure-row-${m.measuredOn}`}
            >
              <button
                type="button"
                onClick={() => onEdit(m.measuredOn)}
                className="flex h-12 min-w-0 flex-1 items-center justify-between px-4 text-left transition-colors duration-150 hover:bg-surface-hover"
              >
                <span className="truncate text-sm">
                  {formatDay(m.measuredOn)}
                </span>
                <span className="num shrink-0 text-sm text-soft">
                  {value} {suffix}
                </span>
              </button>
              {confirmId === m.id ? (
                <span className="flex shrink-0 items-center gap-1 px-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      del.mutate(m.id);
                      setConfirmId(null);
                    }}
                    data-testid={`measure-delete-confirm-${m.measuredOn}`}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <button
                  type="button"
                  title="Delete entry"
                  onClick={() => setConfirmId(m.id)}
                  className="flex size-11 shrink-0 items-center justify-center text-faint transition-colors duration-150 hover:text-neg"
                  data-testid={`measure-delete-${m.measuredOn}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Hand-rolled SVG line chart — no chart library (CLAUDE.md: minimal deps).
// Theme tokens for stroke/fill; tabular numerals on the date axis.
const axisFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function TrendChart({
  series,
}: {
  series: { m: Measurement; value: number }[];
}) {
  const W = 320;
  const H = 120;
  const padX = 10;
  const padTop = 10;
  const padBottom = 20;

  if (series.length === 0) {
    return (
      <div className="mt-2 flex h-[110px] items-center justify-center text-xs text-faint">
        No data yet — log a value above.
      </div>
    );
  }

  const values = series.map((s) => s.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const days = series.map((s) => parseLocal(s.m.measuredOn));
  const t0 = days[0];
  const span = days[days.length - 1] - t0 || 1;
  const x = (t: number) =>
    series.length === 1 ? W / 2 : padX + ((t - t0) / span) * (W - padX * 2);
  const y = (v: number) =>
    padTop + (1 - (v - min) / (max - min)) * (H - padTop - padBottom);

  const pts = series.map((s, i) => `${x(days[i])},${y(s.value)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 w-full"
      role="img"
      aria-label="Measurement trend"
      data-testid="trend-chart"
    >
      <line
        x1={padX}
        y1={H - padBottom}
        x2={W - padX}
        y2={H - padBottom}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {series.length > 1 && (
        <polyline
          points={pts}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {series.map((s, i) => (
        <circle
          key={s.m.id}
          cx={x(days[i])}
          cy={y(s.value)}
          r="2.5"
          fill="var(--accent)"
        />
      ))}
      <text x={padX} y={H - 6} className="num" fontSize="9" fill="var(--faint)">
        {axisFmt.format(days[0])}
      </text>
      {series.length > 1 && (
        <text
          x={W - padX}
          y={H - 6}
          textAnchor="end"
          className="num"
          fontSize="9"
          fill="var(--faint)"
        >
          {axisFmt.format(days[days.length - 1])}
        </text>
      )}
    </svg>
  );
}

// ── Progress photos ─────────────────────────────────────────────────────────
function PhotoStrip({ photos }: { photos: Measurement[] }) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const viewing = photos.find((p) => p.id === viewerId) ?? null;

  return (
    <div className="mt-4">
      <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
        Progress photos
      </h2>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {photos.map((m) => (
          <PhotoThumb
            key={m.id}
            measurement={m}
            onOpen={() => setViewerId(m.id)}
          />
        ))}
      </div>

      <Dialog
        open={viewing != null}
        onOpenChange={(o) => !o && setViewerId(null)}
      >
        {viewing && (
          <PhotoViewer
            measurement={viewing}
            others={photos.filter((p) => p.id !== viewing.id)}
            onClose={() => setViewerId(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function PhotoThumb({
  measurement,
  onOpen,
}: {
  measurement: Measurement;
  onOpen: () => void;
}) {
  const { data: url } = useProgressPhotoUrl(measurement);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative size-20 shrink-0 border border-border bg-surface-2"
      data-testid={`photo-thumb-${measurement.measuredOn}`}
    >
      {url && (
        <img
          src={url}
          alt={`Progress ${measurement.measuredOn}`}
          loading="lazy"
          className="size-full object-cover"
        />
      )}
      <span className="num absolute inset-x-0 bottom-0 bg-(--overlay) px-1 py-0.5 text-center text-2xs text-ink">
        {formatDay(measurement.measuredOn)}
      </span>
    </button>
  );
}

function PhotoImg({
  measurement,
  className,
}: {
  measurement: Measurement;
  className?: string;
}) {
  const { data: url } = useProgressPhotoUrl(measurement);
  return url ? (
    <img
      src={url}
      alt={`Progress ${measurement.measuredOn}`}
      className={className}
    />
  ) : (
    <div className={className} />
  );
}

function PhotoViewer({
  measurement,
  others,
  onClose,
}: {
  measurement: Measurement;
  others: Measurement[];
  onClose: () => void;
}) {
  const uploadPhoto = useUploadProgressPhoto();
  const clearPhoto = useClearProgressPhoto();
  const deleteEntry = useDeleteMeasurement();
  const [compareId, setCompareId] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const compare = others.find((o) => o.id === compareId) ?? null;

  // Photo-only entry → drop the whole row; otherwise keep the day's data and
  // just clear the photo (brief + Hevy: attached measurements survive).
  const keepsData = hasMeasurements(measurement);
  function onDelete() {
    if (keepsData) clearPhoto.mutate(measurement.id);
    else deleteEntry.mutate(measurement.id);
    onClose();
  }

  async function onReplace(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const resized = await resizePhoto(file, 1280);
    uploadPhoto.mutate({ measurementId: measurement.id, file: resized });
  }

  return (
    <DialogContent title={`Photo — ${formatDay(measurement.measuredOn)}`}>
      <div className="flex flex-col gap-3">
        <div className={compare ? "grid grid-cols-2 gap-2" : ""}>
          <figure>
            <PhotoImg
              measurement={measurement}
              className="max-h-[50dvh] w-full border border-border object-contain"
            />
            <figcaption className="num mt-1 text-center text-2xs text-faint">
              {formatDay(measurement.measuredOn)}
            </figcaption>
          </figure>
          {compare && (
            <figure>
              <PhotoImg
                measurement={compare}
                className="max-h-[50dvh] w-full border border-border object-contain"
              />
              <figcaption className="num mt-1 text-center text-2xs text-faint">
                {formatDay(compare.measuredOn)}
              </figcaption>
            </figure>
          )}
        </div>

        {others.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-soft">
            Compare with
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              className="num h-9 flex-1 border border-border-strong bg-surface-2 px-2 text-sm text-ink"
              data-testid="photo-compare-select"
            >
              <option value="">None</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {formatDay(o.measuredOn)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <label className="flex h-11 cursor-pointer items-center gap-2 bg-translucent px-3 text-xs text-soft shadow-(--inset-control) transition-colors duration-150 hover:bg-surface-hover hover:text-ink">
            <Camera className="size-4" />
            Replace
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void onReplace(e)}
              className="hidden"
              data-testid="photo-replace-input"
            />
          </label>
          {confirmDelete ? (
            <>
              <Button
                variant="danger"
                size="lg"
                onClick={onDelete}
                data-testid="photo-delete-confirm"
              >
                Confirm delete
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              size="lg"
              className="ml-auto"
              onClick={() => setConfirmDelete(true)}
              data-testid="photo-delete"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
        <p className="text-2xs text-faint">
          {keepsData
            ? "Deleting removes only the photo — this day's measurements are kept."
            : "This entry is photo-only, so deleting removes the whole entry."}
        </p>
      </div>
    </DialogContent>
  );
}

// Downscale to fit maxDim and re-encode as JPEG — keeps uploads small without a
// dependency (mirrors components/machines.tsx).
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
