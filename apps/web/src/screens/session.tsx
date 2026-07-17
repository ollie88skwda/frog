import {
  adjustRest,
  checkSetForPR,
  computeRecords,
  type Exercise,
  type ExerciseRecords,
  type ExerciseType,
  e1rmFromEffort,
  formatPrevious,
  formatWeight,
  type GhostSet,
  ghostFor,
  groupByPrimaryMuscle,
  isBarLoaded,
  kgToLb,
  kmToM,
  type LoggedSet,
  lbToKg,
  type Machine,
  type Metric,
  miToM,
  type NewRoutineInput,
  newId,
  type PlateConfig,
  previousCells,
  type RestTimerState,
  type RoutineDetail,
  SET_TYPE_LABELS,
  SET_TYPE_MARKERS,
  SET_TYPES,
  type Session,
  type SetType,
  shouldStartRest,
  startRest,
  supportsEffort,
  type Tier,
  TYPE_FIELDS,
  toDisplayDistance,
  toDisplayWeight,
  unitLabel,
  warmupSets,
  weightLabel,
} from "@sbl/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  ChevronDown,
  Flame,
  History,
  Link2,
  Medal,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Play,
  Plus,
  Settings2,
  Square,
  Timer,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ExerciseRibbon, ExerciseThumb } from "@/components/anatomy-ui";
import { ConditionsChip } from "@/components/conditions";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { InfoTip } from "@/components/lesson";
import { MachineEditor } from "@/components/machines";
import { PlateSheet } from "@/components/session/plate-sheet";
import { PrBanner, type PrBannerData } from "@/components/session/pr-banner";
import { RestCountdown } from "@/components/session/rest-countdown";
import {
  FinishPhotoStrip,
  type PendingPhoto,
} from "@/components/session-photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusRing } from "@/components/ui/status-ring";
import { formatDurationSeconds, formatMMSS, parseDuration } from "@/lib/format";
import { useHotkeys } from "@/lib/hotkeys";
import { useUpdateUserPrefs, useUserPrefs } from "@/lib/profile-queries";
import {
  useExercisePrefs,
  useExercises,
  useGhost,
  useLastNote,
  useLastSets,
  useMachines,
  useMetrics,
  useSession,
  useSessionExercises,
  useSetExerciseWeightUnit,
} from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { useRoutineDetail } from "@/lib/routine-queries";
import {
  clearDraft,
  type DraftSnapshot,
  loadDraft,
  saveDraft,
} from "@/lib/session-draft";
import {
  type DistanceUnit,
  distanceUnitFor,
  type Unit,
  useUnit,
} from "@/lib/settings";
import { alertRestDone, playRestBlip } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { voice } from "@/lib/voice";
import { getWarmupMethod } from "@/lib/warmup-method";
import {
  useKeepAwake,
  useLivePrBanner,
  useRestSoundVolume,
  useSmartSupersetScroll,
} from "@/lib/workout-prefs";

type BlockState = {
  seId: string;
  exerciseId: string;
  name: string;
  // Provenance from a routine-started session (null = ad-hoc / empty workout).
  routineExerciseId: string | null;
  // Superset grouping (int id shared by members; null = solo). Rest-countdown
  // target seconds (null = fall back to the user's default). Per-exercise
  // session note (distinct from the routine template note).
  supersetGroup: number | null;
  restSec: number | null;
  note: string | null;
  committed: LoggedSet[];
};

// Context an ExerciseBlock hands up on set completion, so the screen can run the
// PR check + rest-timer + smart-scroll without re-deriving per-block facts.
type CommitCtx = {
  exerciseType: string;
  // Planned type of the set that will follow (routine seed at the next index),
  // used for drop-set rest suppression.
  nextSetType: string | null;
};

// Four accent-tinted left-border colors keyed to a superset group's slot, so
// grouped exercises read as one unit (accent-monochrome: lightness steps of
// the accent, not separate hues).
const SUPERSET_COLORS = [
  "var(--accent)",
  "color-mix(in oklab, var(--accent) 62%, var(--surface))",
  "color-mix(in oklab, var(--accent) 88%, black)",
  "color-mix(in oklab, var(--accent) 40%, var(--surface))",
];

type CommitInput = Omit<LoggedSet, "id" | "setNo" | "restSec"> & {
  metricValues?: Record<string, unknown> | null;
  restSec?: number | null;
};

export type SetPatch = {
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rir?: number | null;
  rpe?: number | null;
  note?: string | null;
  setType?: SetType;
};

// Per-set-index seed for the draft row: routine targets (weights/reps/rep-range
// placeholder) OR the source sets when copying a workout. Both pre-populate the
// active row; the draft grid is seeded per index as the user advances.
export type SeedSet = {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repsMax: number | null; // non-null ⇒ rep range (placeholder only, never seeded as a value)
  durationSec: number | null;
  distanceM: number | null;
};

// mm:ss for a rest duration in whole seconds.
function formatRest(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ms epoch → "YYYY-MM-DDTHH:mm" (local) for a datetime-local input.
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Which logging columns an exercise type shows, left→right. Weight first, then
// distance, time, reps — the natural order for every type (e.g. WEIGHT | REPS,
// DISTANCE | TIME, WEIGHT | DISTANCE). See TYPE_FIELDS in @sbl/core.
type ColKey = "weight" | "reps" | "duration" | "distance";
type Column = { key: ColKey; header: string };

function columnsFor(
  type: ExerciseType,
  unit: Unit,
  distUnit: DistanceUnit,
): Column[] {
  const f = TYPE_FIELDS[type];
  const cols: Column[] = [];
  if (f.weight)
    cols.push({ key: "weight", header: weightLabel(type, unitLabel(unit)) });
  if (f.distance) cols.push({ key: "distance", header: distUnit });
  if (f.duration) cols.push({ key: "duration", header: "time" });
  if (f.reps) cols.push({ key: "reps", header: "reps" });
  return cols;
}

// `2.5rem` set-number + optional PREVIOUS reference + one flexible column each +
// `2.5rem` menu gutter, so the header / committed / active rows stay
// pixel-aligned regardless of type. PREVIOUS only claims space when there's
// prior/target data to show (blank column suppressed for a brand-new exercise).
function gridTemplate(cols: Column[], showPrevious: boolean): string {
  const prev = showPrevious ? "3.5rem " : "";
  return `2.5rem ${prev}${cols.map(() => "1fr").join(" ")} 2.5rem`;
}

// Compact previous-performance string for the PREVIOUS column: weight sans unit
// (the weight column header already carries it) — "100 × 8", "1:30" for time.
function previousText(g: GhostSet, unit: Unit): string | null {
  return formatPrevious(g, (kg) => String(toDisplayWeight(kg, unit)));
}

// Marker letter color for a set type (drop = accent per spec; warm-up/failure
// keep quiet semantic tints; normal is just the faint set number).
function markerColorClass(setType: SetType): string {
  switch (setType) {
    case "warmup":
      return "text-warn";
    case "failure":
      return "text-neg";
    case "drop":
      return "text-accent";
    default:
      return "text-faint";
  }
}

// The set-number cell: shows the number, or a W/F/D marker once a type is
// assigned, and opens a small menu to set the type (+ remove, for committed
// rows). Reused by committed and draft rows.
function SetTypeCell({
  index,
  setType,
  ringState,
  onChange,
  onRemove,
  testId,
}: {
  index: number;
  setType: SetType;
  ringState: "done" | "empty";
  onChange: (t: SetType) => void;
  onRemove?: () => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const marker = SET_TYPE_MARKERS[setType];
  return (
    <span className="relative flex items-center gap-2">
      <StatusRing state={ringState} />
      <button
        type="button"
        // Keep the row's input focused so opening the menu never fires the
        // draft row's blur-to-commit (see ActiveRow.onBlur).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Set type"
        className={cn(
          "num min-w-3 text-left text-2xs tabular-nums",
          markerColorClass(setType),
          setType !== "normal" && "font-semibold",
        )}
        data-testid={testId}
      >
        {marker || index + 1}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full left-0 z-20 mt-1 min-w-32 py-1">
            {SET_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                data-testid={`${testId}-${t}`}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "num w-3 text-center text-2xs font-semibold",
                      markerColorClass(t),
                    )}
                  >
                    {SET_TYPE_MARKERS[t] || "·"}
                  </span>
                  {SET_TYPE_LABELS[t]}
                </span>
                {t === setType && <Check className="size-3.5 text-accent" />}
              </button>
            ))}
            {onRemove && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    onRemove();
                  }}
                  data-testid={`${testId}-remove`}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neg transition-colors duration-150 hover:bg-surface-hover"
                >
                  <Trash2 className="size-3.5" />
                  Remove set
                </button>
              </>
            )}
          </div>
        </>
      )}
    </span>
  );
}

