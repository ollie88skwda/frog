import {
  type ApiToken,
  measurementsCsv,
  setsCsv,
  unitLabel,
  type WarmupStep,
} from "@sbl/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Plus, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ImportCard } from "@/components/import-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSignOut } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useUpdateUserPrefs, useUserPrefs } from "@/lib/profile-queries";
import {
  isIOS,
  pushConfigured,
  pushSupported,
  subscribeToPush,
  swRegistration,
  unsubscribeFromPush,
  useInstallPrompt,
  useNotificationPermission,
  usePushSubscribed,
} from "@/lib/pwa";
import { useRepo } from "@/lib/repo";
import {
  type DistanceUnit,
  type MeasurementUnit,
  type Unit,
  useDistanceUnit,
  useMeasurementUnit,
  useUnit,
} from "@/lib/settings";
import { playRestBlip } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { getWarmupMethod, useWarmupMethod } from "@/lib/warmup-method";
import {
  useKeepAwake,
  useLivePrBanner,
  useRestSoundVolume,
  useSmartSupersetScroll,
} from "@/lib/workout-prefs";

function download(filename: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shared building blocks ──────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint && <p className="mt-0.5 text-2xs text-faint">{hint}</p>}
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-2xs text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  testid,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  testid?: string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          data-testid={testid ? `${testid}-${o.value}` : undefined}
          className={cn(
            "px-3 py-1 text-xs font-medium transition-colors duration-150 ease-(--ease-out-quad)",
            value === o.value
              ? "bg-surface-active text-ink"
              : "text-soft hover:bg-surface-hover",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  testid,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  testid?: string;
}) {
  return (
    <Segmented
      options={[
        { label: "Off", value: "off" },
        { label: "On", value: "on" },
      ]}
      value={on ? "on" : "off"}
      onChange={(v) => onChange(v === "on")}
      testid={testid}
    />
  );
}

function NativeSelect({
  value,
  onChange,
  testid,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  testid?: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink"
    >
      {children}
    </select>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const signOut = useSignOut();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <UnitsSection />
      <WorkoutsSection />
      <DisplaySection />
      <NotificationsSection />
      <InstallSection />
      <ExportSection />
      <ImportCard />
      <ApiTokensSection />

      <Section title="Account">
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={() => void signOut()}
          data-testid="sign-out-btn"
        >
          Sign out
        </Button>
      </Section>
    </div>
  );
}

// ── Units ───────────────────────────────────────────────────────────────────

const WEIGHT_UNITS: Unit[] = ["lb", "kg"];
const DISTANCE_UNITS: DistanceUnit[] = ["mi", "km"];
const MEASUREMENT_UNITS: MeasurementUnit[] = ["in", "cm"];

function UnitsSection() {
  const { unit, setUnit } = useUnit();
  const { distanceUnit, setDistanceUnit } = useDistanceUnit();
  const { measurementUnit, setMeasurementUnit } = useMeasurementUnit();

  return (
    <Section
      title="Units"
      hint="Display only — data is stored canonically (kg, meters, cm)."
    >
      <div className="mt-1 divide-y divide-border">
        <Row label="Weight">
          <Segmented
            options={WEIGHT_UNITS.map((u) => ({
              label: unitLabel(u),
              value: u,
            }))}
            value={unit}
            onChange={setUnit}
            testid="unit"
          />
        </Row>
        <Row label="Distance">
          <Segmented
            options={DISTANCE_UNITS.map((u) => ({ label: u, value: u }))}
            value={distanceUnit}
            onChange={setDistanceUnit}
            testid="distance-unit"
          />
        </Row>
        <Row label="Body measurements">
          <Segmented
            options={MEASUREMENT_UNITS.map((u) => ({ label: u, value: u }))}
            value={measurementUnit}
            onChange={setMeasurementUnit}
            testid="measurement-unit"
          />
        </Row>
      </div>
    </Section>
  );
}

// ── Workouts ────────────────────────────────────────────────────────────────

const REST_OPTIONS: { label: string; sec: number | null }[] = [
  { label: "Off", sec: null },
  { label: "0:30", sec: 30 },
  { label: "0:45", sec: 45 },
  { label: "1:00", sec: 60 },
  { label: "1:30", sec: 90 },
  { label: "2:00", sec: 120 },
  { label: "2:30", sec: 150 },
  { label: "3:00", sec: 180 },
  { label: "4:00", sec: 240 },
  { label: "5:00", sec: 300 },
];

