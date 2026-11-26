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
  creditsFor,
  type Exercise,
  type ExercisePatch,
  type ExerciseRecords,
  type ExerciseType,
  formatPreviousSides,
  formatWeight,
  fractionalHardSets,
  type GhostSet,
  ghostFor,
  groupByPrimaryMuscle,
  groupSetsBySetNo,
  isBarLoaded,
  isConfidentMatch,
  isWeightRequired,
  kgToLb,
  kmToM,
  type Laterality,
  type LoggedSet,
  lbToKg,
  type Machine,
  type MatchCandidate,
  type Metric,
  type MuscleHardSets,
  matchExerciseName,
  miToM,
  muscleLabel,
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
  rirMidpoint,
  type Session,
  type SetType,
  sanitizeNumeric,
  sessionDirectCheck,
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
import {
  Armchair,
  Calculator,
  CaretDown,
  CaretLeft,
  CaretRight,
  Chair,
  Check,
  Clock,
  ClockCounterClockwise,
  DotsThree,
  Flame,
  HandGrabbing,
  LinkSimple,
  MagnifyingGlass,
  Medal,
  Microphone,
  Notebook,
  Notepad,
  Pause,
  Play,
  Plus,
  PushPin,
  Rectangle,
  SlidersHorizontal,
  Square,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ExerciseRibbon } from "@/components/anatomy-ui";
import { ConditionsChip } from "@/components/conditions";
import {
  DeltaChip,
  EvidenceSheet,
  SaveDot,
  type SaveState,
} from "@/components/data";
import { ExerciseEditor } from "@/components/exercise-editor";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { InfoTip } from "@/components/lesson";
import {
  applySetupSetting,
  fieldStep,
  logLabel,
  resumeBlockIndex,
  stepValue,
} from "@/components/session/entry";
import { ScrubSurface, Stepper } from "@/components/session/entry-tile";
import {
  afterLog,
  hasOpenSet,
  offeredSets,
  plannedSetCount,
} from "@/components/session/log-nav";
import {
  MachineChip,
  MachinePickerDialog,
} from "@/components/session/machine-chip";
import { PlateSheet } from "@/components/session/plate-sheet";
import { PrBanner, type PrBannerData } from "@/components/session/pr-banner";
import {
  driftNudge,
  formatRange,
  type PlanTarget,
  planFromSeed,
  planFromSnapshot,
  rangeState,
  reportE1rm,
  rirHint,
  setTarget,
} from "@/components/session/prescription";
import {
  RestStopwatch,
  SessionLengthReveal,
  useHoldReveal,
} from "@/components/session/rest-stopwatch";
import { Ruler } from "@/components/session/ruler";
import { SideCell } from "@/components/session/side-cell";
import {
  FinishPhotoStrip,
  type PendingPhoto,
} from "@/components/session-photos";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChipItem } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Textarea } from "@/components/ui/input";
import { SideTag } from "@/components/ui/side-tag";
import { formatDurationSeconds, formatMMSS, parseDuration } from "@/lib/format";
import {
  AnimatePresence,
  COLLAPSED,
  EXPANDED,
  FADE_OUT,
  m as motionEl,
  useMotionReady,
} from "@/lib/motion";
import { usePendingExercises } from "@/lib/pending-exercises";
import { useUpdateUserPrefs, useUserPrefs } from "@/lib/profile-queries";
import {
  copyExerciseOpts,
  useCreateExercise,
  useDeleteExercise,
  useExercises,
  useGhost,
  useLastNote,
  useLastSets,
  useMachines,
  useMetrics,
  useSession,
  useSessionExercises,
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
import { sessionConditionsLine } from "@/lib/share/conditions";
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
  /** §9.1 target snapshot written at session start; null on ad-hoc blocks. */
  plan: PlanTarget | null;
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
  /** Planned RIR for this set (routine target); stored and hinted, never
   * prefilled. */
  rirMin?: number | null;
  rirMax?: number | null;
};

const SWIPE_IGNORE =
  'input, textarea, select, [contenteditable="true"], [role="slider"], [data-ruler], [data-no-swipe], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** True when a touch starting on `target` belongs to something other than the
 * exercise swipe: a control with its own drag/typing, a sheet or menu
 * (including portalled ones, which sit outside `root` in the DOM), or a
 * horizontally scrollable strip between the target and the panel. */
function swipeIgnored(target: EventTarget, root: Element): boolean {
  if (!(target instanceof Element)) return true;
  if (!root.contains(target)) return true;
  if (target.closest(SWIPE_IGNORE)) return true;
  for (
    let el: Element | null = target;
    el && el !== root;
    el = el.parentElement
  ) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}

function totalVolumeKg(blocks: BlockState[], includeWarmups: boolean): number {
  return blocks.reduce(
    (sum, b) =>
      sum +
      b.committed.reduce(
        (s, x) =>
          !includeWarmups && x.setType === "warmup"
            ? s
            : s + (x.weightKg ?? 0) * (x.reps ?? 0),
        0,
      ),
    0,
  );
}

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
      // The mockup's LAST TIME row spells out the unit ("85 kg × 4") since
      // it's the one number here that isn't self-evidently a weight.
      return v.weightKg != null
        ? `${toDisplayWeight(v.weightKg, unit)} ${unitLabel(unit)}`
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

// The screen's quiet square controls (menus, note, clock): 44px, one resting
// fill that reads on the page and on the entry panel in both modes.
// Last exercise shown per session on this device (resume lands back on it).
const ACTIVE_KEY = "frog.session.active.";

const CHROME_BTN = "size-11 bg-secondary text-ink hover:bg-active md:size-11";