export default function SessionScreen() {
  const { id: sessionId = "" } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { unit } = useUnit();
  const { data: session } = useSession(sessionId);
  const { data: restored } = useSessionExercises(sessionId);
  const { data: metrics = [] } = useMetrics();
  // Routine provenance: template targets + notes for prefill / write-back.
  const routineQuery = useRoutineDetail(session?.routineId ?? null);
  const routineDetail = routineQuery.data ?? null;
  // isLoading is false for a disabled query (empty workout) and once a routine
  // resolves — even to null (deleted routine) — so blocks always eventually seed.
  const routineLoading = routineQuery.isLoading;

  const [blocks, setBlocks] = useState<BlockState[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  // Copy-workout seed passed via navigation state ({ [seId]: SeedSet[] }) —
  // pre-fills the draft grid from a source session's sets. Read once.
  const copySeed = (location.state as { seed?: Record<string, SeedSet[]> })
    ?.seed;
  // Inline duration stopwatch: at most one runs across the whole session. Holds
  // the timing block + its start; ActiveRow ticks and writes elapsed on stop.
  const [timer, setTimer] = useState<{
    seId: string;
    startedAt: number;
  } | null>(null);
  const toggleTimer = useCallback(
    (seId: string) =>
      setTimer((t) =>
        t?.seId === seId ? null : { seId, startedAt: Date.now() },
      ),
    [],
  );
  // Rest is measured per exercise: the timestamp of the last set committed in
  // each block (keyed by seId). Rest between sets of one exercise is the signal
  // a future recommendation wants — switching exercises must not count as rest.
  const [lastCommitByBlock, setLastCommitByBlock] = useState<
    Record<string, number>
  >({});
  // For the live header stopwatch: time since the most recent set anywhere.
  const lastCommitAt = useMemo(() => {
    const vals = Object.values(lastCommitByBlock);
    return vals.length ? Math.max(...vals) : null;
  }, [lastCommitByBlock]);

  const { data: exercises = [] } = useExercises();

  // Device prefs (localStorage) + server prefs (default rest, plate config).
  const [smartScroll] = useSmartSupersetScroll();
  const [restVolume] = useRestSoundVolume();
  const [livePrEnabled] = useLivePrBanner();
  const [keepAwake] = useKeepAwake();
  const { data: userPrefs } = useUserPrefs();
  const updatePrefs = useUpdateUserPrefs();
  const defaultRestSec = userPrefs?.defaultRestSec ?? null;
  const plateConfig = userPrefs?.plateConfig ?? null;
  // PREVIOUS-column scope: "routine" narrows the ghost lookup to same-routine
  // sessions (only meaningful for a routine-started workout); else any workout.
  const previousRoutineId =
    userPrefs?.previousValuesScope === "routine"
      ? (session?.routineId ?? null)
      : null;

  // Keep the screen awake during an active session (opt-in; default off). The
  // Wake Lock auto-drops when the tab hides, so re-acquire on re-show.
  useEffect(() => {
    if (!keepAwake || session?.endedAt != null) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied, or the document isn't visible — ignore.
      }
    };
    const onVisible = () => {
      if (!cancelled && document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      sentinel = null;
    };
  }, [keepAwake, session?.endedAt]);

  // Per-block rest countdown (keyed by seId; absent = none running).
  const [restByBlock, setRestByBlock] = useState<
    Record<string, RestTimerState>
  >({});
  const dismissRest = useCallback((seId: string) => {
    setRestByBlock((prev) => {
      if (!(seId in prev)) return prev;
      const next = { ...prev };
      delete next[seId];
      return next;
    });
  }, []);
  const adjustRestFor = useCallback((seId: string, delta: number) => {
    setRestByBlock((prev) =>
      prev[seId] ? { ...prev, [seId]: adjustRest(prev[seId], delta) } : prev,
    );
  }, []);
  const restDoneFor = useCallback(
    (seId: string, name: string) => {
      playRestBlip(restVolume);
      // The exercise name stays outside voice() so it survives every register
      // (Ultrafrog ribbits words; the name is data).
      alertRestDone(
        `${name}: ${voice(
          "Rest complete.",
          "Rest complete. Adenosine triphosphate: replenished (approximately). The frog suggests you pick up the bar.",
        )}`,
      );
      // Keep the "rest!" chip up briefly, then clear it.
      window.setTimeout(() => dismissRest(seId), 3000);
    },
    [restVolume, dismissRest],
  );

  // Live PR banner + medal set. Bests snapshot captured once at mount, so the
  // logging path never triggers a records refetch (logSet invalidates
  // records-data; we read a plain, non-observing copy).
  const [prBanner, setPrBanner] = useState<PrBannerData | null>(null);
  const prIdRef = useRef(0);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  // Optimistic set id → real server id. The committed row keeps its optimistic
  // id as its React key for the whole session (never swapped), so a background
  // logSet resolving mid-interaction never remounts the row (which would close
  // an open set menu); edit/delete translate to the real id here.
  const [idMap, setIdMap] = useState<Record<string, string>>({});
  const [prSnapshot, setPrSnapshot] = useState<Map<
    string,
    ExerciseRecords
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer a warm records cache (M5) to avoid any fetch; else fetch once.
      const cached = (qc.getQueryData(["records-data", true]) ??
        qc.getQueryData(["records-data", false])) as
        | { records?: { byExercise?: Map<string, ExerciseRecords> } }
        | undefined;
      if (cached?.records?.byExercise) {
        setPrSnapshot(cached.records.byExercise);
        return;
      }
      const history = await repo.recordsData();
      if (!cancelled) setPrSnapshot(computeRecords(history).byExercise);
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, repo]);

  // Warm-up insert prepends typed 'warmup' seeds to a block's draft grid; the
  // nonce forces the active row to remount and pick up the new seed.
  const [seedOverride, setSeedOverride] = useState<Record<string, SeedSet[]>>(
    {},
  );
  const [blockNonce, setBlockNonce] = useState<Record<string, number>>({});

  // Pause: paused time accrues into pausedMs; duration = ended − started − paused.
  const [paused, setPaused] = useState(false);
  const [pausedMs, setPausedMs] = useState(0);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const pausedSeeded = useRef(false);
  useEffect(() => {
    if (!pausedSeeded.current && session) {
      pausedSeeded.current = true;
      setPausedMs(session.pausedMs ?? 0);
    }
  }, [session]);
  const togglePause = useCallback(() => {
    setPaused((p) => {
      if (p) {
        setPausedMs(
          (ms) =>
            ms + (pauseStartedAt != null ? Date.now() - pauseStartedAt : 0),
        );
        setPauseStartedAt(null);
        return false;
      }
      setPauseStartedAt(Date.now());
      return true;
    });
  }, [pauseStartedAt]);
  const currentPausedMs = () =>
    pausedMs +
    (paused && pauseStartedAt != null ? Date.now() - pauseStartedAt : 0);

  // Block DOM refs for smart-superset scrolling.
  const blockRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerBlockRef = useCallback(
    (seId: string, el: HTMLElement | null) => {
      if (el) blockRefs.current.set(seId, el);
      else blockRefs.current.delete(seId);
    },
    [],
  );

  // Distinct superset groups in block order → color slot (index % 4).
  const supersetSlot = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of blocks ?? []) {
      if (b.supersetGroup != null && !m.has(b.supersetGroup))
        m.set(b.supersetGroup, m.size % SUPERSET_COLORS.length);
    }
    return m;
  }, [blocks]);

  // Routine template lookup, keyed by routine_exercise id (provenance match).
  const routineByReId = useMemo(() => {
    const m = new Map<string, RoutineDetail["exercises"][number]>();
    for (const e of routineDetail?.exercises ?? []) m.set(e.id, e);
    return m;
  }, [routineDetail]);

  // Seed local block state once from the server (restores an open session on reload).
  // For routine-started sessions, wait for the template too: ActiveRow reads its
  // per-index seed once at mount, so the blocks must not mount before the
  // targets are available or the draft grid comes up blank.
  useEffect(() => {
    if (blocks !== null || !restored) return;
    if (session?.routineId && routineLoading) return;
    setBlocks(
      restored.map((se) => ({
        seId: se.id,
        exerciseId: se.exerciseId,
        name: se.exerciseName,
        routineExerciseId: se.routineExerciseId,
        supersetGroup: se.supersetGroup,
        restSec: se.restSec,
        note: se.note,
        committed: se.sets,
      })),
    );
  }, [restored, blocks, session?.routineId, routineLoading]);

  // Auto-open the exercise picker once when a session loads with no blocks —
  // but let it be dismissed (Escape/X). Not `open={blocks.length === 0}`, which
  // would force it open and block the header (conditions, End).
  const autoOpenedPicker = useRef(false);
  useEffect(() => {
    if (!autoOpenedPicker.current && blocks !== null && blocks.length === 0) {
      autoOpenedPicker.current = true;
      setPicking(true);
    }
  }, [blocks]);

  const logSet = useMutation({
    mutationFn: (input: { seId: string; set: CommitInput; tempId: string }) =>
      repo.logSet(input.seId, input.set),
    // Record the optimistic→real id mapping (edit/delete translate through it).
    // The committed row keeps its optimistic id, so it never remounts here.
    onSuccess: (realId, { tempId }) => {
      setIdMap((prev) => ({ ...prev, [tempId]: realId }));
    },
    // A new set can mint a PR — mark the records snapshot stale (no observer is
    // mounted mid-session, so this never refetches on the logging path).
    onSettled: () => qc.invalidateQueries({ queryKey: ["records-data"] }),
  });

  useHotkeys(
    useMemo(
      () => ({
        a: () => setPicking(true),
        e: () => setFinishOpen(true),
      }),
      [],
    ),
  );

  async function pickExercise(exerciseId: string, name: string) {
    setPicking(false);
    const seId = await repo.addExerciseToSession(sessionId, exerciseId);
    setBlocks((prev) => [
      ...(prev ?? []),
      {
        seId,
        exerciseId,
        name,
        routineExerciseId: null,
        supersetGroup: null,
        restSec: null,
        note: null,
        committed: [],
      },
    ]);
  }

  function commitSet(seId: string, set: CommitInput, ctx: CommitCtx) {
    // Optimistic: the row is already correct locally; persist in the background.
    // Rest time = seconds since the previous set of THIS exercise (null for its
    // first set) — a per-exercise rest gap, not a session-wide one.
    const prevAt = lastCommitByBlock[seId];
    const restSec =
      prevAt != null ? Math.round((Date.now() - prevAt) / 1000) : null;
    const withRest = { ...set, restSec };
    const tempId = newId();
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: [
                ...b.committed,
                { ...withRest, id: tempId, setNo: b.committed.length },
              ],
            }
          : b,
      ),
    );
    setLastCommitByBlock((prev) => ({ ...prev, [seId]: Date.now() }));
    logSet.mutate({ seId, set: withRest, tempId });
    // The uncommitted row is now saved server-side — drop its local draft.
    clearDraft(seId);

    const block = (blocks ?? []).find((b) => b.seId === seId);

    // Live PR check against the mount-time bests snapshot (session-scoped types
    // finalize at save; only set-scoped ones fire live).
    if (block && prSnapshot) {
      const hits = checkSetForPR(
        prSnapshot.get(block.exerciseId),
        ctx.exerciseType,
        {
          setType: set.setType ?? "normal",
          weightKg: set.weightKg,
          reps: set.reps,
          durationSec: set.durationSec,
          distanceM: set.distanceM,
        },
      );
      if (hits.length) {
        // The banner is opt-out (default on); the row medal always pins.
        if (livePrEnabled) {
          prIdRef.current += 1;
          setPrBanner({
            id: prIdRef.current,
            exerciseName: block.name,
            prTypes: hits.map((h) => h.prType),
          });
        }
        setPrSetIds((prev) => new Set(prev).add(tempId));
      }
    }

    // Rest countdown: per-exercise target (block override or user default).
    // Suppressed when a drop set is next — including the just-committed set
    // being a drop (drops chain into the next reduction with no rest).
    const restTarget = block?.restSec ?? defaultRestSec;
    const committedIsDrop = (set.setType ?? "normal") === "drop";
    const nextType = committedIsDrop ? "drop" : ctx.nextSetType;
    if (shouldStartRest(restTarget, nextType)) {
      setRestByBlock((prev) => ({
        ...prev,
        [seId]: startRest(restTarget as number, Date.now()),
      }));
    }

    // Smart superset scrolling: advance the view to the next member (wrapping).
    if (smartScroll && block?.supersetGroup != null) {
      const members = (blocks ?? []).filter(
        (b) => b.supersetGroup === block.supersetGroup,
      );
      const idx = members.findIndex((b) => b.seId === seId);
      const next = members[(idx + 1) % members.length];
      if (next && next.seId !== seId)
        blockRefs.current
          .get(next.seId)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Per-exercise session note: instant local update + background persist.
  function setBlockNote(seId: string, note: string) {
    setBlocks((prev) =>
      (prev ?? []).map((b) => (b.seId === seId ? { ...b, note } : b)),
    );
    void repo.updateSessionExercise(seId, { note: note.trim() || null });
  }

  // Rest-countdown target for a block (null = off / use default nothing).
  function setBlockRest(seId: string, restSec: number | null) {
    setBlocks((prev) =>
      (prev ?? []).map((b) => (b.seId === seId ? { ...b, restSec } : b)),
    );
    void repo.updateSessionExercise(seId, { restSec });
    if (restSec == null) dismissRest(seId);
  }

  const nextGroupId = () => {
    const ids = (blocks ?? [])
      .map((b) => b.supersetGroup)
      .filter((g): g is number => g != null);
    return ids.length ? Math.max(...ids) + 1 : 1;
  };

  // Link a block into a superset with another block: adopt the target's group
  // (or the source's, or a fresh id). 2 members = superset; 3+ = giant set.
  function linkSuperset(seId: string, targetSeId: string) {
    const list = blocks ?? [];
    const target = list.find((b) => b.seId === targetSeId);
    const source = list.find((b) => b.seId === seId);
    if (!target || !source) return;
    const group = target.supersetGroup ?? source.supersetGroup ?? nextGroupId();
    const ids = new Set([seId, targetSeId]);
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        ids.has(b.seId) ? { ...b, supersetGroup: group } : b,
      ),
    );
    for (const id of ids)
      void repo.updateSessionExercise(id, { supersetGroup: group });
  }

  // Remove a block from its superset; if that leaves a lone member, dissolve it.
  function unlinkSuperset(seId: string) {
    const list = blocks ?? [];
    const group = list.find((b) => b.seId === seId)?.supersetGroup ?? null;
    const toClear = new Set<string>([seId]);
    if (group != null) {
      const remaining = list.filter(
        (b) => b.supersetGroup === group && b.seId !== seId,
      );
      if (remaining.length === 1) toClear.add(remaining[0].seId);
    }
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        toClear.has(b.seId) ? { ...b, supersetGroup: null } : b,
      ),
    );
    for (const id of toClear)
      void repo.updateSessionExercise(id, { supersetGroup: null });
  }

  // Warm-up insert: prepend typed 'warmup' seeds (percentage ramp of the target
  // working weight) above the block's working sets.
  function addWarmup(seId: string, workingWeightKg: number) {
    const block = (blocks ?? []).find((b) => b.seId === seId);
    if (!block) return;
    const ex = exercises.find((e) => e.id === block.exerciseId);
    const sets = warmupSets(
      workingWeightKg,
      getWarmupMethod(),
      undefined,
      ex?.equipment,
    );
    if (!sets.length) return;
    const warmSeeds: SeedSet[] = sets.map((s) => ({
      setType: "warmup",
      weightKg: s.weightKg,
      reps: s.reps,
      repsMax: null,
      durationSec: null,
      distanceM: null,
    }));
    const base = seedOverride[seId] ?? seedFor(block);
    setSeedOverride((prev) => ({ ...prev, [seId]: [...warmSeeds, ...base] }));
    setBlockNonce((prev) => ({ ...prev, [seId]: (prev[seId] ?? 0) + 1 }));
  }

  function saveSet(seId: string, setId: string, patch: SetPatch) {
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: b.committed.map((s) =>
                s.id === setId ? { ...s, ...patch } : s,
              ),
            }
          : b,
      ),
    );
    // setId is the row's stable (optimistic) id — translate to the real server
    // id if logSet has resolved (else the optimistic id already equals it).
    void repo.updateSet(idMap[setId] ?? setId, patch);
  }

  function removeSet(seId: string, setId: string) {
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? { ...b, committed: b.committed.filter((s) => s.id !== setId) }
          : b,
      ),
    );
    void repo.deleteSet(idMap[setId] ?? setId);
  }

  function removeBlock(seId: string) {
    setBlocks((prev) => (prev ?? []).filter((b) => b.seId !== seId));
    void repo.deleteSessionExercise(seId);
  }

  // Per-block seed sets for the draft grid: routine targets (matched by
  // routine_exercise id) win; otherwise the copy-workout seed; otherwise none.
  const seedFor = useCallback(
    (block: BlockState): SeedSet[] => {
      if (block.routineExerciseId) {
        const t = routineByReId.get(block.routineExerciseId);
        if (t)
          return t.sets.map((s) => ({
            setType: (s.setType as SetType) ?? "normal",
            weightKg: s.targetWeightKg,
            reps: s.targetReps,
            repsMax: s.targetRepsMax,
            durationSec: s.targetDurationSec,
            distanceM: s.targetDistanceM,
          }));
      }
      return copySeed?.[block.seId] ?? [];
    },
    [routineByReId, copySeed],
  );

  const noteFor = useCallback(
    (block: BlockState): string | null =>
      block.routineExerciseId
        ? (routineByReId.get(block.routineExerciseId)?.note ?? null)
        : null,
    [routineByReId],
  );

  // Structural drift vs the routine template — gates the Update-Routine /
  // Keep-Original prompt: an added ad-hoc exercise, a template exercise dropped
  // from the session, or extra sets logged beyond the template. Logging *fewer*
  // sets than planned (an early stop) is not structural.
  const structuralChange = useMemo(() => {
    if (!session?.routineId || !routineDetail || !blocks) return false;
    if (blocks.some((b) => !b.routineExerciseId)) return true;
    const present = new Set(
      blocks.map((b) => b.routineExerciseId).filter(Boolean),
    );
    if (routineDetail.exercises.some((e) => !present.has(e.id))) return true;
    for (const b of blocks) {
      if (!b.routineExerciseId) continue;
      const t = routineByReId.get(b.routineExerciseId);
      if (t && b.committed.length > t.sets.length) return true;
    }
    return false;
  }, [session?.routineId, routineDetail, blocks, routineByReId]);

  // NewRoutineInput describing the performed structure (Update Routine choice).
  function structureInput(): NewRoutineInput | null {
    if (!routineDetail || !blocks) return null;
    return {
      name: routineDetail.routine.name,
      folderId: routineDetail.routine.folderId,
      description: routineDetail.routine.description,
      exercises: blocks.map((b, i) => {
        const t = b.routineExerciseId
          ? routineByReId.get(b.routineExerciseId)
          : undefined;
        return {
          exerciseId: b.exerciseId,
          orderIndex: i,
          supersetGroup: t?.supersetGroup ?? null,
          restSec: t?.restSec ?? null,
          note: t?.note ?? null,
          sets: b.committed.map((s, si) => ({
            setNo: si,
            setType: (s.setType as string) ?? "normal",
            targetWeightKg: s.weightKg,
            targetReps: s.reps,
            targetRepsMax: null,
            targetDurationSec: s.durationSec,
            targetDistanceM: s.distanceM,
          })),
        };
      }),
    };
  }

  async function handleFinish(opts: {
    title: string;
    notes: string;
    startedAt: number;
    updateValues: boolean;
    updateStructure: boolean;
  }) {
    const routineId = session?.routineId;
    // 1) Update Routine Values (weights/reps write-back; rep-range sets skipped
    //    by the repo). Independent of the structural choice (Hevy rule).
    if (routineId && opts.updateValues && blocks) {
      const performed = blocks
        .filter((b) => b.routineExerciseId)
        .map((b) => ({
          routineExerciseId: b.routineExerciseId as string,
          sets: b.committed.map((s, i) => ({
            setNo: i,
            weightKg: s.weightKg,
            reps: s.reps,
            durationSec: s.durationSec,
            distanceM: s.distanceM,
          })),
        }));
      await repo.updateRoutineValues(routineId, performed);
    }
    // 2) Structural write-back (only when chosen).
    if (routineId && opts.updateStructure) {
      const input = structureInput();
      if (input) await repo.updateRoutine(routineId, input);
    }
    // 3) Title, notes, start-time, and accumulated pause (all via repo methods).
    if ((opts.title.trim() || null) !== (session?.title ?? null))
      await repo.updateSessionTitle(sessionId, opts.title.trim() || null);
    if (opts.notes !== (session?.notes ?? ""))
      await repo.updateSessionNotes(sessionId, opts.notes.trim() || null);
    if (session && opts.startedAt !== session.startedAt)
      await repo.updateSessionStartedAt(sessionId, opts.startedAt);
    const finalPausedMs = currentPausedMs();
    if (finalPausedMs !== (session?.pausedMs ?? 0))
      await repo.updateSessionPausedMs(sessionId, finalPausedMs);
    // 4) Close out the session; clear any lingering per-block drafts.
    await repo.endSession(sessionId);
    for (const b of blocks ?? []) clearDraft(b.seId);
    // Reflect the edited fields in the detail cache so /history/:id shows them
    // without a refetch.
    const now = Date.now();
    qc.setQueryData<Session | null>(["session", sessionId], (old) =>
      old
        ? {
            ...old,
            title: opts.title.trim() || old.title,
            notes: opts.notes.trim() || null,
            startedAt: opts.startedAt,
            endedAt: now,
          }
        : old,
    );
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    // Profile/Calendar/Home streak + activity bars read this key — refresh so a
    // finished workout shows without waiting out the 60s stale window (M6).
    void qc.invalidateQueries({ queryKey: ["sessions-all"] });
    void qc.invalidateQueries({ queryKey: ["findings-data"] });
    // Records/charts (M5) read a cached snapshot — refresh it on finish rather
    // than waiting out the stale window.
    void qc.invalidateQueries({ queryKey: ["records-data"] });
    // The session grid logs to local state and never writes back to the
    // session-exercises query; refetch so /history/:id shows the real graph
    // (its staleTime is Infinity, so it would otherwise serve the stale load).
    void qc.invalidateQueries({ queryKey: ["session-exercises", sessionId] });
    if (routineId)
      void qc.invalidateQueries({ queryKey: ["routine-detail", routineId] });
    // ?summary=1 triggers the post-save celebration overlay on history detail.
    navigate(`/history/${sessionId}?summary=1`);
  }

  async function handleDiscard() {
    for (const b of blocks ?? []) clearDraft(b.seId);
    await repo.deleteSession(sessionId);
    void qc.invalidateQueries({ queryKey: ["active-session"] });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["findings-data"] });
    navigate("/");
  }

  if (blocks === null) return null;

  const setCount = blocks.reduce((n, b) => n + b.committed.length, 0);
  const volumeKg = blocks.reduce(
    (sum, b) =>
      sum +
      b.committed.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0),
    0,
  );
  const volume = Math.round(unit === "lb" ? kgToLb(volumeKg) : volumeKg);
  const restValues = blocks.flatMap((b) =>
    b.committed
      .map((s) => s.restSec)
      .filter((r): r is number => r != null && r > 0),
  );
  const avgRestSec = restValues.length
    ? Math.round(restValues.reduce((a, b) => a + b, 0) / restValues.length)
    : null;

  return (
    <>
      <PrBanner data={prBanner} onDismiss={() => setPrBanner(null)} />
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
            {session?.title ?? "Session"}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {session && (
              <SessionDurationControl
                startedAt={session.startedAt}
                endedAt={session.endedAt}
                paused={paused}
                pausedMs={pausedMs}
                pauseStartedAt={pauseStartedAt}
                onTogglePause={togglePause}
                onEditStart={(ms) => {
                  void repo.updateSessionStartedAt(sessionId, ms);
                  qc.setQueryData<Session | null>(
                    ["session", sessionId],
                    (old) => (old ? { ...old, startedAt: ms } : old),
                  );
                }}
              />
            )}
            <RestTimer since={lastCommitAt} />
            <Button
              size="sm"
              onClick={() => setFinishOpen(true)}
              title="Finish session (e)"
              data-testid="end-session-btn"
            >
              <Square className="size-3" />
              Finish
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-20 md:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <ConditionsChip sessionId={sessionId} />
          </div>
          <p
            className="num shrink-0 text-xs text-faint"
            data-testid="session-stats"
          >
            {setCount} {setCount === 1 ? "set" : "sets"} ·{" "}
            {volume.toLocaleString()} {unitLabel(unit)}
            {avgRestSec != null && ` · rest ${formatRest(avgRestSec)} avg`}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {blocks.map((block) => (
            <ExerciseBlock
              key={block.seId}
              block={block}
              unit={unit}
              metrics={metrics}
              previousRoutineId={previousRoutineId}
              seedSets={seedOverride[block.seId] ?? seedFor(block)}
              seedNonce={blockNonce[block.seId] ?? 0}
              routineNote={noteFor(block)}
              supersetColor={
                block.supersetGroup != null
                  ? SUPERSET_COLORS[supersetSlot.get(block.supersetGroup) ?? 0]
                  : null
              }
              otherBlocks={blocks
                .filter((b) => b.seId !== block.seId)
                .map((b) => ({ seId: b.seId, name: b.name }))}
              inSuperset={block.supersetGroup != null}
              defaultRestSec={defaultRestSec}
              plateConfig={plateConfig}
              onSavePlateConfig={(cfg) =>
                updatePrefs.mutate({ plateConfig: cfg })
              }
              rest={restByBlock[block.seId]}
              onRestAdjust={(d) => adjustRestFor(block.seId, d)}
              onRestDismiss={() => dismissRest(block.seId)}
              onRestDone={() => restDoneFor(block.seId, block.name)}
              onSetRest={(sec) => setBlockRest(block.seId, sec)}
              onSetNote={(note) => setBlockNote(block.seId, note)}
              onLinkSuperset={(target) => linkSuperset(block.seId, target)}
              onUnlinkSuperset={() => unlinkSuperset(block.seId)}
              onAddWarmup={(w) => addWarmup(block.seId, w)}
              prSetIds={prSetIds}
              registerRef={(el) => registerBlockRef(block.seId, el)}
              timerRunning={timer?.seId === block.seId}
              timerStartedAt={
                timer?.seId === block.seId ? timer.startedAt : null
              }
              onToggleTimer={() => toggleTimer(block.seId)}
              onCommit={(set, ctx) => commitSet(block.seId, set, ctx)}
              onSaveSet={(setId, patch) => saveSet(block.seId, setId, patch)}
              onRemoveSet={(setId) => removeSet(block.seId, setId)}
              onRemoveBlock={() => removeBlock(block.seId)}
            />
          ))}

          <Button
            size="lg"
            className="h-12 w-full"
            onClick={() => setPicking(true)}
            data-testid="open-exercise-picker"
          >
            <Plus className="size-4" />
            Add exercise
          </Button>
          <ExercisePicker
            open={picking}
            onOpenChange={setPicking}
            onPick={pickExercise}
          />
        </div>
      </div>

      {session && (
        <FinishOverlay
          open={finishOpen}
          onOpenChange={setFinishOpen}
          sessionId={sessionId}
          title={session.title ?? ""}
          notes={session.notes ?? ""}
          startedAt={session.startedAt}
          pausedMs={currentPausedMs()}
          setCount={setCount}
          volume={volume}
          unit={unit}
          isRoutine={session.routineId != null}
          structuralChange={structuralChange}
          onFinish={handleFinish}
          onDiscard={handleDiscard}
        />
      )}
    </>
  );
}