const SOUND_PRESETS: { label: string; value: number }[] = [
  { label: "Off", value: 0 },
  { label: "Low", value: 0.25 },
  { label: "Normal", value: 0.5 },
  { label: "High", value: 1 },
];

function WorkoutsSection() {
  const { data: prefs } = useUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const qc = useQueryClient();

  const [smartScroll, setSmartScroll] = useSmartSupersetScroll();
  const [livePr, setLivePr] = useLivePrBanner();
  const [keepAwake, setKeepAwake] = useKeepAwake();
  const [restVolume, setRestVolume] = useRestSoundVolume();

  const defaultRestSec = prefs?.defaultRestSec ?? null;
  const previousScope = (prefs?.previousValuesScope ?? "any") as
    | "any"
    | "routine";
  const includeWarmups = prefs?.includeWarmupsInStats ?? true;

  function onWarmupsInStats(v: boolean) {
    updatePrefs.mutate({ includeWarmupsInStats: v });
    // Records + stats are computed under this flag — force a recompute so the
    // panels never disagree with the toggle (the pref is baked into the query key).
    void qc.invalidateQueries({ queryKey: ["records-data"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  }

  return (
    <Section title="Workouts">
      <div className="mt-1 divide-y divide-border">
        <Row
          label="Default rest timer"
          hint="Applied to sets with no per-exercise rest set."
        >
          <NativeSelect
            value={defaultRestSec === null ? "off" : String(defaultRestSec)}
            onChange={(v) =>
              updatePrefs.mutate({
                defaultRestSec: v === "off" ? null : Number(v),
              })
            }
            testid="default-rest-select"
          >
            {REST_OPTIONS.map((o) => (
              <option
                key={o.label}
                value={o.sec === null ? "off" : String(o.sec)}
              >
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Row>

        <Row
          label="Previous values"
          hint="Which past workout the PREVIOUS column fills from."
        >
          <Segmented
            options={[
              { label: "Any", value: "any" as const },
              { label: "Same routine", value: "routine" as const },
            ]}
            value={previousScope}
            onChange={(v) => updatePrefs.mutate({ previousValuesScope: v })}
            testid="previous-scope"
          />
        </Row>

        <Row
          label="Count warm-ups in stats"
          hint="Include warm-up sets in records, volume, and charts."
        >
          <Toggle
            on={includeWarmups}
            onChange={onWarmupsInStats}
            testid="warmups-stats"
          />
        </Row>

        <Row
          label="Smart superset scrolling"
          hint="Auto-advance to the next superset move after each set."
        >
          <Toggle
            on={smartScroll}
            onChange={setSmartScroll}
            testid="smart-scroll"
          />
        </Row>

        <Row
          label="Live PR banner"
          hint="Celebrate records the moment you beat them."
        >
          <Toggle on={livePr} onChange={setLivePr} testid="live-pr" />
        </Row>

        <Row
          label="Keep screen awake"
          hint="Hold the screen on during an active workout."
        >
          <Toggle on={keepAwake} onChange={setKeepAwake} testid="keep-awake" />
        </Row>

        {/* Full-width row: the 4-preset control + Test button need the whole
            line on a phone, so the label sits above rather than beside them. */}
        <div className="py-2.5">
          <p className="text-xs font-medium">Alert sound</p>
          <p className="mt-0.5 text-2xs text-faint">
            Rest-timer and PR blip volume.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Segmented
              options={SOUND_PRESETS}
              value={restVolume}
              onChange={setRestVolume}
              testid="sound-vol"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => playRestBlip(restVolume || 0.5)}
              data-testid="sound-test"
            >
              Test
            </Button>
          </div>
        </div>
      </div>

      <WarmupMethodEditor />
    </Section>
  );
}

type WarmupRow = { id: number; pct: number; reps: number };

function WarmupMethodEditor() {
  const { setMethod, reset, isCustom } = useWarmupMethod();
  // Rows carry a stable client id so React keys never rely on the array index
  // (reordering/removing mid-list). Persistence mirrors {pct, reps}[] to storage.
  const nextId = useRef(0);
  const withId = (s: WarmupStep): WarmupRow => ({ id: nextId.current++, ...s });
  const [rows, setRows] = useState<WarmupRow[]>(() =>
    getWarmupMethod().map(withId),
  );

  function persist(next: WarmupRow[]) {
    setRows(next);
    setMethod(next.map(({ pct, reps }) => ({ pct, reps })));
  }
  function updateRow(id: number, patch: Partial<WarmupStep>) {
    persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function onReset() {
    reset();
    setRows(getWarmupMethod().map(withId));
  }

  return (
    <div className="mt-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Warm-up method</p>
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="text-2xs text-soft underline-offset-2 hover:underline"
            data-testid="warmup-reset"
          >
            Reset to default
          </button>
        )}
      </div>
      <p className="mt-0.5 text-2xs text-faint">
        Percentage ramp used by “Add warm-up” on the logging screen.
      </p>

      <div className="mt-2 space-y-1.5">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="flex items-center gap-2"
            data-testid={`warmup-step-${i}`}
          >
            <Input
              type="number"
              inputMode="numeric"
              value={String(Math.round(row.pct * 100))}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n))
                  updateRow(row.id, {
                    pct: Math.max(0, Math.min(100, n)) / 100,
                  });
              }}
              className="num w-16"
              data-testid={`warmup-step-${i}-pct`}
            />
            <span className="text-2xs text-faint">% ×</span>
            <Input
              type="number"
              inputMode="numeric"
              value={String(row.reps)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n))
                  updateRow(row.id, { reps: Math.max(0, Math.round(n)) });
              }}
              className="num w-16"
              data-testid={`warmup-step-${i}-reps`}
            />
            <span className="text-2xs text-faint">reps</span>
            <Button
              size="icon"
              variant="ghost"
              title="Remove step"
              onClick={() => persist(rows.filter((r) => r.id !== row.id))}
              data-testid={`warmup-remove-${i}`}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => persist([...rows, withId({ pct: 0.5, reps: 5 })])}
        data-testid="warmup-add-step"
      >
        <Plus className="size-4" />
        Add step
      </Button>
    </div>
  );
}

