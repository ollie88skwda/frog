import {
  DEFAULT_TRACKED_CONDITIONS,
  isConditionTracked,
  type Metric,
  type MetricType,
  SEED_CONDITIONS,
} from "@frog/core";
import { Switch } from "@radix-ui/themes";
import { ClipboardList, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCreateMetric,
  useDeleteMetric,
  useMetrics,
  useSession,
  useSetConditionTracked,
  useTrackedConditions,
  useUpdateConditions,
  useUpdateSessionNotes,
} from "@/lib/queries";
import { sessionConditionsLine } from "@/lib/share/conditions";
import { cn } from "@/lib/utils";

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

const TYPES: { value: MetricType; label: string }[] = [
  { value: "number", label: "# Number" },
  { value: "scale", label: "1–10 Scale" },
  { value: "checkbox", label: "✓ Yes / No" },
  { value: "text", label: "✎ Text" },
];

// Clean up seed names that bake a unit/range into the label ("Sleep (h)",
// "Stress (1–10)"): fold a short trailing "(unit)" into the value suffix for
// numbers, and drop it from scale labels (the 1–10 bar already conveys range).
function displayName(metric: Metric): { label: string; unit: string | null } {
  if (metric.unit) return { label: metric.name, unit: metric.unit };
  const m = metric.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    const inner = m[2];
    if (metric.type === "number" && /^\S{1,4}$/.test(inner))
      return { label: m[1], unit: inner };
    if (metric.type === "scale") return { label: m[1], unit: null };
  }
  return { label: metric.name, unit: null };
}

// Semantic word for the Stress scale (the one seeded scale with anchors).
function stressWord(
  id: string,
  n: unknown,
): { text: string; className: string } | null {
  if (id !== SEED_CONDITIONS.stress || typeof n !== "number") return null;
  if (n <= 3) return { text: "calm", className: "text-pos" };
  if (n <= 6) return { text: "normal", className: "text-faint" };
  if (n <= 8) return { text: "strained", className: "text-warn" };
  return { text: "severe", className: "text-neg" };
}

// Debounced-with-flush: schedule() replaces any pending call; flush() runs it now.
function useDebounced(delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = useCallback(
    (fn: () => void) => {
      pending.current = fn;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const f = pending.current;
        pending.current = null;
        timer.current = undefined;
        f?.();
      }, delay);
    },
    [delay],
  );
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    const f = pending.current;
    pending.current = null;
    f?.();
  }, []);
  return { schedule, flush };
}

const eyebrow = "text-2xs font-medium uppercase tracking-widest text-faint";

/**
 * Session conditions — the "experiment variables" for a training session.
 * A small tracked set pre-loads every session (Sleep + Stress by default); the
 * user adds any typed condition, writes freeform notes, and everything
 * auto-saves optimistically. There is no Save button.
 */
