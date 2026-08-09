import {
  checkSetForPR,
  computeRecords,
  countSets,
  type Exercise,
  type ExercisePatch,
  type ExercisePref,
  type ExerciseRecords,
  type ExerciseType,
  e1rmFromEffort,
  formatPrevious,
  formatWeight,
  type GhostSet,
  groupByPrimaryMuscle,
  groupSetsBySetNo,
  isBarLoaded,
  isConfidentMatch,
  kgToLb,
  kmToM,
  LATERALITY,
  LATERALITY_LABELS,
  type Laterality,
  type LoggedSet,
  lbToKg,
  type Machine,
  type MatchCandidate,
  type Metric,
  matchExerciseName,
  miToM,
  type NewRoutineInput,
  newId,
  type ParsedSetUtterance,
  type PlateConfig,
  type PrType,
  parseSetUtterance,
  type RestTimerState,
  type RoutineDetail,
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
} from "@frog/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  ChevronDown,
  Flame,
  History,
  Link2,
  Medal,
  Mic,
  MoreVertical,
  NotebookPen,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Square,
  StickyNote,
  Timer,
  Trash2,
  Unlink,
  Wrench,
} from "lucide-react";
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ExerciseRibbon, ExerciseThumb } from "@/components/anatomy-ui";
import { MachineAttachDialog } from "@/components/attach-machine";
import { ConditionsChip } from "@/components/conditions";
import { ExerciseEditor } from "@/components/exercise-editor";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { InfoTip } from "@/components/lesson";
import { MachineEditor } from "@/components/machines";
import { PlateSheet } from "@/components/session/plate-sheet";
import { PrBanner, type PrBannerData } from "@/components/session/pr-banner";
import { RestPill } from "@/components/session/rest-countdown";
import {
  FinishPhotoStrip,
  type PendingPhoto,
} from "@/components/session-photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Dots } from "@/components/ui/dots";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SetTypeCell } from "@/components/ui/set-type-cell";
import { Toolbar } from "@/components/ui/toolbar";
import { formatDurationSeconds, formatMMSS, parseDuration } from "@/lib/format";
import type { LessonId } from "@/lib/lessons";
import { usePendingExercises } from "@/lib/pending-exercises";
import { useUpdateUserPrefs, useUserPrefs } from "@/lib/profile-queries";
import {
  copyExerciseOpts,
  useCreateExercise,
  useDeleteExercise,
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
  useUpdateExercise,
} from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import {
  effortReadout,
  parseLoggedRirFields,
  rirEditFields,
  rirRange,
} from "@/lib/rir";
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
import { cn } from "@/lib/utils";
import { useVoice, voice } from "@/lib/voice";
import { getWarmupMethod } from "@/lib/warmup-method";
import {
  useKeepAwake,
  useLivePrBanner,
  useSmartSupersetScroll,
} from "@/lib/workout-prefs";

type BlockState = {
  seId: string;
  exerciseId: string;
  name: string;
  // The exercise the PREVIOUS/last-note lookups key on. Set by the
  // copy-on-write swap (a seed exercise cloned into a private custom copy)
  // so a fresh copy's empty history doesn't blank the reference column
  // mid-session; null = the block has never been swapped.
  ghostExerciseId?: string;
  // Provenance from a routine-started session (null = ad-hoc / empty workout).
  routineExerciseId: string | null;
  // Superset grouping (int id shared by members; null = solo). Per-exercise
  // session note (distinct from the routine template note).
  supersetGroup: number | null;
  note: string | null;
  committed: LoggedSet[];
};

// Context an ExerciseBlock hands up on set completion, so the screen can run the
// PR check + rest-timer + smart-scroll without re-deriving per-block facts.
type CommitCtx = {
  exerciseType: ExerciseType;
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
  /** Present only for a unilateral pair: the right side's own values,
   * written as a second row sharing this commit's set_no. Set type, RIR/RPE,
   * note and metrics seed the right row from the left side at commit — one
   * entry for the symmetric case. Only set type stays shared afterwards (its
   * ᴸ control writes both rows); post-commit RIR/RPE/note are per-limb, each
   * row's details sheet editing its own. */
  otherSide?: {
    weightKg: number | null;
    reps: number | null;
    durationSec: number | null;
    distanceM: number | null;
  } | null;
};

export type SetPatch = {
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rir?: number | null;
  rirMin?: number | null;
  rirMax?: number | null;
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
  /** Per-set laterality override from the routine template (unilateral
   * routine set = one pair, two sides). Null = fall through to the
   * exercise-level default. */
  laterality?: Laterality | null;
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
// DISTANCE | TIME, WEIGHT | DISTANCE). See TYPE_FIELDS in @frog/core.
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
  if (f.reps)
    cols.push({
      key: "reps",
      // Unilateral: the ᴸ/ᴿ line markers already say "per side", so the
      // header stays "reps" (legacy alternating rows read as bilateral too —
      // docs/DECISIONS.md 2026-08-08).
      header: "reps",
    });
  return cols;
}

// Compact previous-performance string for the pre-flight "Last workout"
// summary: weight sans unit (the weight column header already carries it) —
// "100 × 8", "1:30" for time.
function previousText(g: GhostSet, unit: Unit): string | null {
  return formatPrevious(g, (kg) => String(toDisplayWeight(kg, unit)));
}

// Nothing usable came back from the mic — either no speech at all or a
// transcript the parser couldn't read as a set.
function micUnheard(): string {
  return voice("Didn't catch that.", "Didn't catch that — try again?");
}

// SpeechRecognition error codes → honest copy. Recognition is server-backed in
// Chrome, so a dropped connection or a blocked service is an outage, not a
// mishearing: telling the user they weren't heard would invite an endless retry.
function micErrorMessage(error: string): string {
  if (error === "not-allowed")
    return voice(
      "Microphone blocked — allow mic access in your browser settings.",
      "Microphone blocked — the frog needs mic access in your browser settings.",
    );
  if (
    error === "network" ||
    error === "audio-capture" ||
    error === "service-not-allowed"
  )
    return voice(
      "Voice recognition unavailable — try again in a moment.",
      "Voice recognition unavailable — the frog's line dropped. Try again in a moment.",
    );
  return micUnheard();
}

// The stored per-exercise weight-unit override, null when unset or unreadable.
function weightUnitOverrideFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
): Unit | null {
  const override = prefs.find((p) => p.exerciseId === exerciseId)?.weightUnit;
  return override === "kg" || override === "lb" ? override : null;
}

// A block's display weight unit: that override, else the session unit. One
// copy — the block's grid and the voice round-trip both read it, and a
// display↔kg conversion that disagreed would silently shift weights.
function blockUnitFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
  sessionUnit: Unit,
): Unit {
  return weightUnitOverrideFor(prefs, exerciseId) ?? sessionUnit;
}