const RIR_SEGMENTS = [0, 1, 2, 3, 4] as const;

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
  hint,
  bare,
}: {
  min: string;
  max: string;
  onChange: (v: { min: string; max: string }) => void;
  side?: "left" | "right";
  /** No "RIR" caption: the entry panel's column already labels it. */
  bare?: boolean;
  /** Planned segment, outlined until tapped; never selected by itself. */
  hint?: number | null;
}) {
  const selected = rirSegmentOf(min, max);
  return (
    <div className="flex flex-col gap-1">
      {!bare && (
        <span className="text-2xs font-medium tracking-widest text-soft uppercase">
          RIR{side ? ` · ${side}` : ""}
        </span>
      )}
      <div className="flex gap-1">
        {RIR_SEGMENTS.map((v) => {
          const on = selected === v;
          const hinted = !on && hint === v;
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
                "num h-11 flex-1 rounded-sm text-sm font-semibold transition-colors duration-100",
                on
                  ? "bg-action text-on-action"
                  : "bg-secondary text-ink hover:bg-active",
                hinted && "ring-2 ring-accent-ink ring-inset",
              )}
              data-hint={hinted ? "true" : undefined}
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

/** Scrolls the entry panel so a focused value input sits between the panel's
 * sticky Now row and its pinned ruler/Log footer (both overlay the scroll
 * area, so the browser's own scroll-into-view leaves the field under them). */
function revealEntryField(el: Element | null) {
  if (!(el instanceof HTMLInputElement)) return;
  const panel = el.closest<HTMLElement>('[data-testid="entry-panel"]');
  if (!panel) return;
  const top =
    panel.querySelector('[data-testid="now-tab"]')?.getBoundingClientRect()
      .bottom ?? panel.getBoundingClientRect().top;
  const bottom =
    panel.querySelector("[data-entry-footer]")?.getBoundingClientRect().top ??
    panel.getBoundingClientRect().bottom;
  // Reveal the field's whole row (value, label, Split button), not just the
  // input box: on a 404px iOS keyboard viewport the footer used to cover the
  // weight label and half the Split button (10-after-rebased.png).
  const row =
    el.closest('[data-testid="entry-weight-line"]') ??
    el.closest('[data-testid^="entry-col"]') ??
    el;
  const r = row.getBoundingClientRect();
  if (r.bottom > bottom) panel.scrollTop += r.bottom - bottom;
  else if (r.top < top) panel.scrollTop -= top - r.top;
}

/** The visible height while the iOS keyboard is up. `dvh` and the layout
 * viewport ignore the keyboard and its accessory bar, so a column sized to
 * them left the Log button and the ruler underneath (boss r2 note 10; on the
 * iPhone 17 simulator the per-side Log button sat at y 458 of a 404px visible
 * area). Null where there is no visualViewport (falls back to 100dvh). */
function useVisualViewportHeight(): number | null {
  const [h, setH] = useState<number | null>(() =>
    typeof window !== "undefined" && window.visualViewport
      ? Math.round(window.visualViewport.height)
      : null,
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      setH(Math.round(vv.height));
      // The column just shrank or grew: bring the field being typed into
      // back between the sticky Now row and the pinned ruler/Log footer.
      requestAnimationFrame(() => revealEntryField(document.activeElement));
      // iOS pans the page to reveal the focused field; once the column fits
      // the visible area there is nothing to pan, so pin it back to the top.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return h;
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
  const { data: allMetrics = [] } = useMetrics();
  const conditionsSummary = sessionConditionsLine(
    session?.conditionValues ?? {},
    allMetrics.filter((m) => m.scope === "session"),
  );
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
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [activeSeId, setActiveSeId] = useState<string | null>(null);
  const viewportHeight = useVisualViewportHeight();
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
    () =>
      history
        ? computeRecords(history, {
            // Warm-ups are excluded unless the user saved otherwise (R17b).
            includeWarmups: userPrefs?.includeWarmupsInStats ?? false,
          }).byExercise
        : null,
    [history, userPrefs?.includeWarmupsInStats],
  );

  const [seedOverride, setSeedOverride] = useState<Record<string, SeedSet[]>>(
    {},
  );
  const [blockNonce, setBlockNonce] = useState<Record<string, number>>({});
  // Sets the user added with "Add a set", per exercise. Log never adds one:
  // an exercise offers its planned sets (at least one) plus these, nothing
  // else (log-nav.ts).
  const [addedSets, setAddedSets] = useState<Record<string, number>>({});
  // `addedSets` is device-local and starts at 0 after a reload, while the
  // logged sets come back from the server: with 3 logged on a 1-set plan,
  // "Add a set" had to be pressed 3 times before anything opened. Always open
  // exactly one set past what is already logged.
  const addSetTo = useCallback(
    (seId: string, logged: number, planned: number) =>
      setAddedSets((prev) => ({
        ...prev,
        [seId]: Math.max((prev[seId] ?? 0) + 1, logged + 1 - planned),
      })),
    [],
  );

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

  const voiceCtx = useRef({ blocks, unit });
  useEffect(() => {
    voiceCtx.current = { blocks, unit };
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

  function voiceWeightKg(parsed: ParsedSetUtterance): number | null {
    if (parsed.weightDisplay == null) return null;
    const { unit: sessionUnit } = voiceCtx.current;
    // Settings' unit is the only unit (boss r2 note 7).
    const effectiveUnit = parsed.unitExplicit ? parsed.unit : sessionUnit;
    return effectiveUnit === "lb"
      ? lbToKg(parsed.weightDisplay)
      : parsed.weightDisplay;
  }

  function applyVoiceToBlock(seId: string, parsed: ParsedSetUtterance) {
    const block = (voiceCtx.current.blocks ?? []).find((b) => b.seId === seId);
    const exercise = exercises.find((e) => e.id === block?.exerciseId);
    const type = (exercise?.exerciseType as ExerciseType) ?? "weight_reps";
    const f = TYPE_FIELDS[type];
    const weightKg = f.weight ? voiceWeightKg(parsed) : null;
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
        plan: planFromSnapshot(se),
        committed: se.sets,
      })),
    );
  }, [restored, blocks, sessionLoaded, session?.routineId, routineLoading]);

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

  // F15: per-set save state for the SaveDot (queued -> saved | failed).
  function saveStateOf(setId: string): SaveState {
    const q = queuedSets[setId];
    return q ? (q.failed ? "failed" : "queued") : "saved";
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
        plan: null,
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
            plannedRirMin: set.plannedRirMin ?? null,
            plannedRirMax: set.plannedRirMax ?? null,
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
            rir: row.rir,
            rirMin: row.rirMin,
            rirMax: row.rirMax,
            rpe: row.rpe,
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

    // Where to go next: more planned sets here, else the next exercise.
    if (block && blocks) {
      const idx = blocks.findIndex((b) => b.seId === seId);
      const nextBlock = blocks[idx + 1];
      const where = afterLog({
        committedAfter: countSets(block.committed) + 1,
        planned: plannedSetCount((seedOverride[seId] ?? seedFor(block)).length),
        added: addedSets[seId] ?? 0,
        hasNextExercise: nextBlock != null,
      });
      if (where === "next-exercise" && nextBlock) setActiveSeId(nextBlock.seId);
    }
  }

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
            rir: rightRow.rir,
            rirMin: rightRow.rirMin,
            rirMax: rightRow.rirMax,
            rpe: rightRow.rpe,
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
            rirMin: s.targetRirMin,
            rirMax: s.targetRirMax,
          }));
      }
      return copySeed?.[block.seId] ?? [];
    },
    [routineByReId, copySeed],
  );

  // Once blocks land, open on the exercise the user is actually on: the one
  // last shown on this device for this session, else the one with unfinished
  // sets by set state (resumeBlockIndex) — not exercise 1. If the active
  // exercise gets removed, fall back to whatever's now first.
  const resumed = useRef(false);
  useEffect(() => {
    if (!blocks || blocks.length === 0) return;
    if (activeSeId && blocks.some((b) => b.seId === activeSeId)) return;
    if (!resumed.current) {
      resumed.current = true;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(ACTIVE_KEY + sessionId);
      } catch {
        /* storage unavailable: fall back to set state */
      }
      const i = resumeBlockIndex(
        blocks.map((b) => ({
          seId: b.seId,
          committed: countSets(b.committed),
          planned: plannedSetCount((seedOverride[b.seId] ?? seedFor(b)).length),
        })),
        saved,
      );
      setActiveSeId(blocks[Math.max(0, i)].seId);
      return;
    }
    setActiveSeId(blocks[0].seId);
  }, [blocks, activeSeId, sessionId, seedOverride, seedFor]);
  // Remember which exercise is open so reopening the app lands back on it.
  useEffect(() => {
    if (!activeSeId || !sessionId) return;
    try {
      localStorage.setItem(ACTIVE_KEY + sessionId, activeSeId);
    } catch {
      /* storage unavailable: resume falls back to set state */
    }
  }, [activeSeId, sessionId]);

  // How today's workout differs from its routine, one plain line per change
  // (boss r2 note 8): asked once at Finish; yes writes the structure back,
  // no keeps it for this session only.
  const templateChanges = useMemo((): string[] => {
    if (!session?.routineId || !routineDetail || !blocks) return [];
    const out: string[] = [];
    for (const b of blocks)
      if (!b.routineExerciseId) out.push(`Added ${b.name}`);
    const present = new Set(
      blocks.map((b) => b.routineExerciseId).filter(Boolean),
    );
    for (const e of routineDetail.exercises)
      if (!present.has(e.id)) out.push(`Removed ${e.exerciseName}`);
    const keptOrder = blocks
      .map((b) => b.routineExerciseId)
      .filter((id): id is string => id != null && routineByReId.has(id));
    const planned = [...routineDetail.exercises]
      .sort((x, y) => x.orderIndex - y.orderIndex)
      .map((e) => e.id)
      .filter((id) => keptOrder.includes(id));
    if (keptOrder.some((id, i) => id !== planned[i]))
      out.push("Changed the exercise order");
    for (const b of blocks) {
      if (!b.routineExerciseId) continue;
      const t = routineByReId.get(b.routineExerciseId);
      if (!t) continue;
      const groups = groupSetsBySetNo(b.committed);
      if (groups.length > t.sets.length)
        out.push(
          `${b.name}: ${groups.length} sets instead of ${t.sets.length}`,
        );
      const sideSwitch = groups.some((rows, i) => {
        const was = t.sets[i]?.laterality === "unilateral";
        const now = rows.length === 2;
        return t.sets[i] != null && was !== now;
      });
      if (sideSwitch) {
        const now = groups.some((rows) => rows.length === 2);
        out.push(`${b.name}: ${now ? "per side" : "both sides"}`);
      }
    }
    return out;
  }, [session?.routineId, routineDetail, blocks, routineByReId]);
  const structuralChange = templateChanges.length > 0;

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
  const volume = Math.round(
    (unit === "lb" ? kgToLb : (kg: number) => kg)(
      totalVolumeKg(blocks, userPrefs?.includeWarmupsInStats ?? false),
    ),
  );
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const live = fractionalHardSets(
    blocks.map((b) => ({
      targets: exById.get(b.exerciseId)?.muscleTargets,
      sets: b.committed,
    })),
  );
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
          <div className="rounded-md pointer-events-auto flex max-w-md items-center gap-2 bg-raised px-3 py-2 shadow-lg">
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

      {/* 1. Top bar — the one clock, voice, and a ⋯ menu (Finish lives here). */}
      <header className="sticky top-0 z-10 bg-bg">
        <div className="mx-auto flex h-[clamp(52px,6.6dvh,56px)] max-w-2xl items-center justify-between gap-2 px-4">
          <h1 className="sr-only">{session?.title ?? "Session"}</h1>
          {rest && blocks.some((b) => b.seId === rest.seId) ? (
            <RestStopwatch
              compact
              startedAt={rest.state.startedAt}
              setNumber={countSets(
                blocks.find((b) => b.seId === rest.seId)?.committed ?? [],
              )}
              onStop={dismissRest}
              sessionText={() =>
                session
                  ? clockText(
                      (session.endedAt ?? Date.now()) -
                        session.startedAt -
                        currentPausedMs(),
                    )
                  : "—"
              }
            />
          ) : session ? (
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
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            {speechSupported && (
              <span className="relative flex items-center">
                <Button
                  variant={listening ? "primary" : "outline"}
                  size="icon-lg"
                  className="size-11"
                  onClick={listening ? stopListening : startListening}
                  title={listening ? "Stop listening" : "Log a set by voice"}
                  aria-pressed={listening}
                  data-testid="voice-log-mic"
                >
                  <Microphone className="size-5" />
                </Button>
                <span
                  role="status"
                  className={cn(
                    "absolute top-full right-0 z-20 mt-1 whitespace-nowrap text-2xs text-soft",
                    micMessage && "floating px-2 py-1",
                  )}
                >
                  {micMessage}
                </span>
              </span>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton
                  title="Session menu"
                  className={CHROME_BTN}
                  data-testid="session-menu"
                >
                  <DotsThree weight="bold" className="size-6" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {activeBlock && (
                  <DropdownMenuItem
                    className="min-h-11"
                    onSelect={() =>
                      navigate(`/exercises/${activeBlock.exerciseId}`)
                    }
                    data-testid="session-menu-history"
                  >
                    <ClockCounterClockwise className="size-4" />
                    History
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => setPicking(true)}
                  data-testid="open-exercise-picker"
                >
                  <Plus className="size-4" />
                  Add exercise
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() => setConditionsOpen(true)}
                  data-testid="conditions-chip"
                >
                  <Notebook className="size-4" />
                  {conditionsSummary ?? "Log conditions"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  danger
                  className="min-h-11"
                  onSelect={() => setFinishOpen(true)}
                  data-testid="session-finish"
                >
                  <Square className="size-4" />
                  Finish workout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div
        className="mx-auto flex h-[calc(var(--session-vvh,100dvh)-clamp(52px,6.6dvh,56px))] max-w-2xl flex-col overflow-hidden"
        style={
          viewportHeight != null
            ? ({ "--session-vvh": `${viewportHeight}px` } as CSSProperties)
            : undefined
        }
        data-testid="session-column"
        // Keyboard-short visible area (iOS keeps media queries on the full
        // layout height, so a max-height query never sees the keyboard).
        data-short={
          viewportHeight != null && viewportHeight < 450 ? "true" : undefined
        }
      >
        {activeBlock ? (
          <ExerciseSpotlight
            key={activeBlock.seId}
            block={activeBlock}
            sessionMuscles={live.byMuscle}
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
            addedSets={addedSets[activeBlock.seId] ?? 0}
            onAddSet={() =>
              addSetTo(
                activeBlock.seId,
                countSets(activeBlock.committed),
                plannedSetCount(
                  (seedOverride[activeBlock.seId] ?? seedFor(activeBlock))
                    .length,
                ),
              )
            }
            prevName={blocks[activeIdx - 1]?.name ?? null}
            nextName={blocks[activeIdx + 1]?.name ?? null}
            prSetIds={prSetIds}
            prSnapshot={prSnapshot}
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
            saveStateOf={saveStateOf}
            onRetrySets={retryFailedSets}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="text-center text-sm text-soft">No exercises yet.</p>
          </div>
        )}
      </div>

      <ConditionsChip
        sessionId={sessionId}
        open={conditionsOpen}
        onOpenChange={setConditionsOpen}
        hideTrigger
      />
      <ExerciseSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        blocks={blocks}
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
          templateChanges={templateChanges}
          failedSetCount={failedSetCount}
          unsavedSetCount={Object.keys(queuedSets).length}
          onRetryFailed={retryFailedSets}
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
  templateChanges,
  failedSetCount,
  unsavedSetCount,
  onRetryFailed,
  onFinish,
  onDiscard,
}: {
  /** F15: Save is blocked while any set is unsaved. */
  failedSetCount: number;
  unsavedSetCount: number;
  onRetryFailed: () => void;
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
  templateChanges: string[];
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
  // The overlay stays mounted, so re-stamp the end time every time it opens
  // (a frozen mount-time stamp understated the duration).
  const [endAt, setEndAt] = useState(() => Date.now());
  useEffect(() => {
    if (open) setEndAt(Date.now());
  }, [open]);
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
          <div className="flex items-center justify-between pb-3">
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
              // iOS gives date inputs an intrinsic min width wider than the
              // sheet (iOS sim report issue 6); let it shrink to the column.
              className="num w-full max-w-full min-w-0 appearance-none"
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
            <Textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="How did it go? PRs, aches, focus…"
              data-testid="finish-notes"
              className="w-full resize-y rounded-sm border border-field bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-focus"
            />
          </label>

          <FinishPhotoStrip photos={photos} onChange={setPhotos} />

          {isRoutine && (
            <label className="flex items-start gap-2 rounded-sm bg-surface-2 p-2">
              <input
                type="checkbox"
                checked={updateValues}
                onChange={(e) => setUpdateValues(e.target.checked)}
                className="mt-1 size-4 accent-(--color-accent-mark)"
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
            <div className="rounded-sm bg-surface-2 p-2">
              <p className="text-xs font-medium text-ink">
                Save these changes to the routine?
              </p>
              <ul
                className="mt-1 list-disc pl-4 text-xs text-soft"
                data-testid="finish-template-changes"
              >
                {templateChanges.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button
                  variant={updateStructure ? "primary" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUpdateStructure(true)}
                  data-testid="finish-update-structure"
                >
                  Yes, update routine
                </Button>
                <Button
                  variant={!updateStructure ? "primary" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUpdateStructure(false)}
                  data-testid="finish-keep-original"
                >
                  No, just today
                </Button>
              </div>
            </div>
          )}

          {failedSetCount > 0 && (
            <div
              className="rounded-sm flex items-center justify-between gap-2 bg-danger-soft px-3 py-2"
              data-testid="finish-unsaved"
            >
              <span className="text-xs text-danger">
                {failedSetCount} set{failedSetCount === 1 ? "" : "s"} not saved:
                retry
              </span>
              <Button variant="outline" size="sm" onClick={onRetryFailed}>
                Retry
              </Button>
            </div>
          )}
          {unsavedSetCount > failedSetCount && (
            <p className="text-xs text-soft" data-testid="finish-saving">
              Saving {unsavedSetCount - failedSetCount} set
              {unsavedSetCount - failedSetCount === 1 ? "" : "s"}…
            </p>
          )}

          <div className="flex items-center justify-between pt-3">
            {confirmDiscard ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void onDiscard()}
                data-testid="finish-discard-confirm"
              >
                <Trash className="size-3.5" />
                Confirm discard
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDiscard(true)}
                data-testid="finish-discard"
              >
                <Trash className="size-3.5" />
                Discard
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={saving || unsavedSetCount > 0}
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
                  "h-11 shrink-0 px-3 text-2xs transition-colors duration-150 md:h-8",
                  yoursOnly
                    ? "bg-accent-soft text-accent-ink"
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
            <div className="rounded-md overflow-hidden bg-surface">
              {groups.map((group) => (
                <section key={group.key}>
                  <p className="bg-surface-2 px-4 py-2 text-2xs font-medium tracking-widest text-faint uppercase">
                    {group.label}
                  </p>
                  <ul className="[&>*+*]:mt-1">
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
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-faint" />
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
            <ul className="rounded-md [&>*+*]:mt-1 overflow-hidden bg-surface">
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
            <span className="mt-1 block text-2xs text-faint">Saving…</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          title="Last session"
          aria-expanded={showHistory}
          className="flex shrink-0 items-center gap-1 px-3 text-faint transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover hover:text-ink"
          data-testid={`pick-history-toggle-${exercise.name}`}
        >
          <CaretDown
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
      className="rounded-sm bg-surface-2 px-4 py-2 text-2xs text-soft"
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
  activeSeId,
  onJump,
  onAddExercise,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: BlockState[];
  activeSeId: string | null;
  onJump: (seId: string) => void;
  onAddExercise: () => void;
  onFinish: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Switch exercise" className="md:max-w-md">
        <ul className="flex flex-col" data-testid="exercise-sheet">
          {blocks.map((b, i) => {
            const done = countSets(b.committed);
            return (
              <li
                key={b.seId}
                className={cn(
                  "",
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
                      done > 0 ? "text-accent-ink" : "text-faint",
                    )}
                    data-testid={`switcher-progress-${b.name}`}
                  >
                    {done === 0
                      ? "Empty"
                      : `${done} ${done === 1 ? "set" : "sets"}`}
                  </span>
                  <CaretRight className="size-3.5 shrink-0 text-faint" />
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

type MarkState = "done" | "warmup" | "current";
type Mark = {
  kind: MarkState;
  paired: boolean;
  pr: boolean;
  /** `side` is which half of a per-side pair row was tapped. */
  onTap?: (side: "left" | "right" | null) => void;
};

function rirLabel(r: {
  rirMin?: number | null;
  rirMax?: number | null;
  rir?: number | null;
}): string {
  const lo = r.rirMin ?? r.rir ?? null;
  const hi = r.rirMax ?? r.rir ?? null;
  if (lo == null && hi == null) return "";
  const a = lo ?? (hi as number);
  const b = hi ?? a;
  return a === b ? `RIR ${a}` : `RIR ${a}-${b}`;
}

// Set list: one 48px card per logged set plus the current "Now" row; tap a row
// to open that set in the entry panel. Planned sets are never drawn. Same
// set-mark-* test hooks as the old marks band. While logging live, the Now row
// is not drawn in the list: `variant="tab"` renders it as the entry panel's
// own top band (Spotlight's `tab` slot), so the row and the panel are one
// surface, and the list (bottom-anchored in the scroll area) sits directly on
// it (item 6, docs/ux-audit/2026-11-25/fix-6-8).
function SetRows({
  marks,
  rows,
  fmtWeight,
  selectedIndex,
  variant = "list",
}: {
  marks: Mark[];
  /** The set the entry panel below is showing (live or a tapped past set). */
  selectedIndex: number;
  /** "tab": only the live Now row, as the entry panel's top band. */
  variant?: "list" | "tab";
  rows: {
    text: string;
    rirText: string;
    hasNote: boolean;
    /** A per-side pair, both sides labelled (PreviousSets). */
    pair?: GhostSet | null;
  }[];
  fmtWeight: (kg: number) => string;
}) {
  const motionReady = useMotionReady();
  // The live Now row (selected, not yet logged) belongs to the panel.
  const tabIndex =
    marks[selectedIndex]?.kind === "current" ? selectedIndex : -1;
  if (variant === "tab") {
    if (tabIndex < 0) return null;
    return renderRow(tabIndex, true);
  }
  function renderRow(i: number, tab: boolean) {
    const m = marks[i];
    const r = rows[i];
    const now = m.kind === "current";
    // The row the entry panel is showing: the Now row while logging live,
    // or the past set that was tapped (edit mode).
    const selected = i === selectedIndex;
    return (
      <button
        type="button"
        disabled={!m.onTap}
        onClick={(e) => {
          // A per-side pair opens on the side that was tapped: from the
          // R value rightwards is the right side (a matched pair, shown
          // as one value, splits at the row's middle).
          const box = e.currentTarget.getBoundingClientRect();
          const r = e.currentTarget
            .querySelector("[data-pair-right]")
            ?.getBoundingClientRect();
          // A wrapped pair (R half on its own line) splits by line.
          const wrapped = r != null && r.top > box.top + box.height / 3;
          const isRight = wrapped
            ? e.clientY >= r.top - 2
            : e.clientX >= (r ? r.left - 4 : box.left + box.width / 2);
          m.onTap?.(m.paired ? (isRight ? "right" : "left") : null);
        }}
        className={cn(
          "relative grid min-h-[clamp(40px,5.4dvh,48px)] w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 text-left text-[17px] text-ink press duration-100",
          tab
            ? "min-w-0 flex-1 rounded-none bg-transparent px-0"
            : selected
              ? "rounded-md bg-accent-soft ring-2 ring-accent-ink ring-inset"
              : now
                ? "rounded-md bg-accent-soft/50"
                : "rounded-md bg-surface hover:bg-surface-hover",
        )}
        aria-current={selected ? "true" : undefined}
        data-selected={selected ? "true" : "false"}
        data-tab={tab ? "true" : undefined}
        data-testid={`set-mark-${i}`}
      >
        <span
          className={cn(
            "num flex size-6 items-center justify-center rounded-sm text-xs font-semibold",
            selected
              ? "bg-accent-ink text-bg"
              : now
                ? "bg-accent text-on-accent"
                : m.kind === "warmup"
                  ? "bg-surface-2 text-warn"
                  : "bg-accent-soft text-accent-ink",
          )}
          data-testid={`set-mark-${i}-state`}
          data-state={m.kind}
        >
          {m.kind === "warmup" ? "W" : i + 1}
        </span>
        <span className="num flex min-w-0 items-center gap-2 font-semibold">
          {(() => {
            if (now)
              return (
                <span className="flex min-w-0 items-center gap-1 truncate">
                  Now
                  {selected && (
                    <CaretDown
                      aria-label="logging below"
                      className="size-4 shrink-0 text-accent-ink"
                      weight="bold"
                      data-testid="now-link"
                    />
                  )}
                </span>
              );
            const sides = r.pair
              ? formatPreviousSides(r.pair, fmtWeight)
              : null;
            // Uneven per-side pair: label each side. A matched pair
            // collapses to one value plus the L+R tag.
            if (sides?.right != null)
              return (
                // Two outlined cells, one per side, so a per-side set
                // reads as split at a glance (SideCell, >= 3:1 on
                // every row fill). Wraps the R cell under the L cell
                // rather than clipping on a narrow row.
                <span
                  className="flex min-w-0 flex-wrap items-center gap-1.5 py-1 text-[15px] leading-6"
                  data-testid={`set-mark-${i}-sides`}
                >
                  <SideCell side="left">{sides.left}</SideCell>
                  <SideCell side="right" data-pair-right>
                    {sides.right}
                  </SideCell>
                </span>
              );
            return (
              <>
                <span className="min-w-0 truncate">{r.text}</span>
                {m.paired && (
                  <SideTag side="both" testId={`set-mark-${i}-side-tag`} />
                )}
              </>
            );
          })()}
          {m.pr && (
            <Medal
              className="size-4 shrink-0 text-accent-ink"
              data-testid={`set-mark-${i}-medal`}
            />
          )}
        </span>
        <span
          className={cn(
            "num flex items-center gap-2 text-sm text-soft",
            tab && "min-w-0 overflow-hidden whitespace-nowrap",
          )}
        >
          {/* No "last X × Y" on the Now row: last time lives in the
              fields as grey ghosts (boss r2 note 9). */}
          {now ? "" : r.rirText}
          {r.hasNote && (
            <Notebook className="size-4 shrink-0 text-accent-ink" />
          )}
        </span>
      </button>
    );
  }
  return (
    <div className="flex flex-col px-4 pb-2" data-testid="marks-band">
      {/* A logged set morphs in place (same key, new state); an added set
          grows in and a removed one folds away instead of the list jumping.
          The wrapper owns the 4px gap (as top padding) so a folding row takes
          its gap with it. */}
      <AnimatePresence initial={false}>
        {marks.map((_m, i) => {
          // The live Now row is drawn by the panel (variant "tab"); its slot
          // stays here, empty, so logging it morphs it in place into a done
          // row (no grow-in under the user's thumb) and a set that becomes
          // the Now row never lingers here as an exiting duplicate.
          const inPanel = i === tabIndex;
          return (
            <motionEl.div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed set-1,set-2,... sequence, never reordered
              key={`set-${i}`}
              className={cn(i > 0 && !inPanel && "pt-1")}
              initial={motionReady ? COLLAPSED : false}
              animate={EXPANDED}
              exit={{
                ...COLLAPSED,
                pointerEvents: "none",
                transition: FADE_OUT,
              }}
            >
              {!inPanel && renderRow(i, false)}
            </motionEl.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Setup presets: one tap writes "Seat 4" into the setup note ───────────

const SETUP_SETTINGS = [
  { label: "Seat", Icon: Chair },
  { label: "Pad", Icon: Rectangle },
  { label: "Back", Icon: Armchair },
  { label: "Handles", Icon: HandGrabbing },
  { label: "Pin", Icon: PushPin },
] as const;
const SETUP_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** One grouped card in the Setup & form sheet. The sections read apart by
 * tone and spacing, never a rule line (brand: no borders). */
function SetupSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md bg-surface-2 p-3 dark:bg-bg">
      <h3 className="text-2xs font-bold tracking-widest text-soft uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SetupPresets({
  draft,
  onChange,
}: {
  draft: string;
  onChange: (next: string) => void;
}) {
  const [label, setLabel] = useState<string>("Seat");
  const [custom, setCustom] = useState("");
  const current = draft.match(
    new RegExp(`\\b${label}\\s+(\\d+(?:\\.\\d+)?)`, "i"),
  )?.[1];
  return (
    <div className="mb-3 flex flex-col gap-3" data-testid="setup-presets">
      {/* Boss r2 note 2: one icon per preset, grouped cards. */}
      <SetupSection title="Setting">
        <ChipGroup
          value={label}
          onValueChange={(v) => {
            if (v) setLabel(v);
          }}
          className="grid grid-cols-5 gap-1"
          aria-label="Machine setting"
        >
          {SETUP_SETTINGS.map(({ label: l, Icon }) => (
            <ChipItem
              key={l}
              value={l}
              className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-2xs"
              data-testid={`setup-setting-${l.toLowerCase()}`}
            >
              <Icon className="size-5" data-testid="setup-setting-icon" />
              {l}
            </ChipItem>
          ))}
        </ChipGroup>
      </SetupSection>
      <SetupSection title={`${label} position`}>
        <div className="grid grid-cols-6 gap-1">
          {SETUP_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() =>
                onChange(applySetupSetting(draft, label, String(n)))
              }
              aria-pressed={current === String(n)}
              className={cn(
                "num h-11 rounded-sm text-sm font-semibold transition-colors duration-100 md:h-8",
                current === String(n)
                  ? "bg-action text-on-action"
                  : "bg-surface text-ink hover:bg-active",
              )}
              data-testid={`setup-value-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            placeholder={`Other ${label.toLowerCase()} number`}
            value={custom}
            onChange={(e) =>
              setCustom(sanitizeNumeric(e.target.value, { decimal: true }))
            }
            className="num h-11 min-w-0 flex-1"
            data-testid="setup-value-custom"
          />
          <Button
            variant="outline"
            className="h-11 md:h-11"
            disabled={custom.trim() === ""}
            onClick={() => {
              onChange(applySetupSetting(draft, label, custom.trim()));
              setCustom("");
            }}
            data-testid="setup-value-add"
          >
            Set {label.toLowerCase()}
          </Button>
        </div>
      </SetupSection>
    </div>
  );
}

// ── Exercise settings overflow (block-level actions the mockup's minimal
// header doesn't draw, but that stay reachable) ────────────────────────────

function ExerciseSettingsMenu({
  blockName,
  unit,
  warmupEligible,
  heaviestDisplay,
  onRemoveBlock,
  onAddWarmup,
  hasMachine,
  onPickMachine,
  busy,
}: {
  hasMachine: boolean;
  onPickMachine: () => void;
  blockName: string;
  unit: Unit;
  warmupEligible: boolean;
  heaviestDisplay: number | null;
  onRemoveBlock: () => void;
  onAddWarmup: (displayWeight: number) => void;
  busy: boolean;
}) {
  const [warmupOpen, setWarmupOpen] = useState(false);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton
            title="Exercise options"
            className={CHROME_BTN}
            data-testid={`block-${blockName}-menu`}
          >
            <SlidersHorizontal className="size-5" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto"
          data-testid={`block-${blockName}-menu-popup`}
        >
          <DropdownMenuItem
            className="min-h-11"
            disabled={busy}
            onSelect={onPickMachine}
            data-testid={`block-${blockName}-machine`}
          >
            <Wrench className="size-4 shrink-0 text-soft" />
            {hasMachine ? "Change machine" : "Add machine"}
          </DropdownMenuItem>
          {warmupEligible && (
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => setWarmupOpen(true)}
              data-testid={`block-${blockName}-warmup`}
            >
              <Flame className="size-4 shrink-0 text-warn" />
              Add warm-up sets
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            danger
            className="mt-1 min-h-11"
            disabled={busy}
            onSelect={onRemoveBlock}
            data-testid={`remove-block-${blockName}`}
          >
            <Trash className="size-4 shrink-0" />
            Remove exercise
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WarmupDialog
        open={warmupOpen}
        onOpenChange={setWarmupOpen}
        blockName={blockName}
        unit={unit}
        prefill={heaviestDisplay}
        onInsert={onAddWarmup}
      />
    </>
  );
}

// ── Per-set ⋯ (SET TYPE ONLY per the locked decision) ───────────────────────

function SetActionsMenu({
  isWarmup,
  onToggleWarmup,
  onPerSide,
  onDelete,
}: {
  isWarmup: boolean;
  onToggleWarmup: () => void;
  /** Switches a bilateral set to per-side entry; null once the entry panel
   * shows its own Both sides / Per side switch. */
  onPerSide: (() => void) | null;
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
        className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-secondary text-ink transition-colors duration-100 hover:bg-active"
        data-testid="set-type-menu"
      >
        <DotsThree weight="bold" className="size-6" />
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
          <div className="floating absolute top-full right-0 z-20 mt-1 min-w-60 p-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggleWarmup();
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-sm text-ink transition-colors duration-100 hover:bg-surface-hover"
              data-testid="set-type-warmup"
            >
              <span className="flex items-center gap-2">
                <Flame className="size-4 shrink-0 text-warn" />
                Make it a warm-up
              </span>
              {isWarmup && <Check className="size-4 text-accent-ink" />}
            </button>
            {onPerSide && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPerSide();
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-sm text-ink transition-colors duration-100 hover:bg-surface-hover"
                data-testid="set-type-perside"
              >
                <span>Log left and right separately</span>
              </button>
            )}
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
                className="flex min-h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-sm text-neg transition-colors duration-100 hover:bg-surface-hover"
                data-testid="set-type-delete"
              >
                <Trash className="size-4 shrink-0" />
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

/**
 * F1 target line under the exercise name: `Today 102.5 kg · 6-8 · 2 RIR ↑`
 * (R8b rep band, R10 RIR). Tap opens the EvidenceSheet. A deload shows its
 * own wording (F11, R17).
 */
function TargetLine({
  plan,
  unit,
  ghostKg,
  onWhy,
}: {
  plan: PlanTarget;
  unit: Unit;
  ghostKg: number | null;
  onWhy: () => void;
}) {
  const reps = formatRange(plan.repsMin, plan.repsMax);
  const rir = formatRange(plan.rirMin, plan.rirMax);
  const parts: string[] = [];
  if (plan.loadKg != null)
    parts.push(`${toDisplayWeight(plan.loadKg, unit)} ${unitLabel(unit)}`);
  if (reps) parts.push(reps);
  if (rir) parts.push(`${rir} RIR`);
  if (parts.length === 0) return null;
  const arrow =
    plan.loadKg != null && ghostKg != null && plan.loadKg !== ghostKg
      ? plan.loadKg > ghostKg
        ? " ↑"
        : " ↓"
      : "";
  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        type="button"
        onClick={onWhy}
        className="num flex min-h-11 w-full items-center gap-2 rounded-md bg-surface px-3 text-left text-sm font-semibold text-ink"
        data-testid="target-line"
      >
        <span className="text-2xs font-bold tracking-widest text-soft uppercase">
          {plan.isDeload ? "Deload" : "Today"}
        </span>
        <span className="min-w-0 truncate">
          {parts.join(" · ")}
          {arrow}
        </span>
      </button>
      {plan.isDeload && (
        <p className="text-xs text-soft">
          {plan.sets ?? "Fewer"} sets, lighter effort, for fatigue and recovery.
        </p>
      )}
    </div>
  );
}

function ExerciseSpotlight({
  block,
  sessionMuscles,
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
  addedSets,
  onAddSet,
  prevName,
  nextName,
  prSetIds,
  prSnapshot,
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
  saveStateOf,
  onRetrySets,
}: {
  /** Sets added with "Add a set" (beyond the planned ones). */
  addedSets: number;
  onAddSet: () => void;
  prevName: string | null;
  nextName: string | null;
  block: BlockState;
  sessionMuscles: Record<string, MuscleHardSets>;
  /** F15: per-set save state from the screen's write queue. */
  saveStateOf: (setId: string) => SaveState;
  onRetrySets: () => void;
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
  // Set-scope custom metrics enabled for this exercise (Library owns
  // enabling them; the set details sheet is the only place their per-set
  // values are entered). Lives on the metric, not the exercise, so a seed
  // exercise can carry them too.
  const { data: metrics = [] } = useMetrics();
  const enabledMetrics = useMemo(
    () =>
      metrics.filter(
        (m) => m.scope === "set" && m.exerciseIds?.includes(block.exerciseId),
      ),
    [metrics, block.exerciseId],
  );
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
  // Which side of a per-side pair the user tapped in the set list; the
  // spotlight opens with that side's reps selected.
  const [focusSide, setFocusSide] = useState<"left" | "right" | null>(null);
  const focusLive = useCallback(() => setManualFocus(null), []);
  // A spoken utterance always targets the live (next-to-log) set, even if
  // the user had a past set pinned open from a marks-band tap.
  useEffect(() => {
    if (voiceFill) focusLive();
  }, [voiceFill, focusLive]);
  // Per-set laterality override, lifted up here (not owned by the live input
  // component) so the marks band's current-set L+R tag can read it too.
  const [lateralityOverride, setLateralityOverride] =
    useState<Laterality | null>(
      () =>
        loadDraft(block.seId)?.laterality ??
        seedSets[activeIndex]?.laterality ??
        null,
    );
  // Re-derive for the live (next-to-log) set whenever it advances, but only
  // when the new set has its own draft or seed (routine/copy-workout) value
  // — e.g. a prescription that goes bilateral on set 0 and unilateral on
  // set 2 would otherwise silently keep opening set 2 as bilateral. Absent
  // either, the override carries forward from the just-committed set: a
  // manual toggle (the set-type menu's "Default laterality") is sticky
  // across sets with no prescription of their own, not a one-shot. Only the
  // live target re-syncs; a manually-focused past committed set reads its
  // own laterality from `right != null`, not this override.
  //
  // This adjusts state *during render* rather than in a `useEffect`: the
  // child `Spotlight` below remounts (its `key` includes `focusedIndex`)
  // the instant `activeIndex` advances — often in the very same commit that
  // logs a set — and seeds its own `isUnilateral` state once from this
  // value at mount. An effect only runs a render after paint, by which
  // point the child has already mounted with the stale override. Deriving
  // it here keeps the value correct in the same render the child (re)mounts
  // in. See https://react.dev/learn/you-might-not-need-an-effect
  // ("Adjusting some state when a prop changes").
  const [syncedIndex, setSyncedIndex] = useState(activeIndex);
  if (manualFocus == null && syncedIndex !== activeIndex) {
    setSyncedIndex(activeIndex);
    setLateralityOverride(
      loadDraft(block.seId)?.laterality ??
        seedSets[activeIndex]?.laterality ??
        lateralityOverride,
    );
  }
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  // The set list is bottom-anchored on the entry panel, so when it overflows
  // (360x640 at set 3, or a taller per-side panel / keyboard shrinking the
  // scroll area) it must stay scrolled to the bottom or the newest rows slide
  // under the panel (item 6 follow-up). Stick to the bottom while the user is
  // there, re-stick whenever a new set opens, and leave the position alone
  // once they scroll up to read older sets. A tapped past set is brought into
  // view instead.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const pinnedIndexRef = useRef(activeIndex);
  const shownFocusRef = useRef<number | null>(manualFocus);
  const keepListInView = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedIndexRef.current !== activeIndex) {
      pinnedIndexRef.current = activeIndex;
      pinnedRef.current = true;
    }
    if (shownFocusRef.current !== manualFocus) {
      shownFocusRef.current = manualFocus;
      if (manualFocus == null) pinnedRef.current = true;
      else {
        const row = el.querySelector<HTMLElement>(
          `[data-testid="set-mark-${manualFocus}"]`,
        );
        if (row) {
          const s = el.getBoundingClientRect();
          const r = row.getBoundingClientRect();
          if (r.bottom > s.bottom) el.scrollTop += r.bottom - s.bottom;
          else if (r.top < s.top) el.scrollTop -= s.top - r.top;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
          return;
        }
      }
    }
    keepListInView();
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The scroll area shrinks when the panel grows (per-side, split weight,
    // errors) or the viewport does (keyboard); its rows grow as sets land.
    const ro = new ResizeObserver(keepListInView);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [keepListInView]);

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
  // One unit everywhere: the global Settings one (boss r2 note 7).
  const blockUnit = unit;
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
  const plan = useMemo(
    () => block.plan ?? planFromSeed(seedSets),
    [block.plan, seedSets],
  );
  const mechanic = exercise?.mechanic ?? null;
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [machineOpen, setMachineOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState("");
  const working = committedGroups
    .flatMap((g, i) => (g[0].setType === "warmup" ? [] : [{ g, i }]))
    .map(({ g, i }, j) => ({
      group: g,
      target: j === 0 ? plan : setTarget(plan, seedSets[i]),
    }));
  const lastWorking = working.at(-1)?.group;
  const lastTarget = working.at(-1)?.target ?? null;
  const lastState = lastWorking
    ? rangeState({
        reps: lastWorking[0].reps,
        repsMin: lastTarget?.repsMin ?? null,
        repsMax: lastTarget?.repsMax ?? null,
        rir: rirMidpoint(lastWorking[0]),
        plannedRirMin: lastTarget?.rirMin,
        plannedRirMax: lastTarget?.rirMax,
      })
    : null;
  const lastWorkingE1rm = lastWorking ? reportE1rm(lastWorking[0]) : null;
  const nudge = driftNudge(
    working.map(({ group, target }) => ({
      rir: rirMidpoint(group[0]),
      planned: target,
    })),
  );
  const directThis = creditsFor(exercise?.muscleTargets)
    .filter((c) => c.kind === "direct")
    .map((c) => sessionMuscles[c.muscle])
    .find((m) => m != null && sessionDirectCheck(m.direct) === "high");
  const openSet = hasOpenSet({
    planned: plannedSetCount(seedSets.length),
    added: addedSets,
    committed: committedGroups.length,
  });
  const totalMarks = committedGroups.length + (openSet ? 1 : 0);
  const marks: Mark[] = [];
  for (let i = 0; i < totalMarks; i++) {
    if (i < committedGroups.length) {
      const group = committedGroups[i];
      marks.push({
        kind: group[0].setType === "warmup" ? "warmup" : "done",
        paired: group.length === 2,
        pr: group.some((r) => prSetIds.has(r.id)),
        onTap: (side) => {
          setManualFocus(i);
          setFocusSide(side);
        },
      });
    } else {
      marks.push({
        kind: "current",
        paired: false,
        pr: false,
        onTap: focusLive,
      });
    }
  }

  // The set list and the entry panel's Now tab render from the same rows.
  const setRowProps = {
    marks,
    selectedIndex: openSet || manualFocus != null ? focusedIndex : -1,
    // Pair rows carry two values; the unit is on the entry panel, so
    // they drop it to fit both sides on a 360px row.
    fmtWeight: (kg: number) => String(toDisplayWeight(kg, blockUnit)),
    rows: marks.map((_m, i) => {
      const g = committedGroups[i];
      // A per-side pair shows both sides (PreviousSets: one value when
      // they match, L and R when they differ), never just the left.
      const pair: GhostSet | null =
        g && g.length === 2
          ? {
              weightKg: g[0].weightKg ?? null,
              reps: g[0].reps ?? null,
              durationSec: g[0].durationSec ?? null,
              otherSide: {
                weightKg: g[1].weightKg ?? null,
                reps: g[1].reps ?? null,
                durationSec: g[1].durationSec ?? null,
              },
            }
          : null;
      const text = g
        ? fieldsFor(type)
            .map((k) => fieldText(k, g[0], blockUnit, distUnit))
            .filter((t) => t !== "—")
            .join(" × ")
        : "";
      const rirL = g ? rirLabel(g[0]) : "";
      const rirR = g && g.length === 2 ? rirLabel(g[1]) : "";
      const rirText =
        rirR && rirR !== rirL
          ? `${rirL || "RIR —"} / ${rirR.replace("RIR ", "")}`
          : rirL;
      return {
        text,
        rirText,
        hasNote: !!g?.some((r) => r.note),
        pair,
      };
    }),
  };

  // Swipe between exercises from anywhere on the panel (restored after #125
  // narrowed it to the header). Gestures that belong to something else are
  // ignored at touchstart: the ruler's own drag, text inputs, sheets/dialogs
  // (React bubbles portal events up here), opt-outs and horizontal scrollers.
  function onTouchStart(e: ReactTouchEvent) {
    touchRef.current = null;
    if (e.touches.length !== 1) return;
    if (swipeIgnored(e.target, e.currentTarget)) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: ReactTouchEvent) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // A tap or jitter never counts (movement guard), and the gesture must be
    // clearly horizontal so vertical scrolling is never read as a swipe.
    if (Math.hypot(dx, dy) < 12) return;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="session-panel"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        touchRef.current = null;
      }}
    >
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <= 2;
        }}
        // Never thinner than one set row plus its gap, so the last logged
        // set stays readable even when the keyboard leaves little room; the
        // entry panel gives way (scrolls inside itself) instead.
        className="flex min-h-[calc(clamp(40px,5.4dvh,48px)+20px)] flex-1 flex-col overflow-y-auto overscroll-contain"
        data-testid="session-scroll"
      >
        {/* 2. Exercise header. */}
        <header className="px-4 pt-1 pb-3" data-testid={`block-${block.name}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSwitcher}
              className="flex min-h-[clamp(36px,5dvh,44px)] min-w-0 flex-1 items-center text-left"
              data-testid="exercise-header"
            >
              <span
                className="line-clamp-2 min-w-0 text-[clamp(22px,3.3dvh,28px)] leading-[1.15] font-bold tracking-tight text-balance"
                data-testid="exercise-name"
              >
                {block.name}
              </span>
            </button>
            <ExerciseSettingsMenu
              blockName={block.name}
              unit={blockUnit}
              warmupEligible={warmupEligible}
              heaviestDisplay={
                heaviestKg > 0 ? toDisplayWeight(heaviestKg, blockUnit) : null
              }
              onRemoveBlock={onRemoveBlock}
              onAddWarmup={(w) =>
                onAddWarmup(blockUnit === "lb" ? lbToKg(w) : w)
              }
              hasMachine={machine != null}
              onPickMachine={() => setMachineOpen(true)}
              busy={copying || copyError != null}
            />
          </div>
          {total > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <IconButton
                onClick={() => onSwipe(-1)}
                disabled={prevName == null}
                title={
                  prevName ? `Previous: ${prevName}` : "No previous exercise"
                }
                className={CHROME_BTN}
                data-testid="exercise-prev"
              >
                <CaretLeft className="size-5" weight="bold" />
              </IconButton>
              <div
                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
                data-testid="exercise-strip"
              >
                <span
                  className="num text-xs font-semibold text-soft"
                  data-testid="exercise-position"
                >
                  {position} of {total}
                </span>
                <span
                  aria-hidden="true"
                  className="flex max-w-full items-center justify-center gap-1 overflow-hidden"
                >
                  {Array.from({ length: total }, (_, i) => i).map((i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed 1..total strip
                      key={i}
                      className={cn(
                        "h-1 shrink-0 rounded-xs transition-all duration-150",
                        i + 1 === position
                          ? "w-4 bg-accent-ink"
                          : "w-1 bg-surface-2",
                      )}
                    />
                  ))}
                </span>
              </div>
              <IconButton
                onClick={() => onSwipe(1)}
                disabled={nextName == null}
                title={nextName ? `Next: ${nextName}` : "No next exercise"}
                className={CHROME_BTN}
                data-testid="exercise-next"
              >
                <CaretRight className="size-5" weight="bold" />
              </IconButton>
            </div>
          )}
          {machine && (
            <div className="mt-2">
              <MachineChip
                machine={machine}
                blockName={block.name}
                disabled={copying}
                onPick={(machineId) => editOrCopy({ machineId })}
              />
            </div>
          )}
          {total <= 1 && (
            <span className="num sr-only" data-testid="exercise-position">
              {position} of {total}
            </span>
          )}
          {(() => {
            const gw = ghost.reduce<number | null>(
              (max, g) =>
                g.weightKg != null && (max == null || g.weightKg > max)
                  ? g.weightKg
                  : max,
              null,
            );
            const gr = ghost.find((g) => g.weightKg === gw)?.reps ?? null;
            if (plan || gw == null || !TYPE_FIELDS[type].weight) return null;
            const next =
              toDisplayWeight(gw, blockUnit) + fieldStep("weight", blockUnit);
            return (
              <p
                className="flex gap-1 pt-1 text-[13px] text-soft"
                data-testid="goal-line"
              >
                Goal
                <b className="num font-semibold text-accent-ink">
                  {next} {unitLabel(blockUnit)}
                  {gr != null ? ` × ${gr}` : ""}
                </b>
                · beat last time
              </p>
            );
          })()}
          {plan && (
            <TargetLine
              plan={plan}
              unit={blockUnit}
              ghostKg={ghost.reduce<number | null>(
                (max, g) =>
                  g.weightKg != null && (max == null || g.weightKg > max)
                    ? g.weightKg
                    : max,
                null,
              )}
              onWhy={() => setEvidenceOpen(true)}
            />
          )}
          {copyError && (
            <div
              role="status"
              data-testid={`block-${block.name}-copy-error`}
              className="mt-2 flex items-center justify-between gap-2 px-2 py-2"
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

        {/* Everything below the header is bottom-anchored as one cluster
            (setup, result, set list), so the logged sets sit directly on the
            entry panel and any spare height stays under the exercise title
            instead of between the sets and the panel (item 6). */}
        <div
          className="mt-auto flex flex-col gap-2 px-4 pb-[clamp(8px,1.2dvh,12px)]"
          data-testid="exercise-extras"
        >
          {exercise &&
            (exercise.notes ? (
              <button
                type="button"
                onClick={() => {
                  setSetupDraft(exercise.notes ?? "");
                  setSetupOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md bg-surface px-3 py-2 text-left transition-colors duration-100 hover:bg-surface-hover"
                data-testid="setup-row"
              >
                <Wrench className="size-5 shrink-0 text-accent-ink" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-2xs font-bold tracking-widest text-soft uppercase">
                    Setup &amp; form
                  </span>
                  <span
                    className="line-clamp-2 text-sm break-words text-ink"
                    data-testid="setup-note"
                  >
                    {exercise.notes}
                  </span>
                </span>
                <CaretRight className="size-4 shrink-0 text-soft" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSetupDraft("");
                  setSetupOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md bg-surface px-3 py-2 text-left text-sm font-medium text-soft transition-colors duration-100 hover:bg-surface-hover"
                data-testid="setup-add"
              >
                <Plus className="size-5 shrink-0 text-soft" />
                <span className="min-w-0 flex-1">Add setup or form notes</span>
              </button>
            ))}
          <div className="flex min-h-[clamp(40px,5.2dvh,44px)] flex-wrap items-center gap-2">
            {avgRestSec != null && (
              <span
                className="num shrink-0 text-xs text-soft"
                title="Average rest between sets of this exercise"
                data-testid={`block-${block.name}-rest-avg`}
              >
                rest {formatRest(avgRestSec)} avg
              </span>
            )}
          </div>
        </div>
        {(lastState || nudge || directThis) && (
          <div
            className="flex flex-col gap-2 px-4 pt-1"
            data-testid="set-result"
          >
            {lastState && lastWorking && (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "num inline-flex h-5 items-center rounded-xs px-2 text-2xs font-semibold",
                    lastState.kind === "over"
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-hover text-soft",
                  )}
                  data-testid="range-chip"
                >
                  {lastState.label}
                </span>
                {lastWorkingE1rm?.kind === "value" && (
                  <span className="num text-2xs text-soft">
                    e1RM {toDisplayWeight(lastWorkingE1rm.kg, blockUnit)}{" "}
                    {unitLabel(blockUnit)}
                  </span>
                )}
                {lastWorkingE1rm?.kind === "not_estimable" && (
                  <span className="text-2xs text-soft">
                    Over 10 reps in total: no strength estimate for this set
                  </span>
                )}
                {(() => {
                  const g = ghostFor(ghost, lastWorking[0].setNo);
                  const w = lastWorking[0].weightKg;
                  if (g.weightKg == null || w == null) return null;
                  const d = toDisplayWeight(w - g.weightKg, blockUnit);
                  if (Math.abs(d) < 0.1) return null;
                  return (
                    <DeltaChip
                      delta={d}
                      unit={` ${unitLabel(blockUnit)}`}
                      basis="vs last time"
                    />
                  );
                })()}
                <SaveDot
                  state={lastWorking.reduce<SaveState>(
                    (acc, r) =>
                      acc === "failed" || saveStateOf(r.id) === "failed"
                        ? "failed"
                        : acc === "queued" || saveStateOf(r.id) === "queued"
                          ? "queued"
                          : "saved",
                    "saved",
                  )}
                  onRetry={onRetrySets}
                />
              </div>
            )}
            {nudge && (
              <p className="text-xs text-soft" data-testid="coach-nudge">
                {nudge}
              </p>
            )}
            {directThis && (
              <p className="text-xs text-soft" data-testid="direct-sets-note">
                {directThis.direct} direct sets for{" "}
                {muscleLabel(directThis.muscle)} in one session: a planning
                range is 2-5.
              </p>
            )}
          </div>
        )}

        {/* 3. Set band: the last block above the entry panel; the live Now
            row is the panel's own header (SetRows variant="tab"). */}
        <div className="pt-2">
          {(() => {
            // Where this exercise stands: set N of M and how many are left,
            // so the top of the screen says more than one row.
            const offered = offeredSets({
              planned: plannedSetCount(seedSets.length),
              added: addedSets,
              committed: committedGroups.length,
            });
            const left = Math.max(0, offered - committedGroups.length);
            return (
              <div className="flex items-center gap-2 px-4 pb-2">
                <p
                  className="num flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold text-soft"
                  data-testid="exercise-progress"
                >
                  <span className="text-ink">
                    {committedGroups.length} of {offered}{" "}
                    {offered === 1 ? "set" : "sets"} done
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{left === 0 ? "all logged" : `${left} to go`}</span>
                </p>
                {/* Sits above the list so the Now row can stay the last row,
                  attached to the entry panel. */}
                <button
                  type="button"
                  onClick={() => {
                    onAddSet();
                    focusLive();
                  }}
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-surface-2 px-3 text-sm font-medium text-ink press duration-100 hover:bg-surface-hover"
                  data-testid="add-set"
                >
                  <Plus className="size-4" />
                  Add a set
                </button>
              </div>
            );
          })()}
          <SetRows {...setRowProps} />
        </div>
        <MachinePickerDialog
          open={machineOpen}
          onOpenChange={setMachineOpen}
          blockName={block.name}
          onPick={(machineId) => editOrCopy({ machineId })}
        />
        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent title="Setup & form">
            <SetupPresets draft={setupDraft} onChange={setSetupDraft} />
            <SetupSection title="Notes">
              <Textarea
                rows={4}
                placeholder="Seat height, grip, cues, left knee…"
                value={setupDraft}
                onChange={(e) => setSetupDraft(e.target.value)}
                data-testid="setup-notes"
                className="w-full resize-y border border-field bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint"
              />
            </SetupSection>
            <Button
              className="mt-3 h-11 w-full md:h-11"
              onClick={() => {
                editOrCopy({ notes: setupDraft.trim() || null });
                setSetupOpen(false);
              }}
              data-testid="setup-save"
            >
              Save
            </Button>
          </DialogContent>
        </Dialog>
      </div>

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
      {committedGroups[focusedIndex] == null && !openSet ? (
        <div
          className="z-10 shrink-0 rounded-t-lg bg-surface px-4 pt-3 pb-[max(clamp(12px,3.2dvh,34px),env(safe-area-inset-bottom))]"
          data-testid="sets-done"
        >
          {/* Centered confirmation, not a left-hung caption (boss r2 note 1). */}
          <p
            className="num flex items-center justify-center gap-2 pb-3 text-sm font-semibold text-ink"
            data-testid="sets-done-label"
          >
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-accent-ink"
            >
              <Check className="size-3.5" weight="bold" />
            </span>
            {countSets(block.committed)}{" "}
            {countSets(block.committed) === 1 ? "set" : "sets"} logged
          </p>
          {/* What was done, where the weight and reps normally sit: one tile
              per set, a per-side set split into its two sides. */}
          <div
            className="flex flex-wrap justify-center gap-2 pb-3"
            data-testid="sets-done-summary"
          >
            {committedGroups.map((g, i) => {
              const one = (r: LoggedSet) =>
                fieldsFor(type)
                  .map((k) => fieldText(k, r, blockUnit, distUnit))
                  .filter((t) => t !== "—")
                  .join(" × ");
              const warm = g[0].setType === "warmup";
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed set order
                  key={i}
                  onClick={() => {
                    setManualFocus(i);
                    setFocusSide(null);
                  }}
                  className="num flex min-h-11 min-w-[8.5rem] flex-col items-center gap-0.5 rounded-sm bg-surface-2 px-3 py-1.5 text-center text-sm font-semibold text-ink transition-colors duration-100 hover:bg-surface-hover"
                  data-testid={`sets-done-${i}`}
                >
                  <span
                    className={cn(
                      "text-2xs font-bold",
                      warm ? "text-warn" : "text-soft",
                    )}
                  >
                    {warm ? "Warm-up" : `Set ${i + 1}`}
                  </span>
                  {g.length === 2 ? (
                    // Same two outlined side cells as the set list above.
                    <span
                      className="flex flex-col items-center gap-1"
                      data-testid={`sets-done-${i}-sides`}
                    >
                      <SideCell side="left">{one(g[0])}</SideCell>
                      <SideCell side="right">{one(g[1])}</SideCell>
                    </span>
                  ) : (
                    <span>{one(g[0]) || "—"}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full"
              onClick={() => {
                onAddSet();
                focusLive();
              }}
              data-testid="add-set-panel"
            >
              <Plus className="size-4" />
              Add a set
            </Button>
            {nextName && (
              <Button
                size="lg"
                className="h-12 w-full min-w-0"
                onClick={() => onSwipe(1)}
                data-testid="next-exercise"
              >
                {/* A long name truncates to one line; the chevron stays. */}
                <span className="min-w-0 truncate">Next: {nextName}</span>
                <CaretRight className="size-4 shrink-0" weight="bold" />
              </Button>
            )}
          </div>
        </div>
      ) : committedGroups[focusedIndex] == null && ghostLoading ? (
        <p
          className="px-4 py-10 text-center text-xs text-soft"
          data-testid="spotlight-loading"
        >
          Loading…
        </p>
      ) : (
        <Spotlight
          key={`${block.seId}-${focusedIndex}-${seedNonce}-${
            committedGroups[focusedIndex]?.map((r) => r.id).join(",") ?? "live"
          }-${manualFocus != null ? (focusSide ?? "") : ""}`}
          tab={
            marks[setRowProps.selectedIndex]?.kind === "current" ? (
              <SetRows {...setRowProps} variant="tab" />
            ) : undefined
          }
          initialSide={manualFocus != null ? focusSide : null}
          rulerEnabled={block.committed.length > 0}
          seId={block.seId}
          index={focusedIndex}
          unit={blockUnit}
          distUnit={distUnit}
          type={type}
          seed={seedSets[focusedIndex]}
          plan={plan}
          topSet={
            committedGroups
              .slice(0, focusedIndex)
              .every((g) => g[0].setType === "warmup") &&
            (plan?.firstSetMax ?? mechanic === "compound")
          }
          nextSeedType={seedSets[focusedIndex + 1]?.setType ?? null}
          ghost={ghostFor(ghost, focusedIndex)}
          prevSet={(() => {
            // The set before this one in this session (not a warm-up): the
            // placeholder when there is no last time yet, so set 2 of a new
            // exercise never opens on a bare 0. Display only, never logged
            // untouched, and never used for "vs last time" comparisons.
            const prev = committedGroups
              .slice(0, focusedIndex)
              .reverse()
              .find((grp) => grp[0].setType !== "warmup");
            if (!prev) return null;
            const pick = (x: LoggedSet) => ({
              weightKg: x.weightKg,
              reps: x.reps,
              durationSec: x.durationSec,
              distanceM: x.distanceM,
            });
            return {
              ...pick(prev[0]),
              otherSide: prev[1] ? pick(prev[1]) : null,
            };
          })()}
          enabledMetrics={enabledMetrics}
          committedGroup={committedGroups[focusedIndex] ?? null}
          barLoaded={barLoaded}
          weightRequired={isWeightRequired(type, exercise?.equipment)}
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
          exerciseId={block.exerciseId}
          prSnapshot={prSnapshot}
          voiceFill={voiceFill}
          onVoiceFillConsumed={onVoiceFillConsumed}
        />
      )}

      <EvidenceSheet
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        title="Today's target"
        saw={
          <p className="text-sm text-ink">
            {plan?.source === "snapshot"
              ? "Your plan for this exercise was saved when the session started."
              : "From your routine's targets for this exercise."}
          </p>
        }
        ruleId={plan?.ruleId ?? "R10"}
        rule="Train most working sets about 1-3 reps from failure; keep reps inside the planned range and add load once you pass the top of it."
        tier={5}
        tierNote="A practical default, not trial-tested."
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
    </div>
  );
}

// ── The live spotlight set: prefilled two-stacked-row input, jump buttons,
// comparison headers, delta line, stats + growth, RIR/RPE. ─────────────────

const WEIGHT_NEG = [-5, -2.5];
const WEIGHT_POS = [2.5, 5];
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
  plan,
  topSet,
  nextSeedType,
  ghost,
  committedGroup,
  barLoaded,
  weightRequired,
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
  exerciseId,
  prSnapshot,
  voiceFill,
  onVoiceFillConsumed,
  enabledMetrics,
  initialSide,
  rulerEnabled,
  prevSet = null,
  tab,
}: {
  /** The live Now row, drawn as the panel's own top band (SetRows "tab"). */
  tab?: ReactNode;
  /** The ruler is for fine-tuning: shown once this exercise has a logged set
   * in this session; before that the values are plain keyboard inputs. */
  rulerEnabled: boolean;
  /** Editing a per-side pair: the side tapped in the set list opens
   * selected. Null = default (weight, else left reps). */
  initialSide: "left" | "right" | null;
  seId: string;
  index: number;
  unit: Unit;
  distUnit: DistanceUnit;
  type: ExerciseType;
  seed: SeedSet | undefined;
  /** Exercise-level plan (snapshot, else routine seed); null when ad-hoc. */
  plan: PlanTarget | null;
  /** Oliver's method: the first working set of a compound is the top set. */
  topSet: boolean;
  nextSeedType: string | null;
  ghost: GhostSet;
  /** The previous working set of this session, the placeholder fallback when
   * `ghost` (last time) is empty. */
  prevSet?: GhostSet | null;
  /** The physical set's stored rows when this index is already logged —
   * present = editing mode, using the SAME fields/ids as live logging. */
  committedGroup: LoggedSet[] | null;
  barLoaded: boolean;
  /** A live set can't save without a weight (false for bodyweight/no-load). */
  weightRequired: boolean;
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
  exerciseId: string;
  prSnapshot: Map<string, ExerciseRecords> | null;
  voiceFill: { weightKg: number | null; reps: number | null } | null;
  onVoiceFillConsumed: () => void;
  /** Set-scope custom metrics enabled for this exercise; entered from the
   * per-set details sheet (`set-{index}-more`), opt-in each time via an
   * "add field" chip. */
  enabledMetrics: Metric[];
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
  // The ruler panel (weight + reps, optionally per side) vs. the generic
  // stacked panel for time/distance types.
  const perSideWeight = f.weight && f.reps && !f.duration && !f.distance;

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
    // Contract (boss r2 note 9): a value FILLS the field only from an
    // uncommitted draft. Last time (ghost) is a grey placeholder the user
    // taps to take (`ghostText`); an untouched ghost is never logged.
    if (kind === "weight") return draft?.weight ?? "";
    if (kind === "reps") return draft?.reps ?? "";
    if (kind === "duration") return draft?.duration ?? "";
    return draft?.distance ?? "";
  };
  // The right side is its own set of values: seeded once from ITS last-time
  // numbers (else the left's, as a starting point only), then never tied to
  // the left again.
  const ghostRight = ghost.otherSide ?? ghost;
  const seedRightReps = () => {
    if (isEditing) return right?.reps != null ? String(right.reps) : "";
    return draft?.rReps ?? "";
  };
  const seedRightWeight = () => {
    if (isEditing)
      return right?.weightKg != null
        ? String(toDisplayWeight(right.weightKg, unit))
        : "";
    return draft?.rWeight ?? "";
  };
  // Last time's value for one field, as the grey placeholder text ("" = no
  // last time). Right-side keys read the other limb's values.
  // Placeholder source: last time, else this session's previous set.
  const hasLast =
    ghost.weightKg != null ||
    ghost.reps != null ||
    ghost.durationSec != null ||
    ghost.distanceM != null;
  const hint: GhostSet = hasLast ? ghost : (prevSet ?? ghost);
  const hintRight = hint.otherSide ?? hint;
  const ghostText = (kind: FieldKey, sideR = false): string => {
    if (isEditing) return "";
    const g = sideR ? hintRight : hint;
    if (kind === "weight")
      return g.weightKg != null
        ? String(toDisplayWeight(g.weightKg, unit))
        : "";
    if (kind === "reps") return g.reps != null ? String(g.reps) : "";
    if (kind === "duration")
      return g.durationSec != null ? formatMMSS(g.durationSec) : "";
    return g.distanceM != null
      ? String(toDisplayDistance(g.distanceM, distUnit))
      : "";
  };

  const [weight, setWeightRaw] = useState(() => seedFrom("weight"));
  const [weightError, setWeightError] = useState(false);
  const setWeight = (v: string) => {
    setWeightError(false);
    setWeightRaw(sanitizeNumeric(v, { decimal: true }));
  };
  const [reps, setRepsRaw] = useState(() => seedFrom("reps"));
  const setReps = (v: string) => setRepsRaw(sanitizeNumeric(v));
  const [duration, setDuration] = useState(() => seedFrom("duration"));
  const [distance, setDistanceRaw] = useState(() => seedFrom("distance"));
  const setDistance = (v: string) =>
    setDistanceRaw(sanitizeNumeric(v, { decimal: true }));
  // Planned RIR for THIS set (routine target / exercise snapshot) is stored
  // with the set for the coach, but never fills the effort strip: each set's
  // RIR is its own, and blank stays blank (no carry from a previous set or the
  // plan). Its midpoint is only outlined on the strip so an on-plan set stays
  // one tap away.
  const plannedRirMin = seed?.rirMin ?? plan?.rirMin ?? null;
  const plannedRirMax = seed?.rirMax ?? plan?.rirMax ?? null;
  const rirHintValue =
    isEditing || (seed?.setType ?? "normal") === "warmup"
      ? null
      : rirHint(plannedRirMin, plannedRirMax);
  const [rirMin, setRirMin] = useState(
    () => draft?.rirMin ?? (left?.rirMin != null ? String(left.rirMin) : ""),
  );
  const [rirMax, setRirMax] = useState(
    () => draft?.rirMax ?? (left?.rirMax != null ? String(left.rirMax) : ""),
  );
  const [rpe] = useState(
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
  // The ruler panel (weight/reps/RIR) vs. the generic stacked panel for
  // time/distance types.
  const simple =
    f.reps && !f.duration && !f.distance && (f.weight || isUnilateral);
  const [reps2, setReps2Raw] = useState(() => seedRightReps());
  const setReps2 = (v: string) => setReps2Raw(sanitizeNumeric(v));
  const rightReps = !f.weight && reps2.trim() === "" ? reps : reps2;
  const [rDuration] = useState(
    () =>
      draft?.rDuration ??
      (isEditing && right?.durationSec != null
        ? formatMMSS(right.durationSec)
        : ""),
  );
  const [rDistance] = useState(
    () =>
      draft?.rDistance ??
      (isEditing && right?.distanceM != null
        ? String(toDisplayDistance(right.distanceM, distUnit))
        : ""),
  );
  const [rirMin2, setRirMin2] = useState(() =>
    right?.rirMin != null ? String(right.rirMin) : "",
  );
  const [rirMax2, setRirMax2] = useState(() =>
    right?.rirMax != null ? String(right.rirMax) : "",
  );
  const [rpe2] = useState(() => (right?.rpe != null ? String(right.rpe) : ""));
  // Weight-link (per-side mode): linked = one shared field (weight-field);
  // unlinked = weight-field-left/-right, its own jump rows each. Defaults to
  // whatever the stored pair actually is when editing an uneven set.
  const [weight2, setWeight2Raw] = useState(() => seedRightWeight());
  const setWeight2 = (v: string) => {
    setWeightError(false);
    setWeight2Raw(sanitizeNumeric(v, { decimal: true }));
  };
  // Per-side weight is shared (one value, both sides) unless the user splits
  // it; opens split only when the stored/last pair actually differed.
  const [splitWeight, setSplitWeight] = useState(() => {
    const l = seedFrom("weight") || ghostText("weight");
    const r = seedRightWeight() || ghostText("weight", true);
    return initialUnilateral && l !== "" && r !== "" && l !== r;
  });
  // The right side's weight as it will be saved: its own value when split,
  // else the shared one.
  const rightWeight = splitWeight ? weight2 : weight;
  // Per-side mode validates reps per side; names the side that's missing.
  const [repsError, setRepsError] = useState<"left" | "right" | null>(null);
  // Scoped by training session (not exercise) so it survives switching
  // exercises within one session but starts fresh for a new session opened
  // in the same tab — an unscoped key would otherwise carry a stale
  // open/closed state across unrelated sessions (docs/DECISIONS.md).
  const [, forceTick] = useState(0);
  const done = useRef(false);

  // Set details sheet (`set-{index}-more`): per-set note, opt-in custom
  // metrics, the RIR InfoTip, and the plate calculator — the four things the
  // hero row has no room for. `extras` is which enabled metrics are
  // currently revealed as an input (opt-in each time the sheet opens, unless
  // this set already carries a value for one); `metricDraft` is their raw
  // text, parsed by type at commit.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Which value the ruler drives. The R-suffixed keys are the right side of
  // a per-side set (the plain keys are the left, or the whole set).
  const [activeCol, setActiveCol] = useState<
    "weight" | "reps" | "rir" | "weightR" | "repsR" | "rirR"
  >(() =>
    isEditing && right && initialSide
      ? initialSide === "right"
        ? "repsR"
        : "reps"
      : f.weight
        ? "weight"
        : "reps",
  );
  const [note, setNote] = useState(
    () => draft?.note ?? (isEditing ? (left?.note ?? "") : ""),
  );
  // Committed rows don't carry metricValues back into `LoggedSet` (a
  // write-mostly field, entered once at live commit) — editing an
  // already-logged set's note is supported, its metrics aren't; both start
  // blank there, same as a fresh live set.
  const [metricDraft, setMetricDraft] = useState<Record<string, string>>(
    () => draft?.metricDraft ?? {},
  );
  const [extras, setExtras] = useState<Set<string>>(
    () => new Set(draft?.extras ?? []),
  );
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  function toggleExtra(key: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastAdded(key);
  }
  function computeMetricValues(): Record<string, unknown> | null {
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
      note,
      setType,
      extras: [...extras],
      metricDraft,
      rWeight: weight2,
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
    note,
    setType,
    extras,
    metricDraft,
    weight2,
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
    if (f.weight && voiceFill.weightKg != null) {
      setWeightError(false);
      setWeightRaw(String(toDisplayWeight(voiceFill.weightKg, unit)));
    }
    if (f.reps && voiceFill.reps != null) setRepsRaw(String(voiceFill.reps));
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

  // The right side parses only its own fields: a blank right value stays
  // blank (null), except reps on a type without weight, where a blank right
  // value defaults to the left's reps (shown as the right field's ghost).
  // Fields with no right-side control (time, distance, weight on a type
  // without reps) are the same for both sides, so they copy the left.
  function parseRightFields(v: ReturnType<typeof parseFields>) {
    let weightKg: number | null =
      f.weight && !perSideWeight ? v.weightKg : null;
    let repsN: number | null = null;
    const durationSec: number | null = v.durationSec;
    const distanceM: number | null = v.distanceM;
    if (f.weight && perSideWeight && rightWeight.trim() !== "") {
      const d = Number.parseFloat(rightWeight);
      weightKg = Number.isNaN(d) ? null : unit === "lb" ? lbToKg(d) : d;
    }
    if (f.reps && rightReps.trim() !== "") {
      const r = Number.parseInt(rightReps, 10);
      repsN = Number.isNaN(r) ? null : r;
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
    if (!validSides(v)) return;
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
        plannedRirMin: effort && setType !== "warmup" ? plannedRirMin : null,
        plannedRirMax: effort && setType !== "warmup" ? plannedRirMax : null,
        rir: null,
        rirMin: effort ? parsedRir.rirMin : null,
        rirMax: effort ? parsedRir.rirMax : null,
        rpe: effort && rpe.trim() !== "" ? Number.parseFloat(rpe) : null,
        note: note.trim() === "" ? null : note.trim(),
        metricValues: computeMetricValues(),
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

  // Missing weight (when required) or, per side, missing reps: flags the
  // error and selects the offending side's value so the ruler is on it.
  function validSides(v: ReturnType<typeof parseFields>): boolean {
    if (weightRequired && v.weightKg == null) {
      if (isUnilateral) setActiveCol("weight");
      setWeightError(true);
      return false;
    }
    if (!isUnilateral || !(isEditing ? right : true)) return true;
    const rf = parseRightFields(v);
    if (weightRequired && f.weight && rf.weightKg == null) {
      setActiveCol(splitWeight ? "weightR" : "weight");
      setWeightError(true);
      return false;
    }
    if (simple && f.reps && v.reps == null) {
      setRepsError("left");
      setActiveCol("reps");
      return false;
    }
    if (simple && f.reps && rf.reps == null) {
      setRepsError("right");
      setActiveCol("repsR");
      return false;
    }
    return true;
  }

  function submitEdit() {
    if (!left) return;
    const v = parseFields();
    if (!validSides(v)) return;
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
      note: note.trim() === "" ? null : note.trim(),
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

  function bump(
    kind: FieldKey,
    delta: number,
    side: "left" | "right" = "left",
  ) {
    const setters: Record<FieldKey, Dispatch<SetStateAction<string>>> = {
      weight: side === "left" ? setWeightRaw : setWeight2Raw,
      reps: side === "left" ? setRepsRaw : setReps2Raw,
      duration: setDuration,
      distance: setDistanceRaw,
    };
    // An empty field steps from last time's ghost, else (right side) the
    // left's value.
    const fallback =
      ghostText(kind, side === "right") ||
      (side === "left" ? "" : { weight, reps, duration, distance }[kind]);
    if (kind === "weight" && side === "left") setWeightError(false);
    setters[kind]((prev) => {
      const current = prev || fallback;
      if (kind === "duration")
        return formatMMSS(Math.max(0, (parseDuration(current) ?? 0) + delta));
      return stepValue(current, delta);
    });
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
      rirMin:
        effort && rirMin.trim() !== "" ? Number.parseInt(rirMin, 10) : null,
      rirMax:
        effort && rirMax.trim() !== "" ? Number.parseInt(rirMax, 10) : null,
      rpe: effort && rpe.trim() !== "" ? Number.parseFloat(rpe) : null,
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
    effort,
    rirMin,
    rirMax,
    rpe,
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
        className={cn("rounded-md p-3", beat ? "bg-accent-soft" : "bg-bg")}
        data-beat={beat ? "true" : "false"}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs font-bold tracking-widest text-soft uppercase">
            {isUnilateral && key === "weight" ? `${label} · both sides` : label}
          </span>
          <span
            className={cn(
              "num text-xs font-bold",
              cmp.state === "up" && "text-accent-ink",
              cmp.state === "down" && "text-warn",
              (cmp.state === "same" || cmp.state === "none") &&
                "font-normal text-soft",
            )}
            data-testid={compareTestId}
          >
            {cmp.text}
          </span>
        </div>
        <div
          className={cn(
            "rounded-sm mt-2 mb-2 flex items-center justify-center gap-2 bg-surface p-2",
            beat && "bg-bg",
          )}
        >
          {key !== "duration" && (
            <Stepper
              dir={-1}
              label={`Decrease ${label}`}
              step={fieldStep(key, unit)}
              onStep={(d) => bump(key, d)}
              testId={`${key}-step-minus`}
            />
          )}
          <ScrubSurface
            step={key === "duration" ? 1 : fieldStep(key, unit)}
            onStep={(d) => bump(key, d)}
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
              placeholder={ghostText(key) || undefined}
              onChange={(e) =>
                setValue(
                  key === "duration"
                    ? e.target.value.replace(/[^\d:]/g, "")
                    : sanitizeNumeric(e.target.value, {
                        decimal: key !== "reps",
                      }),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onFocus={() => {
                // Rest auto-stops the moment the next set's input is touched
                // (R3 locked decision) — manual Stop is the other trigger.
                if (restStartedAt != null) onStopRest();
              }}
              // A tap on a ghost takes last time's value (boss r2 note 9).
              onClick={() => {
                if (value === "" && ghostText(key)) setValue(ghostText(key));
              }}
              readOnly={key === "duration" && timerRunning}
              data-big-input
              className="num min-w-0 flex-1 bg-transparent text-center text-[40px] leading-none font-bold text-ink placeholder:text-(--color-text-disabled) sm:text-[52px]"
              data-testid={fieldTestId}
              aria-invalid={key === "weight" && weightError ? true : undefined}
              aria-describedby={
                key === "weight" && weightError ? "weight-error" : undefined
              }
            />
            {unitTxt && (
              <span className="shrink-0 text-sm font-semibold text-soft">
                {unitTxt}
              </span>
            )}
          </ScrubSurface>
          {key !== "duration" && (
            <Stepper
              dir={1}
              label={`Increase ${label}`}
              step={fieldStep(key, unit)}
              onStep={(d) => bump(key, d)}
              testId={`${key}-step-plus`}
            />
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
                CHROME_BTN,
                timerRunning &&
                  "bg-accent text-accent-fg hover:bg-accent-hover",
              )}
              data-testid="set-timer"
            >
              {timerRunning ? (
                <Square className="size-4" weight="fill" />
              ) : (
                <Play className="size-4" weight="fill" />
              )}
            </IconButton>
          ) : null}
          {key === "weight" && barLoaded && (
            <IconButton
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onOpenPlates(
                  weight.trim() === "" ? null : Number.parseFloat(weight),
                )
              }
              title="Plate calculator"
              className={CHROME_BTN}
              data-testid="set-plates"
            >
              <Calculator className="size-5" />
            </IconButton>
          )}
        </div>
        {(key === "weight" || key === "reps") && (
          <div className="mb-2" data-testid={`${key}-ruler-wrap`}>
            <Ruler
              value={Number.parseFloat(value) || 0}
              min={0}
              max={key === "weight" ? (unit === "lb" ? 1000 : 500) : 100}
              step={fieldStep(key, unit)}
              majorEvery={key === "weight" ? 4 : 5}
              pxPerStep={key === "weight" ? 14 : 22}
              label={`${label} ruler`}
              unit={unitTxt}
              testId={`${key}-ruler`}
              onStart={() => {
                if (restStartedAt != null) onStopRest();
              }}
              onChange={(v) => setValue(String(v))}
            />
          </div>
        )}
        {key === "weight" && weightError && (
          <p
            id="weight-error"
            role="alert"
            className="mb-2 text-center text-xs font-bold text-neg"
            data-testid="weight-error"
          >
            Add a weight to log this set.
          </p>
        )}
        {key !== "duration" && (
          <div className="flex gap-1">
            {neg.map((d) => (
              <button
                key={d}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => bump(key, d)}
                className="rounded-sm num h-11 flex-1 bg-surface text-sm font-bold text-soft transition-colors duration-100 hover:bg-surface-hover"
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
                className="rounded-sm num h-11 flex-1 bg-accent-soft text-sm font-bold text-accent-ink transition-colors duration-100 hover:bg-accent-soft/80"
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

  const primaryFields = fields;

  const detailsDialog = (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent title={`Set ${index + 1} details`}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-bold tracking-widest text-faint uppercase">
              RIR
            </span>
            <InfoTip lessonId="rir" />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-bold tracking-widest text-faint uppercase">
              Note
            </span>
            <Textarea
              rows={3}
              placeholder="// note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid={`set-${index}-note`}
              className="w-full resize-y border border-field bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-focus"
            />
          </label>
          {enabledMetrics
            .filter((m) => extras.has(m.id))
            .map((m) => (
              <div key={m.id} className="flex flex-col gap-1">
                <span className="text-2xs font-bold tracking-widest text-faint uppercase">
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
                    className="size-4 justify-self-start accent-(--color-accent-mark)"
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
            <div className="flex flex-wrap gap-2 pt-1">
              {enabledMetrics
                .filter((m) => !extras.has(m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleExtra(m.id)}
                    data-testid={`set-${index}-add-${m.id}`}
                    className="rounded-sm flex h-11 items-center gap-1 bg-surface-2 px-3 text-2xs text-soft transition-colors duration-100 hover:bg-surface-hover hover:text-ink md:h-8"
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
                onOpenPlates(
                  weight.trim() === "" ? null : Number.parseFloat(weight),
                );
              }}
              data-testid={`set-${index}-plates`}
              className="flex min-h-11 items-center gap-2 rounded-sm bg-surface-2 px-3 text-left text-xs text-soft transition-colors duration-150 hover:text-ink md:min-h-8"
            >
              <Calculator className="size-3.5" />
              Plate calculator
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  const currentReps = Number.parseInt(reps, 10);
  const restLabel =
    left?.restSec != null ? formatDurationSeconds(left.restSec * 1000) : null;

  // The Both sides / Per side switch shows whenever per-side is in play
  // (a unilateral exercise, a per-side set, or a manual choice this session);
  // a plain bilateral exercise opts in through the ⋯ menu, so its entry
  // panel stays exactly as it was.
  const showLateralitySwitch =
    isUnilateral ||
    exerciseLaterality === "unilateral" ||
    (!isEditing && lateralityOverride != null);
  const setLaterality = (next: boolean) => {
    if (next === isUnilateral) return;
    setRepsError(null);
    setWeightError(false);
    if (isEditing) onSetLaterality(next);
    else {
      setIsUnilateral(next);
      onLateralityOverrideChange(next ? "unilateral" : "bilateral");
    }
    setActiveCol(f.weight ? "weight" : "reps");
  };
  const lateralitySwitch = showLateralitySwitch ? (
    <div
      className="pb-2 [@media(max-height:700px)]:pb-1"
      data-testid="laterality-switch"
    >
      <ChipGroup
        value={isUnilateral ? "per" : "both"}
        onValueChange={(v) => {
          if (v) setLaterality(v === "per");
        }}
        className="grid grid-cols-2 flex-nowrap gap-1 rounded-sm bg-surface-2 p-1 dark:bg-bg"
        aria-label="How to log this set"
      >
        <ChipItem
          value="both"
          className="h-11 text-sm md:h-8"
          data-testid="laterality-both"
        >
          Both sides
        </ChipItem>
        <ChipItem
          value="per"
          className="h-11 text-sm md:h-8"
          data-testid="laterality-perside"
        >
          Per side
        </ChipItem>
      </ChipGroup>
      <p
        className="px-1 pt-1 text-2xs leading-4 text-soft [@media(max-height:700px)]:sr-only"
        data-testid="laterality-help"
      >
        {isUnilateral
          ? "Left and right each get their own reps and RIR."
          : "One entry, logged the same for left and right."}
      </p>
    </div>
  ) : null;

  // ── Ruler entry: weight / reps / RIR, bilateral or per side ──────────────
  // One rule for every value: each is a real <input>, and the value tapped
  // last is the active one. It takes the keyboard, the ruler below drives
  // it, and its underline marks it. Before 2026-11-25 RIR was a focus-less
  // button: tapping it moved the ruler but left the keyboard on reps (typed
  // digits landed in reps), and re-tapping the still-focused reps input fired
  // no focus event, so the ruler and the underline stayed on RIR.
  type EntryKey = "weight" | "weightR" | "reps" | "repsR" | "rir" | "rirR";
  const rirOf = (min: string, max: string) => {
    const lo = min.trim() === "" ? null : Number.parseInt(min, 10);
    const hi = max.trim() === "" ? null : Number.parseInt(max, 10);
    if (lo == null) return { value: null, text: "–" };
    if (hi == null) return { value: Math.min(5, lo), text: `${lo}+` };
    return {
      value: Math.min(5, lo),
      text: lo === hi ? String(lo) : `${lo}-${hi}`,
    };
  };
  const rirFieldsFor = (v: number) =>
    v >= 5 ? { min: "5", max: "" } : { min: String(v), max: String(v) };
  const setRirSide = (sd: "left" | "right", v: number | null) => {
    const fv = v == null ? { min: "", max: "" } : rirFieldsFor(v);
    if (sd === "right") {
      setRirMin2(fv.min);
      setRirMax2(fv.max);
    } else {
      setRirMin(fv.min);
      setRirMax(fv.max);
    }
  };
  const inputRefs = useRef<Partial<Record<EntryKey, HTMLInputElement | null>>>(
    {},
  );
  const activate = (key: EntryKey) => {
    setActiveCol(key);
    if (restStartedAt != null) onStopRest();
  };
  const fontFor = (text: string, big: boolean) =>
    text.length <= 3
      ? big
        ? "clamp(30px,6dvh,44px)"
        : "clamp(28px,5.4dvh,38px)"
      : text.length === 4
        ? "clamp(26px,5dvh,36px)"
        : "clamp(22px,4.2dvh,30px)";

  /** One tappable value. The input covers the whole cell (the tap target is
   * the cell, not the glyphs); the overlay shows the placeholder/formatted
   * text while the input is empty or unfocused. */
  function valueCell(o: {
    key: EntryKey;
    testId: string;
    cellTestId: string;
    ariaLabel: string;
    label: ReactNode;
    value: string;
    /** Overlay text (shown while the input is empty). */
    shown: string;
    onValue: (raw: string) => void;
    mode: "decimal" | "numeric";
    big?: boolean;
    tone?: "up" | "down" | "error" | null;
    sub?: ReactNode;
    hint?: number | null;
    beat?: boolean | null;
    unitSuffix?: string;
    /** Last time's value: grey placeholder while empty; a tap takes it. */
    ghost?: string;
  }) {
    const on = activeCol === o.key;
    const ghosted = o.value === "" && !!o.ghost;
    const shown = ghosted ? (o.ghost as string) : o.shown;
    return (
      <div
        key={o.cellTestId}
        className={cn(
          "relative flex min-w-0 flex-col items-center pb-[clamp(4px,1.1dvh,10px)]",
          on ? "text-ink" : "text-soft",
        )}
        data-testid={o.cellTestId}
        data-active={on ? "true" : "false"}
        data-hint={o.hint ?? undefined}
        data-beat={o.beat == null ? undefined : o.beat ? "true" : "false"}
      >
        <span className="relative flex h-[clamp(44px,6dvh,52px)] w-full items-center justify-center">
          <input
            ref={(el) => {
              inputRefs.current[o.key] = el;
            }}
            inputMode={o.mode}
            pattern={o.mode === "decimal" ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
            autoComplete="off"
            enterKeyHint="done"
            data-big-input
            value={o.value}
            onChange={(e) => o.onValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            // The caret goes where the tap lands; nothing selects the value
            // (boss r2 note 5, reversing the 2026-11-25 select-on-focus).
            onFocus={(e) => {
              activate(o.key);
              revealEntryField(e.currentTarget);
            }}
            // Real focus is the single source of truth for the active value
            // (iOS sim report issue 1): the old onPointerDown re-rendered the
            // ruler before iOS moved focus, and WebKit treats a tap that
            // changes content on press as a hover, so focus and the digits
            // stayed in the previous field (Weight 105 -> tap Reps -> 5 gave
            // 1055). An already-focused input fires no focus event, so its
            // click still moves the ruler and underline back here.
            onClick={() => {
              setActiveCol(o.key);
              // A tap on a ghost takes last time's value (boss r2 note 9).
              // On the tap, not on focus: focus alone (keyboard, autofill,
              // a programmatic fill) must not merge the ghost into typing.
              if (ghosted) o.onValue(o.ghost as string);
            }}
            className="peer num absolute inset-0 size-full min-w-0 bg-transparent p-0 text-center leading-none font-bold tracking-tight outline-none"
            style={{ fontSize: fontFor(o.value || shown, !!o.big) }}
            aria-label={o.ariaLabel}
            placeholder={ghosted ? o.ghost : undefined}
            data-ghost={ghosted ? o.ghost : undefined}
            aria-invalid={o.tone === "error" ? true : undefined}
            data-testid={o.testId}
          />
          <span
            aria-hidden="true"
            className={cn(
              "num leading-none font-bold tracking-tight whitespace-pre peer-focus:invisible",
              o.value !== "" && "invisible",
              ghosted && "text-(--color-text-disabled)",
            )}
            style={{ fontSize: fontFor(shown, !!o.big) }}
            data-testid={ghosted ? `${o.testId}-ghost` : undefined}
          >
            {shown}
            {o.unitSuffix && (
              <span className="visible inline-block w-0 whitespace-nowrap">
                <small className="pl-1 text-[13px] font-semibold tracking-normal text-soft">
                  {o.unitSuffix}
                </small>
              </span>
            )}
          </span>
        </span>
        <span
          className={cn(
            "flex h-6 items-center justify-center gap-1 text-xs font-semibold",
            o.tone === "error"
              ? "text-neg"
              : o.tone === "up"
                ? "text-accent-ink"
                : o.tone === "down"
                  ? "text-warn"
                  : "text-soft",
          )}
        >
          {o.label}
        </span>
        {o.sub}
        {on && (
          <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-xs bg-accent-ink" />
        )}
      </div>
    );
  }

  const wUnit = weightLabel(type, unitLabel(unit));

  function weightCellFor(sd: "both" | "left" | "right", big: boolean) {
    const key: EntryKey = sd === "right" ? "weightR" : "weight";
    const val = sd === "right" ? weight2 : weight;
    const set = sd === "right" ? setWeight2 : setWeight;
    const cmp =
      sd === "both" && !isUnilateral ? comparison("weight", val) : null;
    return valueCell({
      key,
      testId: sd === "right" ? "weight-field-right" : "weight-field",
      cellTestId:
        sd === "right" ? "entry-col-weight-right" : "entry-col-weight",
      ariaLabel:
        sd === "left"
          ? "Left weight"
          : sd === "right"
            ? "Right weight"
            : isUnilateral
              ? "Weight, both sides"
              : "Weight",
      label:
        sd === "both" ? (
          <>
            {isUnilateral ? (
              <>
                {wUnit}
                <SideTag side="both" />
              </>
            ) : (
              "Weight"
            )}
            {barLoaded && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  onOpenPlates(
                    weight.trim() === "" ? null : Number.parseFloat(weight),
                  )
                }
                className="relative ml-1 flex h-7 items-center rounded-sm bg-secondary px-2 text-xs font-semibold text-ink transition-colors duration-100 after:absolute after:-inset-x-1 after:-inset-y-2 hover:bg-active"
                data-testid="set-plates"
              >
                plates
              </button>
            )}
          </>
        ) : (
          <>
            <SideTag side={sd} />
            {wUnit}
          </>
        ),
      value: val,
      shown: val === "" ? "–" : val,
      ghost: ghostText("weight", sd === "right"),
      onValue: set,
      mode: "decimal",
      big,
      unitSuffix: !isUnilateral ? wUnit : undefined,
      tone: weightError ? "error" : (cmp?.state as "up" | "down" | null),
      beat: cmp ? cmp.state === "up" : null,
      sub: cmp ? (
        <span
          className={cn(
            "num min-h-4 px-1 text-center text-2xs leading-4 font-semibold text-balance [@media(max-height:700px)]:sr-only",
            cmp.state === "up" && "text-accent-ink",
            cmp.state === "down" && "text-warn",
            (cmp.state === "same" || cmp.state === "none") &&
              "font-normal text-soft",
          )}
          data-testid="weight-compare"
        >
          {cmp.text}
        </span>
      ) : null,
    });
  }

  function repsCellFor(sd: "both" | "left" | "right") {
    const key: EntryKey = sd === "right" ? "repsR" : "reps";
    const val = sd === "right" ? reps2 : reps;
    const set = sd === "right" ? setReps2 : setReps;
    // Bodyweight: a blank right side logs the left's reps, so show them.
    const placeholder =
      sd === "right" && !f.weight && reps.trim() !== "" ? reps : "–";
    const last =
      sd === "right" ? ghostRight.reps : sd === "left" ? ghost.reps : null;
    const sideCmp =
      sd === "both"
        ? null
        : compareToLast(
            val.trim() === "" ? null : Number.parseFloat(val),
            last ?? null,
            "",
          );
    const cmp = sd === "both" ? comparison("reps", val) : null;
    const err = repsError != null && repsError === sd;
    return valueCell({
      key,
      testId: sd === "both" ? "reps-field" : `reps-field-${sd}`,
      cellTestId: sd === "both" ? "entry-col-reps" : `entry-col-reps-${sd}`,
      ariaLabel:
        sd === "both" ? "Reps" : `${sd === "left" ? "Left" : "Right"} reps`,
      label: "Reps",
      value: val,
      shown: val === "" ? placeholder : val,
      ghost: ghostText("reps", sd === "right"),
      onValue: (v) => {
        setRepsError(null);
        set(v);
      },
      mode: "numeric",
      big: sd === "both",
      tone: err
        ? "error"
        : (cmp ?? sideCmp)?.state === "up"
          ? "up"
          : (cmp ?? sideCmp)?.state === "down"
            ? "down"
            : null,
      beat: cmp ? cmp.state === "up" : null,
      sub: cmp ? (
        <span
          className={cn(
            "num min-h-4 px-1 text-center text-2xs leading-4 font-semibold text-balance [@media(max-height:700px)]:sr-only",
            cmp.state === "up" && "text-accent-ink",
            cmp.state === "down" && "text-warn",
            (cmp.state === "same" || cmp.state === "none") &&
              "font-normal text-soft",
          )}
          data-testid="reps-compare"
        >
          {cmp.text}
        </span>
      ) : null,
    });
  }

  function rirCellFor(sd: "both" | "left" | "right") {
    const key: EntryKey = sd === "right" ? "rirR" : "rir";
    const r = sd === "right" ? rirOf(rirMin2, rirMax2) : rirOf(rirMin, rirMax);
    const showHint = rirHintValue != null && r.value == null;
    return valueCell({
      key,
      testId: sd === "both" ? "rir-column" : `rir-column-${sd}`,
      cellTestId: sd === "both" ? "entry-col-rir" : `entry-col-rir-${sd}`,
      ariaLabel:
        sd === "both" ? "RIR" : `${sd === "left" ? "Left" : "Right"} RIR`,
      label: showHint ? (
        <>
          RIR
          <span className="num font-normal text-soft">
            · plan {rirHintValue === 4 ? "4+" : rirHintValue}
          </span>
        </>
      ) : (
        "RIR"
      ),
      value: r.value == null ? "" : r.text,
      shown: r.text,
      onValue: (raw) => {
        const prev = r.value == null ? "" : r.text;
        const digits = raw.replace(/\D/g, "");
        // A deletion clears; otherwise the newest digit wins, so typing
        // over a value replaces it (RIR is one digit, 5 means 5+).
        if (raw.length < prev.length || digits === "") {
          setRirSide(sd === "right" ? "right" : "left", null);
          return;
        }
        const d = Number.parseInt(digits.slice(-1), 10);
        setRirSide(sd === "right" ? "right" : "left", Math.min(5, d));
      },
      mode: "numeric",
      big: sd === "both",
      hint: rirHintValue,
    });
  }

  const SPLIT_BTN =
    "flex h-11 shrink-0 items-center gap-1 rounded-sm bg-secondary px-3 text-xs font-semibold text-ink transition-colors duration-100 hover:bg-active md:h-8";
  const splitToggle = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (splitWeight) {
          setSplitWeight(false);
          setActiveCol("weight");
        } else {
          setWeight2Raw(weight);
          setSplitWeight(true);
        }
      }}
      className={SPLIT_BTN}
      aria-label={
        splitWeight ? "Same weight both sides" : "Different weight per side"
      }
      data-testid="weight-split-toggle"
    >
      <LinkSimple className="size-4" />
      {splitWeight ? "Same" : "Split"}
    </button>
  );

  /** Entry values. A plain bilateral exercise keeps one row (weight, reps,
   * RIR); once per-side is in play (the Both sides / Per side switch shows)
   * weight sits on its own line and reps/RIR run in one row underneath, one
   * group per side. */
  function entryValues() {
    if (!showLateralitySwitch) {
      return (
        <div
          className="grid auto-cols-fr grid-flow-col"
          data-testid="entry-row"
        >
          {f.weight && weightCellFor("both", true)}
          {repsCellFor("both")}
          {effort && rirCellFor("both")}
        </div>
      );
    }
    const weightLine = f.weight ? (
      <div className="flex items-center gap-2" data-testid="entry-weight-line">
        {/* Mirror of the Split button so the weight sits on the panel's
            true center, not pushed left by the control (boss r2 note 3). */}
        {isUnilateral && (
          <span
            aria-hidden="true"
            className={cn(SPLIT_BTN, "invisible")}
            data-testid="weight-split-spacer"
          >
            <LinkSimple className="size-4" />
            {splitWeight ? "Same" : "Split"}
          </span>
        )}
        <div
          className={cn(
            "grid min-w-0 flex-1",
            isUnilateral && splitWeight ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {isUnilateral && splitWeight ? (
            <>
              {weightCellFor("left", false)}
              {weightCellFor("right", false)}
            </>
          ) : (
            weightCellFor("both", true)
          )}
        </div>
        {isUnilateral && splitToggle}
      </div>
    ) : null;
    if (!isUnilateral) {
      return (
        <div data-testid="entry-row">
          {weightLine}
          <div className="grid auto-cols-fr grid-flow-col">
            {repsCellFor("both")}
            {effort && rirCellFor("both")}
          </div>
        </div>
      );
    }
    const side = (sd: "left" | "right") => (
      <div
        className="flex min-w-0 flex-1 flex-col rounded-md bg-surface-2/60 pt-1 dark:bg-bg"
        data-testid={`perside-${sd}`}
      >
        <span className="flex justify-center" aria-hidden="true">
          <SideTag side={sd} long />
        </span>
        <div className="grid auto-cols-fr grid-flow-col">
          {repsCellFor(sd)}
          {effort && rirCellFor(sd)}
        </div>
      </div>
    );
    return (
      <div data-testid="perside-row">
        {weightLine}
        <div className="flex gap-2 pt-1 [@media(max-height:700px)]:pt-0">
          {side("left")}
          {side("right")}
        </div>
      </div>
    );
  }

  /** The ruler for the active value: fine-tuning only, so it appears once
   * this exercise has a logged set in this session (until then the values
   * are plain inputs with the keyboard). */
  function entryRuler() {
    if (!rulerEnabled) return null;
    const stopRest = () => {
      if (restStartedAt != null) onStopRest();
    };
    const sideName = (r: boolean) => (r ? "Right" : "Left");
    const col = activeCol as EntryKey;
    if ((col === "weight" || col === "weightR") && f.weight) {
      const sideR = col === "weightR";
      // An empty value sits the ruler on last time's ghost.
      const typed = sideR ? weight2 : weight;
      const val = typed || ghostText("weight", sideR);
      const g = sideR ? hintRight.weightKg : hint.weightKg;
      const split = isUnilateral && splitWeight;
      return (
        <Ruler
          key={col}
          value={Number.parseFloat(val) || 0}
          min={0}
          max={unit === "lb" ? 1000 : 500}
          step={unit === "lb" ? 1 : 0.5}
          majorEvery={10}
          midEvery={5}
          pxPerStep={unit === "lb" ? 8 : 9}
          jump={fieldStep("weight", unit)}
          ghost={g != null ? toDisplayWeight(g, unit) : null}
          // Empty field: the readout is the grey ghost (or "–"), never an
          // ink 0 that reads as a value about to be logged.
          emptyText={typed ? undefined : val || "–"}
          label={split ? `${sideName(sideR)} weight ruler` : "Weight ruler"}
          unit={split ? `${wUnit} · ${sideName(sideR).toLowerCase()}` : wUnit}
          testId="weight-ruler"
          onStart={stopRest}
          onChange={(v) => (sideR ? setWeight2 : setWeight)(String(v))}
        />
      );
    }
    if ((col === "rir" || col === "rirR") && effort) {
      const sideR = col === "rirR";
      const r = sideR ? rirOf(rirMin2, rirMax2) : rirOf(rirMin, rirMax);
      return (
        <Ruler
          key={col}
          value={r.value ?? rirHintValue ?? 2}
          min={0}
          max={5}
          step={1}
          majorEvery={1}
          pxPerStep={48}
          jump={1}
          ghost={rirHintValue}
          format={(v) => (v >= 5 ? "5+" : String(v))}
          emptyText={r.value == null ? "–" : undefined}
          label={isUnilateral ? `${sideName(sideR)} RIR ruler` : "RIR ruler"}
          unit={isUnilateral ? `RIR · ${sideName(sideR).toLowerCase()}` : "RIR"}
          testId="rir-ruler"
          onStart={stopRest}
          onChange={(v) => setRirSide(sideR ? "right" : "left", v)}
        />
      );
    }
    const sideR = col === "repsR";
    const typedReps = sideR ? rightReps : reps;
    const val = typedReps || ghostText("reps", sideR);
    return (
      <Ruler
        key={sideR ? "repsR" : "reps"}
        value={Number.parseFloat(val) || 0}
        min={0}
        max={100}
        step={1}
        majorEvery={5}
        midEvery={1}
        pxPerStep={18}
        jump={1}
        ghost={(sideR ? hintRight.reps : hint.reps) ?? null}
        emptyText={typedReps ? undefined : val || "–"}
        label={isUnilateral ? `${sideName(sideR)} reps ruler` : "Reps ruler"}
        unit={isUnilateral ? `reps · ${sideName(sideR).toLowerCase()}` : "reps"}
        testId="reps-ruler"
        onStart={stopRest}
        onChange={(v) => {
          setRepsError(null);
          (sideR ? setReps2 : setReps)(String(v));
        }}
      />
    );
  }

  // Per side, Log stays quiet until every side has what it needs: a set with
  // only the left side entered must not look ready to log.
  const missingSide = (() => {
    if (isEditing || !isUnilateral || !simple) return null;
    if (f.weight && weightRequired) {
      if (weight.trim() === "") return splitWeight ? "left weight" : "weight";
      if (splitWeight && weight2.trim() === "") return "right weight";
    }
    if (f.reps) {
      if (reps.trim() === "") return "left reps";
      if (rightReps.trim() === "") return "right reps";
    }
    return null;
  })();

  // Set note: a labelled note chip beside the set label, not a generic edit
  // pencil among the header actions (boss r2 note 4). Toned once the set
  // carries a note.
  const hasNote = note.trim() !== "";
  const noteChip = (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setDetailsOpen(true)}
      aria-label={hasNote ? "Edit set note and details" : "Add set note"}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-semibold transition-colors duration-100",
        hasNote
          ? "bg-accent-soft text-accent-ink"
          : "bg-surface-2 text-soft hover:bg-surface-hover",
      )}
      data-testid={`set-${index}-more`}
      data-has-note={hasNote ? "true" : "false"}
    >
      <Notepad className="size-4" weight={hasNote ? "fill" : "regular"} />
      Note
    </button>
  );

  const rulerHeader = (
    <div
      className={cn(
        "flex min-h-[clamp(36px,5.2dvh,44px)] items-center gap-2",
        // Live set: the Now row is this header, one accent band across the
        // panel's top edge (item 6, docs/ux-audit/2026-11-25/fix-6-8).
        // Sticky: when space is short the panel scrolls, the Now row stays.
        tab &&
          "sticky -top-2 z-10 -mx-4 -mt-2 mb-1 min-h-[clamp(48px,6.4dvh,56px)] rounded-t-lg bg-accent-soft py-1 pr-4 pl-7",
      )}
      data-testid={tab ? "now-tab" : undefined}
    >
      {tab}
      {/* Same numbered badge as the highlighted set row above, so the panel
          reads as that set opened up. With the Now tab it is the tab. */}
      <span
        className={cn(
          "num flex items-center gap-2 text-sm font-semibold text-ink",
          tab && "sr-only",
        )}
        data-testid="set-number"
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-sm bg-accent-ink text-xs text-bg"
        >
          {index + 1}
        </span>
        Set {index + 1}
        <span className="font-normal text-soft">
          {isEditing ? "· editing" : "· now"}
        </span>
      </span>
      {noteChip}
      {topSet && setType !== "warmup" && (
        <span
          className="rounded-xs bg-accent-soft px-2 py-1 text-2xs font-bold tracking-widest text-accent-ink uppercase"
          data-testid="top-set-label"
        >
          Top set
        </span>
      )}
      {setType === "warmup" && (
        <span className="rounded-xs bg-secondary px-2 py-1 text-2xs font-bold tracking-widest text-warn uppercase">
          Warm-up
        </span>
      )}
      {isEditing && restLabel && (
        <span
          className="num text-2xs text-soft"
          data-testid={`set-rest-stamp-${index}`}
        >
          rested {restLabel}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        <SetActionsMenu
          isWarmup={setType === "warmup"}
          onToggleWarmup={() => {
            const next = setType === "warmup" ? "normal" : "warmup";
            setSetType(next);
            if (isEditing) onSaveType({ setType: next });
          }}
          onPerSide={showLateralitySwitch ? null : () => setLaterality(true)}
          onDelete={isEditing ? onDeleteCommitted : null}
        />
      </span>
    </div>
  );

  if (simple) {
    const logQuiet = missingSide != null;
    return (
      <div
        className="relative z-10 min-h-0 overflow-y-auto overscroll-contain rounded-t-lg bg-surface px-4 pt-2"
        data-testid="entry-panel"
        data-set-index={index}
      >
        {rulerHeader}
        {lateralitySwitch}
        {entryValues()}

        {weightError && (
          <p
            id="weight-error"
            role="alert"
            className="pt-2 text-center text-xs font-bold text-neg"
            data-testid="weight-error"
          >
            {isUnilateral && splitWeight
              ? "Add a weight for each side to log this set."
              : "Add a weight to log this set."}
          </p>
        )}
        {repsError && (
          <p
            role="alert"
            className="pt-2 text-center text-xs font-bold text-neg"
            data-testid="reps-error"
          >
            Add {repsError} reps to log this set.
          </p>
        )}

        {/* Ruler + Log stay pinned to the panel's bottom edge: when the
            keyboard leaves little room the values scroll under the sticky
            Now row instead, never the controls you act with (r2 notes 6/10). */}
        <div
          className="sticky bottom-0 z-10 -mx-4 bg-surface px-4"
          data-entry-footer
        >
          {rulerEnabled && (
            // Keyboard-short screens drop the ruler's readout: it repeats
            // the focused field just above, and its 32px is what lets the
            // whole weight row clear the Now row and the footer (iPhone with
            // the keyboard up, 360x380).
            <div className="mt-2 rounded-sm bg-surface-2 dark:bg-bg in-data-[short=true]:[&_[data-testid$=-ruler-readout]]:hidden">
              {entryRuler()}
            </div>
          )}

          <div className="pt-[clamp(8px,1.4dvh,12px)] pb-[max(clamp(12px,3.2dvh,34px),env(safe-area-inset-bottom))]">
            <Button
              size="lg"
              variant={logQuiet ? "outline" : undefined}
              className={cn(
                "h-[clamp(48px,7dvh,60px)] w-full rounded-lg text-[19px] font-bold",
                logQuiet
                  ? "bg-surface-2 text-soft hover:bg-surface-hover"
                  : "bg-action text-on-action hover:bg-action-hover dark:bg-accent dark:text-on-accent dark:hover:bg-accent-hover",
              )}
              onClick={submit}
              data-testid="log-set"
              data-ready={logQuiet ? "false" : "true"}
            >
              {logQuiet ? (
                <span className="text-base font-semibold">
                  Add {missingSide} to log
                </span>
              ) : (
                <>
                  <Check className="size-5" weight="bold" />
                  {isEditing
                    ? "Save"
                    : logLabel({
                        weight,
                        reps,
                        weightUnit: unitLabel(unit),
                        setNo: index + 1,
                        unilateral: isUnilateral,
                        rightWeight,
                        rightReps: reps2,
                      })}
                </>
              )}
            </Button>
          </div>
        </div>
        {detailsDialog}
      </div>
    );
  }

  return (
    <div
      className="flex max-h-[72dvh] shrink-0 flex-col gap-3 overflow-y-auto rounded-t-lg bg-surface px-4 pt-2 pb-[max(clamp(12px,3.2dvh,34px),env(safe-area-inset-bottom))]"
      data-testid="entry-panel"
    >
      {tab && (
        <div
          className="-mx-4 -mt-2 -mb-1 flex min-h-12 items-center rounded-t-lg bg-accent-soft pr-4 pl-7"
          data-testid="now-tab"
        >
          {tab}
        </div>
      )}
      <div className="flex min-h-11 items-center gap-2">
        <span
          className="num text-sm font-semibold text-soft"
          data-testid="set-number"
        >
          Set {index + 1}
        </span>
        {noteChip}
        {topSet && setType !== "warmup" && (
          <span
            className="rounded-xs bg-accent-soft px-2 py-1 text-2xs font-bold tracking-widest text-accent-ink uppercase"
            data-testid="top-set-label"
          >
            Top set
          </span>
        )}
        {setType === "warmup" && (
          <span className="rounded-xs bg-secondary px-2 py-1 text-2xs font-bold tracking-widest text-warn uppercase">
            Warm-up
          </span>
        )}
        {isEditing && restLabel && (
          <span
            className="num text-2xs text-soft"
            data-testid={`set-rest-stamp-${index}`}
          >
            rested {restLabel}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <SetActionsMenu
            isWarmup={setType === "warmup"}
            onToggleWarmup={() => {
              const next = setType === "warmup" ? "normal" : "warmup";
              setSetType(next);
              if (isEditing) onSaveType({ setType: next });
            }}
            onPerSide={showLateralitySwitch ? null : () => setLaterality(true)}
            onDelete={isEditing ? onDeleteCommitted : null}
          />
        </span>
      </div>

      {lateralitySwitch}

      {primaryFields.map((k) => fieldRow(k))}

      {deltaLine && (
        <p
          className="num text-2xs font-semibold text-accent-ink"
          data-testid="set-delta"
        >
          ▲ {deltaLine}
        </p>
      )}

      {f.weight && (
        <p className="num text-xs text-soft" data-testid="stats-line">
          {(() => {
            if (!prSnapshot || Number.isNaN(currentReps)) return "Best —";
            const rec = prSnapshot.get(exerciseId);
            const best = rec?.setRecords.get(currentReps);
            return best
              ? `Best ${toDisplayWeight(best.weightKg, unit)} × ${currentReps}`
              : "Best —";
          })()}
        </p>
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
              hint={rirHintValue}
            />
          </div>
        </div>
      )}
      {effort && isUnilateral && (
        <div className="flex flex-col gap-2">
          <RirSegmented
            min={rirMin}
            max={rirMax}
            onChange={(v) => {
              setRirMin(v.min);
              setRirMax(v.max);
            }}
            side="left"
            hint={rirHintValue}
          />
          <RirSegmented
            min={rirMin2}
            max={rirMax2}
            onChange={(v) => {
              setRirMin2(v.min);
              setRirMax2(v.max);
            }}
            side="right"
            hint={rirHintValue}
          />
        </div>
      )}

      {/* 5. Action zone. */}
      <div className="pt-1">
        <Button
          size="lg"
          className="h-[clamp(48px,7dvh,60px)] w-full rounded-lg bg-action text-[19px] font-bold text-on-action hover:bg-action-hover dark:bg-accent dark:text-on-accent dark:hover:bg-accent-hover"
          onClick={submit}
          data-testid="log-set"
        >
          <Check className="size-5" weight="bold" />
          {isEditing
            ? "Save"
            : logLabel({
                weight,
                reps,
                weightUnit: f.weight ? unitLabel(unit) : null,
                setNo: index + 1,
                unilateral: isUnilateral,
                rightWeight: weight2,
                rightReps: reps2,
              })}
        </Button>
      </div>

      {detailsDialog}
    </div>
  );
}

// ── Session duration / pause control (unchanged) ────────────────────────────

function clockText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
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
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (endedAt != null || paused) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [endedAt, paused]);

  const nowRef = paused && pauseStartedAt != null ? pauseStartedAt : Date.now();
  const duration = Math.max(0, (endedAt ?? nowRef) - startedAt - pausedMs);
  const hold = useHoldReveal();

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        {...hold.bind}
        onClick={() => {
          if (hold.consumeHold()) return;
          setOpen((o) => !o);
        }}
        title="Session length · tap to pause or edit start"
        className={cn(
          "num flex h-11 touch-manipulation items-center gap-2 rounded-sm px-3 text-sm font-semibold transition-colors duration-100 select-none [-webkit-touch-callout:none]",
          paused
            ? "bg-accent-soft text-accent-ink"
            : "bg-secondary text-ink hover:bg-active",
        )}
        data-testid="session-clock"
        data-clock-kind="session"
      >
        {paused ? <Pause className="size-5" /> : <Clock className="size-5" />}
        <span
          className="text-2xs font-bold tracking-widest text-soft uppercase"
          data-testid="clock-kind"
        >
          {paused ? "Paused" : "Session"}
        </span>
        <span data-testid="session-clock-time">{clockText(duration)}</span>
      </button>
      {hold.held && <SessionLengthReveal text={clockText(duration)} />}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="floating absolute top-full left-0 z-20 mt-1 min-w-56 p-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11 w-full text-sm"
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
              <span className="text-2xs font-medium tracking-wide text-soft uppercase">
                Start
              </span>
              <Input
                type="datetime-local"
                className="num h-11 w-full max-w-full min-w-0 appearance-none"
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
