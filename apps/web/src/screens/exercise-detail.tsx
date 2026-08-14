import {
  ACTION_RATINGS,
  buildExerciseRecordsCard,
  EQUIPMENT_LABELS,
  EXERCISE_TYPE_LABELS,
  type Exercise,
  type ExerciseRecords,
  type ExerciseType,
  epley,
  formatDistance,
  formatWeight,
  hasSetRecords,
  jointActionLabel,
  muscleLabel,
  PR_TYPE_LABELS,
  PR_TYPES_BY_EXERCISE_TYPE,
  type PrType,
  type RecordEntry,
  type RecordsSessionInput,
  type RecordsSetInput,
  ratingsForExercise,
  toDisplayDistance,
  toDisplayWeight,
  topRecordValue,
  unitLabel,
} from "@frog/core";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  CartesianGrid,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";
import { ExerciseThumb, TierBadge } from "@/components/anatomy-ui";
import { ExerciseEditor } from "@/components/exercise-editor";
import { ShareButton } from "@/components/share-sheet";
import { BackButton } from "@/components/ui/back-button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { IconButton } from "@/components/ui/icon-button";
import { rowClass } from "@/components/ui/row";
import { formatDate, formatDateTime, formatMMSS } from "@/lib/format";
import { useUserPrefs } from "@/lib/profile-queries";
import {
  copyExerciseOpts,
  useCreateExercise,
  useExercise,
} from "@/lib/queries";
import { type RecordsData, useRecordsData } from "@/lib/records-queries";
import {
  type DistanceUnit,
  distanceUnitFor,
  type Unit,
  useUnit,
} from "@/lib/settings";
import { trendYDomain } from "@/lib/trend-domain";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

type Tab = "summary" | "history" | "howto";
type Range = "3m" | "1y" | "all";
const RANGE_MS: Record<Range, number | null> = {
  "3m": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
  all: null,
};
const RANGE_LABELS: Record<Range, string> = {
  "3m": "3 months",
  "1y": "1 year",
  all: "All time",
};

export default function ExerciseDetailScreen() {
  const { t } = useVoice();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const {
    data: exercise,
    isLoading: exLoading,
    isPlaceholderData,
  } = useExercise(id);
  const { data: recordsData, isLoading: recLoading } = useRecordsData();
  const { unit } = useUnit();
  const [tab, setTab] = useState<Tab>("summary");

  if (exLoading || recLoading) {
    return (
      <p className="mx-auto max-w-2xl px-4 py-10 text-center text-xs text-faint">
        {t("Loading…", "The frog is thinking…")}
      </p>
    );
  }
  if (!exercise) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-soft">
          {t(
            "Exercise not found.",
            "Specimen not found. The frog checked twice.",
          )}
        </p>
        <Link to="/library" className="mt-2 inline-block text-xs text-accent">
          Back to library
        </Link>
      </div>
    );
  }

  const type = (exercise.exerciseType as ExerciseType) ?? "weight_reps";
  const primary = exercise.muscleTargets?.[0]?.muscle;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 md:pb-6">
      <div className="flex items-start gap-3">
        <BackButton
          onClick={() => navigate(-1)}
          label="Back"
          data-testid="exercise-detail-back"
        />
        <ExerciseThumb
          imageUrl={exercise.imageUrl}
          name={exercise.name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1
            className="text-lg font-semibold tracking-tight"
            data-testid="exercise-detail-name"
          >
            {exercise.name}
          </h1>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-2xs text-faint">
            <span>{EXERCISE_TYPE_LABELS[type]}</span>
            {exercise.equipment && (
              <span>
                ·{" "}
                {
                  EQUIPMENT_LABELS[
                    exercise.equipment as keyof typeof EQUIPMENT_LABELS
                  ]
                }
              </span>
            )}
            {primary && <span>· {muscleLabel(primary)}</span>}
          </p>
        </div>
        <MoreMenu exercise={exercise} partial={isPlaceholderData} />
      </div>

      <div className="mt-4 flex gap-1">
        {(["summary", "history", "howto"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-9 flex-1 text-xs transition-colors duration-150",
              tab === t
                ? "bg-accent-soft text-accent"
                : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
            )}
            data-testid={`tab-${t}`}
          >
            {t === "summary"
              ? "Summary"
              : t === "history"
                ? "History"
                : "How-to"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "summary" && (
          <SummaryTab
            exercise={exercise}
            type={type}
            data={recordsData}
            unit={unit}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            exerciseId={exercise.id}
            type={type}
            data={recordsData}
            unit={unit}
          />
        )}
        {tab === "howto" && (
          <HowToTab exercise={exercise} partial={isPlaceholderData} />
        )}
      </div>
    </div>
  );
}

