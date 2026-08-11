import {
  checkSetForPR,
  computeRecords,
  countSets,
  type Exercise,
  type ExercisePatch,
  type ExerciseRecords,
  type ExerciseType,
  e1rmFromEffort,
  formatWeight,
  ghostFor,
  groupByPrimaryMuscle,
  groupSetsBySetNo,
  isBarLoaded,
  isConfidentMatch,
  kgToLb,
  kmToM,
  LATERALITY,
  LATERALITY_EXPLAINERS,
  LATERALITY_LABELS,
  type Laterality,
  type LoggedSet,
  lbToKg,
  type Machine,
  type MatchCandidate,
  matchExerciseName,
  miToM,
  type NewRoutineInput,
  newId,
  type ParsedSetUtterance,
  type PrType,
  parseSetUtterance,
  previousCells,
  type RoutineDetail,
  type Session,
  type SetType,
  shouldStartRest,
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
  Square,
  StickyNote,
  Timer,
  Trash2,
  Unlink,
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
import { ExerciseRibbon } from "@/components/anatomy-ui";
import { MachineDialog } from "@/components/attach-machine";
import { ConditionsChip } from "@/components/conditions";
import { ExerciseEditor } from "@/components/exercise-editor";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import {
  type LoggerHandle,
  type LoggerTarget,
  MachineChip,
  type RestState,
  SessionLogger,
} from "@/components/session/logger";
import {
  ModifierField,
  modifierBindings,
} from "@/components/session/modifier-field";
import { PlateSheet } from "@/components/session/plate-sheet";
import { PrBanner, type PrBannerData } from "@/components/session/pr-banner";
import {
  blockUnitFor,
  type ColKey,
  type Column,
  type CommitCtx,
  type CommitInput,
  columnsFor,
  committedText,
  formatRest,
  type SeedSet,
  type SetPatch,
  weightUnitOverrideFor,
} from "@/components/session/shared";
import {
  FinishPhotoStrip,
  type PendingPhoto,
} from "@/components/session-photos";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dots } from "@/components/ui/dots";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SetTypeCell } from "@/components/ui/set-type-cell";
import { formatDurationSeconds, formatMMSS, parseDuration } from "@/lib/format";
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
import { clearDraft } from "@/lib/session-draft";
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

// Four accent-tinted left-border colors keyed to a superset group's slot, so
// grouped exercises read as one unit (accent-monochrome: lightness steps of
// the accent, not separate hues).
const SUPERSET_COLORS = [
  "var(--accent)",
  "color-mix(in oklab, var(--accent) 62%, var(--surface))",
  "color-mix(in oklab, var(--accent) 88%, black)",
  "color-mix(in oklab, var(--accent) 40%, var(--surface))",
];