export function ConditionsChip({ sessionId }: { sessionId: string }) {
  const { data: session } = useSession(sessionId);
  const { data: metrics = [] } = useMetrics();
  const { data: prefs = [] } = useTrackedConditions();
  const update = useUpdateConditions(sessionId);
  const notesMut = useUpdateSessionNotes(sessionId);
  const createMetric = useCreateMetric();
  const setTracked = useSetConditionTracked();
  const deleteMetric = useDeleteMetric();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newType, setNewType] = useState<MetricType>("number");
  const [newUnit, setNewUnit] = useState("");
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const sessionMetrics = useMemo(
    () => metrics.filter((m) => m.scope === "session"),
    [metrics],
  );
  const values = session?.conditionValues ?? {};
  const summary = sessionConditionsLine(values, sessionMetrics);

  // The sheet edits a LOCAL copy, seeded when it opens; every commit sends the
  // whole map (replace semantics). Keeping it local means the settle-invalidate
  // refetch can't clobber an in-flight value mid-editing.
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
  const localRef = useRef(localValues);
  localRef.current = localValues;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (open) {
      const seed = sessionRef.current?.conditionValues ?? {};
      localRef.current = seed;
      setLocalValues(seed);
    }
  }, [open]);

  const prefsSimple = useMemo(
    () => prefs.map((p) => ({ metricId: p.metricId, tracked: p.tracked })),
    [prefs],
  );

  // Tracked rows (defaults first), then any non-tracked metric that already has
  // a value this session (e.g. logged then untracked).
  const trackedMetrics = useMemo(() => {
    const orderOf = (id: string) => {
      const i = DEFAULT_TRACKED_CONDITIONS.indexOf(id);
      return i === -1 ? 999 : i;
    };
    return sessionMetrics
      .filter((m) => isConditionTracked(m.id, prefsSimple))
      .sort(
        (a, b) => orderOf(a.id) - orderOf(b.id) || a.name.localeCompare(b.name),
      );
  }, [sessionMetrics, prefsSimple]);

  const sessionOnlyMetrics = useMemo(
    () =>
      sessionMetrics.filter(
        (m) =>
          !isConditionTracked(m.id, prefsSimple) &&
          localValues[m.id] != null &&
          localValues[m.id] !== "",
      ),
    [sessionMetrics, prefsSimple, localValues],
  );

  const shownIds = useMemo(
    () => new Set([...trackedMetrics, ...sessionOnlyMetrics].map((m) => m.id)),
    [trackedMetrics, sessionOnlyMetrics],
  );

  const q = query.trim().toLowerCase();
  const suggestions = sessionMetrics.filter(
    (m) =>
      !shownIds.has(m.id) && (q === "" || m.name.toLowerCase().includes(q)),
  );
  const exactMatch = sessionMetrics.some((m) => m.name.toLowerCase() === q);

  function commit(id: string, val: unknown) {
    const next = { ...localRef.current };
    if (val == null || val === "") delete next[id];
    else next[id] = val;
    localRef.current = next;
    setLocalValues(next);
    update.mutate(next);
  }

  function trackExisting(metricId: string) {
    setTracked.mutate({ metricId, tracked: true });
    setJustAddedId(metricId);
    setQuery("");
  }

  async function createCustom() {
    const name = query.trim();
    if (!name || createMetric.isPending) return;
    const metric = await createMetric.mutateAsync({
      name,
      type: newType,
      scope: "session",
      unit: newType === "number" && newUnit.trim() ? newUnit.trim() : null,
    });
    setTracked.mutate({ metricId: metric.id, tracked: true });
    setJustAddedId(metric.id);
    setQuery("");
    setNewUnit("");
  }

  function onQueryKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (suggestions.length > 0 && q !== "") trackExisting(suggestions[0].id);
    else if (q !== "" && !exactMatch) void createCustom();
  }

  function untrack(metricId: string) {
    setTracked.mutate({ metricId, tracked: false });
  }

  function removeCustom(metricId: string) {
    deleteMetric.mutate(metricId);
    commit(metricId, undefined); // drop its value from this session too
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="conditions-chip"
          className="num flex h-8 max-w-full items-center gap-2 truncate rounded-md bg-translucent px-2 text-xs text-soft shadow-(--inset-control) transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
        >
          <ClipboardList className="size-4 shrink-0" />
          <span className="truncate">{summary ?? "Log conditions"}</span>
        </button>
      </DialogTrigger>
      <DialogContent title="Conditions" className="md:max-w-lg">
        <div className="flex flex-col gap-5">
          {/* Tracked ------------------------------------------------------- */}
          <section className="flex flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className={eyebrow}>Tracked</span>
              {/* TODO(lessons): <InfoTip lessonId="tracked-conditions" /> once copy exists */}
              <span className="text-2xs text-faint">your variables</span>
            </div>
            {trackedMetrics.length === 0 ? (
              <p className="py-1 text-xs text-faint">
                Nothing tracked yet. Add a condition below — it'll show here
                every session.
              </p>
            ) : (
              trackedMetrics.map((m) => (
                <ConditionRow
                  key={m.id}
                  metric={m}
                  value={localValues[m.id]}
                  autoFocus={justAddedId === m.id}
                  onCommit={(v) => commit(m.id, v)}
                  onUntrack={() => untrack(m.id)}
                  onDelete={() => removeCustom(m.id)}
                />
              ))
            )}
          </section>

          {/* This session only -------------------------------------------- */}
          {sessionOnlyMetrics.length > 0 && (
            <section className="flex flex-col">
              <span className={cn(eyebrow, "mb-1")}>This session only</span>
              {sessionOnlyMetrics.map((m) => (
                <ConditionRow
                  key={m.id}
                  metric={m}
                  value={localValues[m.id]}
                  onCommit={(v) => commit(m.id, v)}
                  onUntrack={() => trackExisting(m.id)}
                  untrackLabel="Track every session"
                  onDelete={() => removeCustom(m.id)}
                />
              ))}
            </section>
          )}

          {/* Notes -------------------------------------------------------- */}
          <section className="flex flex-col">
            <span className={cn(eyebrow, "mb-1")}>Notes</span>
            <NotesBlock
              notes={session?.notes ?? ""}
              onCommit={(t) => notesMut.mutate(t.trim() ? t : null)}
            />
          </section>

          {/* Add ---------------------------------------------------------- */}
          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <span className={eyebrow}>Track something else</span>
            <Input
              placeholder="Add a condition or note…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onQueryKeyDown}
              className="h-10 text-sm md:h-8"
              data-testid="condition-add-input"
            />

            {q !== "" && !exactMatch && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNewType(t.value)}
                      data-testid={`condition-type-${t.value}`}
                      className={cn(
                        "rounded-md border px-2 py-1 text-2xs transition-colors duration-150",
                        newType === t.value
                          ? "border-accent bg-accent-soft text-ink"
                          : "border-border bg-translucent text-soft hover:bg-surface-hover",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {newType === "number" && (
                  <Input
                    placeholder="Unit (kg, mg, h…) — optional"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="h-9 text-xs md:h-8"
                    data-testid="condition-unit-input"
                  />
                )}
              </div>
            )}

            {(suggestions.length > 0 || q !== "") && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => trackExisting(m.id)}
                    className="rounded-md bg-translucent px-2 py-1 text-2xs text-soft shadow-(--inset-control) transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
                    data-testid={`condition-preset-${m.name}`}
                  >
                    {m.name}
                  </button>
                ))}
                {q !== "" && !exactMatch && (
                  <button
                    type="button"
                    onClick={() => void createCustom()}
                    disabled={createMetric.isPending}
                    className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-2xs text-accent transition-colors duration-150 ease-(--ease-out-quad) hover:bg-accent/20 disabled:opacity-50"
                    data-testid="condition-create-btn"
                  >
                    <Plus className="size-3" />
                    Create “{query.trim()}”
                  </button>
                )}
              </div>
            )}
          </section>

          <p className="text-2xs text-faint">Saved automatically.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Row: label + type-appropriate control + a ⋯ menu (untrack / delete).
