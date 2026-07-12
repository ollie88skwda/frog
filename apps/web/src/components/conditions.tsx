import { type Metric, SEED_CONDITIONS } from "@sbl/core";
import { ClipboardList, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useCreateMetric,
  useMetrics,
  useSession,
  useUpdateConditions,
} from "@/lib/queries";

// Compact chip labels for the seeded conditions ("7.5h · 82kg · stress 3").
const SHORT: Record<string, (v: unknown) => string> = {
  [SEED_CONDITIONS.sleepH]: (v) => `${v}h`,
  [SEED_CONDITIONS.bodyweight]: (v) => `${v}kg`,
  [SEED_CONDITIONS.preCarbsG]: (v) => `${v}g`,
  [SEED_CONDITIONS.caffeineMg]: (v) => `${v}mg`,
  [SEED_CONDITIONS.stress]: (v) => `stress ${v}`,
  [SEED_CONDITIONS.lastMealH]: (v) => `ate ${v}h ago`,
};

const STRESS_ANCHORS = "1–3 calm · 4–6 normal · 7–8 strained · 9–10 severe";
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function summarize(
  values: Record<string, unknown>,
  metrics: Metric[],
): string | null {
  const parts: string[] = [];
  for (const m of metrics) {
    const v = values[m.id];
    if (v == null || v === "") continue;
    const short = SHORT[m.id];
    if (short) parts.push(short(v));
    else parts.push(`${m.name} ${v}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Conditions start EMPTY per session — the user adds only what they track.
 * Type to add (creates a custom session metric) or tap a preset pill.
 */
export function ConditionsChip({ sessionId }: { sessionId: string }) {
  const { data: session } = useSession(sessionId);
  const { data: metrics = [] } = useMetrics();
  const update = useUpdateConditions(sessionId);
  const createMetric = useCreateMetric();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const sessionMetrics = metrics.filter((m) => m.scope === "session");
  const byId = new Map(sessionMetrics.map((m) => [m.id, m]));
  const values = session?.conditionValues ?? {};
  const summary = summarize(values, sessionMetrics);

  function openDialog() {
    const d: Record<string, string> = {};
    for (const [id, v] of Object.entries(values)) {
      if (v != null && v !== "" && byId.has(id)) d[id] = String(v);
    }
    setDraft(d);
    setQuery("");
    setOpen(true);
  }

  const q = query.trim().toLowerCase();
  const suggestions = sessionMetrics.filter(
    (m) =>
      draft[m.id] === undefined &&
      (q === "" || m.name.toLowerCase().includes(q)),
  );
  const exactMatch = sessionMetrics.some((m) => m.name.toLowerCase() === q);

  function addMetric(id: string) {
    setDraft((d) => ({ ...d, [id]: d[id] ?? "" }));
    setQuery("");
  }

  async function createCustom() {
    const name = query.trim();
    if (!name) return;
    const metric = await createMetric.mutateAsync({
      name,
      type: "number",
      scope: "session",
    });
    addMetric(metric.id);
  }

  function onQueryKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (suggestions.length > 0 && (exactMatch || q !== "")) {
      addMetric(suggestions[0].id);
    } else if (q !== "") {
      void createCustom();
    }
  }

  function save() {
    const parsed: Record<string, unknown> = {};
    for (const [id, raw] of Object.entries(draft)) {
      const t = raw.trim();
      if (t === "") continue;
      const m = byId.get(id);
      parsed[id] =
        m?.type !== "text" && NUMERIC_RE.test(t) ? Number.parseFloat(t) : t;
    }
    update.mutate(parsed);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? openDialog() : setOpen(false))}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="conditions-chip"
          className="num flex h-9 max-w-full items-center gap-1.5 truncate rounded-md bg-translucent px-2.5 text-xs text-soft shadow-(--inset-control) transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink md:h-7 md:px-2"
        >
          <ClipboardList className="size-3.5 shrink-0" />
          <span className="truncate">{summary ?? "Log conditions"}</span>
        </button>
      </DialogTrigger>
      <DialogContent title="Session conditions">
        <div className="flex flex-col gap-3">
          {Object.keys(draft).length === 0 && (
            <p className="text-xs text-faint">
              Track what might move the needle — sleep, caffeine, stress, or
              anything of your own.
            </p>
          )}

          {Object.keys(draft).map((id) => {
            const m = byId.get(id);
            if (!m) return null;
            return (
              <div key={id} className="flex flex-col gap-1">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem_1.5rem] items-center gap-2">
                  <span className="truncate text-xs text-soft">{m.name}</span>
                  <Input
                    inputMode={m.type === "text" ? undefined : "decimal"}
                    value={draft[id]}
                    autoFocus={draft[id] === ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        save();
                      }
                    }}
                    className="num h-10 text-xs md:h-7"
                    data-testid={`condition-input-${id}`}
                  />
                  <button
                    type="button"
                    title={`Remove ${m.name}`}
                    onClick={() =>
                      setDraft((d) => {
                        const { [id]: _gone, ...rest } = d;
                        return rest;
                      })
                    }
                    className="justify-self-center rounded-sm p-0.5 text-faint transition-colors duration-150 hover:text-neg"
                    data-testid={`condition-remove-${id}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {id === SEED_CONDITIONS.stress && (
                  <span className="text-2xs text-faint">{STRESS_ANCHORS}</span>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Input
              placeholder="Add a condition…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onQueryKeyDown}
              className="h-10 text-xs md:h-8"
              data-testid="condition-add-input"
            />
            {(suggestions.length > 0 || q !== "") && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addMetric(m.id)}
                    className="rounded-full bg-translucent px-2.5 py-1 text-2xs text-soft shadow-(--inset-control) transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
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
                    className="rounded-full bg-accent-soft px-2.5 py-1 text-2xs text-accent transition-colors duration-150 ease-(--ease-out-quad) hover:bg-accent/20"
                    data-testid="condition-create-btn"
                  >
                    + Create “{query.trim()}”
                  </button>
                )}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            className="self-end max-md:h-10 max-md:w-full"
            onClick={save}
            data-testid="conditions-save-btn"
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