export default function SessionScreen() {
  const { id: sessionId = "" } = useParams();
  const repo = useRepo();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { unit } = useUnit();
  const { t } = useVoice();
  const sessionQuery = useSession(sessionId);
  const session = sessionQuery.data;
  // Until the row itself is in hand, routineId is unknown — the seed gate
  // below can't tell a routine start from an ad-hoc workout. Presence, not
  // isLoading: a query in `error` status reports isLoading false even while
  // the error branch's Retry is refetching it, and it stays false if the
  // session load failed outright — either way the gate would fall through
  // with routineId still unknown.
  const sessionLoaded = session !== undefined;
  const {
    data: restored,
    isError: restoredError,
    refetch: refetchRestored,
  } = useSessionExercises(sessionId);
  const { data: metrics = [] } = useMetrics();
  // Routine provenance: template targets + notes for prefill / write-back.
  const routineQuery = useRoutineDetail(session?.routineId ?? null);
  const routineDetail = routineQuery.data ?? null;
  // Presence, not isLoading (same rule as the session row above): an errored
  // query reports isLoading false, so it can't hold the gate while the error
  // branch's Retry refetches it. Only consulted for routine-started sessions
  // (the query is disabled otherwise), and false once the routine resolves —
  // even to null (deleted routine) or to a definitive error — so blocks
  // always eventually seed rather than hanging on the loading branch.
  const routineLoading =
    routineQuery.isFetching ||
    (routineQuery.data === undefined && !routineQuery.isError);

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

  const { data: exercises = [] } = useExercises();
  const pendingExercises = usePendingExercises();

  // Device prefs (localStorage) + server prefs (plate config).
  const [smartScroll] = useSmartSupersetScroll();
  const [livePrEnabled] = useLivePrBanner();
  const [keepAwake] = useKeepAwake();
  const { data: userPrefs } = useUserPrefs();
  const { data: exercisePrefs = [] } = useExercisePrefs();
  const updatePrefs = useUpdateUserPrefs();
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

  // Per-block rest stopwatch (keyed by seId; absent = none running).
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

  // ActiveRow handles, keyed by block — the voice mic's target for applying a
  // parsed weight/reps without going through onCommit.
  const rowHandles = useRef<Map<string, ActiveRowHandle>>(new Map());
  const registerRowHandle = useCallback(
    (seId: string, handle: ActiveRowHandle | null) => {
      if (handle) rowHandles.current.set(seId, handle);
      else rowHandles.current.delete(seId);
    },
    [],
  );

  // Voice logging: speak a full utterance ("bench press 135 lbs for 8 reps")
  // to fill the matching block's active row — parse → fuzzy-match against
  // this session's own blocks → apply to that row's local state. Never
  // auto-commits; Enter / Add set stays the explicit trigger. Feature-detect,
  // don't render a dead control: iOS Safari support is inconsistent, Firefox
  // has none, and the API requires a secure context.
  const speechSupported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    (window.SpeechRecognition != null ||
      window.webkitSpeechRecognition != null);
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  // Parsed utterance awaiting a manual block pick (no confident match, or a tie
  // between blocks) — kept unconverted because the effective unit depends on
  // the picked block. `candidates` narrows the list when the tie names it.
  const [voicePicker, setVoicePicker] = useState<{
    parsed: ParsedSetUtterance;
    candidates: MatchCandidate[];
  } | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micMessageTimer = useRef<number | null>(null);

  // Live snapshot for the speech handlers: onresult fires seconds after
  // startListening ran, by which time the blocks, the session unit, or the
  // per-exercise unit overrides may all have moved on.
  const voiceCtx = useRef({ blocks, unit, exercisePrefs });
  useEffect(() => {
    voiceCtx.current = { blocks, unit, exercisePrefs };
  });

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (micMessageTimer.current != null)
        window.clearTimeout(micMessageTimer.current);
    };
  }, []);

  function showMicMessage(message: string) {
    setMicMessage(message);
    if (micMessageTimer.current != null)
      window.clearTimeout(micMessageTimer.current);
    micMessageTimer.current = window.setTimeout(() => {
      micMessageTimer.current = null;
      setMicMessage(null);
    }, 2500);
  }

  // Effective unit for a spoken weight: spoken unit word > the target block's
  // per-exercise unit override (same lookup ExerciseBlock uses) > session unit.
  function voiceWeightKg(
    parsed: ParsedSetUtterance,
    exerciseId: string | null,
  ): number | null {
    if (parsed.weightDisplay == null) return null;
    const { unit: sessionUnit, exercisePrefs: prefs } = voiceCtx.current;
    const effectiveUnit = parsed.unitExplicit
      ? parsed.unit
      : blockUnitFor(prefs, exerciseId, sessionUnit);
    return effectiveUnit === "lb"
      ? lbToKg(parsed.weightDisplay)
      : parsed.weightDisplay;
  }

  function applyVoiceToBlock(seId: string, parsed: ParsedSetUtterance) {
    const block = (voiceCtx.current.blocks ?? []).find((b) => b.seId === seId);
    // False when the row's type has no field the utterance could fill (a weight
    // against a bodyweight row, anything against a duration row) — say so
    // rather than scrolling to a block that silently stayed empty.
    const applied =
      rowHandles.current.get(seId)?.applyVoice({
        weightKg: voiceWeightKg(parsed, block?.exerciseId ?? null),
        reps: parsed.reps,
      }) ?? false;
    blockRefs.current
      .get(seId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!applied)
      showMicMessage(
        `${block?.name ?? "That exercise"}: ${voice(
          "nothing there to fill.",
          "nothing there to fill — wrong shape of set.",
        )}`,
      );
  }

  function handleVoiceResult(transcript: string) {
    const { blocks: liveBlocks, unit: liveUnit } = voiceCtx.current;
    const parsed = parseSetUtterance(transcript, liveUnit);
    if (!parsed) {
      showMicMessage(micUnheard());
      return;
    }
    const candidates = (liveBlocks ?? []).map((b) => ({
      id: b.seId,
      name: b.name,
    }));
    const match = matchExerciseName(parsed.name, candidates);
    if (!match || !isConfidentMatch(match)) {
      setVoicePicker({ parsed, candidates });
      return;
    }
    // Equally good blocks (the same exercise logged twice for back-off work,
    // say) — filling the first one silently would fill the wrong one half the
    // time, so ask, scoped to the blocks that actually tied.
    if (match.tied.length > 1) {
      setVoicePicker({ parsed, candidates: match.tied });
      return;
    }
    applyVoiceToBlock(match.id, parsed);
  }

  function startListening() {
    // The ref, not `listening`: state only flips on the next render, so two
    // clicks in one batch would otherwise both build a recognition and the
    // second one's throw would orphan the first, still-recording instance.
    if (recognitionRef.current) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const reset = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (e) => {
      handleVoiceResult(e.results[0]?.[0]?.transcript ?? "");
    };
    recognition.onerror = (e) => {
      reset();
      showMicMessage(micErrorMessage(e.error));
    };
    recognition.onnomatch = () => {
      reset();
      showMicMessage(micUnheard());
    };
    recognition.onend = reset;
    recognitionRef.current = recognition;
    setMicMessage(null);
    setListening(true);
    // start() throws synchronously when a recognition is already running, and
    // on some WebKit builds for permission/policy failures. Without this the
    // button would stay stuck in its active state with no live recognition
    // behind it, and stop() on a never-started instance can't unstick it.
    try {
      recognition.start();
    } catch {
      reset();
      showMicMessage(
        voice("Couldn't start the mic.", "Couldn't start the mic — try again?"),
      );
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

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
    // The two queries race: when session_exercises lands first, session is
    // still undefined and `session?.routineId` reads as "ad-hoc", skipping the
    // routine wait below and mounting the grid unseeded — permanently, since
    // blocks seed once. Wait for the session row before deciding.
    if (!sessionLoaded) return;
    if (session?.routineId && routineLoading) return;
    setBlocks(
      restored.map((se) => ({
        seId: se.id,
        exerciseId: se.exerciseId,
        name: se.exerciseName,
        routineExerciseId: se.routineExerciseId,
        supersetGroup: se.supersetGroup,
        note: se.note,
        committed: se.sets,
      })),
    );
  }, [restored, blocks, sessionLoaded, session?.routineId, routineLoading]);

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

  // Every set write that hasn't landed yet, keyed by tempId so an entry
  // clears without touching any other one. `failed` flips once the write
  // exhausts its retries (app.tsx: mutations retry 3x) and never persisted —
  // the optimistic row is still on screen looking saved, which is exactly the
  // silent-data-loss shape from the 2026-08-06 outage — and only those are
  // reported. Entries are registered when the write is dispatched, not when
  // it fails: the retries take ~7s, and an edit or delete inside that window
  // has to reach the queued payload too (see saveSet/removeSet/removeBlock)
  // or a later failure would queue the pre-edit values, or a deleted row.
  const [queuedSets, setQueuedSets] = useState<
    Record<
      string,
      {
        seId: string;
        set: CommitInput;
        tempId: string;
        setNo: number;
        failed: boolean;
      }
    >
  >({});

  const logSet = useMutation({
    mutationFn: (input: {
      seId: string;
      set: CommitInput;
      tempId: string;
      setNo: number;
    }) => repo.logSet(input.seId, input.set, input.tempId, input.setNo),
    // Record the optimistic→real id mapping (edit/delete translate through it).
    // The committed row keeps its optimistic id, so it never remounts here.
    onSuccess: (realId, { tempId }) => {
      setIdMap((prev) => ({ ...prev, [tempId]: realId }));
      setQueuedSets((prev) => {
        if (!(tempId in prev)) return prev;
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
    },
    // Only ever marks an entry that is still queued: a set removed while its
    // write was in flight has no entry left, and must not come back here.
    onError: (_err, { tempId }) => {
      setQueuedSets((prev) => {
        const queued = prev[tempId];
        if (!queued || queued.failed) return prev;
        return { ...prev, [tempId]: { ...queued, failed: true } };
      });
    },
    // A new set can mint a PR — mark the records snapshot stale (no observer is
    // mounted mid-session, so this never refetches on the logging path).
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["records-data"] });
      void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
    },
  });

  // Track the payload from the moment it is dispatched, so the reconciliation
  // below covers the whole in-flight window and not just exhausted writes.
  function queueSet(v: {
    seId: string;
    set: CommitInput;
    tempId: string;
    setNo: number;
  }) {
    setQueuedSets((prev) => ({ ...prev, [v.tempId]: { ...v, failed: false } }));
  }

  const failedSets = Object.values(queuedSets).filter((v) => v.failed);
  const failedSetCount = failedSets.length;
  // The entry stays failed until its write actually lands (onSuccess clears
  // it), so the banner keeps telling the truth while a retry is in flight.
  function retryFailedSets() {
    for (const { seId, set, tempId, setNo } of failedSets)
      logSet.mutate({ seId, set, tempId, setNo });
  }
  // A queued payload must never outlive the row it describes: editing or
  // deleting a set that never persisted has to reach its retry entry too,
  // or Retry writes stale values / resurrects a deleted row.
  function dropQueuedSets(
    match: (tempId: string, v: (typeof queuedSets)[string]) => boolean,
  ) {
    setQueuedSets((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id, v]) => !match(id, v)),
      );
      return Object.keys(next).length === Object.keys(prev).length
        ? prev
        : next;
    });
  }

  async function pickExercise(exerciseId: string, name: string) {
    // Its row exists locally but not yet in Postgres — the FK would reject it.
    if (pendingExercises.has(exerciseId)) return;
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
    const block = (blocks ?? []).find((b) => b.seId === seId);
    // One number for both the optimistic row and the write, so a retry can't
    // re-derive a different one. High-water mark rather than a count: removing
    // a set leaves a gap (the row is only soft-deleted server-side), and
    // reusing its number would collide with a live row. A unilateral pair
    // shares this one set_no across its two rows.
    const setNo = (block?.committed ?? []).reduce(
      (next, s) => Math.max(next, s.setNo + 1),
      0,
    );
    const leftTempId = newId();
    const { otherSide, ...leftFields } = set;
    const leftRow = { ...leftFields, restSec, id: leftTempId, setNo };
    // The right side writes rest_sec: null — one commit per physical set means
    // one rest stopwatch (below), and the header average already filters nulls.
    // Set type / RIR / RPE / note / metrics seed from the left side at commit,
    // so the symmetric case is one entry. Only set type stays shared after
    // that — post-commit RIR/RPE/note are per-limb, edited from each row's own
    // details sheet and surfaced on that row's line when they diverge.
    const rightTempId = otherSide ? newId() : null;
    const rightRow =
      otherSide && rightTempId
        ? {
            weightKg: otherSide.weightKg,
            reps: otherSide.reps,
            durationSec: otherSide.durationSec,
            distanceM: otherSide.distanceM,
            setType: set.setType,
            rir: set.rir,
            rirMin: set.rirMin,
            rirMax: set.rirMax,
            rpe: set.rpe,
            note: set.note,
            metricValues: set.metricValues,
            side: "right" as const,
            restSec: null,
            id: rightTempId,
            setNo,
          }
        : null;
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId
          ? {
              ...b,
              committed: [
                ...b.committed,
                leftRow,
                ...(rightRow ? [rightRow] : []),
              ],
            }
          : b,
      ),
    );
    setLastCommitByBlock((prev) => ({ ...prev, [seId]: Date.now() }));
    const leftWrite = { seId, set: leftRow, tempId: leftTempId, setNo };
    queueSet(leftWrite);
    logSet.mutate(leftWrite);
    if (rightRow) {
      const rightWrite = { seId, set: rightRow, tempId: rightRow.id, setNo };
      queueSet(rightWrite);
      logSet.mutate(rightWrite);
    }
    // The uncommitted row is now saved server-side — drop its local draft.
    clearDraft(seId);

    // Live PR check against the mount-time bests snapshot (session-scoped types
    // finalize at save; only set-scoped ones fire live) — once per side row,
    // since either side of a unilateral pair can PR independently.
    if (block && prSnapshot) {
      const rows = rightRow ? [leftRow, rightRow] : [leftRow];
      const hitTypes = new Set<PrType>();
      for (const row of rows) {
        const hits = checkSetForPR(
          prSnapshot.get(block.exerciseId),
          ctx.exerciseType,
          {
            setType: row.setType ?? "normal",
            weightKg: row.weightKg,
            reps: row.reps,
            durationSec: row.durationSec,
            distanceM: row.distanceM,
            setNo: row.setNo,
            side: row.side ?? null,
          },
        );
        if (hits.length) {
          for (const h of hits) hitTypes.add(h.prType);
          setPrSetIds((prev) => new Set(prev).add(row.id));
        }
      }
      // The banner is opt-out (default on); the row medal always pins.
      if (hitTypes.size && livePrEnabled) {
        prIdRef.current += 1;
        setPrBanner({
          id: prIdRef.current,
          exerciseName: block.name,
          prTypes: [...hitTypes],
        });
      }
    }

    // Rest stopwatch: every commit prunes, then starts. Only a superset
    // sibling of the committing block survives the prune — inside a group you
    // alternate between members, so both are genuinely resting; moving to any
    // other exercise (two solo blocks are not siblings) ends the old one, so
    // Stop can never resurface a timer you left behind. The start is then
    // suppressed when a drop set is next — including the just-committed set
    // being a drop (drops chain into the next reduction with no rest) — when
    // the just-committed set was a warm-up, or on duration/distance-type
    // exercises where "resting between sets" isn't meaningful.
    const committedIsDrop = (set.setType ?? "normal") === "drop";
    const nextType = committedIsDrop ? "drop" : ctx.nextSetType;
    const group = block?.supersetGroup ?? null;
    const siblings = new Set(
      group == null
        ? []
        : (blocks ?? [])
            .filter((b) => b.supersetGroup === group)
            .map((b) => b.seId),
    );
    const starting = shouldStartRest(nextType, set.setType, ctx.exerciseType);
    const startedAt = Date.now();
    setRestByBlock((prev) => {
      const next: Record<string, RestTimerState> = {};
      for (const [id, state] of Object.entries(prev)) {
        if (id !== seId && siblings.has(id)) next[id] = state;
      }
      if (starting) next[seId] = startRest(startedAt);
      return next;
    });

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
    // A row whose write hasn't landed has no server row for updateSet to match
    // (0 rows, no error) — its queued payload is the only thing a retry will
    // write, so the edit has to land there too or Retry rewrites stale values.
    setQueuedSets((prev) => {
      const queued = prev[setId];
      if (!queued) return prev;
      return {
        ...prev,
        [setId]: { ...queued, set: { ...queued.set, ...patch } },
      };
    });
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
    // A deleted set ends any rest pill tied to it when it was the block's
    // last — "after set N" must never name a set that no longer exists.
    const remaining = (blocks ?? []).find((b) => b.seId === seId)?.committed
      .length;
    if ((remaining ?? 0) <= 1) dismissRest(seId);
    dropQueuedSets((id) => id === setId);
    void repo.deleteSet(idMap[setId] ?? setId).then(
      () => {
        void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
      },
      () => {},
    );
  }

  // Note 7: a committed set's details sheet can flip the set between
  // bilateral (one row) and unilateral (two rows sharing set_no, side
  // left/right) — the repo's unilateral-pair contract. Bilateral → unilateral
  // flips the ᴸ row's side null → 'left' (a side-null row can never group
  // with a right row — groupSetsBySetNo) and adds a mirrored ᴿ row (rest_sec
  // null, the pair convention; custom per-set metrics don't round-trip
  // through the client LoggedSet model, so the mirror carries none — same as
  // a reload); unilateral → bilateral soft-deletes the ᴿ row and restores the
  // ᴸ row's side to null. Only this one physical set (the groupSetsBySetNo
  // group) is touched — never sibling rows.
  function setCommittedLaterality(
    seId: string,
    exerciseType: ExerciseType,
    primary: LoggedSet,
    unilateral: boolean,
  ) {
    const block = (blocks ?? []).find((b) => b.seId === seId);
    if (!block) return;
    const group = groupSetsBySetNo(block.committed).find(
      (g) => g[0].id === primary.id,
    );
    if (!group || group[0].id !== primary.id) return;
    const leftRow = group[0];
    if (unilateral && leftRow.side !== "left" && !group[1]) {
      // The primary becomes the pair's ᴸ row (side null → 'left'), and a
      // mirrored ᴿ row joins it at the same set_no. Set type stays shared —
      // the ᴸ control writes both rows, as on commit.
      const rightId = newId();
      const rightRow: LoggedSet = {
        id: rightId,
        setNo: leftRow.setNo,
        setType: leftRow.setType,
        weightKg: leftRow.weightKg,
        reps: leftRow.reps,
        durationSec: leftRow.durationSec,
        distanceM: leftRow.distanceM,
        rir: leftRow.rir,
        rirMin: leftRow.rirMin,
        rirMax: leftRow.rirMax,
        rpe: leftRow.rpe,
        note: leftRow.note,
        restSec: null,
        side: "right",
      };
      setBlocks((prev) =>
        (prev ?? []).map((b) =>
          b.seId === seId
            ? {
                ...b,
                committed: b.committed
                  .map((s) =>
                    s.id === leftRow.id ? { ...s, side: "left" as const } : s,
                  )
                  .concat(rightRow),
              }
            : b,
        ),
      );
      const write = {
        seId,
        set: rightRow,
        tempId: rightId,
        setNo: leftRow.setNo,
      };
      queueSet(write);
      logSet.mutate(write);
      // The ᴸ row's side flip is a server write too (a null-side row would
      // re-split the pair on reload) — and it must reach the ᴸ row's queued
      // retry payload if that commit hasn't landed yet, or Retry rewrites the
      // stale null side (saveSet's reconciliation pattern).
      setQueuedSets((prev) => {
        const queued = prev[leftRow.id];
        if (!queued) return prev;
        return {
          ...prev,
          [leftRow.id]: { ...queued, set: { ...queued.set, side: "left" } },
        };
      });
      void repo.updateSet(idMap[leftRow.id] ?? leftRow.id, { side: "left" });
      // Live PR check for the added side, like commitSet — either side of a
      // unilateral pair can PR independently.
      if (prSnapshot) {
        const hits = checkSetForPR(
          prSnapshot.get(block.exerciseId),
          exerciseType,
          {
            setType: rightRow.setType ?? "normal",
            weightKg: rightRow.weightKg,
            reps: rightRow.reps,
            durationSec: rightRow.durationSec,
            distanceM: rightRow.distanceM,
            setNo: rightRow.setNo,
            side: "right",
          },
        );
        if (hits.length) {
          setPrSetIds((prev) => new Set(prev).add(rightId));
          if (livePrEnabled) {
            prIdRef.current += 1;
            setPrBanner({
              id: prIdRef.current,
              exerciseName: block.name,
              prTypes: hits.map((h) => h.prType),
            });
          }
        }
      }
    } else if (!unilateral && leftRow.side === "left" && group[1]) {
      const secondaryRow = group[1];
      setBlocks((prev) =>
        (prev ?? []).map((b) =>
          b.seId === seId
            ? {
                ...b,
                committed: b.committed
                  .map((s) => (s.id === leftRow.id ? { ...s, side: null } : s))
                  .filter((s) => s.id !== secondaryRow.id),
              }
            : b,
        ),
      );
      dropQueuedSets((id) => id === secondaryRow.id);
      // The ᴸ row's side restore must reach its queued retry payload too.
      setQueuedSets((prev) => {
        const queued = prev[leftRow.id];
        if (!queued) return prev;
        return {
          ...prev,
          [leftRow.id]: { ...queued, set: { ...queued.set, side: null } },
        };
      });
      void repo.deleteSet(idMap[secondaryRow.id] ?? secondaryRow.id).then(
        () => {
          void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
        },
        () => {},
      );
      // Restore the ᴸ row's side to null — a lone 'left' row would read as
      // half a set everywhere it's counted.
      void repo.updateSet(idMap[leftRow.id] ?? leftRow.id, { side: null });
    }
  }

  function removeBlock(seId: string) {
    setBlocks((prev) => (prev ?? []).filter((b) => b.seId !== seId));
    dismissRest(seId);
    dropQueuedSets((_id, v) => v.seId === seId);
    void repo.deleteSessionExercise(seId).then(
      () => {
        void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
      },
      () => {},
    );
  }

  // Repoint a block at a different exercise row (copy-on-write: a seed
  // exercise is RLS-read-only, so an in-session laterality/machine edit is
  // applied to a private custom copy and the block follows it). `ghostId`
  // pins the PREVIOUS/last-note lookups to the original exercise, so the
  // copy's empty history doesn't blank the reference column mid-session.
  function swapBlockExercise(
    seId: string,
    exerciseId: string,
    ghostExerciseId: string,
  ) {
    setBlocks((prev) =>
      (prev ?? []).map((b) =>
        b.seId === seId ? { ...b, exerciseId, ghostExerciseId } : b,
      ),
    );
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
            laterality: (s.laterality as Laterality | null) ?? null,
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
      if (t && countSets(b.committed) > t.sets.length) return true;
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
          // One routine set per *physical* set: a unilateral pair is two
          // committed rows sharing one set_no, and the left row is the
          // template for the target.
          sets: groupSetsBySetNo(b.committed).map((rows, si) => {
            const [s] = rows;
            return {
              setNo: si,
              setType: (s.setType as string) ?? "normal",
              targetWeightKg: s.weightKg,
              targetReps: s.reps,
              targetRepsMax: null,
              targetDurationSec: s.durationSec,
              targetDistanceM: s.distanceM,
              // A pair of rows sharing one set_no is a unilateral set — carry
              // the laterality back into the routine template so an Update
              // Routine doesn't silently flatten a unilateral prescription.
              laterality: rows.length === 2 ? "unilateral" : "bilateral",
              // Performed sets carry no RIR prescription — updateRoutine
              // re-creates the set graph, so the authored range has to come
              // from the template or it's erased.
              targetRirMin: t?.sets[si]?.targetRirMin ?? null,
              targetRirMax: t?.sets[si]?.targetRirMax ?? null,
            };
          }),
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
          // One target per physical set (see structureInput) — mapping rows
          // positionally would shift every target after a unilateral pair.
          sets: groupSetsBySetNo(b.committed).map(([s], i) => ({
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
    void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
    navigate("/");
  }

  // blocks stays null until the seed effect above runs, which never happens
  // if either query it depends on failed (a 400 from a schema-drifted
  // column, a dropped connection, ...) — without this branch that reads as
  // an unconditional blank screen, indistinguishable from "still loading".
  if (blocks === null) {
    if (sessionQuery.isError || restoredError) {
      return (
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-16 text-center">
          <p className="text-sm text-neg" data-testid="session-error">
            {t(
              "Couldn't reach the server. This session may still be there.",
              "The frog couldn't reach the pond. This session may still be there.",
            )}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void sessionQuery.refetch();
              void refetchRestored();
              // The routine template gates the seed too: leaving it errored
              // seeds every row with no targets, notes or prefill.
              if (session?.routineId) void routineQuery.refetch();
            }}
            data-testid="session-retry"
          >
            Retry
          </Button>
        </div>
      );
    }
    return (
      <p
        className="px-4 py-16 text-center text-xs text-faint"
        data-testid="session-loading"
      >
        {t("Loading…", "The frog is thinking…")}
      </p>
    );
  }

  const setCount = blocks.reduce((n, b) => n + countSets(b.committed), 0);
  const volumeKg = blocks.reduce(
    (sum, b) =>
      sum +
      b.committed.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0),
    0,
  );
  const volume = Math.round(unit === "lb" ? kgToLb(volumeKg) : volumeKg);

  return (
    <>
      <PrBanner data={prBanner} onDismiss={() => setPrBanner(null)} />
      {failedSetCount > 0 && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4",
            // PrBanner owns top-28 (and auto-dismisses after 4s); sit below it
            // while both are up rather than painting over it.
            prBanner ? "top-44" : "top-28",
          )}
          role="status"
          data-testid="set-sync-error"
        >
          <div className="pointer-events-auto flex max-w-md items-center gap-2 border border-neg bg-(--color-panel-solid) px-3 py-2 shadow-(--shadow-6)">
            <span className="min-w-0 text-xs text-neg">
              {t(
                `${failedSetCount} set${failedSetCount === 1 ? "" : "s"} didn't save — couldn't reach the server.`,
                `The frog dropped ${failedSetCount} set${failedSetCount === 1 ? "" : "s"} — couldn't reach the pond.`,
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={retryFailedSets}
              disabled={logSet.isPending}
              data-testid="set-sync-retry"
            >
              {logSet.isPending ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        {/* Title row: title + finish + mic only — everything else (duration,
            time-since-last-set) lives in the subheader row below so the title
            keeps its full width instead of wrapping around header metadata. */}
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">
            {session?.title ?? "Session"}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {speechSupported && (
              <span className="relative flex items-center">
                <Button
                  variant={listening ? "primary" : "outline"}
                  size="icon-lg"
                  onClick={listening ? stopListening : startListening}
                  title={listening ? "Stop listening" : "Log a set by voice"}
                  aria-pressed={listening}
                  data-testid="voice-log-mic"
                >
                  <Mic className="size-4" />
                </Button>
                {/* Always mounted: a live region that enters the DOM with its
                    text already in it is routinely missed by screen readers. */}
                <span
                  role="status"
                  className={cn(
                    "absolute top-full right-0 z-20 mt-1 whitespace-nowrap text-2xs text-faint",
                    micMessage && "floating px-2 py-1",
                  )}
                >
                  {micMessage}
                </span>
              </span>
            )}
            <Button
              size="lg"
              onClick={() => setFinishOpen(true)}
              title="Finish session"
              data-testid="end-session-btn"
            >
              <Square className="size-3" />
              Finish
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl items-center gap-2 border-t border-border px-4 py-1.5">
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
          {/* Routines stays reachable mid-workout: the shell's Training tab
              jumps to this session while one is live, so /routines (and from
              it /routines/new) would otherwise be unreachable until you
              finish. The session stays server-persisted, so this is safe to
              leave. */}
          <Button
            variant="ghost"
            size="lg"
            className="ml-auto"
            onClick={() => navigate("/routines")}
            data-testid="session-routines-btn"
          >
            <NotebookPen className="size-4" />
            Routines
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4 pb-20">
        {/* The chip keeps the whole row on mobile: it owns the leftover space
            (flex-1) while the stats line wraps (or drops to its own row on
            the tightest phones) instead of shrinking it out of view — no
            session-wide rest average here, rest is per-exercise (see each
            block header). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-max flex-1">
            <ConditionsChip sessionId={sessionId} />
          </div>
          <p
            className="num text-right text-xs text-faint"
            data-testid="session-stats"
          >
            {setCount} {setCount === 1 ? "set" : "sets"} ·{" "}
            {volume.toLocaleString()} {unitLabel(unit)}
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
              plateConfig={plateConfig}
              onSavePlateConfig={(cfg) =>
                updatePrefs.mutate({ plateConfig: cfg })
              }
              restState={restByBlock[block.seId] ?? null}
              onStopRest={() => dismissRest(block.seId)}
              onSetNote={(note) => setBlockNote(block.seId, note)}
              onLinkSuperset={(target) => linkSuperset(block.seId, target)}
              onUnlinkSuperset={() => unlinkSuperset(block.seId)}
              onAddWarmup={(w) => addWarmup(block.seId, w)}
              prSetIds={prSetIds}
              registerRef={(el) => registerBlockRef(block.seId, el)}
              registerRowRef={(handle) => registerRowHandle(block.seId, handle)}
              timerRunning={timer?.seId === block.seId}
              timerStartedAt={
                timer?.seId === block.seId ? timer.startedAt : null
              }
              onToggleTimer={() => toggleTimer(block.seId)}
              onCommit={(set, ctx) => commitSet(block.seId, set, ctx)}
              onSaveSet={(setId, patch) => saveSet(block.seId, setId, patch)}
              onRemoveSet={(setId) => removeSet(block.seId, setId)}
              onSetLaterality={setCommittedLaterality}
              onRemoveBlock={() => removeBlock(block.seId)}
              onSwapExercise={swapBlockExercise}
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
          {voicePicker && (
            <VoiceMatchPicker
              query={voicePicker.parsed.name}
              candidates={voicePicker.candidates}
              onOpenChange={(open) => {
                if (!open) setVoicePicker(null);
              }}
              onPick={(id) => {
                applyVoiceToBlock(id, voicePicker.parsed);
                setVoicePicker(null);
              }}
            />
          )}
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
  const { data: exerciseData, isLoading, isError, refetch } = useExercises();
  // Presence, not query status (same rule as library.tsx): a failed background
  // refetch on a list we already have is not an error state to show.
  const exercises = exerciseData ?? [];
  const exercisesLoaded = exerciseData !== undefined;
  const { t } = useVoice();
  const { data: machines = [] } = useMachines();
  // A just-created exercise is in the list before its INSERT lands; adding it
  // to the session would violate the session_exercises FK. Leaving the
  // registry says the create settled, not that it succeeded — the list itself
  // is what separates the two (a rolled-back create takes its row with it).
  const pendingExercises = usePendingExercises();
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  const [yoursOnly, setYoursOnly] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  // Set by the editor's onCreated; auto-picked the instant its INSERT lands
  // (same FK wait pickExercise already does for any pending row) — the
  // highest-value change in the custom-exercise-adder plan: discovering
  // mid-workout that a lift isn't in the book no longer means abandoning
  // the session to go add it in Library first.
  const [awaitingPick, setAwaitingPick] = useState<{
    id: string;
    name: string;
  } | null>(null);
  useEffect(() => {
    if (!awaitingPick) return;
    if (pendingExercises.has(awaitingPick.id)) return;
    if (!exercises.some((e) => e.id === awaitingPick.id)) return;
    onPick(awaitingPick.id, awaitingPick.name);
    setAwaitingPick(null);
    onOpenChange(false);
  }, [awaitingPick, pendingExercises, exercises, onPick, onOpenChange]);
  // Muscle-grouped, tier-sorted — same reading order as the Library ribbon.
  const filtered = filterExercises(exercises, query, filterMuscle).filter(
    (ex) => !yoursOnly || ex.isCustom,
  );
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
            after={
              <button
                type="button"
                onClick={() => setYoursOnly((v) => !v)}
                aria-pressed={yoursOnly}
                className={cn(
                  "h-8 shrink-0 px-2.5 text-2xs transition-colors duration-150",
                  yoursOnly
                    ? "bg-accent-soft text-accent"
                    : "bg-translucent text-soft hover:bg-surface-hover hover:text-ink",
                )}
                data-testid="picker-filter-yours"
              >
                Yours
              </button>
            }
          />
          {isLoading ? (
            <p className="px-4 py-6 text-center text-xs text-faint">Loading…</p>
          ) : isError && !exercisesLoaded ? (
            <div
              className="flex flex-col items-center gap-2 px-4 py-6 text-center"
              data-testid="picker-error"
            >
              <p className="text-xs text-neg">
                {t(
                  "Couldn't reach the server. Your exercises may still be there.",
                  "The frog couldn't reach the pond. Your exercises may still be there.",
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                data-testid="picker-retry"
              >
                Retry
              </Button>
            </div>
          ) : exercises.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-faint">
              No exercises yet — add one in Library.
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-6">
              <p className="text-center text-xs text-faint">
                {query.trim()
                  ? "No exercises match your search."
                  : "No exercises match these filters."}
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => setCreatingNew(true)}
                data-testid="picker-create-exercise-btn"
              >
                <Plus className="size-4" />
                {query.trim() ? `Create "${query.trim()}"` : "Create exercise"}
              </Button>
            </div>
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
                        pending={pendingExercises.has(ex.id)}
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
      <ExerciseEditor
        open={creatingNew}
        onOpenChange={setCreatingNew}
        mode="create"
        initialName={query.trim()}
        onCreated={(id, name) => setAwaitingPick({ id, name })}
      />
    </Dialog>
  );
}

function ordinal(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

// Voice-log fallback: the parsed name didn't clearly match one block, so ask
// rather than guess. Scoped to this session's own blocks only (never the full
// exercise library) — same search-box pattern as ExercisePicker, above.
function VoiceMatchPicker({
  query,
  candidates,
  onPick,
  onOpenChange,
}: {
  query: string;
  candidates: MatchCandidate[];
  onPick: (id: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState(query);
  const filtered = candidates.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // The pre-filled spoken name usually isn't a substring of any block name
  // (that's why the picker opened) — fall back to the full list rather than
  // opening onto a dead-end empty state. Only while the box still holds that
  // untouched prefill: once the user types, their query wins, and a zero-result
  // search must read as empty rather than silently ignoring the filter.
  const shown = filtered.length > 0 || search !== query ? filtered : candidates;
  // The same exercise can hold two blocks (back-off work, a second wave), and
  // that tie is exactly what sends the user here — two rows reading "Bench
  // Press" would just move the coin flip into a dialog. Number the repeats by
  // their order in the session; unique names stay plain.
  const counted = new Map<string, number>();
  const rows = shown.map((c) => {
    const nth = (counted.get(c.name) ?? 0) + 1;
    counted.set(c.name, nth);
    return { ...c, nth };
  });
  const rowLabel = (row: (typeof rows)[number]) =>
    (counted.get(row.name) ?? 0) > 1
      ? `${row.name} (${ordinal(row.nth)})`
      : row.name;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent title="Which exercise?" className="md:max-w-sm">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-faint" />
            <Input
              placeholder="Search this session…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
              data-testid="voice-picker-search"
            />
          </div>
          {rows.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-faint">
              {voice(
                "No match in this session.",
                "No match in this session — the frog looked, promise.",
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden border border-border bg-surface">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onPick(row.id)}
                    className="block w-full px-4 py-3 text-left text-sm transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
                    data-testid={`voice-pick-${rowLabel(row)}`}
                  >
                    {rowLabel(row)}
                  </button>
                </li>
              ))}
            </ul>
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
  pending,
  onPick,
}: {
  exercise: Exercise;
  tier?: Tier | null;
  machine?: Machine;
  pending?: boolean;
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
          disabled={pending}
          title={pending ? "Still saving — available in a moment" : undefined}
          className="flex-1 px-4 py-3 text-left transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <ExerciseRibbon exercise={exercise} tier={tier} machine={machine} />
          {pending && (
            <span className="mt-0.5 block text-2xs text-faint">Saving…</span>
          )}
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
  plateConfig,
  onSavePlateConfig,
  restState,
  onStopRest,
  onSetNote,
  onLinkSuperset,
  onUnlinkSuperset,
  onAddWarmup,
  prSetIds,
  registerRef,
  registerRowRef,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
  onSaveSet,
  onRemoveSet,
  onSetLaterality,
  onRemoveBlock,
  onSwapExercise,
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
  plateConfig: PlateConfig | null;
  onSavePlateConfig: (cfg: PlateConfig) => void;
  /** The block's rest stopwatch, when one is running (drives the anchored pill). */
  restState: RestTimerState | null;
  onStopRest: () => void;
  onSetNote: (note: string) => void;
  onLinkSuperset: (targetSeId: string) => void;
  onUnlinkSuperset: () => void;
  onAddWarmup: (workingWeightKg: number) => void;
  prSetIds: Set<string>;
  registerRef: (el: HTMLElement | null) => void;
  registerRowRef: (handle: ActiveRowHandle | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
  onSaveSet: (setId: string, patch: SetPatch) => void;
  onRemoveSet: (setId: string) => void;
  /** Note 7: flip one committed set between bilateral/unilateral. */
  onSetLaterality: (
    seId: string,
    exerciseType: ExerciseType,
    primary: LoggedSet,
    unilateral: boolean,
  ) => void;
  onRemoveBlock: () => void;
  onSwapExercise: (seId: string, exerciseId: string, ghostId: string) => void;
}) {
  const { data: ghost = [] } = useGhost(
    block.ghostExerciseId ?? block.exerciseId,
    block.seId,
    previousRoutineId,
  );
  const { data: ghostNote } = useLastNote(
    block.ghostExerciseId ?? block.exerciseId,
    block.seId,
  );
  const { data: exercises = [] } = useExercises();
  const { data: machines = [] } = useMachines();
  const { data: prefs = [] } = useExercisePrefs();
  const setWeightUnit = useSetExerciseWeightUnit();
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const deleteExercise = useDeleteExercise();
  const repo = useRepo();
  const navigate = useNavigate();
  const { t } = useVoice();
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const activeIndex = countSets(block.committed);
  // Average rest between this exercise's committed sets — rest is a
  // per-exercise gap (each block times its own), so it's reported here in
  // the block header, not in the session stats line. Rendered only once at
  // least one committed set carries a rest value.
  const avgRestSec = (() => {
    const rests = block.committed
      .map((s) => s.restSec)
      .filter((r): r is number => r != null && r > 0);
    return rests.length
      ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length)
      : null;
  })();
  // The pre-flight card (machine + laterality + last workout) shows once per
  // exercise, before its first set — "Start logging" or the first keystroke
  // collapses it for the rest of the session (the choices persist on the
  // exercise row itself).
  const [setupDone, setSetupDone] = useState(false);
  const showSetup = activeIndex === 0 && !setupDone;
  const activeRowHandleRef = useRef<ActiveRowHandle | null>(null);
  const enabledMetrics = metrics.filter(
    (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
  );
  const exercise = exercises.find((e) => e.id === block.exerciseId);
  const machine = machines.find((m) => m.id === exercise?.machineId);

  // In-session exercise edit (laterality toggle / machine attach). Custom
  // rows patch in place; seed rows are RLS-read-only (repo/types.ts), so the
  // change goes onto a private custom copy — the duplicate field contract,
  // minus aliases so the matcher stays unambiguous — and the block swaps
  // onto it. The swap is optimistic: the copy is already in the exercises
  // cache from the create's onMutate, and the session_exercises repoint
  // waits for the insert so the FK can't race it. The repoint runs through a
  // retrying mutation (the logSet contract); when its retries exhaust, the
  // failure is resolved by reading the row before any cleanup — the PATCH
  // can have committed with its response lost, so the orphan copy is
  // soft-deleted only when the row still points at the seed; a row already
  // on the copy means the edit landed and nothing is deleted. If the
  // resolution read itself fails, the copy is never deleted (deleting could
  // destroy a committed repoint) and the block stays on the copy with a
  // couldn't-confirm banner. Retry re-attempts the orphan copy's idempotent
  // soft-delete first (a cleanup delete can itself fail and leave a live
  // duplicate library row), resolves by read again, never mints a second
  // copy while the row already points at one, and a fork whose create never
  // resolved starts over from the seed instead of re-pointing at a copy that
  // was never inserted. The Laterality/Attach items stay disabled while a
  // copy-on-write is in flight or its failure banner is up, so a rapid
  // re-toggle can't target the not-yet-inserted copy id or bypass the orphan
  // cleanup.
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<{
    patch: ExercisePatch;
    unresolved?: boolean;
    created?: boolean;
    orphanId?: string;
    originalId: string;
  } | null>(null);
  // A copy-on-write fork in flight (or failed) locks the pre-flight's
  // machine/laterality controls — a rapid re-toggle can't target the
  // not-yet-inserted copy id or bypass the orphan cleanup.
  const busy = copying || copyError != null;
  const repoint = useMutation({
    mutationFn: ({ seId, copyId }: { seId: string; copyId: string }) =>
      repo.updateSessionExercise(seId, { exerciseId: copyId }),
  });
  function settleRepointFailure(
    seId: string,
    copyId: string,
    originalId: string,
    patch: ExercisePatch,
    created: boolean,
  ) {
    void (async () => {
      let state: "committed" | "not-committed" | "unresolved";
      try {
        const row = await repo.getSessionExercise(seId);
        state = row?.exerciseId === copyId ? "committed" : "not-committed";
      } catch {
        state = "unresolved";
      }
      if (state === "committed") {
        setCopying(false);
        return;
      }
      if (state === "unresolved") {
        setCopying(false);
        setCopyError({ patch, unresolved: true, created, originalId });
        return;
      }
      onSwapExercise(seId, originalId, originalId);
      setCopying(false);
      setCopyError({ patch, created, orphanId: copyId, originalId });
      deleteExercise.mutate(copyId);
    })();
  }
  function forkExercise(ex: Exercise, patch: ExercisePatch) {
    // Own custom rows patch in place; seed rows AND community-shared rows
    // (is_custom true, owner_id null) are RLS-immutable — a mid-session
    // laterality/machine edit forks a private copy for both (the shared-row
    // gate mirrors the library's, so the two can't drift —
    // docs/DECISIONS.md 2026-08-08).
    if (ex.isCustom && ex.ownerId !== null) {
      updateExercise.mutate({ exerciseId: ex.id, patch });
      return;
    }
    setCopyError(null);
    const originalId = ex.id;
    const copyId = newId();
    const creating = createExercise.mutateAsync({
      name: `${ex.name} (copy)`,
      // share: false — a mid-session copy-on-write fork is a private copy,
      // never a publish (docs/DECISIONS.md 2026-08-08).
      opts: { id: copyId, ...copyExerciseOpts(ex), ...patch, share: false },
    });
    onSwapExercise(block.seId, copyId, originalId);
    setCopying(true);
    void (async () => {
      let created = false;
      try {
        await creating;
        created = true;
      } catch {
        // The create's failure is itself ambiguous (the row can have landed
        // with the response lost) — settleRepointFailure resolves it by read.
      }
      if (!created) {
        settleRepointFailure(block.seId, copyId, originalId, patch, false);
        return;
      }
      try {
        await repoint.mutateAsync({ seId: block.seId, copyId });
        setCopying(false);
      } catch {
        settleRepointFailure(block.seId, copyId, originalId, patch, true);
      }
    })();
  }
  function editOrCopy(patch: ExercisePatch) {
    if (!exercise) return;
    forkExercise(exercise, patch);
  }
  function retryCopy() {
    if (!copyError) return;
    const err = copyError;
    setCopyError(null);
    setCopying(true);
    void (async () => {
      if (err.orphanId) {
        // The block was swapped back to the seed and the previous copy may
        // still exist (its cleanup delete can have failed) — re-attempt the
        // idempotent soft-delete first. The row no longer references it, so
        // this cannot destroy a committed repoint.
        try {
          await deleteExercise.mutateAsync(err.orphanId);
        } catch {
          setCopying(false);
          setCopyError(err);
          return;
        }
      }
      if (!err.unresolved) {
        setCopying(false);
        editOrCopy(err.patch);
        return;
      }
      let state: "committed" | "not-committed" | "unresolved";
      try {
        const row = await repo.getSessionExercise(block.seId);
        state =
          row?.exerciseId === block.exerciseId ? "committed" : "not-committed";
      } catch {
        state = "unresolved";
      }
      if (state === "committed") {
        setCopying(false);
        return;
      }
      if (state === "unresolved") {
        setCopying(false);
        setCopyError(err);
        return;
      }
      if (err.created) {
        // The copy exists but the repoint never confirmed; the block is
        // still on the copy — re-attempt the repoint on it.
        void repoint
          .mutateAsync({ seId: block.seId, copyId: block.exerciseId })
          .then(() => setCopying(false))
          .catch(() =>
            settleRepointFailure(
              block.seId,
              block.exerciseId,
              err.originalId,
              err.patch,
              true,
            ),
          );
        return;
      }
      // The copy create never resolved — the block may be pinned to a
      // nonexistent copy id; start a fresh copy from the seed exercise.
      const original = exercises.find((e) => e.id === err.originalId);
      if (!original) {
        setCopying(false);
        setCopyError(err);
        return;
      }
      setCopying(false);
      forkExercise(original, err.patch);
    })();
  }

  const type = (exercise?.exerciseType as ExerciseType) ?? "weight_reps";
  // Per-exercise weight-unit override falls back to the global display unit.
  const override = weightUnitOverrideFor(prefs, block.exerciseId);
  const blockUnit = blockUnitFor(prefs, block.exerciseId, unit);
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

  // The pre-flight card's "Last workout" summary — the labeled, unambiguous
  // answer to "what did I do last time on this exercise" (the PREVIOUS
  // column + input ghosts it replaces).
  const previousSets = ghost;
  const currentLaterality: Laterality =
    exercise?.laterality === "unilateral" ? "unilateral" : "bilateral";
  const setCountNow = countSets(block.committed);

  return (
    <section
      ref={registerRef}
      className="rounded-lg border border-border bg-surface pb-4"
      style={
        supersetColor ? { borderLeft: `3px solid ${supersetColor}` } : undefined
      }
      data-testid={`block-${block.name}`}
      data-superset={inSuperset ? "1" : undefined}
    >
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-border px-4 py-1 md:min-h-8">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ExerciseThumb imageUrl={exercise?.imageUrl} name={block.name} />
          <span className="flex min-w-0 flex-col">
            {/* Tap the name → exercise detail; Hevy opens it mid-workout
                without pausing (the session stays server-persisted). Wraps to
                a second line rather than truncating — the left span now
                claims the width left over after the header controls. */}
            <button
              type="button"
              onClick={() => navigate(`/exercises/${block.exerciseId}`)}
              title="Exercise details"
              className="text-left text-sm font-medium transition-colors duration-100 hover:text-accent"
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
            {/* The station's machine, plainly — the block header shows the
                attached machine (tap → its remembered settings) instead of
                a thin strip below the header. */}
            {machine && <SetupStrip machine={machine} blockName={block.name} />}
            {avgRestSec != null && (
              <span
                className="truncate text-2xs text-faint"
                title="Average rest between sets of this exercise"
                data-testid={`block-${block.name}-rest-avg`}
              >
                rest {formatRest(avgRestSec)} avg
              </span>
            )}
          </span>
        </span>
        {/* Options only — superset, warm-up, remove. Machine attach and the
            exercise-level laterality live in the pre-flight card; the
            per-set laterality toggle lives in the log strip. */}
        <Toolbar>
          <BlockMenu
            blockName={block.name}
            unit={blockUnit}
            otherBlocks={otherBlocks}
            inSuperset={inSuperset}
            warmupEligible={warmupEligible}
            heaviestDisplay={
              heaviestKg > 0 ? toDisplayWeight(heaviestKg, blockUnit) : null
            }
            busy={copying || copyError != null}
            onRemoveBlock={onRemoveBlock}
            onLinkSuperset={onLinkSuperset}
            onUnlinkSuperset={onUnlinkSuperset}
            onAddWarmup={(displayWeight) =>
              onAddWarmup(
                blockUnit === "lb" ? lbToKg(displayWeight) : displayWeight,
              )
            }
          />
        </Toolbar>
      </header>

      {copyError && (
        <div
          role="status"
          data-testid={`block-${block.name}-copy-error`}
          className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"
        >
          <span className="min-w-0 text-xs text-neg">
            {copyError.unresolved
              ? t(
                  "Couldn't confirm that change — check your connection and retry.",
                  "The frog can't tell if that landed — check the pond and retry.",
                )
              : t(
                  "Couldn't update this exercise — couldn't reach the server.",
                  "The frog couldn't reach the pond — that change didn't land.",
                )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={retryCopy}
            disabled={copying}
            data-testid={`block-${block.name}-copy-retry`}
          >
            {copying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {/* The exercise's own cue ("brace before you unrack") — set once in
          the exercise editor, read-only here, distinct from this session's
          own note below. */}
      {exercise?.notes && (
        <p
          className="px-4 pb-1 text-2xs text-faint"
          data-testid={`block-${block.name}-exercise-notes`}
        >
          {exercise.notes}
        </p>
      )}

      <SessionNoteField
        blockName={block.name}
        note={block.note ?? ""}
        ghostNote={ghostNote ?? null}
        onCommit={onSetNote}
      />

      {/* ── Pre-flight card ── The station's setup, once per exercise: the
          machine (catalog search + "from your gym", not a menu item), the
          exercise's laterality, and the labeled "Last workout" summary — all
          visible together before the first set. One tap on "Start logging"
          (or the first keystroke in the strip) collapses it; the choices
          persist on the exercise row for the rest of the session. */}
      {showSetup && (
        <div
          className="flex flex-col gap-3 border-b border-border bg-surface-2/60 px-4 py-3"
          data-testid={`block-${block.name}-setup`}
        >
          <p className="text-2xs font-medium tracking-widest text-faint uppercase">
            Set up · once
          </p>

          {/* Machine: attached state reads at a glance and can be changed;
              otherwise the picker is one tap away — visible, never buried. */}
          {machine ? (
            <button
              type="button"
              onClick={() => setAttachOpen(true)}
              disabled={busy}
              title="Change machine"
              className="flex h-10 w-full items-center gap-2 border border-border bg-surface px-2 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover disabled:opacity-50"
              data-testid={`block-${block.name}-setup-machine`}
            >
              <Settings2 className="size-4 shrink-0 text-faint" />
              <span className="truncate">
                {machine.brand ? `${machine.brand} · ` : ""}
                {machine.name}
              </span>
              <span className="ml-auto shrink-0 text-2xs text-faint">
                change
              </span>
            </button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setAttachOpen(true)}
              disabled={busy}
              data-testid={`setup-attach-${block.name}`}
            >
              <Wrench className="size-4" />
              Attach a machine — catalog or your gym
            </Button>
          )}

          {/* Laterality for the whole exercise — full words, one tap. */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs font-medium tracking-widest text-faint uppercase">
              Laterality
            </span>
            <div className="flex rounded-md border border-border bg-surface p-0.5">
              {LATERALITY.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => editOrCopy({ laterality: l })}
                  disabled={busy}
                  className={cn(
                    "h-8 rounded px-3 text-xs transition-colors duration-100",
                    currentLaterality === l
                      ? "bg-accent-soft text-accent"
                      : "text-soft hover:text-ink",
                    busy && "cursor-default opacity-50",
                  )}
                  data-testid={`block-${block.name}-setup-laterality-${l}`}
                >
                  {LATERALITY_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          {/* "Last workout" — the labeled previous-set answer. One tap on a
              value uses it as this set's input. */}
          <div
            className="border border-border bg-surface px-3 py-2"
            data-testid={`block-${block.name}-setup-last`}
          >
            <p className="text-2xs font-medium tracking-widest text-faint uppercase">
              Last workout
            </p>
            {previousSets.length > 0 ? (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {previousSets.map((g, i) => (
                  <button
                    // Ghosts are per-set-index with no stable id — the index
                    // IS their identity (they never reorder).
                    // biome-ignore lint/suspicious/noArrayIndexKey: index-keyed by contract
                    key={i}
                    type="button"
                    onClick={() => activeRowHandleRef.current?.fillFromGhost(g)}
                    title="Use for this set"
                    className="num text-sm text-soft transition-colors duration-100 hover:text-accent"
                    data-testid={`block-${block.name}-setup-last-${i}`}
                  >
                    {previousText(g, blockUnit)}
                  </button>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-2xs text-faint">
                {seedSets.length > 0
                  ? "No previous sets — follow the plan below."
                  : "No previous sets for this exercise yet."}
              </p>
            )}
            {seedSets.length > 0 && (
              <p
                className="mt-1 border-t border-border pt-1 text-2xs text-faint"
                data-testid={`block-${block.name}-setup-plan`}
              >
                Planned · {seedSets.length}{" "}
                {seedSets.length === 1 ? "set" : "sets"}
              </p>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setSetupDone(true)}
            data-testid={`block-${block.name}-setup-start`}
          >
            <Check className="size-4" />
            Start logging
          </Button>
        </div>
      )}

      <MachineAttachDialog
        blockName={block.name}
        open={attachOpen}
        onOpenChange={setAttachOpen}
        onAttach={(machineId) => editOrCopy({ machineId })}
      />

      {/* ── Committed chips ── completed sets as compact records: set number,
          type marker, laterality, weight × reps. Readable at a glance,
          tappable to edit (each zone opens its own details sheet). */}
      {block.committed.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {groupSetsBySetNo(block.committed).map((rows, i) => (
            <CommittedChip
              key={rows[0].id}
              rows={rows}
              index={i}
              unit={blockUnit}
              distUnit={distUnit}
              type={type}
              columns={columns}
              prSetIds={prSetIds}
              onSave={(setId, patch) => onSaveSet(setId, patch)}
              onSaveType={(patch) => {
                for (const r of rows) onSaveSet(r.id, patch);
              }}
              onDelete={() => {
                for (const r of rows) onRemoveSet(r.id);
              }}
              onSetLaterality={(unilateral) =>
                onSetLaterality(block.seId, type, rows[0], unilateral)
              }
            />
          ))}
        </div>
      )}

      {/* ── The rest pill ── anchored in the same spot every set (right above
          the strip), naming its set. Typing in the strip stops it (the strip
          wires onUserInput → dismissRest); Stop is the manual fallback. */}
      {restState && (
        <div className="px-4 pt-3">
          <RestPill
            since={restState.startedAt}
            exerciseName={block.name}
            afterSet={setCountNow}
            onStop={onStopRest}
            testId={`rest-${block.name}`}
          />
        </div>
      )}

      {/* ── The log strip ── the always-open next-set slot. The strip is the
          only way values get entered; every commit advances it to the next
          set (rapid fire: type, Enter, type, Enter). */}
      <ActiveRow
        key={`${activeIndex}-${seedNonce}`}
        ref={(handle) => {
          activeRowHandleRef.current = handle;
          registerRowRef(handle);
        }}
        seId={block.seId}
        index={activeIndex}
        unit={blockUnit}
        distUnit={distUnit}
        type={type}
        columns={columns}
        unitOverride={
          <UnitOverrideMenu
            header={columns.find((c) => c.key === "weight")?.header ?? "kg"}
            blockName={block.name}
            override={override}
            globalUnit={unit}
            onSet={(u) =>
              setWeightUnit.mutate({
                exerciseId: block.exerciseId,
                unit: u,
              })
            }
          />
        }
        seed={seedSets[activeIndex]}
        nextSeedType={seedSets[activeIndex + 1]?.setType ?? null}
        enabledMetrics={enabledMetrics}
        autoFocusWeight={activeIndex > 0}
        barLoaded={barLoaded}
        // The exercise-level laterality default (set in pre-flight); the
        // per-set override lives in the strip's own toggle (seeded from the
        // draft snapshot), so it dies with the row on commit and survives
        // reloads.
        exerciseLaterality={exercise?.laterality ?? null}
        onUserInput={() => {
          // Typing the next set is the natural end of this rest period —
          // and it means the pre-flight is done, collapsed for good.
          onStopRest();
          setSetupDone(true);
        }}
        onOpenPlates={(target) => {
          setPlateTarget(target);
          setPlateOpen(true);
        }}
        timerRunning={timerRunning}
        timerStartedAt={timerStartedAt}
        onToggleTimer={onToggleTimer}
        onCommit={(set, ctx) => onCommit(set, ctx)}
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

// Per-exercise overflow menu (Hevy three-dots): superset link/unlink, warm-up
// insert, machine attach (when none is set), the laterality toggle and
// remove-exercise — the header keeps only rest + ⋯, so no per-exercise action
// claims its own full row. Superset opens a separate picker sheet (note 14:
// choosing the partner from all exercises, not an inline list).
function BlockMenu({
  blockName,
  unit,
  otherBlocks,
  inSuperset,
  warmupEligible,
  heaviestDisplay,
  busy,
  onRemoveBlock,
  onLinkSuperset,
  onUnlinkSuperset,
  onAddWarmup,
}: {
  blockName: string;
  unit: Unit;
  otherBlocks: { seId: string; name: string }[];
  inSuperset: boolean;
  warmupEligible: boolean;
  heaviestDisplay: number | null;
  busy: boolean;
  onRemoveBlock: () => void;
  onLinkSuperset: (targetSeId: string) => void;
  onUnlinkSuperset: () => void;
  onAddWarmup: (displayWeight: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [supersetOpen, setSupersetOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const labelCls =
    "px-3 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase";

  return (
    <span className="relative">
      <IconButton
        onClick={() => setOpen((o) => !o)}
        title="Exercise options"
        data-testid={`block-${blockName}-menu`}
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
          <div
            className="floating absolute top-full right-0 z-20 mt-1 max-h-80 min-w-48 overflow-y-auto py-1"
            data-testid={`block-${blockName}-menu-popup`}
          >
            <p className={labelCls}>Superset</p>
            {otherBlocks.length === 0 ? (
              <p className="px-3 pb-2 text-2xs text-faint">
                Add another exercise to link.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSupersetOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                data-testid={`block-${blockName}-superset`}
              >
                <Link2 className="size-3.5 shrink-0 text-faint" />
                Link superset…
              </button>
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
            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRemoveBlock();
              }}
              disabled={busy}
              className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-soft"
              data-testid={`remove-block-${blockName}`}
            >
              <Trash2 className="size-3.5 shrink-0 text-faint group-hover:text-neg" />
              Remove exercise
            </button>
          </div>
        </>
      )}

      <SupersetPickerDialog
        open={supersetOpen}
        onOpenChange={setSupersetOpen}
        blockName={blockName}
        otherBlocks={otherBlocks}
        onPick={(target) => {
          onLinkSuperset(target);
          setSupersetOpen(false);
        }}
      />

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

// Superset partner picker (note 14): the block ⋯ menu's Superset option opens
// this separate bottom sheet listing every other exercise in the session,
// instead of inlining the whole list in the menu. Tapping one links the two.
function SupersetPickerDialog({
  open,
  onOpenChange,
  blockName,
  otherBlocks,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockName: string;
  otherBlocks: { seId: string; name: string }[];
  onPick: (seId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Link superset" className="md:max-w-sm">
        <p className="pb-3 text-2xs text-faint">
          Choose an exercise to pair {blockName} with — you'll alternate between
          them, one set at a time.
        </p>
        {otherBlocks.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-faint">
            Add another exercise to link.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden border border-border bg-surface">
            {otherBlocks.map((b) => (
              <li key={b.seId}>
                <button
                  type="button"
                  onClick={() => onPick(b.seId)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
                  data-testid={`block-${blockName}-superset-${b.name}`}
                >
                  <Link2 className="size-4 shrink-0 text-faint" />
                  <span className="truncate">{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
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
        // `relative`: without it the static button paints BELOW its own
        // positioned (`relative`) wrapper span, which then swallows the
        // click — the span's flex-stretched box covers the button's.
        className="relative flex min-h-8 min-w-9 items-center justify-center gap-1 px-1 tracking-widest uppercase transition-colors duration-100 hover:text-ink"
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

// Machine setup memory: the header chip shows the attached machine and its
// remembered settings; the dialog edits them on the machine row itself, so
// the same setup appears in every future session.
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
        className="mt-0.5 flex h-8 w-fit max-w-full items-center gap-1.5 border border-border bg-surface-2 px-2 text-left text-2xs text-soft transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover"
        data-testid={`setup-strip-${blockName}`}
      >
        <Settings2 className="size-3.5 shrink-0 text-faint" />
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

// A committed set, compact: one chip per PHYSICAL set — set number/type
// marker, laterality, weight × reps — readable at a glance and tappable to
// edit. No row-form permanence: the strip is for entering, chips are the
// record. A unilateral pair is ONE chip with two tappable zones (ᴸ and ᴿ),
// each opening its own limb's details sheet, so per-limb RIR/RPE/note stay
// editable exactly as on the row design (note 7's bilateral↔unilateral flip
// lives in the ᴸ zone's sheet).
function CommittedChip({
  rows,
  index,
  unit,
  distUnit,
  type,
  columns,
  prSetIds,
  onSave,
  onSaveType,
  onDelete,
  onSetLaterality,
}: {
  rows: LoggedSet[];
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  columns: Column[];
  prSetIds: Set<string>;
  onSave: (setId: string, patch: SetPatch) => void;
  onSaveType: (patch: Pick<SetPatch, "setType">) => void;
  onDelete: () => void;
  /** Note 7: flip this committed set between bilateral/unilateral. */
  onSetLaterality: (unilateral: boolean) => void;
}) {
  const primary = rows[0];
  const secondary = rows[1] ?? null;
  const isPaired = secondary != null;

  const [editingRow, setEditingRow] = useState<LoggedSet | null>(null);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [rirMin, setRirMin] = useState("");
  const [rirMax, setRirMax] = useState("");
  const [rpe, setRpe] = useState("");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const has = (k: ColKey) => columns.some((c) => c.key === k);
  const effort = supportsEffort(type);
  const setType = (primary.setType as SetType) ?? "normal";
  // A unilateral pair's ᴿ row has its own editable RIR/RPE/note (see the
  // details sheet below) that can diverge from the ᴸ row's after commit —
  // surface it only when it actually differs, so the common untouched-mirror
  // case doesn't clutter both zones with duplicate readouts.
  const secondaryEffortDiffers =
    isPaired && effortReadout(primary) !== effortReadout(secondary);
  const primaryNote = primary.note?.trim() || null;
  const secondaryNote = isPaired ? secondary?.note?.trim() || null : null;
  const notesDiffer = isPaired && primaryNote !== secondaryNote;

  function openDetails(set: LoggedSet) {
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
    const fields = rirEditFields(set);
    setRirMin(fields.min);
    setRirMax(fields.max);
    setRpe(set.rpe != null ? String(set.rpe) : "");
    setNote(set.note ?? "");
    setConfirmDelete(false);
    setEditingRow(set);
  }

  function save() {
    if (!editingRow) return;
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
      const r = parseLoggedRirFields(rirMin, rirMax);
      patch.rir = null;
      patch.rirMin = r.rirMin;
      patch.rirMax = r.rirMax;
      patch.rpe = rpe.trim() === "" ? null : Number.parseFloat(rpe);
    }
    onSave(editingRow.id, patch);
    setEditingRow(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

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
          rir: rirRange(parseLoggedRirFields(rirMin, rirMax))?.min ?? null,
          rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
        },
      )
    : null;
  const restLabel =
    primary.restSec != null
      ? formatDurationSeconds(primary.restSec * 1000)
      : null;
  const labelCls = "text-2xs font-medium tracking-wide text-faint uppercase";

  // The ᴿ zone's weight cell (note 1: same weight both sides is the norm, the
  // unilateral part is only the reps). A right weight matching the left
  // renders blank — reading as "same as left" — and only a divergent right
  // weight (legacy data, or a post-commit edit via the details sheet) prints
  // its own value. A null right weight with a non-null left is "no value"
  // ("—"), never an implied mirror.
  function rightWeightText(): string {
    if (secondary.weightKg == null) return "—";
    if (primary.weightKg != null && secondary.weightKg === primary.weightKg)
      return "";
    return String(toDisplayWeight(secondary.weightKg, unit));
  }

  // One side's value spans for the chip, keeping the per-column testids the
  // committed rows exposed (value text unchanged: weight, then reps etc.,
  // joined by × between weight and reps, · elsewhere).
  function valueSpans(s: LoggedSet, zone: "" | "right") {
    return columns.map((c, i) => {
      const text =
        c.key === "weight" && zone === "right"
          ? rightWeightText()
          : committedText(c.key, s, unit, distUnit);
      const sep =
        i > 0
          ? columns[i - 1].key === "weight" && c.key === "reps"
            ? "×"
            : "·"
          : null;
      return (
        <span key={c.key} className="flex items-center gap-1">
          {sep && (
            <span aria-hidden className="text-faint">
              {sep}
            </span>
          )}
          <span
            className={cn(
              "inline-block min-h-5 min-w-6 text-left",
              zone === "right" && "text-soft",
            )}
            data-testid={`committed-${index}${zone ? `-${zone}` : ""}-${c.key}`}
          >
            {text}
          </span>
        </span>
      );
    });
  }

  return (
    <div
      className="relative flex items-stretch overflow-hidden border border-border bg-surface-2"
      data-testid={`committed-${index}`}
    >
      {/* ᴸ zone — the chip's body: marker + values; tap → details sheet. */}
      <span className="flex min-h-11 items-center gap-1.5 py-1 pr-2 pl-1.5 md:min-h-8">
        <SetTypeCell
          index={index}
          setType={setType}
          ringState="done"
          onChange={(t) => onSaveType({ setType: t })}
          testId={`committed-${index}-type`}
          sideLabel={isPaired ? "L" : undefined}
        />
        <button
          type="button"
          onClick={() => openDetails(primary)}
          title="Set details"
          className="num flex min-h-11 items-center gap-1 text-sm text-ink"
          data-testid={`set-menu-${index}`}
        >
          {valueSpans(primary, "")}
          {effort && (effortReadout(primary) || secondaryEffortDiffers) && (
            <span
              className={cn(
                "rounded-sm border border-border bg-surface px-1 text-2xs text-faint",
                !secondaryEffortDiffers && "max-md:hidden",
              )}
              data-testid={`committed-${index}-effort`}
            >
              {effortReadout(primary) || "—"}
            </span>
          )}
          {notesDiffer && primaryNote && (
            <span
              className="text-faint"
              title={primaryNote}
              data-testid={`committed-${index}-note`}
            >
              <StickyNote className="size-3.5" />
            </span>
          )}
          {prSetIds.has(primary.id) && (
            <span
              className="text-accent"
              title="Personal record"
              data-testid={`committed-${index}-medal`}
            >
              <Medal className="size-3.5" />
            </span>
          )}
        </button>
      </span>

      {/* ᴿ zone — a unilateral pair's second half; tap → ITS details sheet
          (per-limb RIR/RPE/note live here). */}
      {isPaired && (
        <>
          <span className="w-px bg-border" />
          <span className="flex min-h-11 items-center gap-1.5 py-1 pr-2 pl-2 md:min-h-8">
            <span className="num shrink-0 text-2xs tabular-nums text-faint">
              {index + 1}ᴿ
            </span>
            <button
              type="button"
              onClick={() => openDetails(secondary)}
              title="Right side details"
              className="num flex min-h-11 items-center gap-1 text-sm"
              data-testid={`committed-${index}-right`}
            >
              {valueSpans(secondary, "right")}
              {effort && secondaryEffortDiffers && (
                <span
                  className="rounded-sm border border-border bg-surface px-1 text-2xs text-faint"
                  data-testid={`committed-${index}-right-effort`}
                >
                  {effortReadout(secondary) || "—"}
                </span>
              )}
              {notesDiffer && secondaryNote && (
                <span
                  className="text-faint"
                  title={secondaryNote}
                  data-testid={`committed-${index}-right-note`}
                >
                  <StickyNote className="size-3.5" />
                </span>
              )}
              {prSetIds.has(secondary.id) && (
                <span
                  className="text-accent"
                  title="Personal record"
                  data-testid={`committed-${index}-right-medal`}
                >
                  <Medal className="size-3.5" />
                </span>
              )}
            </button>
          </span>
        </>
      )}

      <Dialog
        open={editingRow != null}
        onOpenChange={(o) => !o && setEditingRow(null)}
      >
        <DialogContent
          title={
            isPaired
              ? `Set ${index + 1} (${editingRow === secondary ? "right" : "left"}) details`
              : `Set ${index + 1} details`
          }
          className="md:max-w-sm"
        >
          <div className="flex flex-col gap-4">
            {/* Note 7: the set-level unilateral toggle lives in the ᴸ limb's
                sheet — flipping the set away from unilateral while editing
                the ᴿ limb would delete the very row being edited. */}
            {editingRow != null && editingRow.id === primary.id && (
              <label className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-2">
                <input
                  type="checkbox"
                  checked={isPaired}
                  onChange={(e) => onSetLaterality(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-(--accent)"
                  data-testid={`set-menu-${index}-unilateral`}
                />
                <span className="text-xs text-soft">
                  <span className="font-medium text-ink">Unilateral</span>
                  <br />
                  Just this set: same weight both sides, log each side's reps
                  separately.
                </span>
              </label>
            )}
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
              <div className="flex flex-col gap-3">
                {modifierBindings({
                  rirMin,
                  rirMax,
                  rpe,
                  setRirMin,
                  setRirMax,
                  setRpe,
                }).map((b) => (
                  <ModifierField
                    key={b.config.key}
                    {...b}
                    onKeyDown={onKeyDown}
                    testId={`edit-${index}-${b.config.key}`}
                  />
                ))}
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
              {confirmDelete ? (
                <span className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setEditingRow(null);
                      onDelete();
                    }}
                    data-testid={`set-menu-${index}-delete-confirm`}
                  >
                    <Trash2 className="size-3.5" />
                    Confirm delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  data-testid={`set-menu-${index}-delete`}
                >
                  <Trash2 className="size-3.5" />
                  Delete Set
                </Button>
              )}
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

// Set-modifier registry (M4 UI redesign): RIR/RPE are the only two today, but
// the captain expects at most 1-2 more, ever — not an unbounded plugin system.
// A modifier is a small typed value attached to a set, rendered generically in
// the details sheet; adding one is a config entry here, never new layout JSX.
type ModifierConfig = {
  key: "rir" | "rpe";
  label: string;
  kind: "select" | "range";
  options?: number[];
  infoTipLessonId?: LessonId;
};

const SET_MODIFIERS: ModifierConfig[] = [
  { key: "rir", label: "RIR", kind: "range", infoTipLessonId: "rir" },
  { key: "rpe", label: "RPE", kind: "select", options: RPE_OPTIONS },
];

// A bounded min/max pair, always strings (draft-editable text) — same shape
// as the routine editor's rep-range fields.
type RangeValue = { min: string; max: string };

// A registry entry bound to the row state that backs it. Discriminated by
// `kind`, so a modifier's value and its setter can't drift apart in the shape
// they carry — handing a plain string to the range entry is a type error at
// the binding, not a crash on `range.min` at render.
type ModifierBinding = { config: ModifierConfig } & (
  | { kind: "range"; value: RangeValue; onChange: (v: RangeValue) => void }
  | { kind: "scalar"; value: string; onChange: (v: string) => void }
);

// Both row types (draft and committed) bind the same registry to the same
// three pieces of state, so the wiring lives here once rather than as a
// duplicated ternary at each call site.
function modifierBindings(state: {
  rirMin: string;
  rirMax: string;
  rpe: string;
  setRirMin: (v: string) => void;
  setRirMax: (v: string) => void;
  setRpe: (v: string) => void;
}): ModifierBinding[] {
  return SET_MODIFIERS.map((config) =>
    config.kind === "range"
      ? {
          config,
          kind: "range",
          value: { min: state.rirMin, max: state.rirMax },
          onChange: (v: RangeValue) => {
            state.setRirMin(v.min);
            state.setRirMax(v.max);
          },
        }
      : { config, kind: "scalar", value: state.rpe, onChange: state.setRpe },
  );
}

// Shared field renderer for every modifier — the label row reserves a fixed
// height (`min-h-6`) whether or not it carries an InfoTip icon, so RIR and RPE
// (or a future third modifier) always sit flush in the same grid row instead
// of drifting by the icon's height, and the select gets the exact classes as
// the shared Input so its box never looks "elevated" next to a sibling field.
function ModifierField(
  props: ModifierBinding & {
    onKeyDown?: (e: React.KeyboardEvent) => void;
    autoFocus?: boolean;
    testId: string;
  },
) {
  const { config, onKeyDown, autoFocus, testId } = props;
  const label = (
    <span className="flex min-h-6 items-center gap-1 text-2xs font-medium tracking-wide text-faint uppercase">
      {config.label}
      {config.infoTipLessonId && <InfoTip lessonId={config.infoTipLessonId} />}
    </span>
  );

  if (props.kind === "range") {
    const range = props.value;
    const onRangeChange = props.onChange;
    return (
      <div className="flex flex-col gap-1">
        {label}
        <div className="flex items-center gap-1">
          <Input
            inputMode="numeric"
            placeholder="—"
            value={range.min}
            onChange={(e) => onRangeChange({ ...range, min: e.target.value })}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            className="num"
            data-testid={`${testId}min`}
          />
          <span className="text-2xs text-faint">–</span>
          <Input
            inputMode="numeric"
            placeholder="—"
            value={range.max}
            onChange={(e) => onRangeChange({ ...range, max: e.target.value })}
            onKeyDown={onKeyDown}
            className="num"
            data-testid={`${testId}max`}
          />
        </div>
      </div>
    );
  }

  const { value, onChange } = props;
  return (
    <div className="flex flex-col gap-1">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        // biome-ignore lint/a11y/noAutofocus: focuses the just-added field
        autoFocus={autoFocus}
        data-testid={testId}
        className="num h-8 w-full border border-border-strong bg-surface px-2 text-sm text-soft transition-colors duration-150 ease-(--ease-out-quad) focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
      >
        <option value="">—</option>
        {config.options?.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

// Imperative escape hatch for voice logging: fills weight/reps as if typed,
// converting kg to this row's own display unit. Never commits — same as a
// manual edit, an explicit commit (Enter / the check button) still has to
// follow. `fillFromGhost` powers the pre-flight "Last workout" tap-to-use.
type ActiveRowHandle = {
  // Returns false when this row's type has no field the values could land in,
  // so the caller can report the miss instead of leaving the row blank.
  applyVoice: (values: {
    weightKg: number | null;
    reps: number | null;
  }) => boolean;
  /** Pre-flight "Last workout" summary: use one prior set as this set's input. */
  fillFromGhost: (g: GhostSet) => void;
  // Commits the current draft (same path as Enter / the check button). An
  // empty draft is a no-op — a set has to carry at least one value.
  commit: () => void;
};

// The Protocol's log strip: column headers with the per-set laterality
// toggle on the right, then the always-open next-set slot. Every commit
// advances the strip to the next set (the parent keys this component by
// index), so back-to-back sets are type → Enter → type → Enter with no
// extra taps. One row per block, one keyboard session — the poundage
// ergonomics of the old draft row, minus the grid chrome around it.
function ActiveRow({
  seId,
  index,
  unit,
  distUnit,
  type,
  columns,
  unitOverride,
  seed,
  nextSeedType,
  enabledMetrics,
  autoFocusWeight,
  barLoaded,
  exerciseLaterality,
  onUserInput,
  onOpenPlates,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
  ref,
}: {
  seId: string;
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  columns: Column[];
  /** The weight-column header (unit override menu) — rendered by the parent,
      placed here so the header row and the fields line up in one strip. */
  unitOverride: React.ReactNode;
  seed: SeedSet | undefined;
  nextSeedType: string | null;
  enabledMetrics: Metric[];
  autoFocusWeight: boolean;
  barLoaded: boolean;
  exerciseLaterality: string | null;
  /** Any user typing (or a pre-flight value tap) in THIS strip — the parent
      stops the rest stopwatch and collapses the pre-flight on it. */
  onUserInput: () => void;
  onOpenPlates: (target: number | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
  ref: Ref<ActiveRowHandle>;
}) {
  // Restore any uncommitted keystrokes persisted for this block (draft wins
  // over the routine/copy seed once the user has started typing).
  const [draft] = useState<Partial<DraftSnapshot> | null>(() =>
    loadDraft(seId),
  );
  // Per-set laterality override ("just this one set"): toggled from the
  // strip header, seeded from the routine template's per-set laterality or
  // the draft snapshot so a reload restores the ᴿ field and the right-side
  // keystrokes it protects. Local to this row, so it dies on commit or
  // remount — the next strip starts from the exercise default again.
  const [lateralityOverride, setLateralityOverride] =
    useState<Laterality | null>(
      () => draft?.laterality ?? seed?.laterality ?? null,
    );
  // Override wins over the exercise default (set in the pre-flight).
  const laterality = lateralityOverride ?? exerciseLaterality;
  const isUnilateral = laterality === "unilateral";
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
  const [rirMin, setRirMin] = useState(() => draft?.rirMin ?? "");
  const [rirMax, setRirMax] = useState(() => draft?.rirMax ?? "");
  const [rpe, setRpe] = useState(() => draft?.rpe ?? "");
  const [note, setNote] = useState(() => draft?.note ?? "");
  // Right side of a unilateral pair. Blank means "mirror the left value" —
  // the input shows it as a faint placeholder; typing here overrides it. The
  // weight is shared (note 1: same weight both sides, stated in the strip's
  // caption), so only reps/duration/distance live here.
  const [rReps, setRReps] = useState(() => draft?.rReps ?? "");
  const [rDuration, setRDuration] = useState(() => draft?.rDuration ?? "");
  const [rDistance, setRDistance] = useState(() => draft?.rDistance ?? "");
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const done = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Set when the "…" button opens the details sheet: Radix moves focus into
  // the dialog once it mounts, blurring whichever weight/reps input was
  // focused. That blur reaches onFieldBlur/onRightFieldBlur just like a
  // real tap-away would, so without this it auto-checks the set off the
  // moment the sheet opens. Consumed by the next blur, or cleared when the
  // sheet closes without one (e.g. it opened while neither field was
  // focused).
  const suppressCheckoffRef = useRef(false);
  const moreCellRef = useRef<HTMLSpanElement>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  // Mirror uncommitted keystrokes to localStorage so a reload restores them.
  // rWeight deliberately isn't saved: the right side has no weight input
  // (note 1) — legacy drafts that carry one are read for nothing.
  useEffect(() => {
    saveDraft(seId, {
      weight,
      reps,
      duration,
      distance,
      rirMin,
      rirMax,
      rpe,
      note,
      setType,
      extras: [...extras],
      metricDraft,
      rReps,
      rDuration,
      rDistance,
      laterality: lateralityOverride,
    });
  }, [
    seId,
    weight,
    reps,
    duration,
    distance,
    rirMin,
    rirMax,
    rpe,
    note,
    setType,
    extras,
    metricDraft,
    rReps,
    rDuration,
    rDistance,
    lateralityOverride,
  ]);

  // Closing without a field blur ever landing (e.g. the sheet opened while
  // neither weight nor reps had focus) leaves the guard armed — clear it on
  // every close, however the sheet was dismissed, so a later genuine
  // tap-away isn't swallowed too.
  useEffect(() => {
    if (!detailsOpen) suppressCheckoffRef.current = false;
  }, [detailsOpen]);

  function openPlates() {
    onOpenPlates(weight.trim() === "" ? null : Number.parseFloat(weight));
  }

  const f = TYPE_FIELDS[type];
  const effort = supportsEffort(type);

  useImperativeHandle(
    ref,
    () => ({
      applyVoice({ weightKg, reps: repsValue }) {
        let applied = false;
        if (f.weight && weightKg != null) {
          setWeight(String(toDisplayWeight(weightKg, unit)));
          applied = true;
        }
        if (f.reps && repsValue != null) {
          setReps(String(repsValue));
          applied = true;
        }
        if (applied) onUserInput();
        return applied;
      },
      fillFromGhost(g: GhostSet) {
        onUserInput();
        if (f.weight && g.weightKg != null)
          setWeight(String(toDisplayWeight(g.weightKg, unit)));
        if (f.reps && g.reps != null) setReps(String(g.reps));
        if (f.duration && g.durationSec != null)
          setDuration(formatMMSS(g.durationSec));
        if (f.distance && g.distanceM != null)
          setDistance(String(toDisplayDistance(g.distanceM, distUnit)));
        // An uneven pair last time restores uneven — otherwise the left fill
        // above already mirrors across as a placeholder.
        const other = g.otherSide;
        if (isUnilateral && other) {
          if (f.reps && other.reps != null) setRReps(String(other.reps));
          if (f.duration && other.durationSec != null)
            setRDuration(formatMMSS(other.durationSec));
          if (f.distance && other.distanceM != null)
            setRDistance(String(toDisplayDistance(other.distanceM, distUnit)));
        }
      },
      commit,
    }),
    // No deps array: `commit` closes over every field's current value and is
    // a fresh function every render, so memoizing this against a partial dep
    // list would expose a stale `commit` to the ref holder whenever some
    // other field changed without those three.
  );

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

  // Custom per-exercise metrics stay opt-in (their count is unbounded, unlike
  // the fixed RIR/RPE modifier set) — toggled on from inside the details
  // sheet itself, where the newly-revealed input also lives.
  function toggleExtra(key: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastAdded(key);
  }

  // Stop → capture elapsed into the duration field; start → begin the session
  // timer (which is exclusive, so any other running row's stops). Typing the
  // time by hand stays available whenever the timer isn't running.
  function toggleTimer() {
    if (liveElapsed != null) setDuration(formatMMSS(liveElapsed));
    onToggleTimer();
  }

  // Rep-range placeholder ("8–12") when the routine seeds a range at this
  // index.
  const repRangePlaceholder =
    seed?.repsMax != null ? `${seed.reps ?? ""}–${seed.repsMax}` : null;

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

  function parseFields() {
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
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  // Right side of a unilateral pair: mirrors the left's resolved values
  // (symmetric by default) — only a field actually typed into here overrides
  // its left counterpart. Weight has no right-side input (note 1: same weight
  // both sides); the right row copies the left's weight at commit.
  function parseRightFields(left: ReturnType<typeof parseFields>) {
    const weightKg = left.weightKg;
    let repsN = left.reps;
    let durationSec = left.durationSec;
    let distanceM = left.distanceM;
    if (f.reps && rReps.trim() !== "") {
      const r = Number.parseInt(rReps, 10);
      repsN = Number.isNaN(r) ? null : r;
    }
    if (f.duration && rDuration.trim() !== "")
      durationSec = parseDuration(rDuration);
    if (f.distance && rDistance.trim() !== "") {
      const d = Number.parseFloat(rDistance);
      distanceM =
        d == null || Number.isNaN(d)
          ? null
          : distUnit === "km"
            ? kmToM(d)
            : miToM(d);
    }
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  function commit() {
    if (done.current) return;
    const v = parseFields();
    const parsedRir = parseLoggedRirFields(rirMin, rirMax);
    const anyPresent =
      (f.weight && v.weightKg != null) ||
      (f.reps && v.reps != null) ||
      (f.duration && v.durationSec != null) ||
      (f.distance && v.distanceM != null);
    // An empty strip is a no-op (nothing to log).
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
        // New logging always writes the range pair, never the legacy scalar.
        rir: null,
        rirMin: effort ? parsedRir.rirMin : null,
        rirMax: effort ? parsedRir.rirMax : null,
        rpe: effort && rpe.trim() !== "" ? Number.parseFloat(rpe) : null,
        note: note.trim() === "" ? null : note.trim(),
        metricValues: metricValues(),
        side: isUnilateral ? "left" : null,
        otherSide: isUnilateral ? parseRightFields(v) : null,
      },
      { exerciseType: type, nextSetType: nextSeedType },
    );
  }

  // Wired to the strip's data inputs only — deliberately not to the
  // details-sheet fields, where Enter must stay a newline in the note
  // textarea rather than commit the set out from under a sheet the user
  // still has open.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // Auto-checkoff: once both weight and reps carry a typed value, leaving
  // either field commits the set — no separate confirm tap required.
  //
  // Paired (unilateral) strips re-scope this: blurring a ᴸ field never
  // commits — only leaving the ᴿ field does, and only once the ᴸ line is
  // complete. Otherwise the moment you tab off "weight" into "reps" would
  // half-log the set before the right side ever gets a chance to mirror or
  // override.
  function onFieldBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (suppressCheckoffRef.current) {
      suppressCheckoffRef.current = false;
      return;
    }
    // Tab out of reps lands on the "…" trigger — mousedown-preventDefault
    // only covers pointers, so nothing has armed the guard above. Committing
    // here unmounts that trigger mid-Tab, putting set details out of reach of
    // the keyboard on a complete-but-uncommitted row.
    const next = e.relatedTarget as Node | null;
    if (next && moreCellRef.current?.contains(next)) return;
    if (isUnilateral) return;
    if (weight.trim() !== "" && reps.trim() !== "") commit();
  }

  // Guards against committing mid-override: tabbing from one ᴿ field to the
  // next (e.g. reps → duration) blurs the former while the ᴸ line is already
  // complete, which would otherwise auto-commit before the override is even
  // typed. (The ᴿ weight input this guard originally described is gone —
  // same weight both sides, note 1.) Only fires once focus actually leaves
  // this strip.
  function onRightFieldBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (suppressCheckoffRef.current) {
      suppressCheckoffRef.current = false;
      return;
    }
    const next = e.relatedTarget as Node | null;
    if (next && rowRef.current?.contains(next)) return;
    if (weight.trim() !== "" && reps.trim() !== "") commit();
  }

  // One input cell per data column (weight / reps / time / distance). The
  // time cell also carries the inline stopwatch control. `last` picks the
  // mobile keyboard's Return-key hint — "next" mid-row, "done" on the row's
  // final field (iOS numeric/decimal keypads often have no Return key at all
  // regardless of this hint, so it's a best-effort nicety, not the mobile
  // advance path — that's the checkmark / Enter).
  function dataCell(key: ColKey, autoFocus: boolean, last: boolean) {
    const enterKeyHint = last ? "done" : "next";
    const width =
      key === "weight"
        ? "min-w-0 flex-1"
        : key === "reps"
          ? "w-16 shrink-0"
          : "w-20 shrink-0";
    const field = (
      <Field
        className="leading-5"
        inputMode={
          key === "reps" ? "numeric" : key === "duration" ? "text" : "decimal"
        }
        enterKeyHint={enterKeyHint}
        placeholder={
          key === "weight"
            ? unitLabel(unit)
            : key === "reps"
              ? (repRangePlaceholder ?? "reps")
              : key === "duration"
                ? "m:ss"
                : distUnit
        }
        value={
          key === "weight"
            ? weight
            : key === "reps"
              ? reps
              : key === "duration"
                ? durationDisplay
                : distance
        }
        readOnly={key === "duration" && timerRunning}
        onChange={(e) => {
          onUserInput();
          if (key === "weight") setWeight(e.target.value);
          else if (key === "reps") setReps(e.target.value);
          else if (key === "duration") setDuration(e.target.value);
          else setDistance(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={key === "weight" || key === "reps" ? onFieldBlur : undefined}
        autoFocus={autoFocus}
        data-testid={`set-${index}-${key}`}
      />
    );
    if (key === "duration")
      return (
        <span key={key} className={cn(width, "flex items-center gap-1")}>
          {field}
          <IconButton
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleTimer}
            title={timerRunning ? "Stop timer" : "Start timer"}
            className={cn(
              timerRunning &&
                "border-accent bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg",
              !timerRunning && "text-soft",
            )}
            data-testid={`set-${index}-timer`}
          >
            {timerRunning ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
          </IconButton>
        </span>
      );
    return (
      <span key={key} className={width}>
        {field}
      </span>
    );
  }

  // Right-side input for a unilateral pair. Placeholder mirrors the left
  // line's own typed value (live, as faint text) so the pair reads as
  // symmetric until overridden — typing here just makes the set uneven. No
  // weight field: the weight is shared (note 1), stated in the strip's
  // caption.
  function rDataCell(key: ColKey) {
    if (key === "weight") return null;
    if (key === "reps")
      return (
        <span key={`right-${key}`} className="w-16 shrink-0">
          <Field
            className="leading-5"
            inputMode="numeric"
            enterKeyHint={lastColIs(key) ? "done" : "next"}
            placeholder={
              reps.trim() !== "" ? reps : (repRangePlaceholder ?? "reps")
            }
            value={rReps}
            onChange={(e) => {
              onUserInput();
              setRReps(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={onRightFieldBlur}
            data-testid={`set-${index}-right-${key}`}
          />
        </span>
      );
    if (key === "distance")
      return (
        <span key={`right-${key}`} className="w-20 shrink-0">
          <Field
            className="leading-5"
            inputMode="decimal"
            enterKeyHint={lastColIs(key) ? "done" : "next"}
            placeholder={distance.trim() !== "" ? distance : distUnit}
            value={rDistance}
            onChange={(e) => {
              onUserInput();
              setRDistance(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={onRightFieldBlur}
            data-testid={`set-${index}-right-${key}`}
          />
        </span>
      );
    // duration — no second timer button: one physical set has one clock.
    return (
      <span key={`right-${key}`} className="w-20 shrink-0">
        <Field
          className="leading-5"
          inputMode="text"
          enterKeyHint={lastColIs(key) ? "done" : "next"}
          placeholder={duration.trim() !== "" ? duration : "m:ss"}
          value={rDuration}
          onChange={(e) => {
            onUserInput();
            setRDuration(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={onRightFieldBlur}
          data-testid={`set-${index}-right-${key}`}
        />
      </span>
    );
  }

  function lastColIs(key: ColKey): boolean {
    return key === columns[columns.length - 1]?.key;
  }

  // Compact preview of what's filled in next to the details-sheet trigger —
  // mirrors CommittedChip's collapsed RIR/RPE readout, so the same
  // information is visible without opening the sheet on either row type.
  const modifierPreview = effort
    ? effortReadout({
        ...parseLoggedRirFields(rirMin, rirMax),
        rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
      })
    : "";

  const segCls = (active: boolean) =>
    cn(
      "h-6 rounded px-2 text-2xs transition-colors duration-100",
      active
        ? "bg-accent-soft font-medium text-accent"
        : "text-faint hover:text-soft",
    );

  return (
    <div ref={rowRef} className="relative border-t border-border">
      {/* Strip header: # · data columns · this set's laterality toggle. */}
      <div className="flex items-center gap-1.5 px-4 py-1 text-2xs font-medium tracking-widest text-faint uppercase">
        <span className="w-8 shrink-0">#</span>
        {columns.map((c) =>
          c.key === "weight" ? (
            <span key={c.key} className="min-w-0 flex-1">
              {unitOverride}
            </span>
          ) : (
            <span key={c.key} className="flex-1">
              {c.header}
            </span>
          ),
        )}
        <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 normal-case tracking-normal">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setLateralityOverride("bilateral")}
            aria-pressed={!isUnilateral}
            title="Both sides work together — one line per set"
            className={segCls(!isUnilateral)}
            data-testid={`set-${index}-laterality-bilateral`}
          >
            Bilateral
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setLateralityOverride("unilateral")}
            aria-pressed={isUnilateral}
            title="Each side's reps logged separately — two lines per set"
            className={segCls(isUnilateral)}
            data-testid={`set-${index}-laterality-unilateral`}
          >
            Unilateral
          </button>
        </span>
      </div>

      {/* The strip itself: set number · data fields · ⋯ · ✓. */}
      <div className="flex items-stretch gap-1.5 py-1 pr-2 pl-4">
        <span className="flex w-8 shrink-0 items-center">
          <SetTypeCell
            index={index}
            setType={setType}
            ringState="empty"
            onChange={setSetType}
            testId={`set-${index}-type`}
            sideLabel={isUnilateral ? "L" : undefined}
          />
        </span>
        {columns.map((c, i) =>
          isUnilateral && c.key !== "weight" ? (
            <span key={c.key} className="flex min-w-0 flex-1 gap-1.5">
              {dataCell(
                c.key,
                autoFocusWeight && i === 0,
                i === columns.length - 1,
              )}
              {rDataCell(c.key)}
            </span>
          ) : (
            dataCell(
              c.key,
              autoFocusWeight && i === 0,
              i === columns.length - 1,
            )
          ),
        )}
        {/* ⋯ + ✓ share the trailing control group, so tabbing into either
            button can't check the set off. The check is the far-right
            commit; ⋯ opens the details sheet. */}
        <span
          ref={moreCellRef}
          className="col-span-2 flex shrink-0 items-center"
        >
          <Dots
            onClick={() => {
              // Opening the sheet is about to steal focus from weight/reps
              // via Radix's own auto-focus — arm the guard so that blur
              // doesn't read as "done with this row" and check it off.
              suppressCheckoffRef.current = true;
              setDetailsOpen(true);
            }}
            // Keep the weight/reps input focused so tapping doesn't blur it
            // — Safari doesn't focus buttons on tap.
            onMouseDown={(e) => e.preventDefault()}
            title="Set details"
            data-testid={`set-${index}-more`}
          />
          <IconButton
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit()}
            title="Mark set done"
            className="text-ink"
            data-testid={`set-${index}-done`}
          >
            <Check className="size-4" />
          </IconButton>
        </span>
      </div>

      {/* RIR/RPE draft preview: the same badge out of the strip's flow as
          the committed chips', so the layout never widens for it. */}
      {modifierPreview && (
        <span className="num pointer-events-none absolute top-0 right-1.5 z-10 -translate-y-1/2 rounded-sm border border-border bg-surface px-1 text-2xs text-faint">
          {modifierPreview}
        </span>
      )}

      {/* The unilateral strip's shared-weight statement — explicit, never an
          invisible "same weight both sides". */}
      {isUnilateral && (
        <p
          className="px-4 pb-1.5 text-2xs text-faint"
          data-testid={`set-${index}-laterality-note`}
        >
          Same weight both sides — log each side&apos;s reps separately.
        </p>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          title={`Set ${index + 1} details`}
          className="md:max-w-sm"
        >
          <div className="flex flex-col gap-4">
            {effort && (
              <div className="flex flex-col gap-3">
                {modifierBindings({
                  rirMin,
                  rirMax,
                  rpe,
                  setRirMin,
                  setRirMax,
                  setRpe,
                }).map((b) => (
                  <ModifierField
                    key={b.config.key}
                    {...b}
                    autoFocus={lastAdded === b.config.key}
                    testId={`set-${index}-${b.config.key}`}
                  />
                ))}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                Note
              </span>
              <textarea
                rows={3}
                placeholder="// note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                data-testid={`set-${index}-note`}
                className="w-full resize-y rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
              />
            </label>
            {enabledMetrics
              .filter((m) => extras.has(m.id))
              .map((m) => (
                <div key={m.id} className="flex flex-col gap-1">
                  <span className="text-2xs font-medium tracking-wide text-faint uppercase">
                    {m.name}
                  </span>
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
                        setMetricDraft((d) => ({
                          ...d,
                          [m.id]: e.target.value,
                        }))
                      }
                      autoFocus={lastAdded === m.id}
                      className="num"
                      data-testid={`set-${index}-metric-${m.id}`}
                    />
                  )}
                </div>
              ))}
            {enabledMetrics.some((m) => !extras.has(m.id)) && (
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                {enabledMetrics
                  .filter((m) => !extras.has(m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleExtra(m.id)}
                      data-testid={`set-${index}-add-${m.id}`}
                      className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-2xs text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
                    >
                      <Plus className="size-3" />
                      {m.name}
                    </button>
                  ))}
              </div>
            )}
            {barLoaded && (
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  openPlates();
                }}
                data-testid={`set-${index}-plates`}
                className="flex items-center gap-2 border-t border-border pt-3 text-left text-xs text-soft transition-colors duration-150 hover:text-ink"
              >
                <Calculator className="size-3.5" />
                Plate calculator
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
