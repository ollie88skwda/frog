import {
  APP_NAME,
  type ApiToken,
  measurementsCsv,
  setsCsv,
  unitLabel,
  type WarmupStep,
} from "@frog/core";
import { Select } from "@radix-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Plus, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Link } from "react-router";
import { ImportCard } from "@/components/import-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Row as ListRow } from "@/components/ui/row";
import { useSignOut } from "@/lib/auth";
import { useChangelogHasUnseen } from "@/lib/changelog-prefs";
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
import { cn } from "@/lib/utils";
import { type Register, useRegister, useVoice, voice } from "@/lib/voice";
import { getWarmupMethod, useWarmupMethod } from "@/lib/warmup-method";
import {
  useKeepAwake,
  useLivePrBanner,
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

function SelectField({
  value,
  onChange,
  testid,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  testid?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} size="1">
      <Select.Trigger variant="surface" data-testid={testid} />
      <Select.Content>
        {options.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const signOut = useSignOut();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <UnitsSection />
      <VoiceSection />
      <WorkoutsSection />
      <DisplaySection />
      <NotificationsSection />
      <InstallSection />
      <ExportSection />
      <ImportCard />
      <ApiTokensSection />
      <LearnSection />
      <ChangelogSection />

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
  const { t } = useVoice();
  const { unit, setUnit } = useUnit();
  const { distanceUnit, setDistanceUnit } = useDistanceUnit();
  const { measurementUnit, setMeasurementUnit } = useMeasurementUnit();

  return (
    <Section
      title="Units"
      hint={t(
        "Display only — data is stored canonically (kg, meters, cm).",
        "Display only. Underneath, the frog keeps everything canonical (kg, meters, cm).",
      )}
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

// ── Voice ───────────────────────────────────────────────────────────────────

const REGISTERS: { label: string; value: Register }[] = [
  { label: "Human", value: "human" },
  { label: "Frog", value: "frog" },
  { label: "Ultrafrog", value: "ultra" },
];

function VoiceSection() {
  const { register, setRegister } = useRegister();
  const { t } = useVoice();

  return (
    <Section
      title="Voice"
      hint={t(
        "How the app talks. The numbers never change.",
        "How the frog talks. The numbers never change.",
      )}
    >
      <div className="mt-1 divide-y divide-border">
        <Row label="Register">
          <Segmented
            options={REGISTERS}
            value={register}
            onChange={setRegister}
            testid="voice-register"
          />
        </Row>
      </div>
    </Section>
  );
}

// ── Workouts ────────────────────────────────────────────────────────────────

function WorkoutsSection() {
  const { t } = useVoice();
  const { data: prefs } = useUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const qc = useQueryClient();

  const [smartScroll, setSmartScroll] = useSmartSupersetScroll();
  const [livePr, setLivePr] = useLivePrBanner();
  const [keepAwake, setKeepAwake] = useKeepAwake();

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
          hint={t(
            "Celebrate records the moment you beat them.",
            "The moment you beat a record, the frog will be, on that occasion, impressed.",
          )}
        >
          <Toggle on={livePr} onChange={setLivePr} testid="live-pr" />
        </Row>

        <Row
          label="Keep screen awake"
          hint="Hold the screen on during an active workout."
        >
          <Toggle on={keepAwake} onChange={setKeepAwake} testid="keep-awake" />
        </Row>
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

// ── Display (body diagram) ──────────────────────────────────────────────────

function DisplaySection() {
  const { data: prefs } = useUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const bodyDiagram = prefs?.bodyDiagram ?? "neutral";

  return (
    <Section title="Display">
      <div className="mt-1 divide-y divide-border">
        <Row label="Body diagram" hint="Figure used on the stats heat map.">
          <SelectField
            value={bodyDiagram}
            onChange={(v) => updatePrefs.mutate({ bodyDiagram: v })}
            testid="body-diagram-select"
            options={[{ value: "neutral", label: "Frog" }]}
          />
        </Row>
      </div>
    </Section>
  );
}

// ── Notifications + push ────────────────────────────────────────────────────

function NotificationsSection() {
  const { t } = useVoice();
  const repo = useRepo();
  const { permission, request } = useNotificationPermission();
  const { subscribed, refresh } = usePushSubscribed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = pushSupported();

  async function sendTest() {
    if (permission !== "granted") return;
    const body = voice(
      "Test notification",
      "Test notification. The frog cleared its throat.",
    );
    const reg = await swRegistration();
    if (reg) await reg.showNotification(APP_NAME, { body });
    else new Notification(APP_NAME, { body });
  }

  async function togglePush(on: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (on) {
        if (permission !== "granted") {
          const result = await request();
          if (result !== "granted") {
            setError(
              voice(
                "Notification permission is required for push.",
                "The frog cannot push without notification permission.",
              ),
            );
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
      hint={t(
        `Nothing in ${APP_NAME} sends an alert automatically yet — "Send test" is the only notification it posts today.`,
        "The frog has nothing to announce yet. Send a test and it croaks once; otherwise it sits still.",
      )}
    >
      <div className="mt-1 divide-y divide-border">
        <Row
          label="System notifications"
          hint={
            permission === "denied"
              ? "Blocked — re-enable in your browser settings."
              : permission === "unsupported"
                ? "Not supported on this device."
                : `Allow ${APP_NAME} to post notifications — only "Send test" posts one today.`
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
                  : "Registers this device for push. No sender is wired up yet, so nothing arrives."
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
  const { t } = useVoice();
  const { canInstall, promptInstall, installed, ios } = useInstallPrompt();
  if (installed) {
    return (
      <Section title="Install app">
        <p className="mt-1 text-2xs text-faint" data-testid="install-status">
          {t(
            `${APP_NAME} is installed on this device.`,
            `${APP_NAME} is installed. The frog lives here now.`,
          )}
        </p>
      </Section>
    );
  }
  return (
    <Section
      title="Install app"
      hint={t(
        `Add ${APP_NAME} to your home screen for a full-screen, app-like launch.`,
        `Add ${APP_NAME} to your home screen. Full screen, no browser chrome, one resident frog.`,
      )}
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
          Use your browser’s “Install app” menu option to add {APP_NAME}.
        </p>
      )}
    </Section>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportSection() {
  const { t } = useVoice();
  const repo = useRepo();
  const [exporting, setExporting] = useState<
    "json" | "csv" | "measurements" | null
  >(null);
  const exportingLabel = t("Exporting…", "The frog is exporting…");

  async function exportData(kind: "json" | "csv" | "measurements") {
    setExporting(kind);
    try {
      const bundle = await repo.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        download(
          `${APP_NAME.toLowerCase()}-export-${stamp}.json`,
          "application/json",
          JSON.stringify(bundle, null, 2),
        );
      } else if (kind === "csv") {
        download(
          `${APP_NAME.toLowerCase()}-sets-${stamp}.csv`,
          "text/csv",
          setsCsv(bundle),
        );
      } else {
        download(
          `${APP_NAME.toLowerCase()}-measurements-${stamp}.csv`,
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
      hint={t(
        "Your data, yours — full JSON graph, a flat CSV of every set, or your body measurements.",
        "Your data, yours. Full JSON graph, a flat CSV of every set, or your body measurements. The frog hoards nothing.",
      )}
    >
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("json")}
          data-testid="export-json-btn"
        >
          <Download className="size-4" />
          {exporting === "json" ? exportingLabel : "JSON"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("csv")}
          data-testid="export-csv-btn"
        >
          <Download className="size-4" />
          {exporting === "csv" ? exportingLabel : "sets.csv"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("measurements")}
          data-testid="export-measurements-btn"
        >
          <Download className="size-4" />
          {exporting === "measurements" ? exportingLabel : "measurements.csv"}
        </Button>
      </div>
    </Section>
  );
}

// ── API tokens (unchanged) ──────────────────────────────────────────────────

function ApiTokensSection() {
  const { t } = useVoice();
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
      hint={t(
        "Read-only access to your data for scripts, dashboards, and the MCP server.",
        "Read-only access to your data for scripts, dashboards, and the MCP server. Tokens can look, never touch.",
      )}
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
            {t(
              "This is shown once. Store it somewhere safe; only its hash is kept.",
              "This is shown once. Only its hash is kept — the frog has already forgotten it.",
            )}
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
    <li>
      <ListRow interactive={false} className="text-sm">
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
      </ListRow>
    </li>
  );
}

// ── Learn ───────────────────────────────────────────────────────────────────

function LearnSection() {
  const { t } = useVoice();
  return (
    <Section title="Learn">
      <div className="mt-1 divide-y divide-border">
        <Row
          label="Training tips"
          hint={t(
            "The short lessons behind the ⓘ icons, all in one place.",
            "Every short lesson the frog knows, all in one place.",
          )}
        >
          <Link
            to="/tips"
            className="flex h-8 items-center border border-border bg-surface px-3 text-xs font-medium transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
            data-testid="tips-link"
          >
            Browse
          </Link>
        </Row>
      </div>
    </Section>
  );
}

// ── Changelog ───────────────────────────────────────────────────────────────

function ChangelogSection() {
  const hasUnseen = useChangelogHasUnseen();
  return (
    <Section title="Changelog">
      <div className="mt-1 divide-y divide-border">
        <Row
          label="What's new"
          hint="Dev log of what shipped, pulled from docs/DECISIONS.md."
        >
          <span className="flex items-center gap-2">
            {hasUnseen && (
              <span
                className="size-1.5 bg-accent"
                data-testid="changelog-unseen-dot"
              />
            )}
            <Link
              to="/changelog"
              className="flex h-8 items-center border border-border bg-surface px-3 text-xs font-medium transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
              data-testid="changelog-link"
            >
              Browse
            </Link>
          </span>
        </Row>
      </div>
    </Section>
  );
}
