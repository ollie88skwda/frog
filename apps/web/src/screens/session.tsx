// "The Spotlight" — Frog's training-session screen (2026-08-12 redesign,
// session-redesign-r3). One set owns most of the screen; session/exercise
// context compresses into a thin top band. See docs/DECISIONS.md for the
// locked design decisions this file implements.
//
// Scope notes for future readers (also called out in the shipping PR body):
//  - Supersets and drop sets are gone from this UI ("not science-based").
//    Historic sessions that used them still render (their sets are just
//    marks/done, no pairing) — the data (supersetGroup, setType 'drop')
//    is untouched.
//  - RIR moved from a free min/max range to a single-value segmented pick
//    (0/1/2/3/4+) everywhere in this screen, per the locked decision.
//  - Per-set notes and custom per-exercise metrics moved out of the live
//    logging flow (the hero has no room for them, and the mockups don't
//    show them) into the edit sheet a mark opens after a set is logged.
//  - Per-machine remembered settings (seat height etc.) are no longer
//    editable from the session screen — the header chip only attaches /
//    swaps the machine now (Library still owns per-machine setup).
import {
  checkSetForPR,
  computeRecords,
  countSets,
  type Exercise,
  type ExercisePatch,
  type ExercisePref,
  type ExerciseRecords,
  type ExerciseType,
  formatWeight,
  type GhostSet,
  ghostFor,
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
  matchExerciseName,
  miToM,
  type NewRoutineInput,
  newId,
  type ParsedSetUtterance,
  type PlateConfig,
  PR_TYPE_LABELS,
  type PrType,
  parseSetUtterance,
  type RecordsSessionInput,
  type RestTimerState,
  type RoutineDetail,
  type Session,
  type SetType,
  shouldStartRest,
  startRest,
  supportsEffort,
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
  ChevronRight,
  Flame,
  Medal,
  Mic,
  NotebookPen,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ExerciseRibbon, ExerciseThumb } from "@/components/anatomy-ui";
import { ConditionsChip } from "@/components/conditions";
import { ExerciseEditor } from "@/components/exercise-editor";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { MachineChip } from "@/components/session/machine-chip";
import { PlateSheet } from "@/components/session/plate-sheet";
import { PrBanner, type PrBannerData } from "@/components/session/pr-banner";
import { RestStopwatch } from "@/components/session/rest-stopwatch";
import {
  FinishPhotoStrip,
  type PendingPhoto,
} from "@/components/session-photos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
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
  useSession,
  useSessionExercises,
  useSetExerciseWeightUnit,
  useUpdateExercise,
} from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { useRoutineDetail } from "@/lib/routine-queries";
import { clearDraft, loadDraft, saveDraft } from "@/lib/session-draft";
import {
  type DistanceUnit,
  distanceUnitFor,
  type Unit,
  useUnit,
} from "@/lib/settings";
import { compareToLast, rirSegmentOf, segmentToFields } from "@/lib/spotlight";
import { cn } from "@/lib/utils";
import { useVoice, voice } from "@/lib/voice";
import { getWarmupMethod } from "@/lib/warmup-method";
import { useKeepAwake, useLivePrBanner } from "@/lib/workout-prefs";

// ── Types shared across the screen ──────────────────────────────────────────

type BlockState = {
  seId: string;
  exerciseId: string;
  name: string;
  // The exercise the last-time lookups key on. Set by the copy-on-write swap
  // (a seed exercise cloned into a private custom copy) so a fresh copy's
  // empty history doesn't blank the reference row mid-session; null = the
  // block has never been swapped.
  ghostExerciseId?: string;
  // Provenance from a routine-started session (null = ad-hoc / empty workout).
  routineExerciseId: string | null;
  // Superset grouping from before the R3 redesign (2026-08-12): the UI no
  // longer creates or displays these, but a historical session can still
  // carry the field — round-tripped through Finish's structure write-back
  // untouched, never read for layout.
  supersetGroup: number | null;
  note: string | null;
  committed: LoggedSet[];
};

// Context a spotlight hands up on set completion, so the screen can run the
// PR check + rest-stopwatch without re-deriving per-block facts.
type CommitCtx = {
  exerciseType: ExerciseType;
  // Planned type of the set that will follow (routine seed at the next
  // index) — unused now that drop-set chaining is gone from the UI, kept so
  // shouldStartRest's signature (still shared with historical call sites)
  // doesn't need to special-case a session-only caller.
  nextSetType: string | null;
};