// ── Summary: metric-chip line chart + records panel + set records ────────────
function SummaryTab({
  exercise,
  type,
  data,
  unit,
}: {
  exercise: Exercise;
  type: ExerciseType;
  data: RecordsData | undefined;
  unit: Unit;
}) {
  const { t } = useVoice();
  const distUnit = distanceUnitFor(unit);
  const metrics = useMemo(() => chartMetricsFor(type), [type]);
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? "");
  const [range, setRange] = useState<Range>("3m");
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const sessions = data?.history ?? [];
  const includeWarmups = data?.includeWarmups ?? true;
  const records = data?.records.byExercise.get(exercise.id);

  // Per-session scalar for the active metric, over sessions in the range that
  // contain this exercise. Chronological → the line reads left (old) to right.
  const points: Array<{ x: number; y: number }> = useMemo(() => {
    if (!metric) return [];
    const cutoff = RANGE_MS[range];
    const min = cutoff == null ? 0 : Date.now() - cutoff;
    const out: Array<{ x: number; y: number }> = [];
    for (const s of sessions) {
      if (s.startedAt < min) continue;
      const sets = setsFor(s, exercise.id, includeWarmups);
      if (!sets) continue;
      const v = metric.compute(sets);
      if (v != null) out.push({ x: s.startedAt, y: v });
    }
    return out;
  }, [metric, range, sessions, exercise.id, includeWarmups]);

  const latest = points.length ? points[points.length - 1].y : null;

  // The trend tooltip's series label follows the active metric chip.
  const summaryConfig: ChartConfig = {
    y: { label: metric?.label ?? "Value", color: "var(--accent)" },
  };

  // Records sparkline for the share card's graphic — independent of the
  // metric chip above (always the type's headline PR metric: e1RM for
  // weighted types, reps/time/distance otherwise), last 12 sessions
  // containing this exercise.
  const recordsSparkline = useMemo(() => {
    const out: Array<{ at: number; value: number }> = [];
    for (const s of sessions) {
      const sets = setsFor(s, exercise.id, includeWarmups);
      if (!sets) continue;
      let best: number | null = null;
      for (const set of sets) {
        const v = sparklineSetValue(type, set);
        if (v != null && (best == null || v > best)) best = v;
      }
      if (best != null) out.push({ at: s.startedAt, value: best });
    }
    return out.slice(-12);
  }, [sessions, exercise.id, includeWarmups, type]);

  return (
    <div>
      {/* Metric chips */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetricKey(m.key)}
            className={cn(
              "h-9 shrink-0 whitespace-nowrap px-3 text-xs transition-colors duration-150",
              m.key === metricKey
                ? "bg-accent-soft text-accent"
                : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
            )}
            data-testid={`metric-chip-${m.key}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-3 border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{metric?.label}</span>
          <span className="num text-sm text-soft" data-testid="summary-latest">
            {latest == null || !metric
              ? "—"
              : metricFull(metric.kind, latest, unit, distUnit)}
          </span>
        </div>
        {metric && (
          <div className="mt-2">
            {points.length === 0 ? (
              <div
                className="flex h-42 items-center justify-center text-xs text-faint"
                data-testid="summary-chart"
              >
                {t(
                  "No data yet.",
                  "No data yet. The frog refuses to speculate.",
                )}
              </div>
            ) : (
              <ChartContainer
                config={summaryConfig}
                className="h-42 w-full"
                role="img"
                aria-label={`${metric.label} trend`}
                data-testid="summary-chart"
              >
                <RechartsLineChart
                  data={points}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={6}
                    tickCount={3}
                    tickFormatter={(v) => formatDate(Number(v))}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    domain={trendYDomain(points)}
                    tickFormatter={(v) =>
                      metricTick(metric.kind, v, unit, distUnit)
                    }
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_, payload) =>
                          formatDate(payload?.[0]?.payload?.x)
                        }
                        valueFormatter={(v) =>
                          metricTick(metric.kind, Number(v), unit, distUnit)
                        }
                      />
                    }
                  />
                  <RechartsLine
                    dataKey="y"
                    type="monotone"
                    stroke="var(--color-y)"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, strokeWidth: 0, fill: "var(--color-y)" }}
                  />
                </RechartsLineChart>
              </ChartContainer>
            )}
          </div>
        )}
        {/* Range selector — ungated (no Pro cap, scope decision #4). */}
        <div className="mt-2 flex gap-1">
          {(["3m", "1y", "all"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "h-8 flex-1 text-2xs transition-colors duration-150",
                range === r
                  ? "bg-accent-soft text-accent"
                  : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
              )}
              data-testid={`range-${r}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <RecordsPanel
        type={type}
        exerciseName={exercise.name}
        records={records}
        unit={unit}
        distUnit={distUnit}
        sparkline={recordsSparkline}
      />
      {hasSetRecords(type) && <SetRecordsTable records={records} unit={unit} />}
    </div>
  );
}