// ---------------------------------------------------------------------------
function ConditionRow({
  metric,
  value,
  autoFocus,
  onCommit,
  onUntrack,
  onDelete,
  untrackLabel = "Stop tracking",
}: {
  metric: Metric;
  value: unknown;
  autoFocus?: boolean;
  onCommit: (v: unknown) => void;
  onUntrack: () => void;
  onDelete: () => void;
  untrackLabel?: string;
}) {
  const isCustom = metric.ownerId != null;
  const { label, unit } = displayName(metric);
  const inline =
    metric.type === "number" || metric.type === "text" ? null : metric.type;

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2.5 last:border-b-0">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-ink">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {metric.type === "number" && (
            <NumberField
              value={value}
              unit={unit}
              autoFocus={autoFocus}
              onCommit={onCommit}
              testId={`condition-input-${metric.id}`}
            />
          )}
          {metric.type === "text" && (
            <TextField
              value={value}
              autoFocus={autoFocus}
              onCommit={onCommit}
              testId={`condition-input-${metric.id}`}
            />
          )}
          {metric.type === "checkbox" && (
            <ToggleField
              value={value}
              onCommit={onCommit}
              testId={`condition-toggle-${metric.id}`}
            />
          )}
          <RowMenu
            metricId={metric.id}
            canDelete={isCustom}
            untrackLabel={untrackLabel}
            onUntrack={onUntrack}
            onDelete={onDelete}
          />
        </div>
      </div>
      {inline === "scale" && (
        <ScaleField metricId={metric.id} value={value} onCommit={onCommit} />
      )}
    </div>
  );
}

function NumberField({
  value,
  unit,
  autoFocus,
  onCommit,
  testId,
}: {
  value: unknown;
  unit: string | null;
  autoFocus?: boolean;
  onCommit: (v: unknown) => void;
  testId: string;
}) {
  const [str, setStr] = useState(value == null ? "" : String(value));
  const { schedule, flush } = useDebounced(350);
  // Re-seed from the server only when the numeric value actually differs, so an
  // optimistic round-trip doesn't reformat a mid-typing string ("7." → "7").
  useEffect(() => {
    const ext = value == null ? "" : String(value);
    setStr((prev) =>
      Number(prev) === Number(ext) && prev !== "" ? prev : ext,
    );
  }, [value]);

  function onChange(raw: string) {
    setStr(raw);
    const t = raw.trim();
    if (t === "") schedule(() => onCommit(undefined));
    else if (NUMERIC_RE.test(t)) schedule(() => onCommit(Number.parseFloat(t)));
    // otherwise (mid-typing like "7.") wait for a valid value
  }

  return (
    <div className="flex items-center gap-1">
      <input
        inputMode="decimal"
        value={str}
        // biome-ignore lint/a11y/noAutofocus: focuses a just-added condition
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        data-testid={testId}
        className="num h-9 w-20 rounded-md border border-border bg-translucent px-2 text-right text-base font-semibold text-ink shadow-(--inset-control) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70 md:h-8"
      />
      {unit && <span className="w-6 text-xs text-faint">{unit}</span>}
    </div>
  );
}