// ── Display (calendar + body diagram) ───────────────────────────────────────

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function DisplaySection() {
  const { data: prefs } = useUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const firstWeekday = prefs?.firstWeekday ?? 1;
  const bodyDiagram = prefs?.bodyDiagram ?? "neutral";

  return (
    <Section title="Display">
      <div className="mt-1 divide-y divide-border">
        <Row label="First day of week" hint="Calendar and weekly streak start.">
          <NativeSelect
            value={String(firstWeekday)}
            onChange={(v) => updatePrefs.mutate({ firstWeekday: Number(v) })}
            testid="first-weekday-select"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={String(i)}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </Row>
        <Row label="Body diagram" hint="Figure used on the stats heat map.">
          <NativeSelect
            value={bodyDiagram}
            onChange={(v) => updatePrefs.mutate({ bodyDiagram: v })}
            testid="body-diagram-select"
          >
            <option value="neutral">Neutral</option>
          </NativeSelect>
        </Row>
      </div>
    </Section>
  );
}

// ── Notifications + push ────────────────────────────────────────────────────

function NotificationsSection() {
  const repo = useRepo();
  const { permission, request } = useNotificationPermission();
  const { subscribed, refresh } = usePushSubscribed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = pushSupported();

  async function sendTest() {
    if (permission !== "granted") return;
    const reg = await swRegistration();
    if (reg) await reg.showNotification("SBL", { body: "Rest timer test" });
    else new Notification("SBL", { body: "Rest timer test" });
  }

  async function togglePush(on: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (on) {
        if (permission !== "granted") {
          const result = await request();
          if (result !== "granted") {
            setError("Notification permission is required for push.");
            return;
          }
        }
        await subscribeToPush(repo);
      } else {
        await unsubscribeFromPush(repo);
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Notifications"
      hint="Rest-timer alerts fire in-app; a system notification also shows when the tab is in the background."
    >
      <div className="mt-1 divide-y divide-border">
        <Row
          label="System notifications"
          hint={
            permission === "denied"
              ? "Blocked — re-enable in your browser settings."
              : permission === "unsupported"
                ? "Not supported on this device."
                : "Allow SBL to post rest-timer alerts."
          }
        >
          {permission === "granted" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void sendTest()}
              data-testid="notif-test"
            >
              Send test
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={permission === "denied" || permission === "unsupported"}
              onClick={() => void request()}
              data-testid="notif-request"
            >
              Enable
            </Button>
          )}
        </Row>

        <Row
          label="Background push"
          hint={
            !supported
              ? "Not supported on this device."
              : !pushConfigured
                ? "Requires server keys — not configured."
                : isIOS()
                  ? "iOS: install the app to Home Screen first."
                  : "Get rest-timer alerts even when SBL is closed."
          }
        >
          <Toggle
            on={subscribed}
            onChange={(v) => {
              if (!busy) void togglePush(v);
            }}
            testid="push"
          />
        </Row>
      </div>
      {error && (
        <p className="mt-2 text-2xs text-neg" data-testid="push-error">
          {error}
        </p>
      )}
    </Section>
  );
}

