import {
  APP_NAME,
  type ApiToken,
  evidenceRule,
  measurementsCsv,
  setsCsv,
  USER_PREF_DEFAULTS,
  unitLabel,
  type WarmupStep,
} from "@frog/core";
import { Copy, DownloadSimple, Plus, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { Link } from "react-router";
import { ImportCard } from "@/components/import-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QueryState } from "@/components/ui/query-state";
import { Row as ListRow } from "@/components/ui/row";
import { Select } from "@/components/ui/select";
import { useSignOut } from "@/lib/auth";
import { useChangelogHasUnseen } from "@/lib/changelog-prefs";
import { formatDate } from "@/lib/format";
import {
  useResolvedUserPrefs,
  useUpdateUserPrefs,
  useUserPrefs,
} from "@/lib/profile-queries";
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
import { userFacingRepoError } from "@/lib/repo-error";
import {
  type DistanceUnit,
  type MeasurementUnit,
  type Unit,
  useDistanceUnit,
  useMeasurementUnit,
  useUnit,
} from "@/lib/settings";
import { useTheme } from "@/lib/theme";
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold text-soft">{title}</h2>
      {children}
    </section>
  );
}

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
    <div className="mt-4 rounded-md bg-surface p-4">
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
    <div className="inline-flex gap-0.5 rounded-md bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          data-testid={testid ? `${testid}-${o.value}` : undefined}
          className={cn(
            "rounded-sm px-3 py-1 text-xs font-medium transition-colors duration-150 ease-(--ease-out-quad)",
            value === o.value
              ? "bg-accent text-on-accent"
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
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger data-testid={testid} />
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

      <Group title="Training">
        <UnitsSection />
        <WorkoutsSection />
        <DisplaySection />
        <VoiceSection />
      </Group>

      <Group title="Coach">
        <CoachSection />
      </Group>

      <Group title="Data">
        <NotificationsSection />
        <InstallSection />
        <ExportSection />
        <ImportCard />
        <ApiTokensSection />
      </Group>

      <Group title="Account">
        <LearnSection />
        <ChangelogSection />
        <ReportSection />
        <Section title="Sign out">
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => void signOut()}
              data-testid="sign-out-btn"
            >
              Sign out
            </Button>
          </div>
        </Section>
      </Group>
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
      <div className="mt-1 [&>*+*]:mt-0.5">
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
      <div className="mt-1 [&>*+*]:mt-0.5">
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

  const { exerciseGrouping: grouping } = useResolvedUserPrefs();
  const previousScope = (prefs?.previousValuesScope ?? "any") as
    | "any"
    | "routine";
  // Boss preference (2026-11-13) + R6/R17b: warm-ups are excluded from stats
  // unless the user opted in; a saved row keeps its own value.
  const includeWarmups =
    prefs?.includeWarmupsInStats ?? USER_PREF_DEFAULTS.includeWarmupsInStats;

  function onWarmupsInStats(v: boolean) {
    updatePrefs.mutate({ includeWarmupsInStats: v });
    // Records + stats are computed under this flag — force a recompute so the
    // panels never disagree with the toggle (the pref is baked into the query key).
    void qc.invalidateQueries({ queryKey: ["records-data"] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  }

  return (
    <Section title="Workouts">
      <div className="mt-1 [&>*+*]:mt-0.5">
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
          label="Exercise grouping"
          hint={`How the library is organised. Joint action is the ${APP_NAME} default.`}
        >
          <Segmented
            options={[
              { label: "Joint action", value: "joint_action" as const },
              { label: "Region", value: "region" as const },
            ]}
            value={grouping}
            onChange={(v) => updatePrefs.mutate({ exerciseGrouping: v })}
            testid="exercise-grouping"
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
    <div className="mt-2 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Warm-up method</p>
        {isCustom && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            data-testid="warmup-reset"
          >
            Reset to default
          </Button>
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
  const { mode, setMode } = useTheme();

  return (
    <Section title="Display">
      <div className="mt-1 [&>*+*]:mt-0.5">
        <Row label="Appearance" hint="Device follows your phone or computer.">
          <Segmented
            options={[
              { label: "Device", value: "device" as const },
              { label: "Day", value: "day" as const },
              { label: "Night", value: "night" as const },
            ]}
            value={mode}
            onChange={setMode}
            testid="appearance"
          />
        </Row>
        <Row label="Body diagram" hint="Figure used on the stats heat map.">
          <SelectField
            value={bodyDiagram}
            onChange={(v) => updatePrefs.mutate({ bodyDiagram: v })}
            testid="body-diagram-select"
            options={[{ value: "neutral", label: "Default" }]}
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
      setError(userFacingRepoError(e));
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
      <div className="mt-1 [&>*+*]:mt-0.5">
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
          <DownloadSimple className="size-4" />
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
          <DownloadSimple className="size-4" />
          {exporting === "json" ? exportingLabel : "JSON"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("csv")}
          data-testid="export-csv-btn"
        >
          <DownloadSimple className="size-4" />
          {exporting === "csv" ? exportingLabel : "sets.csv"}
        </Button>
        <Button
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportData("measurements")}
          data-testid="export-measurements-btn"
        >
          <DownloadSimple className="size-4" />
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
  const tokensQ = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => repo.listApiTokens(),
  });
  const tokens = tokensQ.data ?? [];
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

      {(tokensQ.isPending || tokensQ.isLoadingError) && (
        <QueryState
          isLoading={tokensQ.isPending}
          isError={tokensQ.isLoadingError}
          error={tokensQ.error}
          onRetry={() => void tokensQ.refetch()}
        >
          {null}
        </QueryState>
      )}

      {tokens.length > 0 && (
        <ul className="mt-3 [&>*+*]:mt-0.5 overflow-hidden rounded-sm">
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
              className="min-w-0 flex-1 truncate rounded-sm bg-surface-2 px-2 py-1 num text-xs"
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

// ── How Frog decides ────────────────────────────────────────────────────────

function LearnSection() {
  const { t } = useVoice();
  return (
    <Section title={`How ${APP_NAME} decides`}>
      <div className="mt-1 [&>*+*]:mt-0.5">
        <Row
          label="Rules and evidence"
          hint={t(
            "Every rule the coach uses, its evidence tier and sources, plus the short lessons behind the ⓘ icons.",
            "Every rule the frog follows, with how strong the evidence is. Plus the short lessons.",
          )}
        >
          <Link
            to="/you/rules"
            className="flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-medium text-on-secondary transition-colors duration-150 ease-(--ease-out-quad) hover:bg-active md:h-8"
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
      <div className="mt-1 [&>*+*]:mt-0.5">
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
              className="flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-medium text-on-secondary transition-colors duration-150 ease-(--ease-out-quad) hover:bg-active md:h-8"
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

// ── Coach (F4/F10, redesign 8.10) ───────────────────────────────────────────

// Coach rules a user can switch off individually. Ids are the CoachRuleId
// values the engine suppresses on (coach/resolve.ts isDismissed); C2c is three
// engine ids behind one switch. Labels come from the evidence library so the
// wording here can never drift from the "How Frog decides" screen.
const COACH_TOGGLES: { label: string; ids: string[]; rule: string }[] = [
  {
    label: "Load progression",
    ids: ["C2c-progress", "C2c-overshoot"],
    rule: "C2c",
  },
  { label: "Stall check", ids: ["C2c-stall", "C2", "C3"], rule: "C2" },
  { label: "Missed-target notes", ids: ["C1"], rule: "C1" },
  { label: "Rep-target drift", ids: ["C4", "C5", "C4/C5"], rule: "C4" },
  { label: "Readiness", ids: ["C7", "C9b", "C9d", "C10"], rule: "C7" },
  { label: "Deload and restart", ids: ["C14", "C15"], rule: "C14" },
  { label: "Weekly volume band", ids: ["C11", "C12"], rule: "C11" },
  { label: "Pre-workout carbs", ids: ["C19"], rule: "C19" },
];

function CoachSection() {
  const prefs = useResolvedUserPrefs();
  const update = useUpdateUserPrefs();
  const off = new Set(prefs.coachRulesOff);

  function setGroup(ids: string[], on: boolean) {
    const next = new Set(off);
    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    update.mutate({ coachRulesOff: [...next] });
  }

  return (
    <Section
      title="Coach"
      hint="Quiet suggestions on Today and in your workout. Nothing changes your plan unless you apply it."
    >
      <div className="mt-1 [&>*+*]:mt-0.5">
        <Row
          label="Coach suggestions"
          hint="Master switch for every rule below."
        >
          <Toggle
            on={prefs.coachEnabled}
            onChange={(v) => update.mutate({ coachEnabled: v })}
            testid="coach-enabled"
          />
        </Row>
        <Row
          label="Evidence labels"
          hint="Show the T1 to T5 badge next to a suggestion."
        >
          <Toggle
            on={prefs.showEvidenceLabels}
            onChange={(v) => update.mutate({ showEvidenceLabels: v })}
            testid="evidence-labels"
          />
        </Row>
        {prefs.coachEnabled &&
          COACH_TOGGLES.map((g) => (
            <Row
              key={g.label}
              label={g.label}
              hint={evidenceRule(g.rule)?.plain}
            >
              <Toggle
                on={!g.ids.some((id) => off.has(id))}
                onChange={(v) => setGroup(g.ids, v)}
                testid={`coach-rule-${g.rule}-${g.label}`}
              />
            </Row>
          ))}
      </div>
    </Section>
  );
}

// ── Report a problem ────────────────────────────────────────────────────────

const ISSUES_URL = "https://github.com/ollie88skwda/frog/issues/new";

function ReportSection() {
  return (
    <Section title="Report a problem">
      <div className="mt-1">
        <Row
          label="Something wrong?"
          hint="Opens a GitHub issue form. Don't paste personal data."
        >
          <a
            href={`${ISSUES_URL}?title=${encodeURIComponent(`${APP_NAME}: `)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-sm bg-secondary px-3 text-xs font-medium text-on-secondary transition-colors duration-150 hover:bg-active md:h-8"
            data-testid="report-problem"
          >
            Report
          </a>
        </Row>
      </div>
    </Section>
  );
}