function RecordsPanel({
  type,
  exerciseName,
  records,
  unit,
  distUnit,
  sparkline,
}: {
  type: ExerciseType;
  exerciseName: string;
  records: ExerciseRecords | undefined;
  unit: Unit;
  distUnit: DistanceUnit;
  sparkline: Array<{ at: number; value: number }>;
}) {
  const { t } = useVoice();
  const { data: prefs } = useUserPrefs();
  const prTypes = PR_TYPES_BY_EXERCISE_TYPE[type] ?? [];
  const bests = prTypes
    .map((pr) => ({ pr, entry: records?.bests[pr] }))
    .filter((r): r is { pr: PrType; entry: RecordEntry } => r.entry != null);
  const card = useMemo(
    () =>
      records
        ? buildExerciseRecordsCard({
            exerciseName,
            type,
            records,
            unit,
            distUnit,
            sparkline,
            identity: { displayName: prefs?.displayName ?? null },
          })
        : null,
    [records, exerciseName, type, unit, distUnit, sparkline, prefs],
  );
  const source = useMemo(
    () => (card ? { kind: "static" as const, card } : null),
    [card],
  );

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
          Records
        </h2>
        {source && (
          <ShareButton
            source={source}
            filename={`records-${exerciseName.toLowerCase().replace(/\s+/g, "-")}`}
            testId="records-share-btn"
            variant="ghost"
            size="icon"
            label={null}
          />
        )}
      </div>
      {bests.length === 0 ? (
        <p className="mt-2 text-xs text-faint" data-testid="records-empty">
          {t(
            "No records yet — log a few sessions to set your first.",
            "No records yet. The frog refuses to speculate — log a few sessions to set your first.",
          )}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border border border-border bg-surface">
          {bests.map(({ pr, entry }) => (
            <li key={pr}>
              <Link
                to={`/history/${entry.sessionId}`}
                className={rowClass()}
                data-testid={`record-${pr}`}
              >
                <span className="text-xs text-soft">{PR_TYPE_LABELS[pr]}</span>
                <span className="flex items-center gap-2">
                  <span className="num text-sm">
                    {formatPrValue(pr, entry.value, unit, distUnit)}
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetRecordsTable({
  records,
  unit,
}: {
  records: ExerciseRecords | undefined;
  unit: Unit;
}) {
  const { t } = useVoice();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const map = records?.setRecords;
    if (!map) return [];
    return [...map.entries()]
      .map(([reps, r]) => ({ reps, ...r }))
      .sort((a, b) => a.reps - b.reps);
  }, [records]);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        data-testid="set-records-toggle"
      >
        {open ? (
          <ChevronDown className="size-4 text-faint" />
        ) : (
          <ChevronRight className="size-4 text-faint" />
        )}
        <span className="text-2xs font-medium tracking-widest text-faint uppercase">
          Set records
        </span>
        <span className="num text-2xs text-faint">{rows.length}</span>
      </button>
      {open &&
        (rows.length === 0 ? (
          <p className="mt-2 text-xs text-faint">
            {t(
              "Heaviest weight per rep count appears here once you log weighted sets.",
              "Heaviest weight per rep count appears here once you log weighted sets. The frog waits.",
            )}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.reps} data-testid={`set-record-${r.reps}`}>
                <Link to={`/history/${r.sessionId}`} className={rowClass()}>
                  <span className="num text-xs text-soft">{r.reps} reps</span>
                  <span className="num text-sm">
                    {formatWeight(r.weightKg, unit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

// ── History: chronological sessions with per-set breakdowns ──────────────────
function HistoryTab({
  exerciseId,
  type,
  data,
  unit,
}: {
  exerciseId: string;
  type: ExerciseType;
  data: RecordsData | undefined;
  unit: Unit;
}) {
  const { t } = useVoice();
  const distUnit = distanceUnitFor(unit);
  // Newest first (history arrives ascending).
  const sessions = (data?.history ?? [])
    .filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId))
    .slice()
    .reverse();

  if (sessions.length === 0) {
    return (
      <p className="text-xs text-faint" data-testid="history-empty">
        {t(
          "No sessions with this exercise yet.",
          "No sessions with this specimen yet.",
        )}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sessions.map((s) => {
        const block = s.exercises.find((e) => e.exerciseId === exerciseId);
        const sets = block?.sets ?? [];
        return (
          <li key={s.sessionId} className="border border-border bg-surface">
            <Link
              to={`/history/${s.sessionId}`}
              className="flex items-center justify-between border-b border-border px-4 py-2 transition-colors duration-150 hover:bg-surface-hover"
              data-testid={`history-session-${s.sessionId}`}
            >
              <span className="num text-xs text-soft">
                {formatDateTime(s.startedAt)}
              </span>
              <ChevronRight className="size-4 text-faint" />
            </Link>
            <ul className="px-4 py-2">
              {sets.map((set, i) => {
                // Read-only history: sets carry no stable id and never reorder,
                // so a positional key is correct. Derived to a variable to keep
                // the raw index out of the JSX key (lint).
                const rowKey = `set-${i}`;
                return (
                  <li
                    key={rowKey}
                    className="num flex items-center gap-2 py-0.5 text-xs text-soft"
                  >
                    <span className="w-5 text-faint">
                      {set.setNo + 1}
                      {set.side === "left"
                        ? "ᴸ"
                        : set.side === "right"
                          ? "ᴿ"
                          : ""}
                    </span>
                    <span>{formatSet(type, set, unit, distUnit)}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

// ── How-to: frames + numbered steps + "why it's rated" science ───────────────
function HowToTab({
  exercise,
  partial,
}: {
  exercise: Exercise;
  /** True while `exercise` is still the narrow list row (LIST_COLUMNS), which
   * carries neither instructions nor imageUrls — absent ≠ empty until the full
   * row lands, so the empty state must wait. */
  partial: boolean;
}) {
  const { t } = useVoice();
  const frames = exercise.imageUrls ?? [];
  const steps = exercise.instructions ?? [];
  const ratings = ratingsForExercise(exercise).filter((r) => r.tier != null);

  return (
    <div className="flex flex-col gap-4">
      {frames.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {frames.map((url) => (
            <span
              key={url}
              className="flex items-center justify-center border border-border bg-white"
            >
              <img
                src={url}
                alt={exercise.name}
                loading="lazy"
                className="max-h-56 w-full object-contain"
              />
            </span>
          ))}
        </div>
      )}

      {steps.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-xs text-soft">
              <span className="num shrink-0 text-faint">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : partial ? (
        <p className="text-xs text-faint" data-testid="howto-loading">
          {t("Loading…", "The frog is thinking…")}
        </p>
      ) : (
        <p className="text-xs text-faint" data-testid="howto-empty">
          {t(
            "No instructions for this exercise yet.",
            "No instructions. The frog assumes you know what you are doing.",
          )}
        </p>
      )}

      {ratings.length > 0 && (
        <div className="border-t border-border pt-3">
          <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
            Why it's rated
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {ratings.map((r) => {
              const rating = ACTION_RATINGS.find(
                (a) => a.jointAction === r.jointAction && a.muscle === r.muscle,
              );
              return (
                <li key={r.jointAction} className="flex items-start gap-2">
                  {r.tier && <TierBadge tier={r.tier} />}
                  <span className="min-w-0 text-xs">
                    <span className="text-ink">
                      {jointActionLabel(r.jointAction)}
                      {r.muscle && (
                        <span className="text-faint">
                          {" "}
                          · {muscleLabel(r.muscle)}
                        </span>
                      )}
                    </span>
                    {rating?.note && (
                      <span className="mt-0.5 block text-2xs text-soft">
                        {rating.note}
                      </span>
                    )}
                    {rating?.citations && rating.citations.length > 0 && (
                      <span className="mt-0.5 block truncate text-2xs text-faint">
                        {rating.citations.join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── ⋯ menu: edit (custom) / duplicate exercise ──────────────────────────────
function MoreMenu({
  exercise,
  partial,
}: {
  exercise: Exercise;
  /** True while `exercise` is still the narrow list row (LIST_COLUMNS): the
   * screen paints off that placeholder, and it has no instructions/imageUrls
   * to copy. Edit is unaffected — the sheet fetches the full row itself. */
  partial: boolean;
}) {
  const create = useCreateExercise();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // Clone into a fresh custom exercise with NO history (Hevy: the "reset an
  // exercise's stats" mechanism). Same exercise design, fresh history: every
  // field the editor writes is carried except `aliases` — two rows sharing an
  // alias would make `matchExerciseName` ambiguous for voice/paste logging.
  // share: false — a fork is a private copy, never a publish
  // (docs/DECISIONS.md 2026-08-08).
  async function duplicate() {
    setOpen(false);
    const copy = await create.mutateAsync({
      name: `${exercise.name} (copy)`,
      opts: { ...copyExerciseOpts(exercise), share: false },
    });
    navigate(`/exercises/${copy.id}`);
  }

  return (
    <div className="relative">
      <IconButton
        onClick={() => setOpen((o) => !o)}
        title="More"
        data-testid="exercise-more"
      >
        <MoreVertical className="size-4" />
      </IconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full right-0 z-20 mt-1 min-w-40 py-1">
            {/* Edit is for the user's own custom rows only — shared rows
                (isCustom true, ownerId null) are RLS-immutable, same as
                seeds, so the menu drops to Duplicate for them. */}
            {exercise.isCustom && exercise.ownerId !== null && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                data-testid="exercise-edit"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
            )}
            <button
              type="button"
              disabled={partial}
              title={partial ? "Still loading this exercise" : undefined}
              onClick={() => void duplicate()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-soft"
              data-testid="exercise-duplicate"
            >
              <Copy className="size-3.5" />
              {/* Seed rows are immutable book data — "duplicate" undersells
                  that this is the only way to get an editable copy. Custom
                  rows keep the literal label since they're also editable
                  directly (see the Edit action above); shared community rows
                  are equally immutable, so their fork says what it does. */}
              {exercise.isCustom && exercise.ownerId === null
                ? "Make a private copy"
                : exercise.isCustom
                  ? "Duplicate exercise"
                  : "Customise this exercise"}
            </button>
          </div>
        </>
      )}
      <ExerciseEditor
        open={editing}
        onOpenChange={setEditing}
        mode="edit"
        exercise={exercise}
      />
    </div>
  );
}

// ── Metric config + formatting ───────────────────────────────────────────────
type MetricKind = "weight" | "reps" | "time" | "distance" | "pace";
type ChartMetric = {
  key: string;
  label: string;
  kind: MetricKind;
  compute: (sets: RecordsSetInput[]) => number | null;
};

const maxVal = (
  sets: RecordsSetInput[],
  fn: (s: RecordsSetInput) => number | null,
) => {
  let m: number | null = null;
  for (const s of sets) {
    const v = fn(s);
    if (v != null && (m == null || v > m)) m = v;
  }
  return m;
};
const sumVal = (
  sets: RecordsSetInput[],
  fn: (s: RecordsSetInput) => number | null,
) => {
  let t = 0;
  let any = false;
  for (const s of sets) {
    const v = fn(s);
    if (v != null) {
      t += v;
      any = true;
    }
  }
  return any ? t : null;
};

const heaviest = (s: RecordsSetInput) =>
  s.weightKg != null && s.weightKg > 0 ? s.weightKg : null;
const setVol = (s: RecordsSetInput) =>
  s.weightKg != null && s.weightKg > 0 && s.reps != null && s.reps >= 1
    ? s.weightKg * s.reps
    : null;
const repsOf = (s: RecordsSetInput) =>
  s.reps != null && s.reps >= 1 ? s.reps : null;
const durOf = (s: RecordsSetInput) =>
  s.durationSec != null && s.durationSec > 0 ? s.durationSec : null;
const distOf = (s: RecordsSetInput) =>
  s.distanceM != null && s.distanceM > 0 ? s.distanceM : null;
const paceOf = (s: RecordsSetInput) =>
  s.distanceM != null &&
  s.distanceM > 0 &&
  s.durationSec != null &&
  s.durationSec > 0
    ? s.distanceM / s.durationSec
    : null;

const M_WEIGHT: ChartMetric = {
  key: "heaviest_weight",
  label: "Heaviest weight",
  kind: "weight",
  compute: (s) => maxVal(s, heaviest),
};
const M_E1RM: ChartMetric = {
  key: "best_e1rm",
  label: "Best 1RM (est.)",
  kind: "weight",
  compute: (s) =>
    maxVal(s, (x) =>
      x.weightKg != null && x.weightKg > 0 && x.reps != null && x.reps >= 1
        ? epley(x.weightKg, x.reps)
        : null,
    ),
};
const M_SET_VOL: ChartMetric = {
  key: "best_set_volume",
  label: "Best set volume",
  kind: "weight",
  compute: (s) => maxVal(s, setVol),
};
const M_SESSION_VOL: ChartMetric = {
  key: "session_volume",
  label: "Session volume",
  kind: "weight",
  compute: (s) => sumVal(s, setVol),
};
const M_TOTAL_REPS: ChartMetric = {
  key: "total_reps",
  label: "Total reps",
  kind: "reps",
  compute: (s) => sumVal(s, repsOf),
};
const M_MOST_REPS: ChartMetric = {
  key: "most_reps_set",
  label: "Most reps (set)",
  kind: "reps",
  compute: (s) => maxVal(s, repsOf),
};
const M_SESSION_REPS: ChartMetric = {
  key: "session_reps",
  label: "Session reps",
  kind: "reps",
  compute: (s) => sumVal(s, repsOf),
};
const M_BEST_TIME: ChartMetric = {
  key: "best_time",
  label: "Best time",
  kind: "time",
  compute: (s) => maxVal(s, durOf),
};
const M_LONGEST_TIME: ChartMetric = {
  key: "longest_time",
  label: "Longest time",
  kind: "time",
  compute: (s) => maxVal(s, durOf),
};
const M_LONGEST_DIST: ChartMetric = {
  key: "longest_distance",
  label: "Longest distance",
  kind: "distance",
  compute: (s) => maxVal(s, distOf),
};
const M_BEST_PACE: ChartMetric = {
  key: "best_pace",
  label: "Best pace",
  kind: "pace",
  compute: (s) => maxVal(s, paceOf),
};

const METRICS_BY_TYPE: Record<ExerciseType, ChartMetric[]> = {
  weight_reps: [M_WEIGHT, M_E1RM, M_SET_VOL, M_SESSION_VOL, M_TOTAL_REPS],
  weighted_bodyweight: [M_WEIGHT, M_SET_VOL, M_SESSION_VOL, M_TOTAL_REPS],
  bodyweight_reps: [M_MOST_REPS, M_SESSION_REPS],
  assisted_bodyweight: [M_MOST_REPS, M_SESSION_REPS],
  duration: [M_BEST_TIME],
  weight_duration: [M_BEST_TIME, M_WEIGHT],
  distance_duration: [M_BEST_PACE, M_LONGEST_DIST, M_LONGEST_TIME],
  weight_distance: [M_WEIGHT, M_LONGEST_DIST],
};

function chartMetricsFor(type: ExerciseType): ChartMetric[] {
  return METRICS_BY_TYPE[type] ?? METRICS_BY_TYPE.weight_reps;
}

// Compact number for the chart axis/readout (no unit).
function metricTick(
  kind: MetricKind,
  v: number,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (kind) {
    case "weight":
      return String(toDisplayWeight(v, unit));
    case "reps":
      return String(Math.round(v));
    case "time":
      return formatMMSS(v);
    case "distance":
      return String(toDisplayDistance(v, distUnit));
    case "pace":
      return String(toDisplayDistance(v * 3600, distUnit));
  }
}
// Full value with unit for the headline readout.
function metricFull(
  kind: MetricKind,
  v: number,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  const n = metricTick(kind, v, unit, distUnit);
  switch (kind) {
    case "weight":
      return `${n} ${unitLabel(unit)}`;
    case "reps":
      return `${n} reps`;
    case "time":
      return n;
    case "distance":
      return `${n} ${distUnit}`;
    case "pace":
      return `${n} ${distUnit}/h`;
  }
}

// PR value formatting per PR type (records panel).
function formatPrValue(
  pr: PrType,
  v: number,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (pr) {
    case "heaviest_weight":
    case "best_e1rm":
    case "best_set_volume":
    case "best_session_volume":
      return formatWeight(v, unit);
    case "best_set_reps":
    case "best_session_reps":
      return `${Math.round(v)} reps`;
    case "best_time":
      return formatMMSS(v);
    case "longest_distance":
      return formatDistance(v, distUnit);
    case "best_pace":
      return `${toDisplayDistance(v * 3600, distUnit)} ${distUnit}/h`;
  }
}

// One set's breakdown line in the history tab, per exercise type.
function formatSet(
  type: ExerciseType,
  s: RecordsSetInput,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  const parts: string[] = [];
  if (type === "distance_duration") {
    if (s.distanceM != null) parts.push(formatDistance(s.distanceM, distUnit));
    if (s.durationSec != null) parts.push(formatMMSS(s.durationSec));
    return parts.join(" · ") || "—";
  }
  if (type === "weight_distance") {
    if (s.weightKg != null) parts.push(formatWeight(s.weightKg, unit));
    if (s.distanceM != null) parts.push(formatDistance(s.distanceM, distUnit));
    return parts.join(" · ") || "—";
  }
  if (type === "duration") {
    return s.durationSec != null ? formatMMSS(s.durationSec) : "—";
  }
  if (type === "weight_duration") {
    if (s.weightKg != null) parts.push(formatWeight(s.weightKg, unit));
    if (s.durationSec != null) parts.push(formatMMSS(s.durationSec));
    return parts.join(" · ") || "—";
  }
  if (type === "bodyweight_reps") {
    return s.reps != null ? `${s.reps} reps` : "—";
  }
  // weight_reps, weighted_bodyweight, assisted_bodyweight
  if (s.weightKg != null && s.reps != null)
    return `${formatWeight(s.weightKg, unit)} × ${s.reps}`;
  if (s.reps != null) return `${s.reps} reps`;
  return "—";
}

// Sets this session logged for the exercise, warm-up-filtered to match records.
function setsFor(
  session: RecordsSessionInput,
  exerciseId: string,
  includeWarmups: boolean,
): RecordsSetInput[] | null {
  const block = session.exercises.find((e) => e.exerciseId === exerciseId);
  if (!block) return null;
  return includeWarmups
    ? block.sets
    : block.sets.filter((s) => s.setType !== "warmup");
}

/** The records sparkline's per-set scalar: e1RM for weighted types (weight +
 * reps), else whatever raw metric backs that type's top records (reps / time
 * / distance — see `topRecordValue`). */
function sparklineSetValue(
  type: ExerciseType,
  set: RecordsSetInput,
): number | null {
  if (hasSetRecords(type)) {
    if (set.weightKg == null || set.reps == null || set.reps < 1) return null;
    return epley(set.weightKg, set.reps);
  }
  return topRecordValue(type, set);
}