// ── Install (PWA) ───────────────────────────────────────────────────────────

function InstallSection() {
  const { canInstall, promptInstall, installed, ios } = useInstallPrompt();
  if (installed) {
    return (
      <Section title="Install app">
        <p className="mt-1 text-2xs text-faint" data-testid="install-status">
          SBL is installed on this device.
        </p>
      </Section>
    );
  }
  return (
    <Section
      title="Install app"
      hint="Add SBL to your home screen for a full-screen, app-like launch."
    >
      {canInstall ? (
        <Button
          size="sm"
          variant="primary"
          className="mt-2"
          onClick={() => void promptInstall()}
          data-testid="install-btn"
        >
          <Download className="size-4" />
          Install
        </Button>
      ) : ios ? (
        <p className="mt-1 text-2xs text-faint" data-testid="install-hint">
          In Safari, tap the Share button, then “Add to Home Screen”.
        </p>
      ) : (
        <p className="mt-1 text-2xs text-faint" data-testid="install-hint">
          Use your browser’s “Install app” menu option to add SBL.
        </p>
      )}
    </Section>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportSection() {
  const repo = useRepo();
  const [exporting, setExporting] = useState<
    "json" | "csv" | "measurements" | null
  >(null);

  async function exportData(kind: "json" | "csv" | "measurements") {
    setExporting(kind);
    try {
      const bundle = await repo.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        download(
          `sbl-export-${stamp}.json`,
          "application/json",
          JSON.stringify(bundle, null, 2),
        );
      } else if (kind === "csv") {
        download(`sbl-sets-${stamp}.csv`, "text/csv", setsCsv(bundle));
      } else {
        download(
          `sbl-measurements-${stamp}.csv`,
          "text/csv",
          measurementsCsv(bundle.measurements ?? []),
        );
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <Section
      title="Export"
      hint="Your data, yours — full JSON graph, a flat CSV of every set, or your body measurements."
    >
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("json")}
          data-testid="export-json-btn"
        >
          <Download className="size-4" />
          {exporting === "json" ? "Exporting…" : "JSON"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("csv")}
          data-testid="export-csv-btn"
        >
          <Download className="size-4" />
          {exporting === "csv" ? "Exporting…" : "sets.csv"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("measurements")}
          data-testid="export-measurements-btn"
        >
          <Download className="size-4" />
          {exporting === "measurements" ? "Exporting…" : "measurements.csv"}
        </Button>
      </div>
    </Section>
  );
}

// ── API tokens (unchanged) ──────────────────────────────────────────────────

function ApiTokensSection() {
  const repo = useRepo();
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => repo.listApiTokens(),
  });
  const [name, setName] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (n: string) => repo.createApiToken(n),
    onSuccess: ({ token }) => {
      setPlaintext(token);
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => repo.revokeApiToken(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  return (
    <Section
      title="API tokens"
      hint="Read-only access to your data for scripts, dashboards, and the MCP server."
    >
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate(name.trim());
          setName("");
        }}
      >
        <Input
          placeholder="Token name (e.g. mcp)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="token-name-input"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={name.trim().length === 0 || create.isPending}
          data-testid="create-token-btn"
        >
          Create
        </Button>
      </form>

      {tokens.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border">
          {tokens.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              onRevoke={() => revoke.mutate(t.id)}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={plaintext !== null}
        onOpenChange={(o) => !o && setPlaintext(null)}
      >
        <DialogContent title="Token created — copy it now">
          <p className="text-xs text-soft">
            This is shown once. Store it somewhere safe; only its hash is kept.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs"
              data-testid="token-plaintext"
            >
              {plaintext}
            </code>
            <Button
              size="icon"
              variant="ghost"
              title="Copy"
              onClick={() =>
                plaintext && void navigator.clipboard.writeText(plaintext)
              }
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: () => void;
}) {
  const revoked = token.revokedAt != null;
  return (
    <li className="flex items-center justify-between px-3 py-2 text-sm">
      <span className={cn(revoked && "text-faint line-through")}>
        {token.name}
      </span>
      <span className="flex items-center gap-2">
        <span className="num text-2xs text-faint">
          created {formatDate(token.createdAt)}
          {token.lastUsedAt != null &&
            ` · used ${formatDate(token.lastUsedAt)}`}
        </span>
        {revoked ? (
          <span className="text-2xs text-faint uppercase">revoked</span>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={onRevoke}
            data-testid={`revoke-${token.name}`}
          >
            Revoke
          </Button>
        )}
      </span>
    </li>
  );
}