// Finish / Save Workout overlay (Hevy-parity M2): computed totals; editable
// title, notes, and start date/time (duration derives from the start edit);
// for routine sessions a default-ON "Update routine values" toggle and — when
// the structure drifted from the template — an Update / Keep-original choice;
// Discard (destructive). Save closes the session and lands on its history.
function FinishOverlay({
  open,
  onOpenChange,
  sessionId,
  title,
  notes,
  startedAt,
  pausedMs,
  setCount,
  volume,
  unit,
  isRoutine,
  structuralChange,
  onFinish,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  title: string;
  notes: string;
  startedAt: number;
  pausedMs: number;
  setCount: number;
  volume: number;
  unit: Unit;
  isRoutine: boolean;
  structuralChange: boolean;
  onFinish: (opts: {
    title: string;
    notes: string;
    startedAt: number;
    updateValues: boolean;
    updateStructure: boolean;
  }) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const repo = useRepo();
  // Freeze the finish moment on open so the computed duration is stable while
  // the sheet is up (matches when the user tapped Finish).
  const [endAt] = useState(() => Date.now());
  const [titleDraft, setTitleDraft] = useState(title);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [startedDraft, setStartedDraft] = useState(startedAt);
  const [updateValues, setUpdateValues] = useState(true);
  const [updateStructure, setUpdateStructure] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  // Workout photos: resized client-side and held locally; uploaded (position =
  // index) only when the workout saves, so discarding never orphans storage.
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const durationMs = Math.max(0, endAt - startedDraft - pausedMs);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      for (let i = 0; i < photos.length; i++) {
        try {
          await repo.uploadSessionPhoto(sessionId, photos[i].blob, i);
        } catch {
          // A single failed photo upload must not block saving the workout.
        }
      }
      await onFinish({
        title: titleDraft,
        notes: notesDraft,
        startedAt: startedDraft,
        updateValues,
        updateStructure,
      });
    } catch {
      setSaving(false);
    }
  }

  const labelCls = "text-2xs font-medium tracking-wide text-faint uppercase";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Finish workout" className="md:max-w-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span
              className="num text-sm text-soft"
              data-testid="finish-summary"
            >
              {setCount} {setCount === 1 ? "set" : "sets"} ·{" "}
              {volume.toLocaleString()} {unitLabel(unit)}
            </span>
            <span
              className="num text-sm text-soft"
              data-testid="finish-duration"
            >
              {formatDurationSeconds(durationMs)}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className={labelCls}>Title</span>
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Workout"
              data-testid="finish-title"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className={labelCls}>Start</span>
            <Input
              type="datetime-local"
              className="num"
              value={toLocalInput(startedDraft)}
              onChange={(e) => {
                const ms = new Date(e.target.value).getTime();
                if (Number.isFinite(ms)) setStartedDraft(ms);
              }}
              data-testid="finish-started-at"
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Notes</span>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="How did it go? PRs, aches, focus…"
              data-testid="finish-notes"
              className="w-full resize-y rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
            />
          </label>

          <FinishPhotoStrip photos={photos} onChange={setPhotos} />

          {isRoutine && (
            <label className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-2">
              <input
                type="checkbox"
                checked={updateValues}
                onChange={(e) => setUpdateValues(e.target.checked)}
                className="mt-0.5 size-4 accent-(--accent)"
                data-testid="finish-update-values"
              />
              <span className="text-xs text-soft">
                <span className="font-medium text-ink">
                  Update routine values
                </span>
                <br />
                Save today's weights &amp; reps back to the routine (rep-range
                sets are left as-is).
              </span>
            </label>
          )}

          {isRoutine && structuralChange && (
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-xs text-soft">
                You changed this workout's structure. Update the routine to
                match, or keep the original?
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant={updateStructure ? "primary" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUpdateStructure(true)}
                  data-testid="finish-update-structure"
                >
                  Update routine
                </Button>
                <Button
                  variant={!updateStructure ? "primary" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUpdateStructure(false)}
                  data-testid="finish-keep-original"
                >
                  Keep original
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            {confirmDiscard ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void onDiscard()}
                data-testid="finish-discard-confirm"
              >
                <Trash2 className="size-3.5" />
                Confirm discard
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDiscard(true)}
                data-testid="finish-discard"
              >
                <Trash2 className="size-3.5" />
                Discard
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={() => void save()}
              data-testid="finish-save"
            >
              <Check className="size-4" />
              {saving ? "Saving…" : "Save workout"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string, name: string) => void;
}) {
  const { data: exercises = [], isLoading } = useExercises();
  const { data: machines = [] } = useMachines();
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  // Muscle-grouped, tier-sorted — same reading order as the Library ribbon.
  const filtered = filterExercises(exercises, query, filterMuscle);
  const groups = groupByPrimaryMuscle(filtered);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add exercise" className="md:max-w-lg">
        <div className="flex flex-col gap-3">
          <ExerciseFilterBar
            query={query}
            onQuery={setQuery}
            muscle={filterMuscle}
            onMuscle={setFilterMuscle}
            autoFocus
          />
          {isLoading ? (
            <p className="px-4 py-6 text-center text-xs text-faint">Loading…</p>
          ) : exercises.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-faint">
              No exercises yet — add one in Library.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-faint">
              No exercises match your search.
            </p>
          ) : (
            <div className="overflow-hidden border border-border bg-surface">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="border-b border-border bg-surface-2 px-4 py-1 text-2xs font-medium tracking-widest text-faint uppercase">
                    {group.label}
                  </p>
                  <ul className="divide-y divide-border">
                    {group.items.map((ex) => (
                      <PickerRow
                        key={ex.id}
                        exercise={ex}
                        tier={
                          ex.muscleTargets?.find((t) => t.muscle === group.key)
                            ?.tier
                        }
                        machine={machines.find((m) => m.id === ex.machineId)}
                        onPick={onPick}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One picker row: the ribbon picks the exercise; a separate toggle reveals the
// last-session history. The history query only mounts once expanded, so opening
// the picker doesn't fire a lookup for every exercise at once.
function PickerRow({
  exercise,
  tier,
  machine,
  onPick,
}: {
  exercise: Exercise;
  tier?: Tier | null;
  machine?: Machine;
  onPick: (id: string, name: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <li>
      <div className="flex items-stretch">
        <button
          type="button"
          data-testid={`pick-exercise-${exercise.name}`}
          onClick={() => onPick(exercise.id, exercise.name)}
          className="flex-1 px-4 py-3 text-left transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
        >
          <ExerciseRibbon exercise={exercise} tier={tier} machine={machine} />
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Last session"
          aria-expanded={showHistory}
          className="flex shrink-0 items-center gap-1 border-l border-border px-3 text-faint transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
          data-testid={`pick-history-toggle-${exercise.name}`}
        >
          <History className="size-4" />
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-150",
              showHistory && "rotate-180",
            )}
          />
        </button>
      </div>
      {showHistory && (
        <PickerHistory exerciseId={exercise.id} name={exercise.name} />
      )}
    </li>
  );
}

// Lazily-loaded last-session sets for one picker row (mounted only when the
// history dropdown is open).
function PickerHistory({
  exerciseId,
  name,
}: {
  exerciseId: string;
  name: string;
}) {
  const { unit } = useUnit();
  const { data: sets = [], isLoading } = useLastSets(exerciseId);
  const summary = sets
    .map((s) =>
      s.weightKg != null && s.reps != null
        ? `${formatWeight(s.weightKg, unit)}×${s.reps}`
        : null,
    )
    .filter((s): s is string => s != null)
    .join(", ");
  return (
    <div
      className="border-t border-border bg-surface-2 px-4 py-2 text-2xs text-soft"
      data-testid={`pick-history-${name}`}
    >
      {isLoading ? (
        <span className="text-faint">Loading…</span>
      ) : summary ? (
        <span className="flex items-center gap-1">
          <History className="size-3 shrink-0 text-faint" />
          Last: {summary}
        </span>
      ) : (
        <span className="text-faint">No history yet.</span>
      )}
    </div>
  );
}

function ExerciseBlock({
  block,
  unit,
  metrics,
  previousRoutineId,
  seedSets,
  seedNonce,
  routineNote,
  supersetColor,
  otherBlocks,
  inSuperset,
  defaultRestSec,
  plateConfig,
  onSavePlateConfig,
  rest,
  onRestAdjust,
  onRestDismiss,
  onRestDone,
  onSetRest,
  onSetNote,
  onLinkSuperset,
  onUnlinkSuperset,
  onAddWarmup,
  prSetIds,
  registerRef,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
  onSaveSet,
  onRemoveSet,
  onRemoveBlock,
}: {
  block: BlockState;
  unit: Unit;
  metrics: Metric[];
  previousRoutineId: string | null;
  seedSets: SeedSet[];
  seedNonce: number;
  routineNote: string | null;
  supersetColor: string | null;
  otherBlocks: { seId: string; name: string }[];
  inSuperset: boolean;
  defaultRestSec: number | null;
  plateConfig: PlateConfig | null;
  onSavePlateConfig: (cfg: PlateConfig) => void;
  rest: RestTimerState | undefined;
  onRestAdjust: (deltaSec: number) => void;
  onRestDismiss: () => void;
  onRestDone: () => void;
  onSetRest: (restSec: number | null) => void;
  onSetNote: (note: string) => void;
  onLinkSuperset: (targetSeId: string) => void;
  onUnlinkSuperset: () => void;
  onAddWarmup: (workingWeightKg: number) => void;
  prSetIds: Set<string>;
  registerRef: (el: HTMLElement | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
  onSaveSet: (setId: string, patch: SetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveBlock: () => void;
}) {
  const { data: ghost = [] } = useGhost(
    block.exerciseId,
    block.seId,
    previousRoutineId,
  );
  const { data: ghostNote } = useLastNote(block.exerciseId, block.seId);
  const { data: exercises = [] } = useExercises();
  const { data: machines = [] } = useMachines();
  const { data: prefs = [] } = useExercisePrefs();
  const setWeightUnit = useSetExerciseWeightUnit();
  const navigate = useNavigate();
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const activeIndex = block.committed.length;
  const enabledMetrics = metrics.filter(
    (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
  );
  const exercise = exercises.find((e) => e.id === block.exerciseId);
  const machine = machines.find((m) => m.id === exercise?.machineId);

  const type = (exercise?.exerciseType as ExerciseType) ?? "weight_reps";
  // Per-exercise weight-unit override falls back to the global display unit.
  const override = prefs.find(
    (p) => p.exerciseId === block.exerciseId,
  )?.weightUnit;
  const blockUnit: Unit =
    override === "kg" || override === "lb" ? override : unit;
  const distUnit = distanceUnitFor(blockUnit);
  const columns = columnsFor(type, blockUnit, distUnit);
  const barLoaded =
    TYPE_FIELDS[type].weight && isBarLoaded(exercise?.equipment);
  const warmupEligible = TYPE_FIELDS[type].weight;
  // Warm-up prefill: the heaviest weight logged so far (display unit).
  const heaviestKg = block.committed.reduce(
    (max, s) => (s.weightKg != null && s.weightKg > max ? s.weightKg : max),
    0,
  );
  const effectiveRestSec = block.restSec ?? defaultRestSec;

  // PREVIOUS column: last performance per set index ('any workout' scope — the
  // existing ghost lookup). Only claims grid space when there's prior or seeded
  // (routine/copy) data. Per-index (no clamp-to-last), so a newly added set is
  // blank until logged once.
  const showPrevious = ghost.length > 0 || seedSets.length > 0;
  const cells = previousCells(ghost, [], activeIndex + 1);
  const template = gridTemplate(columns, showPrevious);

  return (
    <section
      ref={registerRef}
      className="rounded-lg border border-border bg-surface"
      style={
        supersetColor ? { borderLeft: `3px solid ${supersetColor}` } : undefined
      }
      data-testid={`block-${block.name}`}
      data-superset={inSuperset ? "1" : undefined}
    >
      <header className="group flex min-h-8 items-center justify-between border-b border-border px-4 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <ExerciseThumb imageUrl={exercise?.imageUrl} name={block.name} />
          <span className="flex min-w-0 flex-col">
            {/* Tap the name → exercise detail; Hevy opens it mid-workout
                without pausing (the session stays server-persisted). */}
            <button
              type="button"
              onClick={() => navigate(`/exercises/${block.exerciseId}`)}
              title="Exercise details"
              className="truncate text-left text-sm font-medium transition-colors duration-100 hover:text-accent"
              data-testid={`block-${block.name}-open`}
            >
              {block.name}
            </button>
            {routineNote && (
              <span
                className="truncate text-2xs text-faint"
                data-testid={`block-${block.name}-note`}
              >
                {routineNote}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {rest && (
            <RestCountdown
              state={rest}
              onAdjust={onRestAdjust}
              onDismiss={onRestDismiss}
              onDone={onRestDone}
              testId={`rest-${block.name}`}
            />
          )}
          <span className="num text-2xs text-faint">
            {block.committed.length}{" "}
            {block.committed.length === 1 ? "set" : "sets"}
          </span>
          <BlockMenu
            blockName={block.name}
            unit={blockUnit}
            otherBlocks={otherBlocks}
            inSuperset={inSuperset}
            warmupEligible={warmupEligible}
            heaviestDisplay={
              heaviestKg > 0 ? toDisplayWeight(heaviestKg, blockUnit) : null
            }
            restSec={effectiveRestSec}
            onLinkSuperset={onLinkSuperset}
            onUnlinkSuperset={onUnlinkSuperset}
            onSetRest={onSetRest}
            onAddWarmup={(displayWeight) =>
              onAddWarmup(
                blockUnit === "lb" ? lbToKg(displayWeight) : displayWeight,
              )
            }
          />
          <button
            type="button"
            onClick={onRemoveBlock}
            title="Remove exercise from session"
            className="rounded-sm p-1 text-faint transition-opacity duration-150 ease-(--ease-out-quad) hover:text-neg max-md:opacity-100 md:p-0.5 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
            data-testid={`remove-block-${block.name}`}
          >
            <X className="size-4" />
          </button>
        </span>
      </header>

      <SessionNoteField
        blockName={block.name}
        note={block.note ?? ""}
        ghostNote={ghostNote ?? null}
        onCommit={onSetNote}
      />

      {machine && <SetupStrip machine={machine} blockName={block.name} />}

      <div
        className="grid items-center gap-x-2 px-4 py-1 text-2xs font-medium tracking-widest text-faint uppercase"
        style={{ gridTemplateColumns: template }}
      >
        <span>#</span>
        {showPrevious && <span>prev</span>}
        {columns.map((c) =>
          c.key === "weight" ? (
            <UnitOverrideMenu
              key={c.key}
              header={c.header}
              blockName={block.name}
              override={
                override === "kg" || override === "lb" ? override : null
              }
              globalUnit={unit}
              onSet={(u) =>
                setWeightUnit.mutate({ exerciseId: block.exerciseId, unit: u })
              }
            />
          ) : (
            <span key={c.key}>{c.header}</span>
          ),
        )}
        <span />
      </div>

      {block.committed.map((set, i) => (
        <CommittedRow
          key={set.id}
          set={set}
          index={i}
          unit={blockUnit}
          distUnit={distUnit}
          type={type}
          columns={columns}
          template={template}
          showPrevious={showPrevious}
          previous={cells[i]?.previous ?? null}
          isPr={prSetIds.has(set.id)}
          onSave={(patch) => onSaveSet(set.id, patch)}
          onDelete={() => onRemoveSet(set.id)}
        />
      ))}

      <ActiveRow
        key={`${activeIndex}-${seedNonce}`}
        seId={block.seId}
        index={activeIndex}
        unit={blockUnit}
        distUnit={distUnit}
        type={type}
        columns={columns}
        template={template}
        showPrevious={showPrevious}
        previous={cells[activeIndex]?.previous ?? null}
        seed={seedSets[activeIndex]}
        nextSeedType={seedSets[activeIndex + 1]?.setType ?? null}
        ghost={ghostFor(ghost, activeIndex)}
        hasGhost={ghost.length > 0}
        enabledMetrics={enabledMetrics}
        autoFocusWeight={activeIndex > 0}
        barLoaded={barLoaded}
        onOpenPlates={(target) => {
          setPlateTarget(target);
          setPlateOpen(true);
        }}
        timerRunning={timerRunning}
        timerStartedAt={timerStartedAt}
        onToggleTimer={onToggleTimer}
        onCommit={onCommit}
      />

      <PlateSheet
        open={plateOpen}
        onOpenChange={setPlateOpen}
        target={plateTarget}
        unit={blockUnit}
        plateConfig={plateConfig}
        onSaveConfig={onSavePlateConfig}
        testId={`plates-${block.name}`}
      />
    </section>
  );
}

// Per-exercise session note (distinct from the read-only routine template
// note). Instant local edit; persisted on blur. The carry-forward ghost is
// unavailable (the PREVIOUS/ghost fetch doesn't return notes), so it ships
// without the greyed previous-note.
function SessionNoteField({
  blockName,
  note,
  ghostNote,
  onCommit,
}: {
  blockName: string;
  note: string;
  ghostNote: string | null;
  onCommit: (note: string) => void;
}) {
  const [value, setValue] = useState(note);
  // Carry-forward ghost: the prior session's note shows greyed as the
  // placeholder until typed over (dropped on save if left untouched).
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() !== note.trim()) onCommit(value);
      }}
      placeholder={ghostNote ?? "Add a note…"}
      className="w-full border-b border-border bg-surface-2 px-4 py-1.5 text-2xs text-soft placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-inset focus:ring-ring/70"
      data-testid={`block-${blockName}-session-note`}
    />
  );
}

const REST_PRESETS: { label: string; sec: number | null }[] = [
  { label: "Off", sec: null },
  { label: "0:30", sec: 30 },
  { label: "1:00", sec: 60 },
  { label: "1:30", sec: 90 },
  { label: "2:00", sec: 120 },
  { label: "3:00", sec: 180 },
];

// Per-exercise overflow menu (Hevy three-dots): superset link/unlink, rest-timer
// target, and warm-up insert. Remove-exercise stays as the header ✕ (its test id
// is unchanged).
function BlockMenu({
  blockName,
  unit,
  otherBlocks,
  inSuperset,
  warmupEligible,
  heaviestDisplay,
  restSec,
  onLinkSuperset,
  onUnlinkSuperset,
  onSetRest,
  onAddWarmup,
}: {
  blockName: string;
  unit: Unit;
  otherBlocks: { seId: string; name: string }[];
  inSuperset: boolean;
  warmupEligible: boolean;
  heaviestDisplay: number | null;
  restSec: number | null;
  onLinkSuperset: (targetSeId: string) => void;
  onUnlinkSuperset: () => void;
  onSetRest: (restSec: number | null) => void;
  onAddWarmup: (displayWeight: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const labelCls =
    "px-3 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase";

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Exercise options"
        className="rounded-sm p-1 text-faint transition-colors duration-150 hover:text-ink md:p-0.5"
        data-testid={`block-${blockName}-menu`}
      >
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full right-0 z-20 mt-1 max-h-80 min-w-48 overflow-y-auto py-1">
            <p className={labelCls}>Rest timer</p>
            <div className="flex flex-wrap gap-1 px-3 pb-2">
              {REST_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onSetRest(p.sec);
                    setOpen(false);
                  }}
                  className={cn(
                    "num h-7 border px-2 text-2xs transition-colors duration-100",
                    (p.sec ?? null) === (restSec ?? null)
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface-2 text-soft hover:bg-surface-hover hover:text-ink",
                  )}
                  data-testid={`block-${blockName}-rest-${p.sec ?? "off"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="border-t border-border" />
            <p className={labelCls}>Superset</p>
            {otherBlocks.length === 0 ? (
              <p className="px-3 pb-2 text-2xs text-faint">
                Add another exercise to link.
              </p>
            ) : (
              otherBlocks.map((b) => (
                <button
                  key={b.seId}
                  type="button"
                  onClick={() => {
                    onLinkSuperset(b.seId);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                  data-testid={`block-${blockName}-superset-${b.name}`}
                >
                  <Link2 className="size-3.5 shrink-0 text-faint" />
                  <span className="truncate">Superset with {b.name}</span>
                </button>
              ))
            )}
            {inSuperset && (
              <button
                type="button"
                onClick={() => {
                  onUnlinkSuperset();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                data-testid={`block-${blockName}-unsuperset`}
              >
                <Unlink className="size-3.5 shrink-0 text-faint" />
                Remove from superset
              </button>
            )}

            {warmupEligible && (
              <>
                <div className="border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setWarmupOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                  data-testid={`block-${blockName}-warmup`}
                >
                  <Flame className="size-3.5 shrink-0 text-warn" />
                  Add warm-up sets
                </button>
              </>
            )}
          </div>
        </>
      )}

      <WarmupDialog
        open={warmupOpen}
        onOpenChange={setWarmupOpen}
        blockName={blockName}
        unit={unit}
        prefill={heaviestDisplay}
        onInsert={onAddWarmup}
      />
    </span>
  );
}

// Prompts for the target working weight, then inserts a percentage-based
// warm-up ramp (typed as warm-ups) above the working sets.
function WarmupDialog({
  open,
  onOpenChange,
  blockName,
  unit,
  prefill,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockName: string;
  unit: Unit;
  prefill: number | null;
  onInsert: (displayWeight: number) => void;
}) {
  const [weight, setWeight] = useState(prefill != null ? String(prefill) : "");
  // Re-seed the prefill each time the dialog opens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current)
      setWeight(prefill != null ? String(prefill) : "");
    wasOpen.current = open;
  }, [open, prefill]);

  function insert() {
    const w = Number.parseFloat(weight);
    if (Number.isFinite(w) && w > 0) {
      onInsert(w);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add warm-up sets" className="md:max-w-xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs font-medium tracking-wide text-faint uppercase">
              Working weight ({unit})
            </span>
            <Input
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insert();
                }
              }}
              autoFocus
              className="num"
              data-testid={`block-${blockName}-warmup-weight`}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={insert}
            data-testid={`block-${blockName}-warmup-insert`}
          >
            <Plus className="size-4" />
            Insert warm-up sets
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Weight-column header doubles as the per-exercise unit-override control: tap →
// kg / lbs / Default. The override lives in exercise_prefs (works on seed rows).
function UnitOverrideMenu({
  header,
  blockName,
  override,
  globalUnit,
  onSet,
}: {
  header: string;
  blockName: string;
  override: Unit | null;
  globalUnit: Unit;
  onSet: (unit: Unit | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const opts: { value: Unit | null; label: string }[] = [
    { value: "kg", label: "kg" },
    { value: "lb", label: "lbs" },
    { value: null, label: `Default (${unitLabel(globalUnit)})` },
  ];
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Weight unit for this exercise"
        className="flex items-center gap-1 tracking-widest uppercase transition-colors duration-100 hover:text-ink"
        data-testid={`block-${blockName}-unit`}
      >
        {header}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full left-0 z-20 mt-1 min-w-32 py-1">
            {opts.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => {
                  onSet(o.value);
                  setOpen(false);
                }}
                data-testid={`block-${blockName}-unit-${o.value ?? "default"}`}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs normal-case tracking-normal text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              >
                {o.label}
                {override === o.value && (
                  <Check className="size-3.5 text-accent" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

// Machine setup memory: the strip shows the remembered settings; the dialog
// edits them on the machine row itself, so the same setup appears in every
// future session.
function SetupStrip({
  machine,
  blockName,
}: {
  machine: Machine;
  blockName: string;
}) {
  const summary = (machine.settings ?? [])
    .filter((s) => s.value != null)
    .map((s) => `${s.label} ${s.value}`)
    .join(" · ");
  return (
    <Dialog>
      <DialogTrigger
        className="flex h-8 w-full items-center gap-2 border-b border-border bg-surface-2 px-4 text-left text-2xs text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
        data-testid={`setup-strip-${blockName}`}
      >
        <Settings2 className="size-4 shrink-0 text-faint" />
        <span className="truncate">
          {machine.brand ? `${machine.brand} · ` : ""}
          {machine.name}
        </span>
        {summary ? (
          <span className="num ml-auto shrink-0 truncate text-faint">
            {summary}
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-faint">set up…</span>
        )}
      </DialogTrigger>
      <DialogContent
        title={`Setup — ${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`}
      >
        <MachineEditor machine={machine} />
      </DialogContent>
    </Dialog>
  );
}

// Committed-value formatter for one column (— when the field is empty).
function committedText(
  key: ColKey,
  set: LoggedSet,
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (key) {
    case "weight":
      return set.weightKg != null
        ? String(toDisplayWeight(set.weightKg, unit))
        : "—";
    case "reps":
      return set.reps != null ? String(set.reps) : "—";
    case "duration":
      return set.durationSec != null ? formatMMSS(set.durationSec) : "—";
    case "distance":
      return set.distanceM != null
        ? String(toDisplayDistance(set.distanceM, distUnit))
        : "—";
  }
}

// PREVIOUS reference cell — quiet, tabular; blank when never logged at this
// index. On the draft row it's a tap-to-fill button (see ActiveRow).
function PreviousCell({
  previous,
  unit,
  testId,
}: {
  previous: GhostSet | null;
  unit: Unit;
  testId: string;
}) {
  const text = previous ? previousText(previous, unit) : null;
  return (
    <span
      className="num truncate text-2xs text-faint"
      data-testid={testId}
      title={text ?? undefined}
    >
      {text ?? "—"}
    </span>
  );
}

function CommittedRow({
  set,
  index,
  unit,
  distUnit,
  type,
  columns,
  template,
  showPrevious,
  previous,
  isPr,
  onSave,
  onDelete,
}: {
  set: LoggedSet;
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  columns: Column[];
  template: string;
  showPrevious: boolean;
  previous: GhostSet | null;
  isPr: boolean;
  onSave: (patch: SetPatch) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [rir, setRir] = useState("");
  const [rpe, setRpe] = useState("");
  const [note, setNote] = useState("");

  const has = (k: ColKey) => columns.some((c) => c.key === k);
  const effort = supportsEffort(type);
  const setType = (set.setType as SetType) ?? "normal";

  function openDetails() {
    setWeight(
      set.weightKg != null ? String(toDisplayWeight(set.weightKg, unit)) : "",
    );
    setReps(set.reps != null ? String(set.reps) : "");
    setDuration(set.durationSec != null ? formatMMSS(set.durationSec) : "");
    setDistance(
      set.distanceM != null
        ? String(toDisplayDistance(set.distanceM, distUnit))
        : "",
    );
    setRir(set.rir != null ? String(set.rir) : "");
    setRpe(set.rpe != null ? String(set.rpe) : "");
    setNote(set.note ?? "");
    setOpen(true);
  }

  function save() {
    const patch: SetPatch = {
      note: note.trim() === "" ? null : note.trim(),
    };
    if (has("weight")) {
      const d = weight.trim() === "" ? null : Number.parseFloat(weight);
      patch.weightKg =
        d == null || Number.isNaN(d) ? null : unit === "lb" ? lbToKg(d) : d;
    }
    if (has("reps")) {
      const r = reps.trim() === "" ? null : Number.parseInt(reps, 10);
      patch.reps = r != null && Number.isNaN(r) ? null : r;
    }
    if (has("duration")) patch.durationSec = parseDuration(duration);
    if (has("distance")) {
      const d = distance.trim() === "" ? null : Number.parseFloat(distance);
      patch.distanceM =
        d == null || Number.isNaN(d)
          ? null
          : distUnit === "km"
            ? kmToM(d)
            : miToM(d);
    }
    if (effort) {
      patch.rir = rir.trim() === "" ? null : Number.parseInt(rir, 10);
      patch.rpe = rpe.trim() === "" ? null : Number.parseFloat(rpe);
    }
    onSave(patch);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  // e1RM previews live off the fields being edited, so it reacts as you type.
  const showE1rm = has("weight") && has("reps");
  const liveWeightKg =
    weight.trim() === ""
      ? null
      : unit === "lb"
        ? lbToKg(Number.parseFloat(weight))
        : Number.parseFloat(weight);
  const e1rm = showE1rm
    ? e1rmFromEffort(
        liveWeightKg,
        reps.trim() === "" ? null : Number.parseInt(reps, 10),
        {
          rir: rir.trim() === "" ? null : Number.parseInt(rir, 10),
          rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
        },
      )
    : null;
  const restLabel =
    set.restSec != null ? formatDurationSeconds(set.restSec * 1000) : null;
  const labelCls = "text-2xs font-medium tracking-wide text-faint uppercase";

  return (
    <div className="relative border-t border-border">
      <div
        className="group commit-flash grid h-11 items-center gap-x-2 bg-surface px-4 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover md:h-8"
        style={{ gridTemplateColumns: template }}
        data-testid={`committed-${index}`}
      >
        <SetTypeCell
          index={index}
          setType={setType}
          ringState="done"
          onChange={(t) => onSave({ setType: t })}
          onRemove={onDelete}
          testId={`committed-${index}-type`}
        />
        {showPrevious && (
          <PreviousCell
            previous={previous}
            unit={unit}
            testId={`committed-${index}-previous`}
          />
        )}
        {columns.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={openDetails}
            className="num cursor-pointer text-left text-sm"
            title="Set details"
            data-testid={`committed-${index}-${c.key}`}
          >
            {committedText(c.key, set, unit, distUnit)}
          </button>
        ))}
        <span className="flex items-center justify-center gap-1">
          {effort && (
            <span className="num text-2xs text-faint max-md:hidden md:group-hover:hidden">
              {[
                set.rir != null ? `@${set.rir}` : null,
                set.rpe != null ? `RPE ${set.rpe}` : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          )}
          <button
            type="button"
            onClick={openDetails}
            title="Set details"
            className="rounded-sm p-1 text-faint transition-colors duration-150 hover:text-ink max-md:block md:hidden md:p-0.5 md:group-hover:block"
            data-testid={`set-menu-${index}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </span>
      </div>

      {isPr && (
        <span
          className="pointer-events-none absolute top-0.5 right-1.5 text-accent"
          title="Personal record"
          data-testid={`committed-${index}-medal`}
        >
          <Medal className="size-3.5" />
        </span>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Set ${index + 1} details`}
          className="md:max-w-sm"
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {columns.map((c, i) => (
                <div key={c.key} className="flex flex-col gap-1">
                  <span className={labelCls}>
                    {c.key === "weight"
                      ? `Weight (${weightLabel(type, unitLabel(unit))})`
                      : c.key === "reps"
                        ? "Reps"
                        : c.key === "duration"
                          ? "Time (m:ss)"
                          : `Distance (${distUnit})`}
                  </span>
                  {c.key === "weight" ? (
                    <Input
                      inputMode="decimal"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      onKeyDown={onKeyDown}
                      autoFocus={i === 0}
                      className="num"
                      data-testid={`edit-${index}-weight`}
                    />
                  ) : c.key === "reps" ? (
                    <Input
                      inputMode="numeric"
                      value={reps}
                      onChange={(e) => setReps(e.target.value)}
                      onKeyDown={onKeyDown}
                      autoFocus={i === 0}
                      className="num"
                      data-testid={`edit-${index}-reps`}
                    />
                  ) : c.key === "duration" ? (
                    <Input
                      inputMode="text"
                      placeholder="m:ss"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      onKeyDown={onKeyDown}
                      autoFocus={i === 0}
                      className="num"
                      data-testid={`edit-${index}-duration`}
                    />
                  ) : (
                    <Input
                      inputMode="decimal"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      onKeyDown={onKeyDown}
                      autoFocus={i === 0}
                      className="num"
                      data-testid={`edit-${index}-distance`}
                    />
                  )}
                </div>
              ))}
            </div>

            {effort && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className={cn(labelCls, "flex items-center gap-1")}>
                    RIR
                    <InfoTip lessonId="rir" />
                  </span>
                  <Input
                    inputMode="numeric"
                    placeholder="—"
                    value={rir}
                    onChange={(e) => setRir(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="num"
                    data-testid={`edit-${index}-rir`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className={labelCls}>RPE</span>
                  {/* TODO(lessons): <InfoTip lessonId="rpe" /> once copy exists */}
                  <RpeSelect
                    value={rpe}
                    onChange={setRpe}
                    testId={`edit-${index}-rpe`}
                  />
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Note</span>
              <textarea
                rows={3}
                placeholder="e.g. seat height 4, pad on notch 2, felt strong out of the hole…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid={`edit-${index}-note`}
                className="w-full resize-y rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
              />
            </label>

            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-2xs text-faint">
              <span className="flex items-center gap-1.5">
                <Timer className="size-3.5" />
                Rest{" "}
                <span
                  className="num text-soft"
                  data-testid={`set-rest-${index}`}
                >
                  {restLabel ?? "—"}
                </span>
              </span>
              {showE1rm && (
                <span>
                  e1RM ≈{" "}
                  <span className="num text-soft">
                    {e1rm != null
                      ? `${toDisplayWeight(e1rm, unit)} ${unitLabel(unit)}`
                      : "—"}
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                data-testid={`set-menu-${index}-delete`}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={save}
                data-testid={`edit-${index}-save`}
              >
                <Check className="size-4" />
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// RPE is a fixed 0.5-step scale (1–10), not a free-form number — a small
// select keeps it a quick pick and reads as clearly secondary to weight/reps.
const RPE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5);

function RpeSelect({
  value,
  onChange,
  autoFocus,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  testId: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // biome-ignore lint/a11y/noAutofocus: focuses the just-added RPE field
      autoFocus={autoFocus}
      data-testid={testId}
      className="num h-8 w-16 rounded-md border border-border-strong bg-surface px-1.5 text-xs text-soft transition-colors duration-150 ease-(--ease-out-quad) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
    >
      <option value="">—</option>
      {RPE_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function ActiveRow({
  seId,
  index,
  unit,
  distUnit,
  type,
  columns,
  template,
  showPrevious,
  previous,
  seed,
  nextSeedType,
  ghost,
  hasGhost,
  enabledMetrics,
  autoFocusWeight,
  barLoaded,
  onOpenPlates,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
}: {
  seId: string;
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  columns: Column[];
  template: string;
  showPrevious: boolean;
  previous: GhostSet | null;
  seed: SeedSet | undefined;
  nextSeedType: string | null;
  ghost: GhostSet;
  hasGhost: boolean;
  enabledMetrics: Metric[];
  autoFocusWeight: boolean;
  barLoaded: boolean;
  onOpenPlates: (target: number | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
}) {
  // Restore any uncommitted keystrokes persisted for this block (draft wins over
  // the routine/copy seed once the user has started typing).
  const [draft] = useState<Partial<DraftSnapshot> | null>(() =>
    loadDraft(seId),
  );
  // Seed the draft from the routine target / copied set for this index. A rep
  // range seeds only a placeholder (never a concrete reps value).
  const [weight, setWeight] = useState(
    () =>
      draft?.weight ??
      (seed?.weightKg != null
        ? String(toDisplayWeight(seed.weightKg, unit))
        : ""),
  );
  const [reps, setReps] = useState(
    () =>
      draft?.reps ??
      (seed && seed.repsMax == null && seed.reps != null
        ? String(seed.reps)
        : ""),
  );
  const [duration, setDuration] = useState(
    () =>
      draft?.duration ??
      (seed?.durationSec != null ? formatMMSS(seed.durationSec) : ""),
  );
  const [distance, setDistance] = useState(
    () =>
      draft?.distance ??
      (seed?.distanceM != null
        ? String(toDisplayDistance(seed.distanceM, distUnit))
        : ""),
  );
  const [rir, setRir] = useState(() => draft?.rir ?? "");
  const [rpe, setRpe] = useState(() => draft?.rpe ?? "");
  const [note, setNote] = useState(() => draft?.note ?? "");
  const [setType, setSetType] = useState<SetType>(
    () => draft?.setType ?? seed?.setType ?? "normal",
  );
  const [metricDraft, setMetricDraft] = useState<Record<string, string>>(
    () => draft?.metricDraft ?? {},
  );
  // Optional per-set fields the user opts into via the ⋯ menu (RIR / RPE /
  // note / custom metrics). Nothing shows until explicitly added.
  const [extras, setExtras] = useState<Set<string>>(
    () => new Set(draft?.extras ?? []),
  );
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const done = useRef(false);
  const suppressBlur = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  // Mirror uncommitted keystrokes to localStorage so a reload restores them.
  useEffect(() => {
    saveDraft(seId, {
      weight,
      reps,
      duration,
      distance,
      rir,
      rpe,
      note,
      setType,
      extras: [...extras],
      metricDraft,
    });
  }, [
    seId,
    weight,
    reps,
    duration,
    distance,
    rir,
    rpe,
    note,
    setType,
    extras,
    metricDraft,
  ]);

  // Open the plate calculator for the current draft weight without letting the
  // focus-out into the dialog commit the set.
  function openPlates() {
    suppressBlur.current = true;
    onOpenPlates(weight.trim() === "" ? null : Number.parseFloat(weight));
    window.setTimeout(() => {
      suppressBlur.current = false;
    }, 400);
  }

  const f = TYPE_FIELDS[type];
  const effort = supportsEffort(type);

  // Live stopwatch readout while this row's timer runs (ticks each second).
  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [timerRunning]);
  const liveElapsed =
    timerRunning && timerStartedAt != null
      ? Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000))
      : null;
  const durationDisplay =
    liveElapsed != null ? formatMMSS(liveElapsed) : duration;

  const extraOptions = [
    ...(effort
      ? [
          { key: "rir", label: "RIR" },
          { key: "rpe", label: "RPE" },
        ]
      : []),
    { key: "note", label: "Note" },
    ...enabledMetrics.map((m) => ({ key: m.id, label: m.name })),
  ];

  function toggleExtra(key: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastAdded(key);
    setMenuOpen(false);
  }

  // Stop → capture elapsed into the duration field; start → begin the session
  // timer (which is exclusive, so any other running row's stops). Typing the
  // time by hand stays available whenever the timer isn't running.
  function toggleTimer() {
    if (liveElapsed != null) setDuration(formatMMSS(liveElapsed));
    onToggleTimer();
  }

  const ghostWeight =
    ghost.weightKg != null ? toDisplayWeight(ghost.weightKg, unit) : null;
  const ghostReps = ghost.reps != null ? String(ghost.reps) : null;
  const ghostDuration =
    ghost.durationSec != null ? formatMMSS(ghost.durationSec) : null;
  const ghostDistance =
    ghost.distanceM != null
      ? String(toDisplayDistance(ghost.distanceM, distUnit))
      : null;
  // Rep-range placeholder ("8–12") when the routine seeds a range at this index.
  const repRangePlaceholder =
    seed?.repsMax != null ? `${seed.reps ?? ""}–${seed.repsMax}` : null;

  // Tap the PREVIOUS cell → autofill this draft row from last time.
  function fillFromPrevious() {
    if (!previous) return;
    if (f.weight && previous.weightKg != null)
      setWeight(String(toDisplayWeight(previous.weightKg, unit)));
    if (f.reps && previous.reps != null) setReps(String(previous.reps));
    if (f.duration && previous.durationSec != null)
      setDuration(formatMMSS(previous.durationSec));
    if (f.distance && previous.distanceM != null)
      setDistance(String(toDisplayDistance(previous.distanceM, distUnit)));
  }

  function metricValues(): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};
    for (const m of enabledMetrics) {
      const raw = (metricDraft[m.id] ?? "").trim();
      if (raw === "") continue;
      out[m.id] =
        m.type === "number" || m.type === "scale"
          ? Number.parseFloat(raw)
          : m.type === "checkbox"
            ? raw === "true"
            : raw;
    }
    return Object.keys(out).length ? out : null;
  }

  function parseFields(adoptGhost: boolean) {
    let weightKg: number | null = null;
    let repsN: number | null = null;
    let durationSec: number | null = null;
    let distanceM: number | null = null;
    if (f.weight) {
      const d = weight.trim() === "" ? null : Number.parseFloat(weight);
      weightKg =
        d == null || Number.isNaN(d) ? null : unit === "lb" ? lbToKg(d) : d;
    }
    if (f.reps) {
      const r = reps.trim() === "" ? null : Number.parseInt(reps, 10);
      repsN = r != null && Number.isNaN(r) ? null : r;
    }
    if (f.duration) durationSec = parseDuration(durationDisplay);
    if (f.distance) {
      const d = distance.trim() === "" ? null : Number.parseFloat(distance);
      distanceM =
        d == null || Number.isNaN(d)
          ? null
          : distUnit === "km"
            ? kmToM(d)
            : miToM(d);
    }
    if (adoptGhost && hasGhost) {
      // Enter on empty fields accepts the ghost values (tap-to-accept).
      if (f.weight) weightKg = weightKg ?? ghost.weightKg ?? null;
      if (f.reps) repsN = repsN ?? ghost.reps ?? null;
      if (f.duration) durationSec = durationSec ?? ghost.durationSec ?? null;
      if (f.distance) distanceM = distanceM ?? ghost.distanceM ?? null;
    }
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  function allActiveFilled(): boolean {
    if (f.weight && weight.trim() === "") return false;
    if (f.reps && reps.trim() === "") return false;
    if (f.duration && durationDisplay.trim() === "") return false;
    if (f.distance && distance.trim() === "") return false;
    return true;
  }

  function commit(adoptGhost: boolean) {
    if (done.current) return;
    const v = parseFields(adoptGhost);
    const anyPresent =
      (f.weight && v.weightKg != null) ||
      (f.reps && v.reps != null) ||
      (f.duration && v.durationSec != null) ||
      (f.distance && v.distanceM != null);
    if (!anyPresent) return;
    done.current = true;
    clearDraft(seId);
    if (timerRunning) onToggleTimer();
    onCommit(
      {
        weightKg: v.weightKg,
        reps: v.reps,
        setType,
        durationSec: v.durationSec,
        distanceM: v.distanceM,
        rir: effort && rir.trim() !== "" ? Number.parseInt(rir, 10) : null,
        rpe: effort && rpe.trim() !== "" ? Number.parseFloat(rpe) : null,
        note: note.trim() === "" ? null : note.trim(),
        metricValues: metricValues(),
      },
      { exerciseType: type, nextSetType: nextSeedType },
    );
  }

  function onBlur(e: React.FocusEvent) {
    // Finalize only when focus truly leaves the row. Moving to another control
    // inside this row (the ⋯ menu, the RIR / RPE / note / metric fields) must not
    // commit the set out from under the user — committing swaps this draft row
    // for a fresh one, which reads as a phantom "new set" and hides the popup.
    // Opening the plate sheet also moves focus out (into a portal) — suppressed.
    if (suppressBlur.current) return;
    const next = e.relatedTarget as Node | null;
    if (next && rowRef.current?.contains(next)) return;
    if (allActiveFilled()) commit(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(true);
    }
  }

  // One input cell per data column (weight / reps / time / distance). The time
  // cell also carries the inline stopwatch control.
  function dataCell(key: ColKey, autoFocus: boolean) {
    if (key === "weight") {
      const input = (
        <Input
          key={key}
          inputMode="decimal"
          placeholder={
            ghostWeight != null ? String(ghostWeight) : unitLabel(unit)
          }
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-weight`}
        />
      );
      // Bar-loaded exercises get a plate-calculator affordance beside the weight.
      return barLoaded ? (
        <span key={key} className="flex items-center gap-1">
          {input}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openPlates}
            title="Plate calculator"
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink md:size-8"
            data-testid={`set-${index}-plates`}
          >
            <Calculator className="size-3.5" />
          </button>
        </span>
      ) : (
        input
      );
    }
    if (key === "reps")
      return (
        <Input
          key={key}
          inputMode="numeric"
          placeholder={repRangePlaceholder ?? ghostReps ?? "reps"}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-reps`}
        />
      );
    if (key === "distance")
      return (
        <Input
          key={key}
          inputMode="decimal"
          placeholder={ghostDistance ?? distUnit}
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-distance`}
        />
      );
    // duration
    return (
      <span key={key} className="flex items-center gap-1">
        <Input
          inputMode="text"
          placeholder={ghostDuration ?? "m:ss"}
          value={durationDisplay}
          readOnly={timerRunning}
          onChange={(e) => setDuration(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          className="num h-10 md:h-8"
          data-testid={`set-${index}-duration`}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleTimer}
          title={timerRunning ? "Stop timer" : "Start timer"}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md border border-border transition-colors duration-100 md:size-8",
            timerRunning
              ? "bg-accent text-accent-fg"
              : "bg-surface-2 text-soft hover:bg-surface-hover hover:text-ink",
          )}
          data-testid={`set-${index}-timer`}
        >
          {timerRunning ? (
            <Square className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>
      </span>
    );
  }

  return (
    <div ref={rowRef} className="border-t border-border px-4 py-2">
      <div
        className="grid items-center gap-x-2"
        style={{ gridTemplateColumns: template }}
      >
        <SetTypeCell
          index={index}
          setType={setType}
          ringState="empty"
          onChange={setSetType}
          testId={`set-${index}-type`}
        />
        {showPrevious && (
          <button
            type="button"
            // Keep the input focused so tapping never fires blur-to-commit.
            onMouseDown={(e) => e.preventDefault()}
            onClick={fillFromPrevious}
            disabled={!previous}
            title={previous ? "Fill from last time" : undefined}
            className="num truncate text-left text-2xs text-faint transition-colors duration-100 enabled:hover:text-ink disabled:cursor-default"
            data-testid={`set-${index}-previous`}
          >
            {previous ? (previousText(previous, unit) ?? "—") : "—"}
          </button>
        )}
        {columns.map((c, i) => dataCell(c.key, autoFocusWeight && i === 0))}
        <span className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            // Keep the weight/reps input focused so tapping never fires the
            // blur-to-commit — Safari doesn't focus buttons on tap.
            onMouseDown={(e) => e.preventDefault()}
            title="Add RIR / RPE / note / metrics"
            className="rounded-md border border-border bg-surface-2 p-1.5 text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
            data-testid={`set-${index}-more`}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="floating absolute top-full right-0 z-20 mt-1 min-w-36 py-1">
                {extraOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleExtra(o.key)}
                    data-testid={`set-${index}-add-${o.key}`}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                  >
                    {o.label}
                    {extras.has(o.key) && (
                      <Check className="size-3.5 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </span>
      </div>
      {extras.size > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {(extras.has("rir") || extras.has("rpe")) && (
            <div className="flex items-end gap-3 pl-10">
              {extras.has("rir") && (
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-2xs font-medium tracking-wide text-faint uppercase">
                    RIR
                    <InfoTip lessonId="rir" />
                  </span>
                  <Input
                    inputMode="numeric"
                    placeholder="—"
                    value={rir}
                    onChange={(e) => setRir(e.target.value)}
                    onKeyDown={onKeyDown}
                    autoFocus={lastAdded === "rir"}
                    className="num h-8 w-16 bg-surface text-xs text-soft"
                    data-testid={`set-${index}-rir`}
                  />
                </div>
              )}
              {extras.has("rpe") && (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                    RPE
                  </span>
                  {/* TODO(lessons): <InfoTip lessonId="rpe" /> once copy exists */}
                  <RpeSelect
                    value={rpe}
                    onChange={setRpe}
                    autoFocus={lastAdded === "rpe"}
                    testId={`set-${index}-rpe`}
                  />
                </div>
              )}
            </div>
          )}
          {extras.has("note") && (
            <div className="grid grid-cols-[2rem_1fr_2fr_2.5rem] items-center gap-x-2">
              <span />
              <Input
                placeholder="// note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={onKeyDown}
                autoFocus={lastAdded === "note"}
                className="col-span-2 h-10 md:h-8"
                data-testid={`set-${index}-note`}
              />
              <span />
            </div>
          )}
          {enabledMetrics
            .filter((m) => extras.has(m.id))
            .map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[2rem_1fr_2fr_2.5rem] items-center gap-x-2"
              >
                <span />
                <span className="truncate text-2xs text-faint">{m.name}</span>
                {m.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={metricDraft[m.id] === "true"}
                    onChange={(e) =>
                      setMetricDraft((d) => ({
                        ...d,
                        [m.id]: e.target.checked ? "true" : "",
                      }))
                    }
                    className="size-4 justify-self-start accent-(--accent)"
                    data-testid={`set-${index}-metric-${m.id}`}
                  />
                ) : (
                  <Input
                    inputMode={m.type === "text" ? undefined : "decimal"}
                    placeholder={m.type === "text" ? m.name : "0"}
                    value={metricDraft[m.id] ?? ""}
                    onChange={(e) =>
                      setMetricDraft((d) => ({ ...d, [m.id]: e.target.value }))
                    }
                    onKeyDown={onKeyDown}
                    autoFocus={lastAdded === m.id}
                    className="num h-10 md:h-8"
                    data-testid={`set-${index}-metric-${m.id}`}
                  />
                )}
                <span />
              </div>
            ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => commit(true)}
        className="mt-2 h-8 w-full"
        data-testid={`set-${index}-add`}
      >
        <Plus className="size-3" />
        Add set
      </Button>
    </div>
  );
}

// Top-bar duration readout that doubles as the pause / edit-start control
// (Hevy: tapping the stopwatch opens Pause·Resume and start-date/time edits).
// Duration = (end | now) − started − paused; freezes while paused.
function SessionDurationControl({
  startedAt,
  endedAt,
  paused,
  pausedMs,
  pauseStartedAt,
  onTogglePause,
  onEditStart,
}: {
  startedAt: number;
  endedAt: number | null;
  paused: boolean;
  pausedMs: number;
  pauseStartedAt: number | null;
  onTogglePause: () => void;
  onEditStart: (ms: number) => void;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (endedAt != null || paused) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endedAt, paused]);

  const nowRef = paused && pauseStartedAt != null ? pauseStartedAt : Date.now();
  const duration = Math.max(0, (endedAt ?? nowRef) - startedAt - pausedMs);

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Duration · pause / edit start"
        className={cn(
          "num flex h-8 items-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-100",
          paused
            ? "bg-accent-soft text-accent"
            : "text-soft hover:bg-surface-hover",
        )}
        data-testid="session-duration"
      >
        {paused && <Pause className="size-3.5" />}
        {formatDurationSeconds(duration)}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full right-0 z-20 mt-1 min-w-52 p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onTogglePause();
                setOpen(false);
              }}
              data-testid="session-pause-toggle"
            >
              {paused ? (
                <>
                  <Play className="size-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="size-3.5" />
                  Pause
                </>
              )}
            </Button>
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                Start
              </span>
              <Input
                type="datetime-local"
                className="num"
                value={toLocalInput(startedAt)}
                onChange={(e) => {
                  const ms = new Date(e.target.value).getTime();
                  if (Number.isFinite(ms)) onEditStart(ms);
                }}
                data-testid="session-start-input"
              />
            </div>
          </div>
        </>
      )}
    </span>
  );
}

function RestTimer({ since }: { since: number | null }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [since]);

  if (since === null) return null;
  const total = Math.floor((Date.now() - since) / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return (
    <span className="num flex h-8 shrink-0 items-center gap-2 rounded-md bg-translucent px-2 text-xs text-soft shadow-(--inset-control)">
      <Timer className="size-4" />
      {m}:{s}
    </span>
  );
}
