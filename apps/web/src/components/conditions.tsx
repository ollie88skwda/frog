import { type Metric, SEED_CONDITIONS } from "@sbl/core";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMetrics, useSession, useUpdateConditions } from "@/lib/queries";

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
    else if (m.type !== "text") parts.push(`${m.name} ${v}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function ConditionsChip({ sessionId }: { sessionId: string }) {
  const { data: session } = useSession(sessionId);
  const { data: metrics = [] } = useMetrics();
  const update = useUpdateConditions(sessionId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const sessionMetrics = metrics.filter((m) => m.scope === "session");
  const values = session?.conditionValues ?? {};
  const summary = summarize(values, sessionMetrics);

  function openDialog() {
    setDraft(
      Object.fromEntries(
        sessionMetrics.map((m) => [
          m.id,
          values[m.id] == null ? "" : String(values[m.id]),
        ]),
      ),
    );
    setOpen(true);
  }

  function save() {
    if (!draft) return;
    const parsed: Record<string, unknown> = {};
    for (const m of sessionMetrics) {
      const raw = (draft[m.id] ?? "").trim();
      if (raw === "") continue;
      parsed[m.id] =
        m.type === "number" || m.type === "scale"
          ? Number.parseFloat(raw)
          : raw;
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
          className="num flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-surface px-2 py-1 text-xs text-soft transition-colors duration-100 hover:border-border-strong hover:text-ink"
        >
          <ClipboardList className="size-3.5 shrink-0" />
          <span className="truncate">{summary ?? "Log conditions"}</span>
        </button>
      </DialogTrigger>
      <DialogContent title="Session conditions">
        <div className="flex flex-col gap-2.5">
          {sessionMetrics.map((m) => (
            <label
              key={m.id}
              htmlFor={`condition-${m.id}`}
              className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2"
            >
              <span className="truncate text-xs text-soft">{m.name}</span>
              <Input
                id={`condition-${m.id}`}
                inputMode={m.type === "text" ? undefined : "decimal"}
                value={draft?.[m.id] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...(d ?? {}), [m.id]: e.target.value }))
                }
                className="num h-7 text-xs"
                data-testid={`condition-input-${m.id}`}
              />
              {m.id === SEED_CONDITIONS.stress && (
                <span className="col-span-2 -mt-1 text-2xs text-faint">
                  {STRESS_ANCHORS}
                </span>
              )}
            </label>
          ))}
          <Button
            variant="primary"
            size="sm"
            className="mt-1 self-end"
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