// ms epoch → "YYYY-MM-DDTHH:mm" (local) for a datetime-local input.
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
  // Which exercise the one logger drawer is pointed at, and whether the drawer
  // is at its open snap point (peek otherwise). Tapping any ledger section
  // header repoints it.
  const [activeSeId, setActiveSeId] = useState<string | null>(null);
  const [loggerOpen, setLoggerOpen] = useState(false);
  // Which block's machine dialog is up — opened from the ledger header chip OR
  // the logger's chip, both of which point at the same per-block dialog (the
  // copy-on-write write path lives in the ledger section).
  const [machineSeId, setMachineSeId] = useState<string | null>(null);
  // Plate calculator, hoisted to the screen: the logger is a single drawer, so
  // the sheet it opens can't live inside a per-block component anymore.
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  // Ledger sections open by default; collapsing one is a per-session choice.
  const [collapsed, setCollapsed] = useState<string[]>([]);
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
  const { data: exercises = [] } = useExercises();
  const { data: machines = [] } = useMachines();
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

  // R1 — EXACTLY ONE rest stopwatch exists at a time, it counts up, and it
  // names the set it follows. It lives in the logger drawer's peek bar (the
  // screen edge), so it can never scroll away, and its measured value is
  // stamped onto the set that earned it when it stops. There is no dock, no
  // header timer and no block-header glow anymore.
  const [rest, setRest] = useState<RestState | null>(null);
  // Mirror for the handlers: stopRest is called from a keystroke handler and
  // from commit, both of which must read (and clear) the live value without
  // waiting for a render.
  const restRef = useRef<RestState | null>(null);
  useEffect(() => {
    restRef.current = rest;
  }, [rest]);

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

  // The one logger's imperative handle — the voice mic's target for applying a
  // parsed weight/reps without going through onCommit. There is exactly one
  // now (the logger points at one exercise at a time), so a voice match for
  // another exercise repoints the logger first and applies on the next tick.
  const loggerRef = useRef<LoggerHandle | null>(null);
  const pendingVoice = useRef<{
    seId: string;
    parsed: ParsedSetUtterance;
  } | null>(null);

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
    // The logger points at one exercise at a time. A match for a different one
    // repoints it first; the fill lands once that logger has mounted (the
    // effect below), so the values never go to the wrong exercise.
    if (seId !== activeSeId) {
      pendingVoice.current = { seId, parsed };
      setActiveSeId(seId);
      setLoggerOpen(true);
      return;
    }
    const block = (voiceCtx.current.blocks ?? []).find((b) => b.seId === seId);
    // False when the row's type has no field the utterance could fill (a weight
    // against a bodyweight row, anything against a duration row) — say so
    // rather than opening a logger that silently stayed empty.
    const applied =
      loggerRef.current?.applyVoice({
        weightKg: voiceWeightKg(parsed, block?.exerciseId ?? null),
        reps: parsed.reps,
      }) ?? false;
    setLoggerOpen(true);
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

  /**
   * Ends the one rest period and stamps its MEASURED length onto the set that
   * earned it (R1) — not onto whatever gets logged next, so switching
   * exercises mid-rest still credits the right row. Called by the peek bar's
   * Stop, by pulling the drawer open, and by the first keystroke of the next
   * set.
   */
  function stopRest() {
    const r = restRef.current;
    if (!r) return;
    restRef.current = null;
    setRest(null);
    const sec = Math.max(0, Math.round((Date.now() - r.startedAt) / 1000));
    // A stopwatch stopped inside its first second measured nothing worth
    // recording; "rest —" is the honest readout.
    if (sec > 0) saveSet(r.seId, r.setId, { restSec: sec });
  }

  function commitSet(seId: string, set: CommitInput, ctx: CommitCtx) {
    // The rest period that was running belongs to the PREVIOUS set — close it
    // out (stamping it there) before this one starts its own.
    stopRest();
    // Optimistic: the row is already correct locally; persist in the background.
    // `restSec` is stamped later, when this set's own rest stopwatch stops.
    const restSec = null;
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

    // The one rest stopwatch starts here, named after the set it follows and
    // pinned to the set that will carry its measurement. Suppressed when a
    // drop set is next — including the just-committed set being a drop (drops
    // chain into the next reduction with no rest) — when the just-committed
    // set was a warm-up, or on duration/distance-type exercises where
    // "resting between sets" isn't meaningful.
    const committedIsDrop = (set.setType ?? "normal") === "drop";
    const nextType = committedIsDrop ? "drop" : ctx.nextSetType;
    if (block && shouldStartRest(nextType, set.setType, ctx.exerciseType)) {
      const next: RestState = {
        seId,
        setId: leftTempId,
        exerciseName: block.name,
        setNo: countSets(block.committed) + 1,
        startedAt: Date.now(),
      };
      restRef.current = next;
      setRest(next);
    }

    // The drawer drops back to peek so the ledger (and the rest stopwatch the
    // peek bar now is) is what you see after logging.
    setLoggerOpen(false);

    // Supersets: advance the logger to the next member (wrapping). The rest
    // clock keeps running for the set that earned it — switching stations
    // mid-rest is free.
    if (smartScroll && block?.supersetGroup != null) {
      const members = (blocks ?? []).filter(
        (b) => b.supersetGroup === block.supersetGroup,
      );
      const idx = members.findIndex((b) => b.seId === seId);
      const next = members[(idx + 1) % members.length];
      if (next && next.seId !== seId) {
        setActiveSeId(next.seId);
        blockRefs.current
          .get(next.seId)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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
    // Its rest measurement has nowhere left to land — drop it silently rather
    // than stamping a soft-deleted row.
    if (restRef.current?.seId === seId) {
      restRef.current = null;
      setRest(null);
    }
    if (activeSeId === seId) setActiveSeId(null);
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

  // ---- the logger's target -------------------------------------------------
  // One drawer writes every set, so exactly one block's logging context is
  // derived here (the ledger itself needs none of it — it only reads).
  // Default target: the first block that still has sets to do, else the last.
  const activeBlock = useMemo(() => {
    const list = blocks ?? [];
    if (!list.length) return null;
    return list.find((b) => b.seId === activeSeId) ?? list[0];
  }, [blocks, activeSeId]);
  const activeExercise = exercises.find(
    (e) => e.id === activeBlock?.exerciseId,
  );
  const { data: activeGhost = [] } = useGhost(
    activeBlock ? (activeBlock.ghostExerciseId ?? activeBlock.exerciseId) : "",
    activeBlock?.seId ?? "",
    previousRoutineId,
  );

  const loggerTarget: LoggerTarget | null = useMemo(() => {
    if (!activeBlock) return null;
    const type =
      (activeExercise?.exerciseType as ExerciseType) ?? "weight_reps";
    const blockUnit = blockUnitFor(exercisePrefs, activeBlock.exerciseId, unit);
    const distUnit = distanceUnitFor(blockUnit);
    const index = countSets(activeBlock.committed);
    const seeds = seedOverride[activeBlock.seId] ?? seedFor(activeBlock);
    const machine = machines.find((m) => m.id === activeExercise?.machineId);
    return {
      seId: activeBlock.seId,
      exerciseName: activeBlock.name,
      index,
      type,
      unit: blockUnit,
      distUnit,
      columns: columnsFor(type, blockUnit, distUnit),
      seed: seeds[index],
      nextSeedType: seeds[index + 1]?.setType ?? null,
      ghost: ghostFor(activeGhost, index),
      hasGhost: activeGhost.length > 0,
      previous:
        previousCells(activeGhost, [], index + 1)[index]?.previous ?? null,
      enabledMetrics: metrics.filter(
        (m) =>
          m.scope === "set" && m.exerciseIds?.includes(activeBlock.exerciseId),
      ),
      barLoaded:
        TYPE_FIELDS[type].weight && isBarLoaded(activeExercise?.equipment),
      exerciseLaterality: activeExercise?.laterality ?? null,
      machineLabel: machine
        ? `${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`
        : null,
      nonce: blockNonce[activeBlock.seId] ?? 0,
    };
  }, [
    activeBlock,
    activeExercise,
    activeGhost,
    blockNonce,
    exercisePrefs,
    machines,
    metrics,
    seedFor,
    seedOverride,
    unit,
  ]);

  // A voice match for a different exercise repoints the logger first; the fill
  // lands once that logger has mounted.
  useEffect(() => {
    const pending = pendingVoice.current;
    if (!pending || pending.seId !== activeBlock?.seId) return;
    pendingVoice.current = null;
    applyVoiceToBlock(pending.seId, pending.parsed);
  });

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

      {/* The ledger scrolls behind the logger drawer; the bottom padding is
          the drawer's peek bar plus (on mobile) the tab island it clears. */}
      <div
        className={cn(
          // Clears the peek bar (and, on mobile, the tab island it sits above).
          "mx-auto max-w-2xl px-4 pt-4 pb-[11rem] md:pb-24",
        )}
      >
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

        {/* THE LEDGER — read-only. Every row in here is a set that happened;
            there is not one input in it (R5: the draft/upcoming/committed
            tri-state is gone). Writing happens in the one logger drawer. */}
        <Accordion
          type="multiple"
          value={blocks
            .map((b) => b.seId)
            .filter((id) => !collapsed.includes(id))}
          onValueChange={(open) =>
            setCollapsed(
              blocks.map((b) => b.seId).filter((id) => !open.includes(id)),
            )
          }
          className="mt-4 flex flex-col gap-3"
        >
          {blocks.map((block) => (
            <LedgerSection
              key={block.seId}
              block={block}
              unit={unit}
              active={block.seId === activeBlock?.seId}
              routineNote={noteFor(block)}
              plannedSets={(seedOverride[block.seId] ?? seedFor(block)).length}
              supersetColor={
                block.supersetGroup != null
                  ? SUPERSET_COLORS[supersetSlot.get(block.supersetGroup) ?? 0]
                  : null
              }
              otherBlocks={blocks
                .filter((b) => b.seId !== block.seId)
                .map((b) => ({ seId: b.seId, name: b.name }))}
              inSuperset={block.supersetGroup != null}
              restingSetId={rest?.seId === block.seId ? rest.setId : null}
              machineOpen={machineSeId === block.seId}
              onMachineOpenChange={(open) =>
                setMachineSeId(open ? block.seId : null)
              }
              onFocusLogger={() => {
                setActiveSeId(block.seId);
                setLoggerOpen(true);
                stopRest();
              }}
              onSetNote={(note) => setBlockNote(block.seId, note)}
              onLinkSuperset={(target) => linkSuperset(block.seId, target)}
              onUnlinkSuperset={() => unlinkSuperset(block.seId)}
              onAddWarmup={(w) => addWarmup(block.seId, w)}
              prSetIds={prSetIds}
              registerRef={(el) => registerBlockRef(block.seId, el)}
              onSaveSet={(setId, patch) => saveSet(block.seId, setId, patch)}
              onRemoveSet={(setId) => removeSet(block.seId, setId)}
              onSetLaterality={setCommittedLaterality}
              onRemoveBlock={() => removeBlock(block.seId)}
              onSwapExercise={swapBlockExercise}
            />
          ))}
        </Accordion>

        <div className="mt-4 flex flex-col gap-4">
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

      {/* THE LOGGER — one persistent bottom drawer does all the writing, and
          its peek bar IS the rest stopwatch (R1). */}
      <SessionLogger
        ref={loggerRef}
        target={loggerTarget}
        rest={rest}
        open={loggerOpen}
        onOpenChange={(open) => {
          setLoggerOpen(open);
          // Pulling the drawer up ends the rest (and stamps it on the set that
          // earned it) — "rest's over, next set".
          if (open) stopRest();
        }}
        onStopRest={stopRest}
        onTypingStarted={stopRest}
        onOpenMachine={() => setMachineSeId(activeBlock?.seId ?? null)}
        onOpenPlates={(target) => {
          setPlateTarget(target);
          setPlateOpen(true);
        }}
        timerRunning={activeBlock != null && timer?.seId === activeBlock.seId}
        timerStartedAt={
          activeBlock != null && timer?.seId === activeBlock.seId
            ? timer.startedAt
            : null
        }
        onToggleTimer={() => activeBlock && toggleTimer(activeBlock.seId)}
        onCommit={(set, ctx) =>
          activeBlock && commitSet(activeBlock.seId, set, ctx)
        }
      />

      <PlateSheet
        open={plateOpen}
        onOpenChange={setPlateOpen}
        target={plateTarget}
        unit={loggerTarget?.unit ?? unit}
        plateConfig={plateConfig}
        onSaveConfig={(cfg) => updatePrefs.mutate({ plateConfig: cfg })}
        testId={`plates-${activeBlock?.name ?? ""}`}
      />

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

/**
 * THE LEDGER — one Accordion section per exercise. Header: name, machine chip,
 * sets-done count, ⋯. Body: committed set rows ONLY. Not one input lives in
 * here; every write goes through the single logger drawer. Tapping the header
 * points the logger at this exercise.
 */
function LedgerSection({
  block,
  unit,
  active,
  routineNote,
  plannedSets,
  supersetColor,
  otherBlocks,
  inSuperset,
  restingSetId,
  machineOpen,
  onMachineOpenChange,
  onFocusLogger,
  onSetNote,
  onLinkSuperset,
  onUnlinkSuperset,
  onAddWarmup,
  prSetIds,
  registerRef,
  onSaveSet,
  onRemoveSet,
  onSetLaterality,
  onRemoveBlock,
  onSwapExercise,
}: {
  block: BlockState;
  unit: Unit;
  /** The logger is pointed at this exercise — the section takes an accent
   * border, per mockup E1. */
  active: boolean;
  routineNote: string | null;
  plannedSets: number;
  supersetColor: string | null;
  otherBlocks: { seId: string; name: string }[];
  inSuperset: boolean;
  /** The set row currently earning the running rest stopwatch (its stamp is
   * still being measured) — renders "rest …". */
  restingSetId: string | null;
  machineOpen: boolean;
  onMachineOpenChange: (open: boolean) => void;
  onFocusLogger: () => void;
  onSetNote: (note: string) => void;
  onLinkSuperset: (targetSeId: string) => void;
  onUnlinkSuperset: () => void;
  onAddWarmup: (workingWeightKg: number) => void;
  prSetIds: Set<string>;
  registerRef: (el: HTMLElement | null) => void;
  onSaveSet: (setId: string, patch: SetPatch) => void;
  onRemoveSet: (setId: string) => void;
  /** Flip one committed set between bilateral and unilateral. */
  onSetLaterality: (
    seId: string,
    exerciseType: ExerciseType,
    primary: LoggedSet,
    unilateral: boolean,
  ) => void;
  onRemoveBlock: () => void;
  onSwapExercise: (seId: string, exerciseId: string, ghostId: string) => void;
}) {
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
  const setsDone = countSets(block.committed);
  // Average rest between this exercise's committed sets — rest is a
  // per-exercise gap (each block times its own), so it's reported here in
  // the section header, not in the session stats line. Rendered only once at
  // least one committed set carries a rest value.
  const avgRestSec = (() => {
    const rests = block.committed
      .map((s) => s.restSec)
      .filter((r): r is number => r != null && r > 0);
    return rests.length
      ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length)
      : null;
  })();
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
  const warmupEligible = TYPE_FIELDS[type].weight;
  // Warm-up prefill: the heaviest weight logged so far (display unit).
  const heaviestKg = block.committed.reduce(
    (max, s) => (s.weightKg != null && s.weightKg > max ? s.weightKg : max),
    0,
  );
  const machineLabel = machine
    ? `${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`
    : null;
  const groups = groupSetsBySetNo(block.committed);

  return (
    <AccordionItem
      ref={registerRef}
      value={block.seId}
      // E1: the section the logger points at takes the accent border.
      className={cn(active && "border-accent")}
      style={
        supersetColor ? { borderLeft: `3px solid ${supersetColor}` } : undefined
      }
      data-testid={`block-${block.name}`}
      data-superset={inSuperset ? "1" : undefined}
      data-active={active ? "1" : undefined}
    >
      {/* Header row: name · machine chip · sets done (the collapse trigger) · ⋯
          — mockup E1. Everything here is readable at 390px: the name owns the
          leftover width, the chip and the count are fixed. */}
      <div className="flex min-h-11 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <button
          type="button"
          // Tapping the header points the logger at this exercise (the one
          // navigation act in the ledger).
          onClick={onFocusLogger}
          className="flex min-w-0 flex-1 flex-col text-left"
          data-testid={`block-${block.name}-open`}
        >
          <span className="truncate text-sm font-semibold">{block.name}</span>
          {routineNote && (
            <span
              className="truncate text-2xs text-faint"
              data-testid={`block-${block.name}-note`}
            >
              {routineNote}
            </span>
          )}
          {avgRestSec != null && (
            <span
              className="num truncate text-2xs text-faint"
              title="Average rest between sets of this exercise"
              data-testid={`block-${block.name}-rest-avg`}
            >
              rest {formatRest(avgRestSec)} avg
            </span>
          )}
        </button>
        {/* R3: the machine is a visible chip on the ledger header, so the
            session record answers "what was I on" forever — never a ⋯ item. */}
        <MachineChip
          label={machineLabel}
          onClick={() => onMachineOpenChange(true)}
          testId={`setup-strip-${block.name}`}
        />
        {/* Sets-done doubles as the collapse trigger — one control, not two. */}
        <AccordionTrigger
          className="h-8 shrink-0 gap-1 border border-border bg-surface-2 px-1.5"
          aria-label={`Toggle ${block.name} sets`}
          data-testid={`block-${block.name}-count`}
        >
          <span className="num text-2xs text-faint">
            {setsDone}/{Math.max(plannedSets, setsDone)}
            {plannedSets > 0 && setsDone >= plannedSets ? " ✓" : ""}
          </span>
        </AccordionTrigger>
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
          override={override}
          globalUnit={unit}
          weightColumnHeader={
            columns.find((c) => c.key === "weight")?.header ?? null
          }
          onSetWeightUnit={(u) =>
            setWeightUnit.mutate({ exerciseId: block.exerciseId, unit: u })
          }
          onOpenDetail={() => navigate(`/exercises/${block.exerciseId}`)}
          laterality={exercise?.laterality ?? null}
          onLateralityChange={(l) => editOrCopy({ laterality: l })}
          onRemoveBlock={onRemoveBlock}
          onLinkSuperset={onLinkSuperset}
          onUnlinkSuperset={onUnlinkSuperset}
          onAddWarmup={(displayWeight) =>
            onAddWarmup(
              blockUnit === "lb" ? lbToKg(displayWeight) : displayWeight,
            )
          }
        />
      </div>

      <MachineDialog
        blockName={block.name}
        machine={machine ?? null}
        open={machineOpen}
        onOpenChange={onMachineOpenChange}
        onAttach={(machineId) => editOrCopy({ machineId })}
      />

      {copyError && (
        <div
          role="status"
          data-testid={`block-${block.name}-copy-error`}
          className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2"
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

      <AccordionContent className="flex flex-col">
        {/* The exercise's own cue ("brace before you unrack") — set once in
            the exercise editor, read-only here, distinct from this session's
            own note below. */}
        {exercise?.notes && (
          <p
            className="px-2.5 pt-1.5 text-2xs text-faint"
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

        {groups.length === 0 ? (
          <p
            className="px-2.5 py-2.5 text-2xs text-faint"
            data-testid={`block-${block.name}-empty`}
          >
            {t("No sets yet.", "Nothing on the record yet.")}
          </p>
        ) : (
          <div className="flex flex-col">
            {groups.map((rows, i) => (
              <CommittedRow
                key={rows[0].id}
                rows={rows}
                index={i}
                unit={blockUnit}
                distUnit={distUnit}
                type={type}
                columns={columns}
                prSetIds={prSetIds}
                resting={rows[0].id === restingSetId}
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
      </AccordionContent>
    </AccordionItem>
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
  override,
  globalUnit,
  weightColumnHeader,
  onSetWeightUnit,
  onOpenDetail,
  laterality,
  onLateralityChange,
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
  /** Per-exercise weight-unit override (null = follow the session unit). */
  override: Unit | null;
  globalUnit: Unit;
  /** Null on exercise types with no weight field. */
  weightColumnHeader: string | null;
  onSetWeightUnit: (unit: Unit | null) => void;
  onOpenDetail: () => void;
  laterality: string | null;
  onLateralityChange: (l: Laterality) => void;
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
  // null (never set) and any legacy value (incl. pre-2026-08-08
  // 'alternating') read as bilateral — the same default the editor and the
  // session's pairing logic use.
  const currentLaterality: Laterality =
    laterality === "unilateral" ? "unilateral" : "bilateral";

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

            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenDetail();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              data-testid={`block-${blockName}-detail`}
            >
              <History className="size-3.5 shrink-0 text-faint" />
              Exercise details
            </button>
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
            {weightColumnHeader && (
              <>
                <div className="border-t border-border" />
                <p className={labelCls} data-testid={`block-${blockName}-unit`}>
                  Weight unit
                </p>
                {(
                  [
                    { value: "kg", label: "kg" },
                    { value: "lb", label: "lbs" },
                    {
                      value: null,
                      label: `Default (${unitLabel(globalUnit)})`,
                    },
                  ] as { value: Unit | null; label: string }[]
                ).map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSetWeightUnit(o.value);
                    }}
                    data-testid={`block-${blockName}-unit-${o.value ?? "default"}`}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                  >
                    {o.label}
                    {override === o.value && (
                      <Check className="size-3.5 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}
            <div className="border-t border-border" />
            <p className={labelCls}>Laterality</p>
            <p className="px-3 pb-1 text-2xs text-faint">
              Bilateral: both sides work together — one row per set. Unilateral:
              each side's reps are logged separately, as two rows.
            </p>
            {LATERALITY.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onLateralityChange(l);
                }}
                disabled={busy}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-soft"
                data-testid={`block-${blockName}-laterality-${l}`}
              >
                <span className="flex flex-col">
                  {LATERALITY_LABELS[l]}
                  <span className="text-2xs font-normal normal-case tracking-normal text-faint">
                    {LATERALITY_EXPLAINERS[l]}
                  </span>
                </span>
                {currentLaterality === l && (
                  <Check className="size-3.5 shrink-0 text-accent" />
                )}
              </button>
            ))}
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

/**
 * One committed set, as a LEDGER row: set number/type, the values (a
 * unilateral pair as ONE row with ᴸ/ᴿ chips), and the rest stamp measured
 * after it. Read-only at rest — tapping a value opens the details sheet,
 * which is where every edit (values, RIR/RPE, note, laterality, delete)
 * happens.
 */
function CommittedRow({
  rows,
  index,
  unit,
  distUnit,
  type,
  columns,
  prSetIds,
  resting,
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
  /** The rest stopwatch is running for this set right now — "rest …". */
  resting: boolean;
  onSave: (setId: string, patch: SetPatch) => void;
  onSaveType: (patch: Pick<SetPatch, "setType">) => void;
  onDelete: () => void;
  /** Flip this committed set between bilateral and unilateral. */
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
  // case doesn't clutter both lines with duplicate readouts.
  // Compared through the rendered readout, so a legacy scalar and the
  // equivalent zero-width range don't read as a divergence.
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
      // Writes always go through the range pair going forward — the legacy
      // scalar column is left null rather than kept alongside it.
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
          // Estimate off the low end of the range — the harder-effort bound.
          // Read through rirRange so a max-only entry still projects, matching
          // the badge rather than silently falling back to plain Epley.
          rir: rirRange(parseLoggedRirFields(rirMin, rirMax))?.min ?? null,
          rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
        },
      )
    : null;
  // mm:ss, matching the stopwatch that measured it (the header average uses
  // the same formatter).
  const restLabel =
    primary.restSec != null ? formatRest(primary.restSec) : null;
  const labelCls = "text-2xs font-medium tracking-wide text-faint uppercase";

  // The ᴿ line's weight cell (note 1: same weight both sides is the norm, the
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

  const valueCells = (set: LoggedSet, side: "left" | "right" | null) => (
    <span className="num flex min-w-0 items-baseline gap-1 text-sm">
      {side && (
        <Badge
          variant="accent"
          className="self-center"
          title={side === "left" ? "Left side" : "Right side"}
          data-testid={`committed-${index}-side-${side}`}
        >
          {side === "left" ? "ᴸ" : "ᴿ"}
        </Badge>
      )}
      {columns.map((c, i) => (
        <span key={c.key} className="flex items-baseline gap-1">
          {i > 0 && <span className="text-faint">×</span>}
          <button
            type="button"
            onClick={() => openDetails(set)}
            className="min-h-5 cursor-pointer text-left"
            title="Set details"
            data-testid={`committed-${index}-${side === "right" ? "right-" : ""}${c.key}`}
          >
            {c.key === "weight" && side === "right"
              ? rightWeightText() ||
                committedText(c.key, primary, unit, distUnit)
              : committedText(c.key, set, unit, distUnit)}
          </button>
        </span>
      ))}
    </span>
  );

  return (
    <div className="relative border-t border-border first:border-t-0">
      <div
        className={cn(
          "commit-flash flex min-h-11 items-center gap-2 px-2.5 py-1 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover md:min-h-9",
          // Zebra by physical set (a unilateral pair is one stripe, since it's
          // one CommittedRow) — one quiet sage step.
          index % 2 === 1 ? "bg-surface-2" : "bg-surface",
        )}
        data-testid={`committed-${index}`}
      >
        <SetTypeCell
          index={index}
          setType={setType}
          ringState="done"
          onChange={(t) => onSaveType({ setType: t })}
          testId={`committed-${index}-type`}
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          {valueCells(primary, isPaired ? "left" : (primary.side ?? null))}
          {isPaired && valueCells(secondary, "right")}
        </span>

        {/* R1: the measured rest that followed THIS set — "…" while its
            stopwatch is still running, "—" when nothing was measured. */}
        <span
          className="num shrink-0 text-2xs text-faint"
          title="Rest taken after this set"
          data-testid={`committed-${index}-rest`}
        >
          {resting ? "rest …" : restLabel ? `rest ${restLabel}` : "rest —"}
        </span>

        {/* The ᴸ limb's readout also prints when only the ᴿ limb diverges —
            "—" then says "nothing on this side", which a missing badge would
            leave reading as "the ᴿ readout is the whole set's". */}
        {effort && (effortReadout(primary) || secondaryEffortDiffers) && (
          <span
            className="num shrink-0 border border-border bg-surface px-1 text-2xs text-faint"
            data-testid={`committed-${index}-effort`}
          >
            {effortReadout(primary) || "—"}
          </span>
        )}
        {effort && secondaryEffortDiffers && (
          <span
            className="num shrink-0 border border-border bg-surface px-1 text-2xs text-faint"
            data-testid={`committed-${index}-right-effort`}
          >
            {effortReadout(secondary) || "—"}
          </span>
        )}
        {primaryNote && (
          <span
            className="shrink-0 text-faint"
            title={primaryNote}
            data-testid={`committed-${index}-note`}
          >
            <StickyNote className="size-3.5" />
          </span>
        )}
        {notesDiffer && secondaryNote && (
          <span
            className="shrink-0 text-faint"
            title={secondaryNote}
            data-testid={`committed-${index}-right-note`}
          >
            <StickyNote className="size-3.5" />
          </span>
        )}
        {prSetIds.has(primary.id) && (
          <span
            className="shrink-0 text-accent"
            title="Personal record"
            data-testid={`committed-${index}-medal`}
          >
            <Medal className="size-3.5" />
          </span>
        )}
        {isPaired && prSetIds.has(secondary.id) && (
          <span
            className="shrink-0 text-accent"
            title="Personal record"
            data-testid={`committed-${index}-right-medal`}
          >
            <Medal className="size-3.5" />
          </span>
        )}
        <Dots
          onClick={() => openDetails(primary)}
          title="Set details"
          data-testid={`set-menu-${index}`}
        />
      </div>

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
                sheet (opened from the ⋯ or a ᴸ value cell) — flipping the set
                away from unilateral while editing the ᴿ limb would delete the
                very row being edited. Mirrors the draft row's per-set
                override, but writes the committed pair structurally. */}
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