function TextField({
  value,
  autoFocus,
  onCommit,
  testId,
}: {
  value: unknown;
  autoFocus?: boolean;
  onCommit: (v: unknown) => void;
  testId: string;
}) {
  const [str, setStr] = useState(typeof value === "string" ? value : "");
  const { schedule, flush } = useDebounced(400);
  useEffect(() => {
    const ext = typeof value === "string" ? value : "";
    setStr((prev) => (prev === ext ? prev : ext));
  }, [value]);
  return (
    <input
      value={str}
      // biome-ignore lint/a11y/noAutofocus: focuses a just-added condition
      autoFocus={autoFocus}
      onChange={(e) => {
        setStr(e.target.value);
        schedule(() => onCommit(e.target.value));
      }}
      onBlur={flush}
      placeholder="…"
      data-testid={testId}
      className="h-9 w-40 rounded-md border border-border bg-translucent px-2 text-sm text-ink shadow-(--inset-control) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70 md:h-8"
    />
  );
}

function ToggleField({
  value,
  onCommit,
  testId,
}: {
  value: unknown;
  onCommit: (v: unknown) => void;
  testId: string;
}) {
  const on = value === true;
  return (
    <Switch
      checked={on}
      onCheckedChange={(c) => onCommit(c)}
      data-testid={testId}
      size="2"
    />
  );
}

function ScaleField({
  metricId,
  value,
  onCommit,
}: {
  metricId: string;
  value: unknown;
  onCommit: (v: unknown) => void;
}) {
  const current = typeof value === "number" ? value : null;
  const word = stressWord(metricId, current);
  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid grid-cols-10 gap-1"
        data-testid={`condition-scale-${metricId}`}
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`condition-scale-${metricId}-${n}`}
            aria-label={`${n}`}
            onClick={() => onCommit(current === n ? undefined : n)}
            className={cn(
              "h-7 rounded-md border transition-colors duration-150",
              current != null && n <= current
                ? "border-accent bg-accent"
                : "border-border bg-translucent hover:bg-surface-hover",
            )}
          />
        ))}
      </div>
      <span className="num text-right text-2xs text-faint">
        {current == null ? (
          "not set"
        ) : (
          <>
            {current}
            {word && (
              <span className={cn("ml-1", word.className)}>· {word.text}</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

function RowMenu({
  metricId,
  canDelete,
  untrackLabel,
  onUntrack,
  onDelete,
}: {
  metricId: string;
  canDelete: boolean;
  untrackLabel: string;
  onUntrack: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`condition-menu-${metricId}`}
        aria-label="Condition options"
        className="flex size-8 items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="floating absolute right-0 z-20 mt-1 min-w-40 py-1">
            <button
              type="button"
              onClick={() => {
                onUntrack();
                setOpen(false);
              }}
              data-testid={`condition-untrack-${metricId}`}
              className="block w-full px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
            >
              {untrackLabel}
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  setOpen(false);
                }}
                data-testid={`condition-delete-${metricId}`}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotesBlock({
  notes,
  onCommit,
}: {
  notes: string;
  onCommit: (t: string) => void;
}) {
  const [val, setVal] = useState(notes);
  const { schedule, flush } = useDebounced(500);
  useEffect(() => {
    setVal((prev) => (prev === notes ? prev : notes));
  }, [notes]);
  return (
    <textarea
      value={val}
      onChange={(e) => {
        setVal(e.target.value);
        schedule(() => onCommit(e.target.value));
      }}
      onBlur={flush}
      rows={3}
      placeholder="How did it feel? Anything worth remembering…"
      data-testid="condition-notes"
      className="min-h-16 w-full resize-y rounded-md border border-border bg-translucent px-2.5 py-2 text-sm text-ink shadow-(--inset-control) placeholder:text-faint focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
    />
  );
}