type CommitInput = Omit<LoggedSet, "id" | "setNo" | "restSec"> & {
  metricValues?: Record<string, unknown> | null;
  restSec?: number | null;
  /** Present only for a unilateral pair: the right side's own values,
   * written as a second row sharing this commit's set_no. Per-side sets
   * (R3): RIR/RPE are entered per side at commit time, not mirrored from
   * the left — only set type stays shared. */
  otherSide?: {
    weightKg: number | null;
    reps: number | null;
    durationSec: number | null;
    distanceM: number | null;
    rirMin: number | null;
    rirMax: number | null;
    rpe: number | null;
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

// Per-set-index seed for the spotlight: routine targets (weights/reps/rep-range
// placeholder) OR the source sets when copying a workout.
export type SeedSet = {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repsMax: number | null;
  durationSec: number | null;
  distanceM: number | null;
  laterality?: Laterality | null;
};

// ── Small formatters / helpers ──────────────────────────────────────────────

// mm:ss for a rest duration in whole seconds — the block header's average.
function formatRest(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type FieldKey = "weight" | "distance" | "duration" | "reps";

// Which fields the spotlight stacks, in order — same left-to-right reading
// order the old grid used (weight, distance, time, reps), now top-to-bottom.
function fieldsFor(type: ExerciseType): FieldKey[] {
  const f = TYPE_FIELDS[type];
  const out: FieldKey[] = [];
  if (f.weight) out.push("weight");
  if (f.distance) out.push("distance");
  if (f.duration) out.push("duration");
  if (f.reps) out.push("reps");
  return out;
}

function fieldLabel(key: FieldKey, type: ExerciseType): string {
  if (key === "weight") return "Weight";
  if (key === "distance") return "Distance";
  if (key === "duration") return "Time";
  return TYPE_FIELDS[type].weight ? "Reps" : "Reps";
}

// Nothing usable came back from the mic.
function micUnheard(): string {
  return voice("Didn't catch that.", "Didn't catch that — try again?");
}

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

function weightUnitOverrideFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
): Unit | null {
  const override = prefs.find((p) => p.exerciseId === exerciseId)?.weightUnit;
  return override === "kg" || override === "lb" ? override : null;
}

function blockUnitFor(
  prefs: ExercisePref[],
  exerciseId: string | null,
  sessionUnit: Unit,
): Unit {
  return weightUnitOverrideFor(prefs, exerciseId) ?? sessionUnit;
}

// Compact "100 × 8" / "1:30" string for a stored/ghost value at one field.
function fieldText(
  key: FieldKey,
  v: {
    weightKg?: number | null;
    reps?: number | null;
    durationSec?: number | null;
    distanceM?: number | null;
  },
  unit: Unit,
  distUnit: DistanceUnit,
): string {
  switch (key) {
    case "weight":
      return v.weightKg != null
        ? String(toDisplayWeight(v.weightKg, unit))
        : "—";
    case "reps":
      return v.reps != null ? String(v.reps) : "—";
    case "duration":
      return v.durationSec != null ? formatMMSS(v.durationSec) : "—";
    case "distance":
      return v.distanceM != null
        ? String(toDisplayDistance(v.distanceM, distUnit))
        : "—";
  }
}

// ── RIR / RPE: shared effort controls (locked decision — segmented RIR,
// compact RPE, both single-value, replacing the old free min/max range) ─────

const RIR_SEGMENTS = [0, 1, 2, 3, 4] as const;
const RPE_VALUES = Array.from({ length: 21 }, (_, i) => i * 0.5); // 0..10

// Contract testid for one RIR segment: value ∈ 0,1,2,3,4plus ("rir-option-{value}",
// with a -left/-right suffix in per-side mode) — testid-contract.md.
function rirOptionId(v: number, side?: "left" | "right"): string {
  const val = v >= 4 ? "4plus" : String(v);
  return side ? `rir-option-${val}-${side}` : `rir-option-${val}`;
}

function RirSegmented({
  min,
  max,
  onChange,
  side,
}: {
  min: string;
  max: string;
  onChange: (v: { min: string; max: string }) => void;
  side?: "left" | "right";
}) {
  const selected = rirSegmentOf(min, max);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium tracking-widest text-faint uppercase">
        RIR
      </span>
      <div className="flex gap-1">
        {RIR_SEGMENTS.map((v) => {
          const on = selected === v;
          return (
            <button
              key={v}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onChange(on ? { min: "", max: "" } : segmentToFields(v))
              }
              aria-pressed={on}
              className={cn(
                "num h-10 flex-1 border text-sm font-semibold transition-colors duration-100",
                on
                  ? "border-ink bg-ink text-(--accent-fg)"
                  : "border-border-strong bg-surface text-soft hover:bg-surface-hover",
              )}
              data-testid={rirOptionId(v, side)}
            >
              {v === 4 ? "4+" : v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RpePicker({
  value,
  onChange,
  side,
}: {
  value: string;
  onChange: (v: string) => void;
  side?: "left" | "right";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-medium tracking-widest text-faint uppercase">
        RPE
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num h-10 w-full border border-border-strong bg-surface px-2 text-sm font-semibold text-ink transition-colors duration-150 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
        data-testid={side ? `rpe-picker-${side}` : "rpe-picker"}
      >
        <option value="">—</option>
        {RPE_VALUES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
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
  const sessionLoaded = session !== undefined;
  const {
    data: restored,
    isError: restoredError,
    refetch: refetchRestored,
  } = useSessionExercises(sessionId);
  const routineQuery = useRoutineDetail(session?.routineId ?? null);
  const routineDetail = routineQuery.data ?? null;
  const routineLoading =
    routineQuery.isFetching ||
    (routineQuery.data === undefined && !routineQuery.isError);

  const [blocks, setBlocks] = useState<BlockState[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [activeSeId, setActiveSeId] = useState<string | null>(null);
  const copySeed = (location.state as { seed?: Record<string, SeedSet[]> })
    ?.seed;

  // Inline duration stopwatch (a set's own timed field, e.g. a plank) — at
  // most one runs across the whole session. Distinct from the REST
  // stopwatch below (one measures the set, the other measures the gap
  // between sets).
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

  const [lastCommitByBlock, setLastCommitByBlock] = useState<
    Record<string, number>
  >({});

  const { data: exercises = [] } = useExercises();
  const pendingExercises = usePendingExercises();

  const [livePrEnabled] = useLivePrBanner();
  const [keepAwake] = useKeepAwake();
  const { data: userPrefs } = useUserPrefs();
  const { data: exercisePrefs = [] } = useExercisePrefs();
  const updatePrefs = useUpdateUserPrefs();
  const plateConfig = userPrefs?.plateConfig ?? null;
  const previousRoutineId =
    userPrefs?.previousValuesScope === "routine"
      ? (session?.routineId ?? null)
      : null;

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

  // Session-wide rest stopwatch (R3: exactly ONE, tied to whichever set was
  // just committed — the Spotlight shows one exercise at a time, so there is
  // no "resting on two exercises simultaneously" concept anymore).
  const [rest, setRest] = useState<{
    seId: string;
    state: RestTimerState;
  } | null>(null);
  const dismissRest = useCallback(() => setRest(null), []);

  const [prBanner, setPrBanner] = useState<PrBannerData | null>(null);
  const prIdRef = useRef(0);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  const [idMap, setIdMap] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<RecordsSessionInput[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = (qc.getQueryData(["records-data", true]) ??
        qc.getQueryData(["records-data", false])) as
        | { history?: RecordsSessionInput[] }
        | undefined;
      if (cached?.history) {
        setHistory(cached.history);
        return;
      }
      const h = await repo.recordsData();
      if (!cancelled) setHistory(h);
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, repo]);
  const prSnapshot = useMemo(
    () => (history ? computeRecords(history).byExercise : null),
    [history],
  );

  const [seedOverride, setSeedOverride] = useState<Record<string, SeedSet[]>>(
    {},
  );
  const [blockNonce, setBlockNonce] = useState<Record<string, number>>({});

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

  // Voice-fill target: since only the ACTIVE exercise's spotlight is ever
  // mounted (R3 — one exercise on screen at a time), a spoken utterance for
  // a DIFFERENT block can't reach it through an imperative ref the way the
  // old always-mounted grid did. Switching the active block and handing the
  // values down as a prop works for both cases (already active, or not)
  // uniformly — Spotlight applies it in an effect on receipt.
  const [voiceFill, setVoiceFill] = useState<{
    seId: string;
    weightKg: number | null;
    reps: number | null;
  } | null>(null);
  const clearVoiceFill = useCallback(() => setVoiceFill(null), []);

  const speechSupported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    (window.SpeechRecognition != null ||
      window.webkitSpeechRecognition != null);
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [voicePicker, setVoicePicker] = useState<{
    parsed: ParsedSetUtterance;
    candidates: MatchCandidate[];
  } | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micMessageTimer = useRef<number | null>(null);

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
    const exercise = exercises.find((e) => e.id === block?.exerciseId);
    const type = (exercise?.exerciseType as ExerciseType) ?? "weight_reps";
    const f = TYPE_FIELDS[type];
    const weightKg = f.weight
      ? voiceWeightKg(parsed, block?.exerciseId ?? null)
      : null;
    const reps = f.reps ? parsed.reps : null;
    const applied = weightKg != null || reps != null;
    setActiveSeId(seId);
    if (applied) setVoiceFill({ seId, weightKg, reps });
    else
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
    if (match.tied.length > 1) {
      setVoicePicker({ parsed, candidates: match.tied });
      return;
    }
    applyVoiceToBlock(match.id, parsed);
  }

  function startListening() {
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

  const routineByReId = useMemo(() => {
    const m = new Map<string, RoutineDetail["exercises"][number]>();
    for (const e of routineDetail?.exercises ?? []) m.set(e.id, e);
    return m;
  }, [routineDetail]);

  useEffect(() => {
    if (blocks !== null || !restored) return;
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

  // Default the spotlight to the first exercise once blocks land; if the
  // active exercise gets removed, fall back to whatever's now first.
  useEffect(() => {
    if (!blocks || blocks.length === 0) return;
    if (activeSeId && blocks.some((b) => b.seId === activeSeId)) return;
    setActiveSeId(blocks[0].seId);
  }, [blocks, activeSeId]);

  const autoOpenedPicker = useRef(false);
  useEffect(() => {
    if (!autoOpenedPicker.current && blocks !== null && blocks.length === 0) {
      autoOpenedPicker.current = true;
      setPicking(true);
    }
  }, [blocks]);

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
    onSuccess: (realId, { tempId }) => {
      setIdMap((prev) => ({ ...prev, [tempId]: realId }));
      setQueuedSets((prev) => {
        if (!(tempId in prev)) return prev;
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
    },
    onError: (_err, { tempId }) => {
      setQueuedSets((prev) => {
        const queued = prev[tempId];
        if (!queued || queued.failed) return prev;
        return { ...prev, [tempId]: { ...queued, failed: true } };
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["records-data"] });
      void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
    },
  });

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
  function retryFailedSets() {
    for (const { seId, set, tempId, setNo } of failedSets)
      logSet.mutate({ seId, set, tempId, setNo });
  }
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
    if (pendingExercises.has(exerciseId)) return;
    setPicking(false);
    setSwitcherOpen(false);
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
    setActiveSeId(seId);
  }

  function commitSet(seId: string, set: CommitInput, ctx: CommitCtx) {
    const prevAt = lastCommitByBlock[seId];
    const restSec =
      prevAt != null ? Math.round((Date.now() - prevAt) / 1000) : null;
    const block = (blocks ?? []).find((b) => b.seId === seId);
    const setNo = (block?.committed ?? []).reduce(
      (next, s) => Math.max(next, s.setNo + 1),
      0,
    );
    const leftTempId = newId();
    const { otherSide, ...leftFields } = set;
    const leftRow = { ...leftFields, restSec, id: leftTempId, setNo };
    const rightTempId = otherSide ? newId() : null;
    const rightRow =
      otherSide && rightTempId
        ? {
            weightKg: otherSide.weightKg,
            reps: otherSide.reps,
            durationSec: otherSide.durationSec,
            distanceM: otherSide.distanceM,
            setType: set.setType,
            rir: null,
            rirMin: otherSide.rirMin,
            rirMax: otherSide.rirMax,
            rpe: otherSide.rpe,
            note: null,
            metricValues: null,
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
    clearDraft(seId);

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
      if (hitTypes.size && livePrEnabled) {
        prIdRef.current += 1;
        setPrBanner({
          id: prIdRef.current,
          exerciseName: block.name,
          prTypes: [...hitTypes],
        });
      }
    }

    // Rest stopwatch: exactly one, always tied to the set that was just
    // committed (R3 — no superset siblings to preserve anymore). Suppressed
    // for a warm-up commit or a type with no rest concept.
    const starting = shouldStartRest(
      ctx.nextSetType,
      set.setType,
      ctx.exerciseType,
    );
    setRest(starting ? { seId, state: startRest(Date.now()) } : null);
  }

  const nextGroupId = () => {
    const ids = (blocks ?? [])
      .map((b) => b.supersetGroup)
      .filter((g): g is number => g != null);
    return ids.length ? Math.max(...ids) + 1 : 1;
  };
  void nextGroupId; // kept for structureInput's round-trip shape below

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
    setQueuedSets((prev) => {
      const queued = prev[setId];
      if (!queued) return prev;
      return {
        ...prev,
        [setId]: { ...queued, set: { ...queued.set, ...patch } },
      };
    });
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
      setQueuedSets((prev) => {
        const queued = prev[leftRow.id];
        if (!queued) return prev;
        return {
          ...prev,
          [leftRow.id]: { ...queued, set: { ...queued.set, side: "left" } },
        };
      });
      void repo.updateSet(idMap[leftRow.id] ?? leftRow.id, { side: "left" });
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
      void repo.updateSet(idMap[leftRow.id] ?? leftRow.id, { side: null });
    }
  }

  function removeBlock(seId: string) {
    setBlocks((prev) => (prev ?? []).filter((b) => b.seId !== seId));
    if (rest?.seId === seId) dismissRest();
    dropQueuedSets((_id, v) => v.seId === seId);
    void repo.deleteSessionExercise(seId).then(
      () => {
        void qc.invalidateQueries({ queryKey: ["recent-exercise-ids"] });
      },
      () => {},
    );
  }

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
              laterality: rows.length === 2 ? "unilateral" : "bilateral",
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
    if (routineId && opts.updateValues && blocks) {
      const performed = blocks
        .filter((b) => b.routineExerciseId)
        .map((b) => ({
          routineExerciseId: b.routineExerciseId as string,
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
    if (routineId && opts.updateStructure) {
      const input = structureInput();
      if (input) await repo.updateRoutine(routineId, input);
    }
    if ((opts.title.trim() || null) !== (session?.title ?? null))
      await repo.updateSessionTitle(sessionId, opts.title.trim() || null);
    if (opts.notes !== (session?.notes ?? ""))
      await repo.updateSessionNotes(sessionId, opts.notes.trim() || null);
    if (session && opts.startedAt !== session.startedAt)
      await repo.updateSessionStartedAt(sessionId, opts.startedAt);
    const finalPausedMs = currentPausedMs();
    if (finalPausedMs !== (session?.pausedMs ?? 0))
      await repo.updateSessionPausedMs(sessionId, finalPausedMs);

    await repo.endSession(sessionId);
    for (const b of blocks ?? []) clearDraft(b.seId);
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
    void qc.invalidateQueries({ queryKey: ["sessions-all"] });
    void qc.invalidateQueries({ queryKey: ["findings-data"] });
    void qc.invalidateQueries({ queryKey: ["records-data"] });
    void qc.invalidateQueries({ queryKey: ["session-exercises", sessionId] });
    if (routineId)
      void qc.invalidateQueries({ queryKey: ["routine-detail", routineId] });
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
  const activeIdx = Math.max(
    0,
    blocks.findIndex((b) => b.seId === activeSeId),
  );
  const activeBlock = blocks[activeIdx] ?? null;

  function gotoOffset(delta: -1 | 1) {
    const next = blocks?.[activeIdx + delta];
    if (next) setActiveSeId(next.seId);
  }

  return (
    <>
      <PrBanner data={prBanner} onDismiss={() => setPrBanner(null)} />
      {failedSetCount > 0 && (
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4",
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

      {/* 1. Session line — name, elapsed clock, Finish. */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">
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
              data-testid="session-finish"
            >
              <Square className="size-3" />
              Finish
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-3 border-b border-border px-4 py-1.5">
        {/* The chip owns the leftover space (flex-1) while the stats text
            stays shrink-0, so the chip never gets squeezed to a sliver on a
            narrow phone — it wraps to its own row before that happens. */}
        <div className="min-w-max flex-1">
          <ConditionsChip sessionId={sessionId} />
        </div>
        <p
          className="num shrink-0 text-xs text-faint"
          data-testid="session-stats"
        >
          {setCount} {setCount === 1 ? "set" : "sets"} ·{" "}
          {volume.toLocaleString()} {unitLabel(unit)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/routines")}
          data-testid="session-routines-btn"
        >
          <NotebookPen className="size-4" />
          Routines
        </Button>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col">
        {activeBlock ? (
          <ExerciseSpotlight
            key={activeBlock.seId}
            block={activeBlock}
            position={activeIdx + 1}
            total={blocks.length}
            unit={unit}
            previousRoutineId={previousRoutineId}
            seedSets={seedOverride[activeBlock.seId] ?? seedFor(activeBlock)}
            seedNonce={blockNonce[activeBlock.seId] ?? 0}
            plateConfig={plateConfig}
            onSavePlateConfig={(cfg) =>
              updatePrefs.mutate({ plateConfig: cfg })
            }
            restStartedAt={
              rest?.seId === activeBlock.seId ? rest.state.startedAt : null
            }
            onStopRest={dismissRest}
            onAddWarmup={(w) => addWarmup(activeBlock.seId, w)}
            onRemoveBlock={() => removeBlock(activeBlock.seId)}
            onOpenSwitcher={() => setSwitcherOpen(true)}
            onSwipe={gotoOffset}
            prSetIds={prSetIds}
            prSnapshot={prSnapshot}
            history={history}
            voiceFill={voiceFill?.seId === activeBlock.seId ? voiceFill : null}
            onVoiceFillConsumed={clearVoiceFill}
            timerRunning={timer?.seId === activeBlock.seId}
            timerStartedAt={
              timer?.seId === activeBlock.seId ? timer.startedAt : null
            }
            onToggleTimer={() => toggleTimer(activeBlock.seId)}
            onCommit={(set, ctx) => commitSet(activeBlock.seId, set, ctx)}
            onSaveSet={(setId, patch) =>
              saveSet(activeBlock.seId, setId, patch)
            }
            onRemoveSet={(setId) => removeSet(activeBlock.seId, setId)}
            onSetLaterality={setCommittedLaterality}
            onSwapExercise={swapBlockExercise}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="text-center text-sm text-faint">No exercises yet.</p>
          </div>
        )}

        <div className="px-4 pb-24">
          <Button
            variant="outline"
            size="lg"
            className="mt-3 w-full"
            onClick={() => setPicking(true)}
            data-testid="open-exercise-picker"
          >
            <Plus className="size-4" />
            Add exercise
          </Button>
        </div>
      </div>

      <ExerciseSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        blocks={blocks}
        seedFor={seedFor}
        activeSeId={activeBlock?.seId ?? null}
        onJump={(id) => {
          setActiveSeId(id);
          setSwitcherOpen(false);
        }}
        onAddExercise={() => {
          setSwitcherOpen(false);
          setPicking(true);
        }}
        onFinish={() => {
          setSwitcherOpen(false);
          setFinishOpen(true);
        }}
      />

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

// ── Finish / Save Workout overlay (unchanged from the prior design) ────────

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
  const [endAt] = useState(() => Date.now());
  const [titleDraft, setTitleDraft] = useState(title);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [startedDraft, setStartedDraft] = useState(startedAt);
  const [updateValues, setUpdateValues] = useState(true);
  const [updateStructure, setUpdateStructure] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
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

// ── Add-exercise picker (unchanged from the prior design) ──────────────────

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
  const exercises = exerciseData ?? [];
  const exercisesLoaded = exerciseData !== undefined;
  const { t } = useVoice();
  const { data: machines = [] } = useMachines();
  const pendingExercises = usePendingExercises();
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  const [yoursOnly, setYoursOnly] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
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
  const shown = filtered.length > 0 || search !== query ? filtered : candidates;
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

function PickerRow({
  exercise,
  tier,
  machine,
  pending,
  onPick,
}: {
  exercise: Exercise;
  tier?: string | null;
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
          <ExerciseRibbon
            exercise={exercise}
            tier={tier as never}
            machine={machine}
          />
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
        <span className="flex items-center gap-1">Last: {summary}</span>
      ) : (
        <span className="text-faint">No history yet.</span>
      )}
    </div>
  );
}

// ── Exercise switcher — the bottom sheet the exercise-header name opens ────

function ExerciseSwitcher({
  open,
  onOpenChange,
  blocks,
  seedFor,
  activeSeId,
  onJump,
  onAddExercise,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: BlockState[];
  seedFor: (block: BlockState) => SeedSet[];
  activeSeId: string | null;
  onJump: (seId: string) => void;
  onAddExercise: () => void;
  onFinish: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Switch exercise" className="md:max-w-md">
        <ul
          className="flex flex-col border border-border"
          data-testid="exercise-sheet"
        >
          {blocks.map((b, i) => {
            const planned = seedFor(b).length;
            const done = countSets(b.committed);
            const complete = planned > 0 && done >= planned;
            return (
              <li
                key={b.seId}
                className={cn(
                  "border-border not-first:border-t",
                  b.seId === activeSeId ? "bg-accent-soft" : "bg-surface",
                )}
              >
                <button
                  type="button"
                  onClick={() => onJump(b.seId)}
                  className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-100 hover:bg-surface-hover"
                  data-testid={`exercise-sheet-row-${i}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {b.name}
                  </span>
                  <span
                    className={cn(
                      "num shrink-0 text-xs tabular-nums",
                      complete ? "text-accent" : "text-faint",
                    )}
                    data-testid={`switcher-progress-${b.name}`}
                  >
                    {planned > 0 ? `${done}/${planned}` : done}
                    {complete ? " ✓" : ""}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-faint" />
                </button>
              </li>
            );
          })}
          {blocks.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-faint">
              No exercises yet — add one below.
            </li>
          )}
        </ul>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full"
            onClick={onAddExercise}
            data-testid="switcher-add-exercise"
          >
            <Plus className="size-4" />
            Add exercise
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={onFinish}
            data-testid="switcher-finish"
          >
            <Square className="size-3" />
            Finish workout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Warm-up ramp generator (block-level, distinct from the per-set ⋯'s plain
// "make it a warm-up" toggle) ───────────────────────────────────────────────

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

// ── Growth bars: expandable six-session top-set chart ──────────────────────

function GrowthBars({
  history,
  exerciseId,
  unit,
  liveTopKg,
}: {
  history: RecordsSessionInput[] | null;
  exerciseId: string;
  unit: Unit;
  liveTopKg: number | null;
}) {
  const points = useMemo(() => {
    const perSession: Array<{ at: number; kg: number }> = [];
    for (const s of history ?? []) {
      const block = s.exercises.find((e) => e.exerciseId === exerciseId);
      if (!block) continue;
      let best: number | null = null;
      for (const set of block.sets) {
        if (set.setType === "warmup" || set.weightKg == null) continue;
        if (best == null || set.weightKg > best) best = set.weightKg;
      }
      if (best != null) perSession.push({ at: s.startedAt, kg: best });
    }
    perSession.sort((a, b) => a.at - b.at);
    const past = perSession.slice(-5);
    const bars = past.map((p) => ({
      label: formatDayShort(p.at),
      value: toDisplayWeight(p.kg, unit),
      isToday: false,
    }));
    bars.push({
      label: "today",
      value: liveTopKg != null ? toDisplayWeight(liveTopKg, unit) : 0,
      isToday: true,
    });
    const oldest = past[0];
    const todayVal = liveTopKg ?? past[past.length - 1]?.kg ?? null;
    const trend =
      oldest && todayVal != null
        ? {
            weeks: Math.max(
              1,
              Math.round((Date.now() - oldest.at) / (7 * 86_400_000)),
            ),
            deltaKg: todayVal - oldest.kg,
          }
        : null;
    return { bars, trend };
  }, [history, exerciseId, unit, liveTopKg]);

  if (points.bars.every((b) => b.value === 0)) {
    return (
      <p className="px-1 py-3 text-center text-2xs text-faint">
        Not enough history yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1" data-testid="growth-bars">
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points.bars}
            margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              fontSize={9}
              stroke="var(--faint)"
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Bar
              dataKey="value"
              radius={0}
              maxBarSize={28}
              // A custom shape (not <Cell> children) so each bar can carry
              // its own testid — Cell doesn't forward arbitrary DOM props.
              shape={(props: {
                x?: number;
                y?: number;
                width?: number;
                height?: number;
                index?: number;
              }) => {
                const {
                  x = 0,
                  y = 0,
                  width = 0,
                  height = 0,
                  index = 0,
                } = props;
                const bar = points.bars[index];
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={bar?.isToday ? "var(--accent-soft)" : "var(--accent)"}
                    stroke={bar?.isToday ? "var(--accent)" : undefined}
                    strokeDasharray={bar?.isToday ? "3 2" : undefined}
                    data-testid={`stats-growth-bar-${index}`}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {points.trend && (
        <p className="num text-center text-2xs text-faint">
          {points.trend.weeks} wk {points.trend.deltaKg >= 0 ? "+" : "−"}
          {Math.abs(
            Math.round(toDisplayWeight(points.trend.deltaKg, unit) * 10) / 10,
          )}{" "}
          {unitLabel(unit)}
        </p>
      )}
    </div>
  );
}

function formatDayShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type MarkState = "done" | "warmup" | "current" | "todo";
type Mark = {
  kind: MarkState;
  paired: boolean;
  pr: boolean;
  onTap?: () => void;
};

function MarksBand({ marks }: { marks: Mark[] }) {
  return (
    <div className="flex border-b border-border" data-testid="marks-band">
      {marks.map((m, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed set-1,set-2,... sequence, never reordered
          key={`${m.kind}-${i}`}
          type="button"
          disabled={!m.onTap}
          onClick={m.onTap}
          className={cn(
            "relative min-w-0 flex-1 border-r border-border py-2.5 text-center text-base leading-none last:border-r-0",
            m.kind === "done" && "text-accent",
            m.kind === "warmup" && "text-warn",
            m.kind === "todo" && "text-border-strong",
            m.kind === "current" && "bg-ink text-(--accent-fg)",
          )}
          data-testid={`set-mark-${i}`}
        >
          <span data-testid={`set-mark-${i}-state`} data-state={m.kind}>
            {m.kind === "current" ? "●" : m.kind === "todo" ? "○" : "✓"}
          </span>
          {m.paired && (
            <span
              data-testid={`set-mark-${i}-side-tag`}
              className="absolute right-0 bottom-0.5 left-0 text-[7px] font-bold text-faint"
            >
              ᴸᴿ
            </span>
          )}
          {m.kind === "warmup" && (
            <span className="absolute right-0 bottom-0.5 left-0 text-[7px] font-bold text-faint">
              W
            </span>
          )}
          {m.pr && (
            <Medal
              className="absolute top-0.5 right-0.5 size-2.5 text-accent"
              data-testid={`set-mark-${i}-medal`}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ── Edge dots (position indicator down the right edge) ─────────────────────

function EdgeDots({ total, position }: { total: number; position: number }) {
  if (total <= 1) return null;
  return (
    <div
      className="pointer-events-none fixed top-1/2 right-1 z-10 flex -translate-y-1/2 flex-col items-center gap-1.5"
      data-testid="exercise-edge-rail"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count position rail, no other identity per dot
          key={`dot-${i}`}
          className={cn(
            "size-1 shrink-0",
            i < position - 1 && "bg-accent",
            i === position - 1 && "size-2 bg-ink",
            i > position - 1 && "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}

// ── Exercise settings overflow (block-level actions the mockup's minimal
// header doesn't draw, but that stay reachable) ────────────────────────────

function ExerciseSettingsMenu({
  blockName,
  unit,
  showUnitOverride,
  unitOverride,
  globalUnit,
  onSetUnitOverride,
  warmupEligible,
  heaviestDisplay,
  laterality,
  onLateralityChange,
  onRemoveBlock,
  onAddWarmup,
  busy,
}: {
  blockName: string;
  unit: Unit;
  showUnitOverride: boolean;
  unitOverride: Unit | null;
  globalUnit: Unit;
  onSetUnitOverride: (u: Unit | null) => void;
  warmupEligible: boolean;
  heaviestDisplay: number | null;
  laterality: string | null;
  onLateralityChange: (l: Laterality) => void;
  onRemoveBlock: () => void;
  onAddWarmup: (displayWeight: number) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);
  const currentLaterality: Laterality =
    laterality === "unilateral" ? "unilateral" : "bilateral";
  return (
    <span className="relative">
      <IconButton
        onClick={() => setOpen((o) => !o)}
        title="Exercise options"
        data-testid={`block-${blockName}-menu`}
      >
        <Wrench className="size-4" />
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
            className="floating absolute top-full right-0 z-20 mt-1 max-h-80 min-w-56 overflow-y-auto py-1"
            data-testid={`block-${blockName}-menu-popup`}
          >
            {warmupEligible && (
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
            )}
            {showUnitOverride && (
              <>
                <div className="border-t border-border" />
                <p className="px-3 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase">
                  Weight unit
                </p>
                {[
                  { value: "kg" as const, label: "kg" },
                  { value: "lb" as const, label: "lbs" },
                  { value: null, label: `Default (${unitLabel(globalUnit)})` },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSetUnitOverride(o.value);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
                    data-testid={`block-${blockName}-unit-${o.value ?? "default"}`}
                  >
                    {o.label}
                    {unitOverride === o.value && (
                      <Check className="size-3.5 shrink-0 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}
            <div className="border-t border-border" />
            <p className="px-3 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase">
              Default laterality
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
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink disabled:cursor-default disabled:opacity-50"
                data-testid={`block-${blockName}-laterality-${l}`}
              >
                {LATERALITY_LABELS[l]}
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
              className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg disabled:cursor-default disabled:opacity-50"
              data-testid={`remove-block-${blockName}`}
            >
              <Trash2 className="size-3.5 shrink-0 text-faint group-hover:text-neg" />
              Remove exercise
            </button>
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

// ── Per-set ⋯ (SET TYPE ONLY per the locked decision) ───────────────────────

function SetActionsMenu({
  isWarmup,
  onToggleWarmup,
  isUnilateral,
  onToggleUnilateral,
  onDelete,
}: {
  isWarmup: boolean;
  onToggleWarmup: () => void;
  isUnilateral: boolean;
  onToggleUnilateral: () => void;
  /** Present only when focused on an already-committed set. */
  onDelete: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Set options"
        className="flex size-9 shrink-0 items-center justify-center border border-border-strong bg-surface-2 text-lg font-bold text-soft"
        data-testid="set-type-menu"
      >
        ⋯
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              setConfirmDelete(false);
            }}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full right-0 z-20 mt-1 min-w-52 py-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggleWarmup();
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              data-testid="set-type-warmup"
            >
              <span className="flex items-center gap-2">
                <Flame className="size-3.5 shrink-0 text-warn" />
                Make it a warm-up
              </span>
              {isWarmup && <Check className="size-3.5 text-accent" />}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggleUnilateral();
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              data-testid="set-type-perside"
            >
              <span>Log left/right separately</span>
              {isUnilateral && <Check className="size-3.5 text-accent" />}
            </button>
            {onDelete && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (confirmDelete) {
                    setOpen(false);
                    setConfirmDelete(false);
                    onDelete();
                  } else {
                    setConfirmDelete(true);
                  }
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neg transition-colors duration-150 hover:bg-surface-hover"
                data-testid="set-type-delete"
              >
                <Trash2 className="size-3.5 shrink-0" />
                {confirmDelete ? "Confirm delete" : "Delete set"}
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// ── The exercise spotlight — header, marks band, hero set, action zone ─────

function ExerciseSpotlight({
  block,
  position,
  total,
  unit,
  previousRoutineId,
  seedSets,
  seedNonce,
  plateConfig,
  onSavePlateConfig,
  restStartedAt,
  onStopRest,
  onAddWarmup,
  onRemoveBlock,
  onOpenSwitcher,
  onSwipe,
  prSetIds,
  prSnapshot,
  history,
  voiceFill,
  onVoiceFillConsumed,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
  onSaveSet,
  onRemoveSet,
  onSetLaterality,
  onSwapExercise,
}: {
  block: BlockState;
  position: number;
  total: number;
  unit: Unit;
  previousRoutineId: string | null;
  seedSets: SeedSet[];
  seedNonce: number;
  plateConfig: PlateConfig | null;
  onSavePlateConfig: (cfg: PlateConfig) => void;
  restStartedAt: number | null;
  onStopRest: () => void;
  onAddWarmup: (workingWeightKg: number) => void;
  onRemoveBlock: () => void;
  onOpenSwitcher: () => void;
  onSwipe: (delta: -1 | 1) => void;
  prSetIds: Set<string>;
  prSnapshot: Map<string, ExerciseRecords> | null;
  history: RecordsSessionInput[] | null;
  voiceFill: { weightKg: number | null; reps: number | null } | null;
  onVoiceFillConsumed: () => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
  onSaveSet: (setId: string, patch: SetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onSetLaterality: (
    seId: string,
    exerciseType: ExerciseType,
    primary: LoggedSet,
    unilateral: boolean,
  ) => void;
  onSwapExercise: (seId: string, exerciseId: string, ghostId: string) => void;
}) {
  // isLoading (not just `data`) matters here: the live spotlight FILLS
  // weight/reps from this on mount via a plain useState initializer (a
  // one-shot read, not a subscription), so mounting it before this query
  // has settled would freeze the fields at "no last time" forever even
  // once the real ghost lands a moment later — gated below.
  const { data: ghost = [], isLoading: ghostLoading } = useGhost(
    block.ghostExerciseId ?? block.exerciseId,
    block.seId,
    previousRoutineId,
  );
  useLastNote(block.ghostExerciseId ?? block.exerciseId, block.seId);
  const { data: exercises = [] } = useExercises();
  const { data: prefs = [] } = useExercisePrefs();
  const setWeightUnit = useSetExerciseWeightUnit();
  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const deleteExercise = useDeleteExercise();
  const repo = useRepo();
  const [plateTarget, setPlateTarget] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const activeIndex = countSets(block.committed);
  // Tapping a done/warm-up mark focuses the spotlight on that already-
  // logged set instead of the live (next-to-log) one; null = follow live.
  // The same fixed-id spotlight renders either way (testid-contract.md) —
  // there is exactly one spotlight on screen, never a second modal copy.
  const [manualFocus, setManualFocus] = useState<number | null>(null);
  const focusedIndex = manualFocus ?? activeIndex;
  const focusLive = useCallback(() => setManualFocus(null), []);
  // A spoken utterance always targets the live (next-to-log) set, even if
  // the user had a past set pinned open from a marks-band tap.
  useEffect(() => {
    if (voiceFill) focusLive();
  }, [voiceFill, focusLive]);
  // Per-set laterality override, lifted up here (not owned by the live input
  // component) so the marks band's current-set ᴸᴿ tag can read it too.
  const [lateralityOverride, setLateralityOverride] =
    useState<Laterality | null>(
      () =>
        loadDraft(block.seId)?.laterality ??
        seedSets[activeIndex]?.laterality ??
        null,
    );
  const touchRef = useRef<{ x: number; y: number } | null>(null);

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
    if (ex.isCustom && ex.ownerId !== null) {
      updateExercise.mutate({ exerciseId: ex.id, patch });
      return;
    }
    setCopyError(null);
    const originalId = ex.id;
    const copyId = newId();
    const creating = createExercise.mutateAsync({
      name: `${ex.name} (copy)`,
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
        // Resolved by settleRepointFailure below.
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

  const exercise = exercises.find((e) => e.id === block.exerciseId);
  const machines = useMachines().data ?? [];
  const machine = machines.find((m) => m.id === exercise?.machineId);
  const type = (exercise?.exerciseType as ExerciseType) ?? "weight_reps";
  const override = weightUnitOverrideFor(prefs, block.exerciseId);
  const blockUnit = blockUnitFor(prefs, block.exerciseId, unit);
  const distUnit = distanceUnitFor(blockUnit);
  const barLoaded =
    TYPE_FIELDS[type].weight && isBarLoaded(exercise?.equipment);
  const warmupEligible = TYPE_FIELDS[type].weight;
  const heaviestKg = block.committed.reduce(
    (max, s) => (s.weightKg != null && s.weightKg > max ? s.weightKg : max),
    0,
  );
  // Rest is a per-exercise gap (each exercise times its own), so it's
  // reported here, not in the session-wide stats line.
  const avgRestSec = (() => {
    const rests = block.committed
      .map((s) => s.restSec)
      .filter((r): r is number => r != null && r > 0);
    return rests.length
      ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length)
      : null;
  })();

  const committedGroups = groupSetsBySetNo(block.committed);
  const totalMarks = Math.max(committedGroups.length + 1, seedSets.length + 1);
  const marks: Mark[] = [];
  for (let i = 0; i < totalMarks; i++) {
    if (i < committedGroups.length) {
      const group = committedGroups[i];
      marks.push({
        kind: group[0].setType === "warmup" ? "warmup" : "done",
        paired: group.length === 2,
        pr: group.some((r) => prSetIds.has(r.id)),
        onTap: () => setManualFocus(i),
      });
    } else if (i === activeIndex) {
      marks.push({
        kind: "current",
        paired: false,
        pr: false,
        onTap: focusLive,
      });
    } else {
      marks.push({ kind: "todo", paired: false, pr: false });
    }
  }

  const liveTopKg = block.committed.reduce(
    (max: number | null, s) =>
      s.setType !== "warmup" &&
      s.weightKg != null &&
      (max == null || s.weightKg > max)
        ? s.weightKg
        : max,
    null,
  );

  function onTouchStart(e: ReactTouchEvent) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: ReactTouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <EdgeDots total={total} position={position} />

      {/* 2. Exercise header. */}
      <header className="px-4 pt-3 pb-2.5" data-testid={`block-${block.name}`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSwitcher}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            data-testid="exercise-header"
          >
            <ExerciseThumb imageUrl={exercise?.imageUrl} name={block.name} />
            <span
              className="min-w-0 truncate text-xl font-extrabold tracking-tight"
              data-testid="exercise-name"
            >
              {block.name}
            </span>
            <ChevronDown className="size-3 shrink-0 text-faint" />
          </button>
          <ExerciseSettingsMenu
            blockName={block.name}
            unit={blockUnit}
            showUnitOverride={TYPE_FIELDS[type].weight}
            unitOverride={override}
            globalUnit={unit}
            onSetUnitOverride={(u) =>
              setWeightUnit.mutate({ exerciseId: block.exerciseId, unit: u })
            }
            warmupEligible={warmupEligible}
            heaviestDisplay={
              heaviestKg > 0 ? toDisplayWeight(heaviestKg, blockUnit) : null
            }
            laterality={exercise?.laterality ?? null}
            onLateralityChange={(l) => editOrCopy({ laterality: l })}
            onRemoveBlock={onRemoveBlock}
            onAddWarmup={(w) => onAddWarmup(blockUnit === "lb" ? lbToKg(w) : w)}
            busy={copying || copyError != null}
          />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span
            className="num shrink-0 text-2xs text-faint"
            data-testid="exercise-position"
          >
            {position} of {total}
          </span>
          {avgRestSec != null && (
            <span
              className="num shrink-0 text-2xs text-faint"
              title="Average rest between sets of this exercise"
              data-testid={`block-${block.name}-rest-avg`}
            >
              rest {formatRest(avgRestSec)} avg
            </span>
          )}
          <MachineChip
            machine={machine ?? null}
            blockName={block.name}
            disabled={copying}
            onPick={(machineId) => editOrCopy({ machineId })}
          />
          {override && (
            <button
              type="button"
              onClick={() =>
                setWeightUnit.mutate({
                  exerciseId: block.exerciseId,
                  unit: null,
                })
              }
              className="num shrink-0 border border-border bg-surface-2 px-1.5 py-0.5 text-2xs text-faint"
              title="Using a per-exercise weight unit override — tap to clear"
              data-testid={`block-${block.name}-unit-clear`}
            >
              {unitLabel(override)} only
            </button>
          )}
        </div>
        {copyError && (
          <div
            role="status"
            data-testid={`block-${block.name}-copy-error`}
            className="mt-2 flex items-center justify-between gap-2 border border-border px-2 py-1.5"
          >
            <span className="min-w-0 text-2xs text-neg">
              {copyError.unresolved
                ? "Couldn't confirm that change — check your connection and retry."
                : "Couldn't update this exercise — couldn't reach the server."}
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
      </header>

      {/* 3. Set band. */}
      <MarksBand marks={marks} />

      {/* 4 + 5. The spotlight + action zone — one persistent spotlight, live
          or focused on a committed set via a marks-band tap (never a second
          modal copy of the same fields; testid-contract.md).

          Held back on its FIRST paint until the ghost query settles when
          it's the live (not-yet-logged) set that's showing: Spotlight fills
          weight/reps from `ghost` once, via a useState initializer, on
          mount — mounting it while the query is still loading would freeze
          the fields at "no last time" even after the real ghost data lands,
          which is exactly the bug this guards ("opens already filled, no
          user action" has to be true the instant it's visible, not after a
          blank flash). Editing an already-committed set never depends on
          ghost — its values come straight from `committedGroup`. */}
      {committedGroups[focusedIndex] == null && ghostLoading ? (
        <p
          className="px-4 py-10 text-center text-xs text-faint"
          data-testid="spotlight-loading"
        >
          Loading…
        </p>
      ) : (
        <Spotlight
          key={`${block.seId}-${focusedIndex}-${seedNonce}-${
            committedGroups[focusedIndex]?.map((r) => r.id).join(",") ?? "live"
          }`}
          seId={block.seId}
          index={focusedIndex}
          unit={blockUnit}
          distUnit={distUnit}
          type={type}
          seed={seedSets[focusedIndex]}
          nextSeedType={seedSets[focusedIndex + 1]?.setType ?? null}
          ghost={ghostFor(ghost, focusedIndex)}
          hasGhost={ghost.length > 0}
          committedGroup={committedGroups[focusedIndex] ?? null}
          barLoaded={barLoaded}
          exerciseLaterality={exercise?.laterality ?? null}
          lateralityOverride={lateralityOverride}
          onLateralityOverrideChange={setLateralityOverride}
          onOpenPlates={(target) => {
            setPlateTarget(target);
            setPlateOpen(true);
          }}
          timerRunning={timerRunning}
          timerStartedAt={timerStartedAt}
          onToggleTimer={onToggleTimer}
          restStartedAt={focusedIndex === activeIndex ? restStartedAt : null}
          onStopRest={onStopRest}
          onCommit={onCommit}
          onSaveCommitted={(setId, patch) => onSaveSet(setId, patch)}
          onSaveType={(patch) => {
            const group = committedGroups[focusedIndex];
            if (group) for (const r of group) onSaveSet(r.id, patch);
          }}
          onDeleteCommitted={() => {
            const group = committedGroups[focusedIndex];
            if (group) for (const r of group) onRemoveSet(r.id);
            focusLive();
          }}
          onSetLaterality={(unilateral) => {
            const group = committedGroups[focusedIndex];
            if (group) onSetLaterality(block.seId, type, group[0], unilateral);
          }}
          onFocusLive={focusLive}
          history={history}
          liveTopKg={liveTopKg}
          exerciseId={block.exerciseId}
          prSnapshot={prSnapshot}
          voiceFill={voiceFill}
          onVoiceFillConsumed={onVoiceFillConsumed}
        />
      )}

      <PlateSheet
        open={plateOpen}
        onOpenChange={setPlateOpen}
        target={plateTarget}
        unit={blockUnit}
        plateConfig={plateConfig}
        onSaveConfig={onSavePlateConfig}
        testId={`plates-${block.name}`}
      />
    </div>
  );
}

// ── The live spotlight set: prefilled two-stacked-row input, jump buttons,
// comparison headers, delta line, stats + growth, RIR/RPE. ─────────────────

const WEIGHT_NEG = [-15, -10, -5, -1];
const WEIGHT_POS = [1, 5, 10, 15];
const REPS_NEG = [-2, -1];
const REPS_POS = [1, 2];
const DURATION_NEG = [-30, -10];
const DURATION_POS = [10, 30];
const DISTANCE_NEG = [-1, -0.1];
const DISTANCE_POS = [0.1, 1];

function jumpsFor(key: FieldKey): { neg: number[]; pos: number[] } {
  if (key === "weight") return { neg: WEIGHT_NEG, pos: WEIGHT_POS };
  if (key === "reps") return { neg: REPS_NEG, pos: REPS_POS };
  if (key === "duration") return { neg: DURATION_NEG, pos: DURATION_POS };
  return { neg: DISTANCE_NEG, pos: DISTANCE_POS };
}

// ── The spotlight: the ONE persistent set editor on screen. Live (the next
// set to log) or focused on an already-committed set via a marks-band tap —
// same fixed testid-contract.md hooks either way, never a second modal copy
// of the same fields. `committedGroup` null = live. ─────────────────────────

function Spotlight({
  seId,
  index,
  unit,
  distUnit,
  type,
  seed,
  nextSeedType,
  ghost,
  hasGhost,
  committedGroup,
  barLoaded,
  exerciseLaterality,
  lateralityOverride,
  onLateralityOverrideChange,
  onOpenPlates,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  restStartedAt,
  onStopRest,
  onCommit,
  onSaveCommitted,
  onSaveType,
  onDeleteCommitted,
  onSetLaterality,
  onFocusLive,
  history,
  liveTopKg,
  exerciseId,
  prSnapshot,
  voiceFill,
  onVoiceFillConsumed,
}: {
  seId: string;
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  seed: SeedSet | undefined;
  nextSeedType: string | null;
  ghost: GhostSet;
  hasGhost: boolean;
  /** The physical set's stored rows when this index is already logged —
   * present = editing mode, using the SAME fields/ids as live logging. */
  committedGroup: LoggedSet[] | null;
  barLoaded: boolean;
  exerciseLaterality: string | null;
  lateralityOverride: Laterality | null;
  onLateralityOverrideChange: (l: Laterality | null) => void;
  onOpenPlates: (target: number | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  restStartedAt: number | null;
  onStopRest: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
  onSaveCommitted: (setId: string, patch: SetPatch) => void;
  onSaveType: (patch: Pick<SetPatch, "setType">) => void;
  onDeleteCommitted: () => void;
  onSetLaterality: (unilateral: boolean) => void;
  onFocusLive: () => void;
  history: RecordsSessionInput[] | null;
  liveTopKg: number | null;
  exerciseId: string;
  prSnapshot: Map<string, ExerciseRecords> | null;
  voiceFill: { weightKg: number | null; reps: number | null } | null;
  onVoiceFillConsumed: () => void;
}) {
  const isEditing = committedGroup != null;
  const left = committedGroup?.[0] ?? null;
  const right = committedGroup?.[1] ?? null;
  const draft = isEditing ? null : loadDraft(seId);
  const initialUnilateral = isEditing
    ? right != null
    : (lateralityOverride ?? exerciseLaterality) === "unilateral";
  const f = TYPE_FIELDS[type];
  const effort = supportsEffort(type);
  const fields = fieldsFor(type);

  // "Already loaded with last time's numbers — no tap required" (locked
  // decision): prefill priority is any uncommitted draft, else last time
  // (ghost), else the routine/copy-workout seed, else blank. In edit mode
  // the fields show the set's own stored values instead.
  const seedFrom = (kind: "weight" | "reps" | "duration" | "distance") => {
    if (isEditing && left) {
      if (kind === "weight")
        return left.weightKg != null
          ? String(toDisplayWeight(left.weightKg, unit))
          : "";
      if (kind === "reps") return left.reps != null ? String(left.reps) : "";
      if (kind === "duration")
        return left.durationSec != null ? formatMMSS(left.durationSec) : "";
      return left.distanceM != null
        ? String(toDisplayDistance(left.distanceM, distUnit))
        : "";
    }
    // Contract: a value FILLS the field only from an uncommitted draft or
    // last time's own performance (ghost) — never from the routine target,
    // which is placeholder-only (seedPlaceholder below) when there's no
    // ghost to prefill from.
    if (kind === "weight") {
      if (draft?.weight) return draft.weight;
      if (ghost.weightKg != null)
        return String(toDisplayWeight(ghost.weightKg, unit));
      return "";
    }
    if (kind === "reps") {
      if (draft?.reps) return draft.reps;
      if (ghost.reps != null) return String(ghost.reps);
      return "";
    }
    if (kind === "duration") {
      if (draft?.duration) return draft.duration;
      if (ghost.durationSec != null) return formatMMSS(ghost.durationSec);
      return "";
    }
    if (draft?.distance) return draft.distance;
    if (ghost.distanceM != null)
      return String(toDisplayDistance(ghost.distanceM, distUnit));
    return "";
  };
  // Routine/copy-workout target, shown as a placeholder only — never a
  // silent fill — when there's no ghost (last-time) value for this field.
  const seedPlaceholder = (
    kind: "weight" | "reps" | "duration" | "distance",
  ): string | undefined => {
    if (isEditing || !seed) return undefined;
    if (kind === "weight")
      return seed.weightKg != null
        ? String(toDisplayWeight(seed.weightKg, unit))
        : undefined;
    if (kind === "reps") {
      if (seed.repsMax != null) return `${seed.reps ?? ""}–${seed.repsMax}`;
      return seed.reps != null ? String(seed.reps) : undefined;
    }
    if (kind === "duration")
      return seed.durationSec != null
        ? formatMMSS(seed.durationSec)
        : undefined;
    return seed.distanceM != null
      ? String(toDisplayDistance(seed.distanceM, distUnit))
      : undefined;
  };
  const seedRightReps = () => {
    if (isEditing) return right?.reps != null ? String(right.reps) : "";
    return draft?.rReps ?? "";
  };
  const seedRightWeight = () => {
    if (isEditing)
      return right?.weightKg != null
        ? String(toDisplayWeight(right.weightKg, unit))
        : "";
    return "";
  };

  const [weight, setWeight] = useState(() => seedFrom("weight"));
  const [reps, setReps] = useState(() => seedFrom("reps"));
  const [duration, setDuration] = useState(() => seedFrom("duration"));
  const [distance, setDistance] = useState(() => seedFrom("distance"));
  const [rirMin, setRirMin] = useState(
    () => draft?.rirMin ?? (left?.rirMin != null ? String(left.rirMin) : ""),
  );
  const [rirMax, setRirMax] = useState(
    () => draft?.rirMax ?? (left?.rirMax != null ? String(left.rirMax) : ""),
  );
  const [rpe, setRpe] = useState(
    () => draft?.rpe ?? (left?.rpe != null ? String(left.rpe) : ""),
  );
  const [setType, setSetType] = useState<SetType>(
    () =>
      (left?.setType as SetType | undefined) ??
      draft?.setType ??
      seed?.setType ??
      "normal",
  );
  const [isUnilateral, setIsUnilateral] = useState(initialUnilateral);
  const [reps2, setReps2] = useState(() => seedRightReps());
  const [rDuration, setRDuration] = useState(() => draft?.rDuration ?? "");
  const [rDistance, setRDistance] = useState(() => draft?.rDistance ?? "");
  const [rirMin2, setRirMin2] = useState(() =>
    right?.rirMin != null ? String(right.rirMin) : "",
  );
  const [rirMax2, setRirMax2] = useState(() =>
    right?.rirMax != null ? String(right.rirMax) : "",
  );
  const [rpe2, setRpe2] = useState(() =>
    right?.rpe != null ? String(right.rpe) : "",
  );
  // Weight-link (per-side mode): linked = one shared field (weight-field);
  // unlinked = weight-field-left/-right, its own jump rows each. Defaults to
  // whatever the stored pair actually is when editing an uneven set.
  const [weightLinked, setWeightLinked] = useState(
    () => !isEditing || !right || left?.weightKg === right.weightKg,
  );
  const [weight2, setWeight2] = useState(() => seedRightWeight());
  const [growthOpen, setGrowthOpen] = useState(
    () => sessionStorage.getItem("frog.growth-open") === "1",
  );
  const [, forceTick] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (isEditing) return;
    saveDraft(seId, {
      weight,
      reps,
      duration,
      distance,
      rirMin,
      rirMax,
      rpe,
      note: "",
      setType,
      extras: [],
      metricDraft: {},
      rReps: reps2,
      rDuration,
      rDistance,
      laterality: lateralityOverride,
    });
  }, [
    isEditing,
    seId,
    weight,
    reps,
    duration,
    distance,
    rirMin,
    rirMax,
    rpe,
    setType,
    reps2,
    rDuration,
    rDistance,
    lateralityOverride,
  ]);

  // Voice fill only ever targets the live set (SessionScreen already
  // returns focus to live before handing this down) — applied via an
  // effect so it lands whether this row was already showing or the mic
  // switched to it.
  useEffect(() => {
    if (!voiceFill || isEditing) return;
    if (f.weight && voiceFill.weightKg != null)
      setWeight(String(toDisplayWeight(voiceFill.weightKg, unit)));
    if (f.reps && voiceFill.reps != null) setReps(String(voiceFill.reps));
    onVoiceFillConsumed();
  }, [voiceFill, isEditing, f.weight, f.reps, unit, onVoiceFillConsumed]);

  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [timerRunning]);
  const liveElapsed =
    timerRunning && timerStartedAt != null
      ? Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000))
      : null;
  const durationDisplay =
    liveElapsed != null ? formatMMSS(liveElapsed) : duration;

  const parseFields = useCallback(() => {
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
  }, [f, weight, reps, durationDisplay, distance, unit, distUnit]);

  function parseRightFields(left2: ReturnType<typeof parseFields>) {
    let repsN = left2.reps;
    let durationSec = left2.durationSec;
    let distanceM = left2.distanceM;
    let weightKg = left2.weightKg;
    if (!weightLinked && f.weight && weight2.trim() !== "") {
      const d = Number.parseFloat(weight2);
      weightKg = Number.isNaN(d) ? null : unit === "lb" ? lbToKg(d) : d;
    }
    if (f.reps && reps2.trim() !== "") {
      const r = Number.parseInt(reps2, 10);
      repsN = Number.isNaN(r) ? null : r;
    }
    if (f.duration && rDuration.trim() !== "")
      durationSec = parseDuration(rDuration);
    if (f.distance && rDistance.trim() !== "") {
      const d = Number.parseFloat(rDistance);
      distanceM = Number.isNaN(d)
        ? null
        : distUnit === "km"
          ? kmToM(d)
          : miToM(d);
    }
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  function rir(min: string, max: string) {
    const lo = min.trim() === "" ? null : Number.parseInt(min, 10);
    const hi = max.trim() === "" ? null : Number.parseInt(max, 10);
    return { rirMin: lo, rirMax: hi };
  }

  function submitLive() {
    if (done.current) return;
    const v = parseFields();
    const anyPresent =
      (f.weight && v.weightKg != null) ||
      (f.reps && v.reps != null) ||
      (f.duration && v.durationSec != null) ||
      (f.distance && v.distanceM != null);
    if (!anyPresent) return;
    done.current = true;
    clearDraft(seId);
    if (timerRunning) onToggleTimer();
    const parsedRir = rir(rirMin, rirMax);
    onCommit(
      {
        weightKg: v.weightKg,
        reps: v.reps,
        setType,
        durationSec: v.durationSec,
        distanceM: v.distanceM,
        rir: null,
        rirMin: effort ? parsedRir.rirMin : null,
        rirMax: effort ? parsedRir.rirMax : null,
        rpe: effort && rpe.trim() !== "" ? Number.parseFloat(rpe) : null,
        note: null,
        metricValues: null,
        side: isUnilateral ? "left" : null,
        otherSide: isUnilateral
          ? {
              ...parseRightFields(v),
              ...rir(rirMin2, rirMax2),
              rpe: rpe2.trim() === "" ? null : Number.parseFloat(rpe2),
            }
          : null,
      },
      { exerciseType: type, nextSetType: nextSeedType },
    );
  }

  function submitEdit() {
    if (!left) return;
    const v = parseFields();
    const parsedRir = rir(rirMin, rirMax);
    const patch: SetPatch = {
      weightKg: f.weight ? v.weightKg : undefined,
      reps: f.reps ? v.reps : undefined,
      durationSec: f.duration ? v.durationSec : undefined,
      distanceM: f.distance ? v.distanceM : undefined,
      rir: null,
      rirMin: effort ? parsedRir.rirMin : undefined,
      rirMax: effort ? parsedRir.rirMax : undefined,
      rpe: effort
        ? rpe.trim() === ""
          ? null
          : Number.parseFloat(rpe)
        : undefined,
    };
    onSaveCommitted(left.id, patch);
    if (setType !== left.setType) onSaveType({ setType });
    if (isUnilateral && right) {
      const rf = parseRightFields(v);
      const parsedRir2 = rir(rirMin2, rirMax2);
      onSaveCommitted(right.id, {
        weightKg: f.weight ? rf.weightKg : undefined,
        reps: f.reps ? rf.reps : undefined,
        durationSec: f.duration ? rf.durationSec : undefined,
        distanceM: f.distance ? rf.distanceM : undefined,
        rir: null,
        rirMin: effort ? parsedRir2.rirMin : undefined,
        rirMax: effort ? parsedRir2.rirMax : undefined,
        rpe: effort
          ? rpe2.trim() === ""
            ? null
            : Number.parseFloat(rpe2)
          : undefined,
      });
    }
    onFocusLive();
  }

  function submit() {
    if (isEditing) submitEdit();
    else submitLive();
  }

  function resetToLastTime() {
    if (f.weight && ghost.weightKg != null)
      setWeight(String(toDisplayWeight(ghost.weightKg, unit)));
    if (f.reps && ghost.reps != null) setReps(String(ghost.reps));
    if (f.duration && ghost.durationSec != null)
      setDuration(formatMMSS(ghost.durationSec));
    if (f.distance && ghost.distanceM != null)
      setDistance(String(toDisplayDistance(ghost.distanceM, distUnit)));
    const other = ghost.otherSide;
    if (isUnilateral && other) {
      if (f.reps && other.reps != null) setReps2(String(other.reps));
      if (f.duration && other.durationSec != null)
        setRDuration(formatMMSS(other.durationSec));
      if (f.distance && other.distanceM != null)
        setRDistance(String(toDisplayDistance(other.distanceM, distUnit)));
    }
  }

  function bump(
    kind: FieldKey,
    delta: number,
    side: "left" | "right" = "left",
  ) {
    const setters: Record<FieldKey, (v: string) => void> = {
      weight: side === "left" ? setWeight : setWeight2,
      reps: side === "left" ? setReps : setReps2,
      duration: side === "left" ? setDuration : setRDuration,
      distance: side === "left" ? setDistance : setRDistance,
    };
    const current =
      kind === "weight"
        ? side === "left"
          ? weight
          : weight2 || weight
        : kind === "reps"
          ? side === "left"
            ? reps
            : reps2 || reps
          : kind === "duration"
            ? side === "left"
              ? duration
              : rDuration || duration
            : side === "left"
              ? distance
              : rDistance || distance;
    if (kind === "duration") {
      const sec = Math.max(0, (parseDuration(current) ?? 0) + delta);
      setters.duration(formatMMSS(sec));
      return;
    }
    const base = Number.parseFloat(current || "0") || 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    setters[kind](String(next));
  }

  // Comparison header + "beat" tint per row, against last time (ghost).
  function comparison(kind: FieldKey, currentText: string) {
    const ghostVal =
      kind === "weight"
        ? ghost.weightKg != null
          ? toDisplayWeight(ghost.weightKg, unit)
          : null
        : kind === "reps"
          ? (ghost.reps ?? null)
          : kind === "duration"
            ? (ghost.durationSec ?? null)
            : ghost.distanceM != null
              ? toDisplayDistance(ghost.distanceM, distUnit)
              : null;
    const cur =
      kind === "duration"
        ? parseDuration(currentText)
        : Number.parseFloat(currentText);
    const unitTxt =
      kind === "weight" ? unitLabel(unit) : kind === "distance" ? distUnit : "";
    return compareToLast(
      cur == null || Number.isNaN(cur) ? null : cur,
      ghostVal,
      unitTxt,
    );
  }

  const weightBeat = comparison("weight", weight).state === "up";
  const repsBeat = comparison("reps", reps).state === "up";

  // Delta line: prefer a genuine all-time PR (checked live against the
  // records snapshot), else a plain "beat last time" summary.
  const deltaLine = useMemo(() => {
    if (!prSnapshot) return null;
    const v = parseFields();
    const hits = checkSetForPR(prSnapshot.get(exerciseId), type, {
      setType,
      weightKg: v.weightKg,
      reps: v.reps,
      durationSec: v.durationSec,
      distanceM: v.distanceM,
      setNo: index,
      side: isUnilateral ? "left" : null,
    });
    if (hits.length) {
      const friendly: Partial<Record<PrType, string>> = {
        heaviest_weight: "heaviest set you've done here",
        best_e1rm: "best estimated 1RM here",
        best_set_volume: "biggest single set here",
        best_set_reps: "most reps you've done here",
      };
      return (
        friendly[hits[0].prType] ?? PR_TYPE_LABELS[hits[0].prType].toLowerCase()
      );
    }
    if (weightBeat || repsBeat) return "beat last time";
    return null;
  }, [
    parseFields,
    weightBeat,
    repsBeat,
    prSnapshot,
    exerciseId,
    type,
    setType,
    index,
    isUnilateral,
  ]);

  function fieldRow(key: FieldKey) {
    const value =
      key === "weight"
        ? weight
        : key === "reps"
          ? reps
          : key === "duration"
            ? durationDisplay
            : distance;
    const setValue =
      key === "weight"
        ? setWeight
        : key === "reps"
          ? setReps
          : key === "duration"
            ? setDuration
            : setDistance;
    const cmp = comparison(key, key === "duration" ? durationDisplay : value);
    const beat = cmp.state === "up";
    const unitTxt =
      key === "weight"
        ? weightLabel(type, unitLabel(unit))
        : key === "reps"
          ? "reps"
          : key === "distance"
            ? distUnit
            : "";
    const { neg, pos } = jumpsFor(key);
    const label = fieldLabel(key, type);
    const fieldTestId =
      key === "weight"
        ? "weight-field"
        : key === "reps"
          ? "reps-field"
          : `${key}-field`;
    const compareTestId =
      key === "weight"
        ? "weight-compare"
        : key === "reps"
          ? "reps-compare"
          : `${key}-compare`;
    const adjustPrefix =
      key === "weight"
        ? "weight-adjust"
        : key === "reps"
          ? "reps-adjust"
          : `${key}-adjust`;
    return (
      <div
        key={key}
        className={cn(
          "border p-2.5",
          beat ? "border-accent bg-accent-soft" : "border-border-strong bg-bg",
        )}
        data-beat={beat ? "true" : "false"}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs font-bold tracking-widest text-faint uppercase">
            {isUnilateral && key === "weight" ? `${label} · both sides` : label}
          </span>
          <span
            className={cn(
              "num text-xs font-bold",
              cmp.state === "up" && "text-accent",
              cmp.state === "down" && "text-warn",
              (cmp.state === "same" || cmp.state === "none") && "text-faint",
            )}
            data-testid={compareTestId}
          >
            {cmp.text}
          </span>
        </div>
        <div
          className={cn(
            "mt-1.5 mb-2 flex items-center justify-center gap-2 border border-border-strong border-b-[3px] border-b-accent bg-surface px-2.5 py-2",
            beat && "bg-bg",
          )}
        >
          <input
            inputMode={
              key === "duration"
                ? "text"
                : key === "reps"
                  ? "numeric"
                  : "decimal"
            }
            value={value}
            placeholder={seedPlaceholder(key)}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            onFocus={() => {
              // Rest auto-stops the moment the next set's input is touched
              // (R3 locked decision) — manual Stop is the other trigger.
              if (restStartedAt != null) onStopRest();
            }}
            readOnly={key === "duration" && timerRunning}
            className="num min-w-0 flex-1 bg-transparent text-center text-[44px] leading-none font-bold text-ink placeholder:text-3xl placeholder:text-faint focus:outline-none sm:text-[52px]"
            data-testid={fieldTestId}
          />
          {unitTxt && (
            <span className="shrink-0 text-sm font-bold text-faint">
              {unitTxt}
            </span>
          )}
          {key === "duration" ? (
            <IconButton
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (liveElapsed != null) setDuration(formatMMSS(liveElapsed));
                onToggleTimer();
              }}
              title={timerRunning ? "Stop timer" : "Start timer"}
              className={cn(
                timerRunning && "border-accent bg-accent text-accent-fg",
              )}
              data-testid="set-timer"
            >
              {timerRunning ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
            </IconButton>
          ) : (
            <span
              className="shrink-0 text-base text-border-strong"
              aria-hidden="true"
            >
              ⌨
            </span>
          )}
          {key === "weight" && barLoaded && (
            <IconButton
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onOpenPlates(
                  weight.trim() === "" ? null : Number.parseFloat(weight),
                )
              }
              title="Plate calculator"
              data-testid="set-plates"
            >
              <Calculator className="size-3.5" />
            </IconButton>
          )}
        </div>
        {key !== "duration" && (
          <div className="flex gap-1">
            {neg.map((d) => (
              <button
                key={d}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => bump(key, d)}
                className="num h-10 flex-1 border border-border-strong bg-surface text-sm font-bold text-soft transition-colors duration-100 hover:bg-surface-hover"
                data-testid={`${adjustPrefix}-${d}`}
              >
                {d}
              </button>
            ))}
            <span className="w-2 shrink-0" />
            {pos.map((d) => (
              <button
                key={d}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => bump(key, d)}
                className="num h-10 flex-1 border border-accent/45 bg-accent-soft text-sm font-bold text-accent transition-colors duration-100 hover:bg-accent-soft/80"
                data-testid={`${adjustPrefix}-${d}`}
              >
                +{d}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const lastText = fieldsFor(type)
    .map((k) => fieldText(k, ghost, unit, distUnit))
    .filter((t) => t !== "—")
    .join(" × ");

  const primaryFields = fields.filter((k) => k !== "reps" || !isUnilateral);

  const currentReps = Number.parseInt(reps, 10);
  const restLabel =
    left?.restSec != null ? formatDurationSeconds(left.restSec * 1000) : null;

  return (
    <div className="flex flex-col gap-2.5 px-4 pt-2.5 pb-4">
      <div className="flex items-center gap-2">
        <span
          className="text-xl font-extrabold tracking-tight"
          data-testid="set-number"
        >
          Set {index + 1}
        </span>
        {setType === "warmup" && (
          <span className="border border-warn/45 bg-amber-soft px-1.5 py-0.5 text-2xs font-extrabold tracking-widest text-warn uppercase">
            Warm-up
          </span>
        )}
        {isUnilateral && (
          <span className="border border-accent/45 bg-accent-soft px-1.5 py-0.5 text-2xs font-extrabold tracking-widest text-accent uppercase">
            Per side
          </span>
        )}
        {isEditing && restLabel && (
          <span
            className="num text-2xs text-faint"
            data-testid={`set-rest-stamp-${index}`}
          >
            rested {restLabel}
          </span>
        )}
        <span className="ml-auto">
          <SetActionsMenu
            isWarmup={setType === "warmup"}
            onToggleWarmup={() => {
              const next = setType === "warmup" ? "normal" : "warmup";
              setSetType(next);
              if (isEditing) onSaveType({ setType: next });
            }}
            isUnilateral={isUnilateral}
            onToggleUnilateral={() => {
              const next = !isUnilateral;
              if (isEditing) {
                onSetLaterality(next);
              } else {
                setIsUnilateral(next);
                onLateralityOverrideChange(next ? "unilateral" : "bilateral");
              }
            }}
            onDelete={isEditing ? onDeleteCommitted : null}
          />
        </span>
      </div>

      {hasGhost && !isEditing && (
        <div
          className="flex items-center gap-2.5 border border-border-strong bg-surface px-2.5 py-2"
          data-testid="last-time-row"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={resetToLastTime}
            title="Reset to last time's values"
            className="flex size-7 shrink-0 items-center justify-center border border-border bg-bg text-sm text-soft"
            data-testid="last-time-reset"
          >
            ↺
          </button>
          <span className="min-w-0 flex-1">
            <span className="block text-2xs font-extrabold tracking-widest text-faint uppercase">
              Last time
            </span>
            <span className="num block text-base font-bold">
              {lastText || "—"}
            </span>
          </span>
          <span className="shrink-0 border border-border bg-bg px-2 py-1 text-center text-[9px] leading-tight font-extrabold text-faint">
            ALREADY
            <br />
            LOADED
          </span>
        </div>
      )}

      {primaryFields.map((k) =>
        k === "weight" && isUnilateral ? (
          <div key="weight" className="flex flex-col gap-1">
            {fieldRow("weight")}
            <button
              type="button"
              onClick={() => setWeightLinked((v) => !v)}
              className="self-start border border-border bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-faint"
              data-testid="weight-link-toggle"
            >
              {weightLinked
                ? "🔗 linked · tap to set sides separately"
                : "unlinked · tap to link"}
            </button>
            {!weightLinked && (
              <div className="border border-border-strong bg-bg p-2">
                <div className="flex items-center justify-center border border-border-strong bg-surface px-2 py-1">
                  <input
                    inputMode="decimal"
                    value={weight2}
                    placeholder={weight}
                    onChange={(e) => setWeight2(e.target.value)}
                    className="num w-full min-w-0 bg-transparent text-center text-[28px] leading-none font-bold text-ink focus:outline-none"
                    data-testid="weight-field-right"
                  />
                </div>
                <div className="mt-1.5 flex gap-1">
                  {WEIGHT_NEG.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => bump("weight", d, "right")}
                      className="num h-8 flex-1 border border-border-strong bg-surface text-xs font-bold text-soft"
                      data-testid={`weight-adjust-${d}-right`}
                    >
                      {d}
                    </button>
                  ))}
                  {WEIGHT_POS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => bump("weight", d, "right")}
                      className="num h-8 flex-1 border border-accent/45 bg-accent-soft text-xs font-bold text-accent"
                      data-testid={`weight-adjust-${d}-right`}
                    >
                      +{d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          fieldRow(k)
        ),
      )}

      {isUnilateral && f.reps && (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-center text-2xs font-extrabold tracking-widest text-accent uppercase">
              ᴸ Left
            </span>
            <span className="text-center text-2xs font-extrabold tracking-widest text-accent uppercase">
              ᴿ Right
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["left", "right"] as const).map((side) => (
              <div
                key={side}
                className="border border-border-strong bg-bg p-1.5"
              >
                <div className="flex items-center justify-center border border-border-strong bg-surface px-2 py-1">
                  <input
                    inputMode="numeric"
                    value={side === "left" ? reps : reps2}
                    placeholder={side === "right" ? reps || "reps" : undefined}
                    onChange={(e) =>
                      side === "left"
                        ? setReps(e.target.value)
                        : setReps2(e.target.value)
                    }
                    onFocus={() => {
                      if (restStartedAt != null) onStopRest();
                    }}
                    className="num w-full min-w-0 bg-transparent text-center text-[28px] leading-none font-bold text-ink focus:outline-none"
                    data-testid={`reps-field-${side}`}
                  />
                </div>
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bump("reps", -1, side)}
                    className="num h-8 flex-1 border border-border-strong bg-surface text-xs font-bold text-soft"
                    data-testid={`reps-adjust--1-${side}`}
                  >
                    −1
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => bump("reps", 1, side)}
                    className="num h-8 flex-1 border border-accent/45 bg-accent-soft text-xs font-bold text-accent"
                    data-testid={`reps-adjust-1-${side}`}
                  >
                    +1
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deltaLine && (
        <p
          className="num text-2xs font-semibold text-accent"
          data-testid="set-delta"
        >
          ▲ {deltaLine}
        </p>
      )}

      {f.weight && (
        <div className="border border-border bg-surface px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="num text-xs text-soft" data-testid="stats-line">
              {(() => {
                if (!prSnapshot || Number.isNaN(currentReps)) return "Best —";
                const rec = prSnapshot.get(exerciseId);
                const best = rec?.setRecords.get(currentReps);
                return best
                  ? `Best ${toDisplayWeight(best.weightKg, unit)} × ${currentReps}`
                  : "Best —";
              })()}
            </span>
            <button
              type="button"
              onClick={() => {
                setGrowthOpen((v) => {
                  sessionStorage.setItem("frog.growth-open", v ? "0" : "1");
                  return !v;
                });
              }}
              className="border border-accent/45 bg-accent-soft px-2 py-1 text-2xs font-extrabold tracking-widest text-accent uppercase"
              data-testid="stats-growth-toggle"
            >
              Growth {growthOpen ? "▴" : "▾"}
            </button>
          </div>
          {growthOpen && (
            <div
              className="mt-2 border-t border-border pt-2"
              data-testid="stats-growth-chart"
            >
              <GrowthBars
                history={history}
                exerciseId={exerciseId}
                unit={unit}
                liveTopKg={liveTopKg}
              />
            </div>
          )}
        </div>
      )}

      {effort && !isUnilateral && (
        <div className="flex gap-2">
          <div className="flex-1">
            <RirSegmented
              min={rirMin}
              max={rirMax}
              onChange={(v) => {
                setRirMin(v.min);
                setRirMax(v.max);
              }}
            />
          </div>
          <div className="w-28 shrink-0">
            <RpePicker value={rpe} onChange={setRpe} />
          </div>
        </div>
      )}
      {effort && isUnilateral && (
        <div className="grid grid-cols-2 gap-2">
          <RirSegmented
            min={rirMin}
            max={rirMax}
            onChange={(v) => {
              setRirMin(v.min);
              setRirMax(v.max);
            }}
            side="left"
          />
          <RirSegmented
            min={rirMin2}
            max={rirMax2}
            onChange={(v) => {
              setRirMin2(v.min);
              setRirMax2(v.max);
            }}
            side="right"
          />
          <RpePicker value={rpe} onChange={setRpe} side="left" />
          <RpePicker value={rpe2} onChange={setRpe2} side="right" />
        </div>
      )}

      {/* 5. Action zone. */}
      <div className="mt-1">
        {restStartedAt != null ? (
          <RestStopwatch
            startedAt={restStartedAt}
            setNumber={index + 1}
            onStop={onStopRest}
          />
        ) : (
          <Button
            size="lg"
            className="h-13 w-full text-base font-bold"
            onClick={submit}
            data-testid="log-set"
          >
            {isEditing
              ? "Save"
              : isUnilateral
                ? `Log set ${index + 1} · ᴸ + ᴿ`
                : `Log set ${index + 1}`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Session duration / pause control (unchanged) ────────────────────────────

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
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (endedAt != null || paused) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
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
        data-testid="session-clock"
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
