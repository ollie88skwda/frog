import {
  type ExerciseType,
  type GhostSet,
  kmToM,
  lbToKg,
  type Metric,
  miToM,
  type SetType,
  supportsEffort,
  TYPE_FIELDS,
  toDisplayDistance,
  toDisplayWeight,
  unitLabel,
} from "@frog/core";
import {
  Calculator,
  Check,
  ChevronUp,
  Link2,
  Play,
  Plus,
  Square,
  Unlink,
  Wrench,
} from "lucide-react";
import {
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ModifierField,
  modifierBindings,
} from "@/components/session/modifier-field";
import {
  type ColKey,
  type Column,
  type CommitCtx,
  type CommitInput,
  formatRest,
  LAT_LABEL,
  type LatMode,
  previousText,
  type SeedSet,
  seedText,
} from "@/components/session/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dots } from "@/components/ui/dots";
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SetTypeCell } from "@/components/ui/set-type-cell";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMMSS, parseDuration } from "@/lib/format";
import { effortReadout, parseLoggedRirFields } from "@/lib/rir";
import {
  clearDraft,
  type DraftSnapshot,
  loadDraft,
  saveDraft,
} from "@/lib/session-draft";
import type { DistanceUnit, Unit } from "@/lib/settings";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The logger — the write half of the split read/write session screen (redesign
// option E, "Ledger & Logger"). One persistent bottom Drawer (Vaul) with two
// snap points does ALL the writing; the ledger behind it only reads.
//
//  - peek  : one always-present bar pinned to the screen edge. While a rest
//            stopwatch runs, that bar IS the stopwatch (R1: one clock, named
//            after the set it follows, counting up). Otherwise it names the
//            next set and pulls the logger open.
//  - open  : the Vaul drawer — machine chip, the labeled LAST/TARGET
//            reference line, the laterality ToggleGroup, the fields, Log set.
//            Focusing a field snaps it to full height so the on-screen
//            keyboard can never cover what is being typed into.
//
// Why the peek bar lives OUTSIDE the drawer rather than being its first snap
// point: Vaul renders through Radix Dialog and never forwards its own `modal`
// prop to it, so a permanently-mounted drawer permanently runs Radix's modal
// machinery — `aria-hidden` on the entire app and a Tab focus trap. For the
// read half of this design (the whole ledger) that is a hard accessibility
// failure. Opening on demand makes the modality honest: while you are logging
// a set, a modal sheet IS what's on screen (and its overlay is E2's dimmed
// ledger); while you are resting or reading, the ledger is fully live and the
// bar is just a bar.
// ---------------------------------------------------------------------------

export type RestState = {
  seId: string;
  /** The row the measured rest is stamped onto — the set that earned it. */
  setId: string;
  exerciseName: string;
  /** 1-based physical set number, for the "after <exercise> set N" label. */
  setNo: number;
  startedAt: number;
};

/** A parsed voice utterance, handed to the logger as data. `nonce` makes a
 * repeat of the same values a distinct fill. */
export type VoiceFill = {
  seId: string;
  nonce: number;
  weightKg: number | null;
  reps: number | null;
};

export type LoggerTarget = {
  seId: string;
  exerciseName: string;
  /** 0-based index of the set being logged (= physical sets committed). */
  index: number;
  type: ExerciseType;
  unit: Unit;
  distUnit: DistanceUnit;
  columns: Column[];
  seed: SeedSet | undefined;
  nextSeedType: string | null;
  ghost: GhostSet;
  hasGhost: boolean;
  previous: GhostSet | null;
  enabledMetrics: Metric[];
  barLoaded: boolean;
  exerciseLaterality: string | null;
  machineLabel: string | null;
  /** Bumped by a warm-up insert so the form re-seeds. */
  nonce: number;
};

export function SessionLogger({
  target,
  voiceFill,
  rest,
  open,
  onOpenChange,
  onStopRest,
  onTypingStarted,
  onOpenMachine,
  onOpenPlates,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
}: {
  target: LoggerTarget | null;
  voiceFill: VoiceFill | null;
  rest: RestState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStopRest: () => void;
  onTypingStarted: () => void;
  onOpenMachine: () => void;
  onOpenPlates: (target: number | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  // Natural height of the drawer's content — the resting snap point, so the
  // drawer is exactly as tall as what it has to show (mockup E2) rather than a
  // fixed fraction that clips the taller ᴸ/ᴿ layout.
  const [contentPx, setContentPx] = useState(360);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const restPx = Math.min(Math.max(contentPx, 200), viewportH);
  const restSnap = `${restPx}px`;
  const snapPoints = useMemo(() => [restSnap, 1], [restSnap]);

  // Plain controlled snap state. It must NOT be derived from another flag:
  // Vaul reports its own snap changes through setActiveSnapPoint mid-animation,
  // and a derived setter turns that into an oscillation the drawer never
  // settles out of.
  const [snap, setSnap] = useState<number | string>(restSnap);
  // Re-measured content moves the resting snap; follow it unless the keyboard
  // has taken the drawer to full height.
  useEffect(() => {
    setSnap((s) => (s === 1 ? 1 : restSnap));
  }, [restSnap]);
  // Closing drops the keyboard height too, so re-opening starts content-sized.
  useEffect(() => {
    if (!open) setSnap(restSnap);
  }, [open, restSnap]);

  return (
    <>
      <PeekBar
        rest={rest}
        target={target}
        open={open}
        onOpen={() => onOpenChange(true)}
        onStopRest={onStopRest}
      />
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={snapPoints}
        activeSnapPoint={snap}
        setActiveSnapPoint={(value) => value != null && setSnap(value)}
        shouldScaleBackground={false}
      >
        <DrawerContent className="md:left-56" data-testid="logger-drawer">
          <DrawerTitle className="sr-only">
            {target
              ? `Log ${target.exerciseName} set ${target.index + 1}`
              : "Log a set"}
          </DrawerTitle>
          <div
            ref={panelRef}
            className={cn(
              "mx-auto flex w-full max-w-2xl flex-col border-t border-border-strong bg-bg shadow-(--shadow-6)",
              // Mobile: the floating tab island overlaps the drawer's bottom
              // edge, so reserve its height rather than putting a control
              // underneath it.
              "pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-3",
            )}
          >
            <PanelMeasure panelRef={panelRef} onMeasure={setContentPx} />
            <DrawerHandle />
            <LoggerHeader target={target} />
            {target && (
              <LoggerForm
                key={`${target.seId}-${target.index}-${target.nonce}`}
                target={target}
                voiceFill={voiceFill}
                onFocusChange={() => setSnap(1)}
                onTypingStarted={onTypingStarted}
                onOpenMachine={onOpenMachine}
                onOpenPlates={onOpenPlates}
                timerRunning={timerRunning}
                timerStartedAt={timerStartedAt}
                onToggleTimer={onToggleTimer}
                onCommit={onCommit}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Reports the drawer panel's natural height so the resting snap point is
 * exactly as tall as the content (the ᴸ/ᴿ layout is taller than the plain
 * one). Mounted with the drawer, so the observer's life matches the panel's. */
function PanelMeasure({
  panelRef,
  onMeasure,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  onMeasure: (px: number) => void;
}) {
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    onMeasure(el.scrollHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onMeasure(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelRef, onMeasure]);
  return null;
}

/** The open drawer's own title row: what is being logged, and on what. */
function LoggerHeader({ target }: { target: LoggerTarget | null }) {
  if (!target) return null;
  return (
    <div
      className="flex items-center gap-2 px-3 pb-1"
      data-testid="logger-title"
    >
      <span className="min-w-0 truncate text-sm font-semibold">
        {target.exerciseName}
      </span>
      <span className="num shrink-0 text-2xs text-faint">
        set {target.index + 1}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The peek bar — pinned to the bottom edge of the screen for the whole
// session. Resting → the ONE stopwatch, counting up, named after its set, with
// Stop. Otherwise → what the logger will write next; tap to pull it open.
// ---------------------------------------------------------------------------
function PeekBar({
  rest,
  target,
  open,
  onOpen,
  onStopRest,
}: {
  rest: RestState | null;
  target: LoggerTarget | null;
  open: boolean;
  onOpen: () => void;
  onStopRest: () => void;
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!rest) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [rest]);

  const elapsed = rest
    ? Math.max(0, Math.floor((Date.now() - rest.startedAt) / 1000))
    : 0;

  return (
    // Mobile: clears the floating tab island, so navigation stays reachable
    // mid-workout. Desktop: sits on the content column, right of the nav rail.
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20",
        "md:bottom-0 md:left-56",
        // Hidden while the drawer is open — the drawer is showing the same
        // exercise, and the overlay would sit on top of this anyway.
        open && "invisible",
      )}
      data-testid="session-logger"
      data-open={open ? "1" : "0"}
    >
      <div className="mx-auto w-full max-w-2xl px-3 md:px-4">
        {rest ? (
          <div
            className="flex h-14 items-center gap-2.5 border border-accent/50 bg-accent-soft px-2.5 shadow-(--shadow-6)"
            data-testid={`rest-${rest.exerciseName}`}
          >
            <button
              type="button"
              onClick={onOpen}
              className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left"
              title="Stop resting and log the next set"
              data-testid="rest-open"
            >
              <span className="rest-pulse size-2 shrink-0 rounded-full bg-accent" />
              <span
                className="num shrink-0 text-lg leading-none font-semibold text-pos"
                data-testid={`rest-${rest.exerciseName}-value`}
              >
                {formatRest(elapsed)}
              </span>
              <span className="min-w-0 truncate text-2xs text-pos">
                resting · after {rest.exerciseName} set {rest.setNo}
              </span>
            </button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={onStopRest}
              data-testid={`rest-${rest.exerciseName}-stop`}
            >
              Stop
            </Button>
          </div>
        ) : target ? (
          <button
            type="button"
            onClick={onOpen}
            className="flex h-14 w-full items-center gap-2 border border-border-strong bg-bg px-2.5 text-left shadow-(--shadow-6)"
            data-testid="logger-peek"
          >
            <span className="min-w-0 truncate text-sm font-semibold">
              {target.exerciseName}
            </span>
            <span className="num shrink-0 text-2xs text-faint">
              set {target.index + 1}
            </span>
            <ChevronUp className="ml-auto size-4 shrink-0 text-faint" />
          </button>
        ) : (
          <div
            className="flex h-14 items-center border border-border bg-surface px-2.5 text-xs text-faint shadow-(--shadow-6)"
            data-testid="logger-peek-empty"
          >
            Add an exercise to start logging.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The machine chip — visible on the logging path, never a ⋯ menu item (R3).
// ---------------------------------------------------------------------------
export function MachineChip({
  label,
  onClick,
  testId,
  className,
}: {
  label: string | null;
  onClick: () => void;
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label ? `Machine — ${label}` : "Pick a machine"}
      data-testid={testId}
      className={cn(
        // Never bare text: both states carry a fill.
        "inline-flex h-7 max-w-[9.5rem] shrink-0 items-center gap-1 border px-1.5 text-2xs font-medium transition-colors duration-100",
        label
          ? "border-accent/40 bg-accent-soft text-pos hover:bg-accent-soft"
          : "border-border bg-surface-2 text-faint hover:bg-surface-hover hover:text-ink",
        className,
      )}
    >
      {label ? (
        <Wrench className="size-3 shrink-0" />
      ) : (
        <Plus className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{label ?? "machine"}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// The logging surface itself. All draft state lives here and is keyed to the
// (exercise, set index) pair, so committing a set resets it wholesale.
// ---------------------------------------------------------------------------
function LoggerForm({
  target,
  voiceFill,
  onFocusChange,
  onTypingStarted,
  onOpenMachine,
  onOpenPlates,
  timerRunning,
  timerStartedAt,
  onToggleTimer,
  onCommit,
}: {
  target: LoggerTarget;
  voiceFill: VoiceFill | null;
  /** Reports keyboard focus up so the drawer can go full-height. */
  onFocusChange: () => void;
  onTypingStarted: () => void;
  onOpenMachine: () => void;
  onOpenPlates: (target: number | null) => void;
  timerRunning: boolean;
  timerStartedAt: number | null;
  onToggleTimer: () => void;
  onCommit: (set: CommitInput, ctx: CommitCtx) => void;
}) {
  const {
    seId,
    index,
    unit,
    distUnit,
    type,
    columns,
    seed,
    nextSeedType,
    ghost,
    hasGhost,
    previous,
    enabledMetrics,
    barLoaded,
    exerciseLaterality,
  } = target;
  const [draft] = useState<Partial<DraftSnapshot> | null>(() =>
    loadDraft(seId),
  );

  const seededMode: LatMode =
    (draft?.latMode as LatMode | undefined) ??
    ((seed?.laterality ?? exerciseLaterality) === "unilateral"
      ? "pair"
      : "both");
  const [latMode, setLatMode] = useState<LatMode>(seededMode);
  const [linked, setLinked] = useState(() => draft?.linked !== false);
  const isPair = latMode === "pair";

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
  const [rWeight, setRWeight] = useState(() => draft?.rWeight ?? "");
  const [rReps, setRReps] = useState(() => draft?.rReps ?? "");
  const [rDuration, setRDuration] = useState(() => draft?.rDuration ?? "");
  const [rDistance, setRDistance] = useState(() => draft?.rDistance ?? "");
  const [rirMin, setRirMin] = useState(() => draft?.rirMin ?? "");
  const [rirMax, setRirMax] = useState(() => draft?.rirMax ?? "");
  const [rpe, setRpe] = useState(() => draft?.rpe ?? "");
  const [note, setNote] = useState(() => draft?.note ?? "");
  const [setType, setSetType] = useState<SetType>(
    () => draft?.setType ?? seed?.setType ?? "normal",
  );
  const [metricDraft, setMetricDraft] = useState<Record<string, string>>(
    () => draft?.metricDraft ?? {},
  );
  const [extras, setExtras] = useState<Set<string>>(
    () => new Set(draft?.extras ?? []),
  );
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const committed = useRef(false);
  // R1: the FIRST keystroke of the next set ends the rest. Once per form.
  const typedRef = useRef(false);

  const f = TYPE_FIELDS[type];
  const effort = supportsEffort(type);

  // Mirror uncommitted keystrokes to localStorage so a reload restores them.
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
      rWeight,
      rReps,
      rDuration,
      rDistance,
      latMode,
      linked,
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
    rWeight,
    rReps,
    rDuration,
    rDistance,
    latMode,
    linked,
  ]);

  // Voice fill lands here, not through a ref the screen pokes: this form is
  // mounted and unmounted with the drawer, so an imperative handle is null
  // exactly when the voice path needs it.
  const appliedVoice = useRef(0);
  useEffect(() => {
    if (!voiceFill || appliedVoice.current === voiceFill.nonce) return;
    appliedVoice.current = voiceFill.nonce;
    if (f.weight && voiceFill.weightKg != null)
      setWeight(String(toDisplayWeight(voiceFill.weightKg, unit)));
    if (f.reps && voiceFill.reps != null) setReps(String(voiceFill.reps));
  }, [voiceFill, f.weight, f.reps, unit]);

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

  function noteTyping() {
    if (typedRef.current) return;
    typedRef.current = true;
    onTypingStarted();
  }

  function onFieldFocus() {
    // Keyboard-safe: a focused field takes the drawer to full height, so the
    // on-screen keyboard can never cover what is being typed into.
    onFocusChange();
  }

  function toggleTimer() {
    if (liveElapsed != null) setDuration(formatMMSS(liveElapsed));
    onToggleTimer();
  }

  function toggleExtra(key: string) {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastAdded(key);
  }

  // ---- the reference line (R4) -------------------------------------------
  const lastText = previous ? previousText(previous, unit) : null;
  const targetText = seed
    ? columns
        .map((c) => seedText(c.key, seed, unit, distUnit))
        .filter((s) => s !== "—")
        .join(" × ")
    : "";

  function fillFrom(src: GhostSet) {
    noteTyping();
    if (f.weight && src.weightKg != null)
      setWeight(String(toDisplayWeight(src.weightKg, unit)));
    if (f.reps && src.reps != null) setReps(String(src.reps));
    if (f.duration && src.durationSec != null)
      setDuration(formatMMSS(src.durationSec));
    if (f.distance && src.distanceM != null)
      setDistance(String(toDisplayDistance(src.distanceM, distUnit)));
    const other = src.otherSide;
    if (isPair && other) {
      if (
        f.weight &&
        other.weightKg != null &&
        other.weightKg !== src.weightKg
      ) {
        setLinked(false);
        setRWeight(String(toDisplayWeight(other.weightKg, unit)));
      }
      if (f.reps && other.reps != null) setRReps(String(other.reps));
      if (f.duration && other.durationSec != null)
        setRDuration(formatMMSS(other.durationSec));
      if (f.distance && other.distanceM != null)
        setRDistance(String(toDisplayDistance(other.distanceM, distUnit)));
    }
  }

  function useReference() {
    if (previous) return fillFrom(previous);
    if (!seed) return;
    noteTyping();
    if (f.weight && seed.weightKg != null)
      setWeight(String(toDisplayWeight(seed.weightKg, unit)));
    if (f.reps && seed.repsMax == null && seed.reps != null)
      setReps(String(seed.reps));
    if (f.duration && seed.durationSec != null)
      setDuration(formatMMSS(seed.durationSec));
    if (f.distance && seed.distanceM != null)
      setDistance(String(toDisplayDistance(seed.distanceM, distUnit)));
  }

  // ---- commit -------------------------------------------------------------
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

  function parseWeight(raw: string): number | null {
    const d = raw.trim() === "" ? null : Number.parseFloat(raw);
    return d == null || Number.isNaN(d) ? null : unit === "lb" ? lbToKg(d) : d;
  }
  function parseDistance(raw: string): number | null {
    const d = raw.trim() === "" ? null : Number.parseFloat(raw);
    return d == null || Number.isNaN(d)
      ? null
      : distUnit === "km"
        ? kmToM(d)
        : miToM(d);
  }

  function parseFields(adoptGhost: boolean) {
    let weightKg: number | null = null;
    let repsN: number | null = null;
    let durationSec: number | null = null;
    let distanceM: number | null = null;
    if (f.weight) weightKg = parseWeight(weight);
    if (f.reps) {
      const r = reps.trim() === "" ? null : Number.parseInt(reps, 10);
      repsN = r != null && Number.isNaN(r) ? null : r;
    }
    if (f.duration) durationSec = parseDuration(durationDisplay);
    if (f.distance) distanceM = parseDistance(distance);
    if (adoptGhost && hasGhost) {
      if (f.weight) weightKg = weightKg ?? ghost.weightKg ?? null;
      if (f.reps) repsN = repsN ?? ghost.reps ?? null;
      if (f.duration) durationSec = durationSec ?? ghost.durationSec ?? null;
      if (f.distance) distanceM = distanceM ?? ghost.distanceM ?? null;
    }
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  /** The ᴿ limb mirrors the ᴸ limb unless the link is off (weight) or a field
   * was actually typed into (everything else). */
  function parseRightFields(left: ReturnType<typeof parseFields>) {
    let weightKg = left.weightKg;
    let repsN = left.reps;
    let durationSec = left.durationSec;
    let distanceM = left.distanceM;
    if (f.weight && !linked && rWeight.trim() !== "")
      weightKg = parseWeight(rWeight);
    if (f.reps && rReps.trim() !== "") {
      const r = Number.parseInt(rReps, 10);
      repsN = Number.isNaN(r) ? null : r;
    }
    if (f.duration && rDuration.trim() !== "")
      durationSec = parseDuration(rDuration);
    if (f.distance && rDistance.trim() !== "")
      distanceM = parseDistance(rDistance);
    return { weightKg, reps: repsN, durationSec, distanceM };
  }

  const modifierPreview = effort
    ? effortReadout({
        ...parseLoggedRirFields(rirMin, rirMax),
        rpe: rpe.trim() === "" ? null : Number.parseFloat(rpe),
      })
    : "";

  const anyFilled =
    (f.weight && weight.trim() !== "") ||
    (f.reps && reps.trim() !== "") ||
    (f.duration && durationDisplay.trim() !== "") ||
    (f.distance && distance.trim() !== "") ||
    hasGhost;

  function commit() {
    if (committed.current) return;
    const v = parseFields(true);
    const parsedRir = parseLoggedRirFields(rirMin, rirMax);
    const anyPresent =
      (f.weight && v.weightKg != null) ||
      (f.reps && v.reps != null) ||
      (f.duration && v.durationSec != null) ||
      (f.distance && v.distanceM != null);
    if (!anyPresent) return;
    committed.current = true;
    clearDraft(seId);
    if (timerRunning) onToggleTimer();
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
        note: note.trim() === "" ? null : note.trim(),
        metricValues: metricValues(),
        // BOTH is a single bilateral row; L / R a single one-sided row; L+R
        // the two rows sharing one set_no the data model calls unilateral.
        side:
          latMode === "both"
            ? null
            : latMode === "right"
              ? "right"
              : ("left" as const),
        otherSide: isPair ? parseRightFields(v) : null,
      },
      { exerciseType: type, nextSetType: nextSeedType },
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // ---- fields -------------------------------------------------------------
  const ghostWeight =
    ghost.weightKg != null ? toDisplayWeight(ghost.weightKg, unit) : null;
  const ghostReps = ghost.reps != null ? String(ghost.reps) : null;
  const repRangePlaceholder =
    seed?.repsMax != null ? `${seed.reps ?? ""}–${seed.repsMax}` : null;

  function labelFor(key: ColKey): string {
    return columns.find((c) => c.key === key)?.header ?? key;
  }

  // No autoFocus anywhere: the drawer is at PEEK right after a commit (the
  // rest stopwatch owns the bar), and focusing a field would pull it straight
  // back open — and raise the keyboard — before the user asked for it.
  function leftCell(key: ColKey, last: boolean) {
    const enterKeyHint = last ? "done" : "next";
    const common = {
      onFocus: onFieldFocus,
      onKeyDown,
      enterKeyHint,
    } as const;
    if (key === "weight")
      return (
        <FieldBox
          key={key}
          label={labelFor("weight")}
          testId={`set-${index}-weight-unit`}
        >
          <Field
            {...common}
            inputMode="decimal"
            placeholder={
              ghostWeight != null ? String(ghostWeight) : unitLabel(unit)
            }
            value={weight}
            onChange={(e) => {
              noteTyping();
              setWeight(e.target.value);
            }}
            className="h-11 px-2"
            data-testid={`set-${index}-weight`}
          />
        </FieldBox>
      );
    if (key === "reps")
      return (
        <FieldBox key={key} label="reps">
          <Field
            {...common}
            inputMode="numeric"
            aria-label="Reps"
            placeholder={repRangePlaceholder ?? ghostReps ?? "reps"}
            value={reps}
            onChange={(e) => {
              noteTyping();
              setReps(e.target.value);
            }}
            className="h-11 px-2"
            data-testid={`set-${index}-reps`}
          />
        </FieldBox>
      );
    if (key === "distance")
      return (
        <FieldBox key={key} label={distUnit}>
          <Field
            {...common}
            inputMode="decimal"
            aria-label={`Distance (${distUnit})`}
            placeholder={distUnit}
            value={distance}
            onChange={(e) => {
              noteTyping();
              setDistance(e.target.value);
            }}
            className="h-11 px-2"
            data-testid={`set-${index}-distance`}
          />
        </FieldBox>
      );
    return (
      <FieldBox key={key} label="time">
        <span className="flex items-center">
          <Field
            {...common}
            inputMode="text"
            aria-label="Time"
            placeholder="m:ss"
            value={durationDisplay}
            readOnly={timerRunning}
            onChange={(e) => {
              noteTyping();
              setDuration(e.target.value);
            }}
            className="h-11 px-2"
            data-testid={`set-${index}-duration`}
          />
          <IconButton
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleTimer}
            title={timerRunning ? "Stop timer" : "Start timer"}
            className={cn(
              "mr-1 shrink-0",
              timerRunning
                ? "border-accent bg-accent text-accent-fg hover:bg-accent hover:text-accent-fg"
                : "text-soft",
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
      </FieldBox>
    );
  }

  function rightCell(key: ColKey) {
    const common = { onFocus: onFieldFocus, onKeyDown } as const;
    if (key === "weight")
      return (
        <FieldBox
          key={key}
          label={labelFor("weight")}
          testId={`set-${index}-right-weight-unit`}
        >
          <Field
            {...common}
            inputMode="decimal"
            aria-label={`Right-side weight (${labelFor("weight")})`}
            readOnly={linked}
            placeholder={weight.trim() !== "" ? weight : unitLabel(unit)}
            value={linked ? "" : rWeight}
            onChange={(e) => {
              noteTyping();
              setRWeight(e.target.value);
            }}
            className={cn("h-10 px-2", linked && "text-faint")}
            data-testid={`set-${index}-right-weight`}
          />
        </FieldBox>
      );
    if (key === "reps")
      return (
        <FieldBox key={key} label="reps">
          <Field
            {...common}
            inputMode="numeric"
            placeholder={
              reps.trim() !== ""
                ? reps
                : (repRangePlaceholder ?? ghostReps ?? "reps")
            }
            value={rReps}
            onChange={(e) => {
              noteTyping();
              setRReps(e.target.value);
            }}
            className="h-10 px-2"
            data-testid={`set-${index}-right-reps`}
          />
        </FieldBox>
      );
    if (key === "distance")
      return (
        <FieldBox key={key} label={distUnit}>
          <Field
            {...common}
            inputMode="decimal"
            aria-label={`Right-side distance (${distUnit})`}
            placeholder={distance.trim() !== "" ? distance : distUnit}
            value={rDistance}
            onChange={(e) => {
              noteTyping();
              setRDistance(e.target.value);
            }}
            className="h-10 px-2"
            data-testid={`set-${index}-right-distance`}
          />
        </FieldBox>
      );
    return (
      <FieldBox key={key} label="time">
        <Field
          {...common}
          inputMode="text"
          aria-label="Right-side time"
          placeholder={duration.trim() !== "" ? duration : "m:ss"}
          value={rDuration}
          onChange={(e) => {
            noteTyping();
            setRDuration(e.target.value);
          }}
          className="h-10 px-2"
          data-testid={`set-${index}-right-duration`}
        />
      </FieldBox>
    );
  }

  const gridCols =
    columns.length >= 3
      ? "grid-cols-3"
      : columns.length === 2
        ? "grid-cols-2"
        : "grid-cols-1";

  return (
    <div
      className="flex flex-col gap-2.5 px-3 pt-1 pb-2"
      data-testid="logger-body"
    >
      {/* Exercise + machine (the peek bar carries the name when collapsed;
          when open this row is the logger's own header, matching mockup E2). */}
      <div className="flex items-center gap-2">
        <SetTypeCell
          index={index}
          setType={setType}
          ringState="empty"
          onChange={setSetType}
          testId={`set-${index}-type`}
        />
        <MachineChip
          label={target.machineLabel}
          onClick={onOpenMachine}
          testId={`logger-machine-${target.exerciseName}`}
          className="ml-auto"
        />
      </div>

      {/* R4: ONE labeled reference line — replaces the prev column, the input
          ghosts and the target-row styling. */}
      {(lastText || targetText) && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-dashed border-border bg-surface px-2 py-1.5"
          data-testid="logger-reference"
        >
          {lastText && (
            <>
              <span className="text-2xs font-semibold tracking-widest text-faint uppercase">
                Last
              </span>
              <span className="num text-xs text-soft" data-testid="logger-last">
                {lastText}
              </span>
            </>
          )}
          {targetText && (
            <>
              <span className="text-2xs font-semibold tracking-widest text-faint uppercase">
                Target
              </span>
              <span
                className="num text-xs text-soft"
                data-testid="logger-target"
              >
                {targetText}
              </span>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onMouseDown={(e) => e.preventDefault()}
            onClick={useReference}
            data-testid="logger-use"
          >
            use
          </Button>
        </div>
      )}

      {/* R2: laterality is one visible, per-set control. Mixing bilateral and
          unilateral inside one exercise is one tap, in both directions. */}
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={latMode}
          onValueChange={(v) => v && setLatMode(v as LatMode)}
          aria-label="Laterality"
          className="h-10 flex-1"
          data-testid={`set-${index}-laterality`}
        >
          {(["both", "left", "right", "pair"] as LatMode[]).map((m) => (
            <ToggleGroupItem
              key={m}
              value={m}
              data-testid={`set-${index}-lat-${m}`}
            >
              {LAT_LABEL[m]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {isPair && f.weight && (
          <Toggle
            pressed={linked}
            onPressedChange={setLinked}
            aria-label="Same weight both sides"
            className="h-10"
            data-testid={`set-${index}-link-weight`}
          >
            {linked ? (
              <Link2 className="size-3.5" />
            ) : (
              <Unlink className="size-3.5" />
            )}
            same weight
          </Toggle>
        )}
      </div>

      {isPair ? (
        <div className="grid grid-cols-2 gap-2">
          <SidePanel label="ᴸ LEFT" testId={`set-${index}-panel-left`}>
            <div className={cn("grid gap-1.5", gridCols)}>
              {columns.map((c, i) => leftCell(c.key, i === columns.length - 1))}
            </div>
          </SidePanel>
          <SidePanel label="ᴿ RIGHT" testId={`set-${index}-panel-right`}>
            <div className={cn("grid gap-1.5", gridCols)}>
              {columns.map((c) => rightCell(c.key))}
            </div>
          </SidePanel>
        </div>
      ) : (
        <div className={cn("grid gap-2", gridCols)}>
          {columns.map((c, i) => leftCell(c.key, i === columns.length - 1))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="lg"
          className="h-12 flex-1"
          disabled={!anyFilled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          data-testid={`set-${index}-add`}
        >
          <Check className="size-4" />
          Log set {index + 1}
          {latMode !== "both" && ` · ${sideSuffix(latMode)}`}
        </Button>
        {/* What the details sheet is holding, without opening it — same
            readout a committed row shows. */}
        {modifierPreview && (
          <span
            className="num shrink-0 border border-border bg-surface px-1 text-2xs text-faint"
            data-testid={`set-${index}-effort`}
          >
            {modifierPreview}
          </span>
        )}
        <Dots
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDetailsOpen(true)}
          title="Set details"
          data-testid={`set-${index}-more`}
        />
      </div>

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
                  onOpenPlates(
                    weight.trim() === "" ? null : Number.parseFloat(weight),
                  );
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

function sideSuffix(mode: LatMode): string {
  if (mode === "left") return "ᴸ";
  if (mode === "right") return "ᴿ";
  return "ᴸ+ᴿ";
}

/** A boxed data field with its unit label — E2/E3's `.field` treatment. */
function FieldBox({
  label,
  testId,
  children,
}: {
  label: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    // A <div>, not a <label>: the "label" here is the unit caption, and the
    // inputs carry their own aria-label (the caption alone would read as
    // "kg" with no field identity on a screen reader).
    <div className="flex min-w-0 flex-col border border-border bg-surface-2 focus-within:border-accent/60">
      <span
        className="px-2 pt-1 text-2xs font-medium tracking-widest text-faint uppercase"
        data-testid={testId}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SidePanel({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1.5 border border-border bg-surface p-1.5"
      data-testid={testId}
    >
      <span className="text-2xs font-extrabold tracking-wide text-pos">
        {label}
      </span>
      {children}
    </div>
  );
}
