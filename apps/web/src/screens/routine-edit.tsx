import {
  EXERCISE_TYPES,
  type Exercise,
  type ExerciseType,
  groupByPrimaryMuscle,
  isConfidentMatch,
  LATERALITY_EXPLAINERS,
  LATERALITY_LABELS,
  type Machine,
  matchExerciseName,
  type NewRoutineInput,
  newId,
  type ParsedExercise,
  parseRoutineText,
  type RoutineExerciseInput,
  type SetType,
  sameExerciseName,
  TYPE_FIELDS,
} from "@frog/core";
import { Select } from "@radix-ui/themes";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardPaste,
  Flame,
  Link2,
  MoreVertical,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { MachineAttachDialog } from "@/components/attach-machine";
import { ExerciseEditor } from "@/components/exercise-editor";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SegmentedLaterality } from "@/components/ui/segmented-laterality";
import { SetTypeCell } from "@/components/ui/set-type-cell";
import { formatMMSS, parseDuration, parseIntOrNull } from "@/lib/format";
import { usePendingExercises } from "@/lib/pending-exercises";
import {
  copyExerciseOpts,
  useCreateExercise,
  useExercises,
  useMachines,
  useUpdateExercise,
} from "@/lib/queries";
import { parseTargetRirFields } from "@/lib/rir";
import {
  useCreateRoutine,
  useRoutineDetail,
  useRoutineFolders,
  useUpdateRoutine,
} from "@/lib/routine-queries";
import { useUnit } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

// Laterality in the routine builder is a per-set prescription: unilateral
// means "each side does the reps, logged as a pair in the session" — the
// session's LATERALITY also has alternating, which lives on the exercise row
// (never authored here) and is out of this screen's scope. A null
// routine_sets.laterality reads as bilateral, the same default the session
// uses.
type SetLaterality = "bilateral" | "unilateral";

// Draft model for the builder: targets in DISPLAY units (converted to kg on
// save). Rep range mode = repsMax non-empty.
type DraftSet = {
  key: string;
  setType: SetType;
  laterality: SetLaterality;
  reps: string;
  repsMax: string;
  duration: string; // mm:ss or seconds
  distance: string; // km/mi display
  rirMin: string; // target RIR range (reps-based types only)
  rirMax: string;
  // Not authored here (the weight input was dropped from the builder) but
  // carried through the draft so a save doesn't erase a generator-seeded or
  // session-written-back target — updateRoutine re-creates the set graph from
  // this input rather than merging into it. Null for genuinely new sets.
  existingTargetWeightKg: number | null;
};

type DraftExercise = {
  key: string;
  exerciseId: string;
  name: string;
  exerciseType: ExerciseType;
  supersetGroup: number | null;
  restSec: number | null;
  note: string;
  sets: DraftSet[];
};

// A parsed "paste workout" line whose exercise name didn't fuzzy-match
// anything in the library — surfaced for the user to resolve, never dropped
// or guessed.
type UnmatchedLine = ParsedExercise & { key: string };

// A pasted line the parser couldn't read at all (no set×rep token, or no
// name beside one). Surfaced so a partial import is never silent — pasted
// text has no id and can repeat verbatim, hence the generated key.
type UnparsedLine = { key: string; text: string };

// A pasted line parsing to more sets than this is almost certainly a
// misread (e.g. weight×reps like "80x5" read as sets×reps, or a stray
// digit run) rather than a real prescription — route it to the unmatched
// list instead of materializing hundreds of DraftSet rows.
const MAX_PARSED_SETS = 20;

// What a line whose set count was rejected as implausible falls back to once
// the user resolves it by hand: the reps were readable, the count wasn't.
const FALLBACK_SETS = 3;

// A multi-week program pasted at once (150-250 set×rep lines) would render
// one full non-virtualized DraftExercise editor per line — cuts against the
// "lightweight & fast" requirement the set-count cap already protects at the
// set level. Cap exercises per parse too; overflow is reported, not dropped
// silently.
const MAX_PARSED_EXERCISES = 50;

// Radix Select forbids empty-string values; this sentinel stands in for the
// null case (no folder) and maps back to null at the boundary.
const NO_FOLDER = "__none__";

// A fresh set's target RIR range default: "leave a little in the tank" for
// most working sets (RIR ≈ 10 − RPE; 1-2 RIR ≈ RPE 8-9). Editable per set.
const DEFAULT_RIR_MIN = "1";
const DEFAULT_RIR_MAX = "2";

function emptySet(): DraftSet {
  return {
    key: crypto.randomUUID(),
    setType: "normal",
    laterality: "bilateral",
    reps: "",
    repsMax: "",
    duration: "",
    distance: "",
    rirMin: DEFAULT_RIR_MIN,
    rirMax: DEFAULT_RIR_MAX,
    existingTargetWeightKg: null,
  };
}

// + Add set inherits the prescription (reps/range/duration/distance/RIR
// range) from the previous set — not weight (intentionally variable
// set-to-set, e.g. ramping/drop sets) and not setType (a warmup/failure/drop
// label carried forward would silently mislabel a new working set).
function inheritedSet(prev: DraftSet | undefined): DraftSet {
  const base = emptySet();
  return prev
    ? {
        ...base,
        reps: prev.reps,
        repsMax: prev.repsMax,
        duration: prev.duration,
        distance: prev.distance,
        rirMin: prev.rirMin,
        rirMax: prev.rirMax,
        // Laterality is structural, not a label: a set added to a unilateral
        // exercise keeps prescribing one pair unless the user flips it (a
        // carried-forward warmup/failure TYPE would mislabel, laterality
        // can't).
        laterality: prev.laterality,
      }
    : base;
}

function exerciseTypeOf(e: Exercise | undefined): ExerciseType {
  const t = e?.exerciseType as ExerciseType | undefined;
  return t && (EXERCISE_TYPES as readonly string[]).includes(t)
    ? t
    : "weight_reps";
}

// Shared by the exercise picker and the paste-workout parser — same
// DraftExercise shape either way, just a different starting set of `sets`.
function draftFromExercise(e: Exercise, sets: DraftSet[]): DraftExercise {
  return {
    key: crypto.randomUUID(),
    exerciseId: e.id,
    name: e.name,
    exerciseType: exerciseTypeOf(e),
    supersetGroup: null,
    restSec: e.defaultRestSec ?? null,
    note: "",
    sets,
  };
}

// A fresh "Add exercise" pick (not resolving a parsed/pasted line, which
// already carries its own reps) — prefills the exercise's own default rep
// range instead of three blank sets.
function defaultSetsFor(e: Exercise): DraftSet[] {
  const reps = e.defaultRepsMin != null ? String(e.defaultRepsMin) : "";
  const repsMax = e.defaultRepsMax != null ? String(e.defaultRepsMax) : "";
  return [emptySet(), emptySet(), emptySet()].map((s) => ({
    ...s,
    reps,
    repsMax,
  }));
}

function setsFromParsed(p: ParsedExercise): DraftSet[] {
  // A count over MAX_PARSED_SETS is precisely why the line was routed to the
  // unmatched list (a misread like weight×reps "80x5"), so materializing it —
  // even clamped — hands the user 20 rows to delete. Keep the readable half
  // (the reps) and fall back to a normal set count for the rest.
  const count = p.sets > MAX_PARSED_SETS ? FALLBACK_SETS : Math.max(1, p.sets);
  return Array.from({ length: count }, () => ({
    ...emptySet(),
    reps: p.reps != null ? String(p.reps) : "",
    repsMax: p.repsMax != null ? String(p.repsMax) : "",
  }));
}

// The picker's filter is a literal `includes`, strictly stricter than the
// fuzzy matcher that just failed on this same raw name — seeding the whole
// line would open the picker on zero results. The longest lettered word is
// the most distinctive part and keeps real candidates on screen.
function pickerSeed(rawName: string): string {
  return rawName
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => /[a-zA-Z]/.test(w))
    .reduce((best, w) => (w.length > best.length ? w : best), "");
}

// N8: the RIR and REPS/TIME groups are capped tracks so they sit close
// together instead of each claiming a wide 1fr column (fields stretched to
// ~125px on desktop); minmax(0,·) lets the caps yield on narrow phones. The
// last track absorbs the leftover and right-anchors the per-set ⋯ menu.
const ROW_GRID =
  "grid grid-cols-[2.5rem_minmax(0,5rem)_minmax(0,6rem)_3.5rem_minmax(0,1fr)] items-center gap-1";

export default function RoutineEditScreen() {
  const { id } = useParams(); // undefined on /routines/new
  const navigate = useNavigate();
  const { unit } = useUnit();
  const { t } = useVoice();
  const {
    data: exercises = [],
    isSuccess: libraryLoaded,
    isError: libraryFailed,
  } = useExercises();
  // Saving the routine inserts routine_exercises against a real FK, so a row
  // whose own create is still queued can't be drafted in.
  const pendingExercises = usePendingExercises();
  const { data: machines = [] } = useMachines();
  const updateExercise = useUpdateExercise();
  const createExercise = useCreateExercise();
  const { data: folders = [] } = useRoutineFolders();
  const { data: detail, isError: detailFailed } = useRoutineDetail(id ?? null);
  const createRoutine = useCreateRoutine();
  const updateRoutine = useUpdateRoutine();

  const [name, setName] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null | undefined>(
    undefined,
  );
  const [drafts, setDrafts] = useState<DraftExercise[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paste-workout import: raw text -> matched drafts + a resolvable
  // unmatched list. `pickFor` routes the (shared) exercise picker's
  // selection back into a specific unmatched line instead of a fresh add.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedLine[]>([]);
  const [unparsed, setUnparsed] = useState<UnparsedLine[]>([]);
  const [overflowCount, setOverflowCount] = useState(0);
  const [pickFor, setPickFor] = useState<UnmatchedLine | null>(null);
  // "Create exercise…" opens the shared editor prefilled with the raw line;
  // pendingTwinCreate resolves every unmatched line sharing that name once
  // the new row lands in `exercises` (the editor itself is optimistic and
  // closes instantly, but the twin draft rows need the real exerciseType).
  const [creatingFor, setCreatingFor] = useState<UnmatchedLine | null>(null);
  const [pendingTwinCreate, setPendingTwinCreate] = useState<{
    id: string;
    forRawName: string;
  } | null>(null);

  const byId = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  // Read by createFromUnmatched after its await, where the render-time
  // `unmatched` closure would be stale — a line dismissed or picked while the
  // create was in flight must not come back as a draft row.
  const unmatchedRef = useRef(unmatched);
  unmatchedRef.current = unmatched;

  // Seed the draft once when editing an existing routine.
  const seeded = detail && drafts === null && id;
  if (seeded) {
    setName(detail.routine.name);
    setFolderId(detail.routine.folderId);
    setDrafts(
      detail.exercises.map((re) => ({
        key: crypto.randomUUID(),
        exerciseId: re.exerciseId,
        name: re.exerciseName,
        exerciseType: exerciseTypeOf(byId.get(re.exerciseId)),
        supersetGroup: re.supersetGroup,
        restSec: re.restSec,
        note: re.note ?? "",
        sets: re.sets.map((s) => ({
          key: crypto.randomUUID(),
          setType: (s.setType as SetType) ?? "normal",
          reps: s.targetReps != null ? String(s.targetReps) : "",
          repsMax: s.targetRepsMax != null ? String(s.targetRepsMax) : "",
          duration:
            s.targetDurationSec != null ? formatMMSS(s.targetDurationSec) : "",
          distance:
            s.targetDistanceM != null
              ? String(
                  Math.round(
                    (s.targetDistanceM / (unit === "kg" ? 1000 : 1609.344)) *
                      100,
                  ) / 100,
                )
              : "",
          // A pre-existing set with no authored target RIR shows blank, not
          // the fresh-set default — fabricating "1-2" for old data would
          // claim a prescription that was never made.
          rirMin: s.targetRirMin != null ? String(s.targetRirMin) : "",
          rirMax: s.targetRirMax != null ? String(s.targetRirMax) : "",
          existingTargetWeightKg: s.targetWeightKg ?? null,
          laterality:
            s.laterality === "unilateral" ? "unilateral" : "bilateral",
        })),
      })),
    );
  }

  const list = drafts ?? [];
  const routineName = name ?? "";

  // Shared gate for every action that mutates the draft on /routines/:id.
  // Any of them makes `drafts` non-null, which permanently disables the
  // seed-once block above — so an Add/Paste that lands before the saved
  // routine arrives would leave its exercises unloaded and let Save
  // overwrite them with only the new rows.
  const draftReady = !id || drafts !== null;
  // Resolved-but-absent counts as broken too: without a seed, saving would
  // replace the routine's contents with whatever was added since.
  const detailBroken = detailFailed || detail === null;

  function patchExercise(i: number, patch: Partial<DraftExercise>) {
    setDrafts((prev) =>
      (prev ?? []).map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );
  }

  // Machine attach on an exercise card — writes exercises.machine_id (the
  // session's machine memory), mirroring the session block's chip. Owned
  // custom rows patch in place; seed/community rows are RLS-immutable, so the
  // routine draft is pointed at a private copy (the session's copy-on-write
  // convention, minus the repoint-retry machinery — the builder is a draft,
  // not a live session).
  function attachMachine(i: number, machineId: string) {
    const d = list[i];
    if (!d) return;
    const ex = byId.get(d.exerciseId);
    if (!ex) return;
    if (ex.isCustom && ex.ownerId !== null) {
      updateExercise.mutate({ exerciseId: ex.id, patch: { machineId } });
      return;
    }
    const copyId = newId();
    const copyName = `${ex.name} (copy)`;
    createExercise.mutate({
      name: copyName,
      opts: { id: copyId, ...copyExerciseOpts(ex), machineId, share: false },
    });
    patchExercise(i, { exerciseId: copyId, name: copyName });
  }

  function patchSet(i: number, si: number, patch: Partial<DraftSet>) {
    setDrafts((prev) =>
      (prev ?? []).map((d, j) =>
        j === i
          ? {
              ...d,
              sets: d.sets.map((s, k) => (k === si ? { ...s, ...patch } : s)),
            }
          : d,
      ),
    );
  }

  function move(i: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const arr = [...(prev ?? [])];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  // Superset toggle: joins this exercise with the NEXT one (Hevy pairs any
  // two exercises; adjacent pairing covers the common case without a second
  // picker — reorder first, then link).
  function toggleSupersetWithNext(i: number) {
    setDrafts((prev) => {
      const arr = [...(prev ?? [])];
      if (i + 1 >= arr.length) return arr;
      const cur = arr[i];
      const next = arr[i + 1];
      if (
        cur.supersetGroup != null &&
        cur.supersetGroup === next.supersetGroup
      ) {
        // Unlink the pair (next keeps group if a third member follows it).
        arr[i] = { ...cur, supersetGroup: null };
        const third = arr[i + 2];
        if (!third || third.supersetGroup !== next.supersetGroup)
          arr[i + 1] = { ...next, supersetGroup: null };
        return arr;
      }
      const group =
        cur.supersetGroup ??
        next.supersetGroup ??
        Math.max(0, ...arr.map((d) => (d.supersetGroup ?? -1) + 1));
      arr[i] = { ...cur, supersetGroup: group };
      arr[i + 1] = { ...next, supersetGroup: group };
      return arr;
    });
  }

  // Parse the pasted text against the current library, split matches (go
  // straight into the draft, same as picking one by hand) from misses (held
  // in `unmatched` for the user to resolve — never saved, never guessed).
  function parsePaste() {
    if (!draftReady) {
      setPasteError(
        t(
          "This routine is still loading — try again in a moment.",
          "The frog hasn't finished reading this routine. One moment.",
        ),
      );
      return;
    }
    // Matching against a library that hasn't loaded marks every line
    // unmatched, and "Create exercise" would then duplicate rows that already
    // exist — refuse to parse until the real list is in hand.
    if (!libraryLoaded) {
      setPasteError(
        libraryFailed
          ? t(
              "Couldn't load your exercise library. Reload before pasting a workout.",
              "The frog lost your library. Reload before you paste.",
            )
          : t(
              "Your exercise library is still loading — try again in a moment.",
              "The frog is still unpacking your library. One moment.",
            ),
      );
      return;
    }
    const parsed = parseRoutineText(pasteText);
    if (parsed.exercises.length === 0) {
      setPasteError(
        t(
          "No exercises found in that text.",
          "The frog found nothing to chew on there.",
        ),
      );
      return;
    }
    const exercisesToProcess = parsed.exercises.slice(0, MAX_PARSED_EXERCISES);
    const overflow = parsed.exercises.length - exercisesToProcess.length;
    const matchedDrafts: DraftExercise[] = [];
    const misses: UnmatchedLine[] = [];
    for (const p of exercisesToProcess) {
      // An implausible set count (likely a misread, not a real prescription)
      // always goes to the unmatched list for manual review, even if the
      // name matched cleanly — never auto-add a hundreds-of-sets draft row.
      const raw =
        p.sets <= MAX_PARSED_SETS
          ? matchExerciseName(p.rawName, exercises)
          : null;
      // Same confidence bar as voice logging (isConfidentMatch's default):
      // the merged matcher's scoring is more generous than this file's old
      // Jaccard formula was, so reusing that formula's old looser threshold
      // here would silently accept shorthand it used to reject (a bare
      // "row" against a library that also has "Barbell Bent Over Row").
      // A tie (two candidates scoring equally) is never auto-picked either;
      // it falls to "Pick manually" same as a low-confidence miss.
      const match =
        raw && raw.tied.length === 1 && isConfidentMatch(raw) ? raw : null;
      if (match)
        matchedDrafts.push(draftFromExercise(match, setsFromParsed(p)));
      else misses.push({ ...p, key: crypto.randomUUID() });
    }
    if (parsed.name && !name) setName(parsed.name);
    setDrafts((prev) => [...(prev ?? []), ...matchedDrafts]);
    setUnmatched((prev) => [...prev, ...misses]);
    setUnparsed((prev) => [
      ...prev,
      ...parsed.unparsed.map((text) => ({ key: crypto.randomUUID(), text })),
    ]);
    if (overflow > 0) setOverflowCount((prev) => prev + overflow);
    setPasteOpen(false);
    setPasteText("");
    setPasteError(null);
  }

  function pickManually(u: UnmatchedLine) {
    setQuery(pickerSeed(u.rawName));
    setPickFor(u);
    setPicking(true);
  }

  // Opens the shared editor prefilled with the raw line, instead of a bare
  // one-tap create — the primary action now produces a real record (report
  // §5.3), not a metadata-free row (mechanic/equipment/muscles all null).
  function createFromUnmatched(u: UnmatchedLine) {
    setCreatingFor(u);
  }

  // The editor's onCreated fires the instant Save is tapped (optimistic —
  // it doesn't wait on the network), so the new row lands in `exercises` on
  // the very next render; this resolves once it does.
  useEffect(() => {
    if (!pendingTwinCreate) return;
    // Wait for the create to settle: resolving against the still-pending
    // optimistic row binds the draft to an id that a publish dupe-hit then
    // drops (the RPC backstop's canonical row supersedes it — the editor
    // re-fires onCreated with that id, which re-points this effect at the
    // row that actually exists).
    if (pendingExercises.has(pendingTwinCreate.id)) return;
    const created = exercises.find((e) => e.id === pendingTwinCreate.id);
    if (!created) return;
    // A routine can name the same lift twice (main sets + a backoff line),
    // possibly with a plural mismatch ("Tricep Pushdowns" / "Tricep
    // Pushdown") — sameExerciseName is the matcher's own equality, so twin
    // detection can't drift from what matchExerciseName itself considers
    // one exercise. Resolve every unmatched line sharing this name against
    // the row we just created rather than leaving a button that
    // duplicates it.
    const twins = unmatchedRef.current.filter((x) =>
      sameExerciseName(x.rawName, pendingTwinCreate.forRawName),
    );
    setDrafts((prev) => [
      ...(prev ?? []),
      ...twins.map((x) => draftFromExercise(created, setsFromParsed(x))),
    ]);
    setUnmatched((prev) =>
      prev.filter(
        (x) => !sameExerciseName(x.rawName, pendingTwinCreate.forRawName),
      ),
    );
    setPendingTwinCreate(null);
  }, [pendingTwinCreate, exercises, pendingExercises]);

  function selectFromPicker(e: Exercise) {
    if (pickFor) {
      // Same twin resolution as createFromUnmatched: a routine can name the
      // same lift twice (main sets + a backoff line), so picking one exercise
      // for this line also resolves every sibling unmatched line sharing its
      // name, instead of leaving a Create-exercise button that would mint a
      // different row for the same lift.
      const twins = unmatchedRef.current.filter((x) =>
        sameExerciseName(x.rawName, pickFor.rawName),
      );
      setDrafts((prev) => [
        ...(prev ?? []),
        ...twins.map((x) => draftFromExercise(e, setsFromParsed(x))),
      ]);
      setUnmatched((prev) =>
        prev.filter((x) => !sameExerciseName(x.rawName, pickFor.rawName)),
      );
      setPickFor(null);
    } else {
      setDrafts((prev) => [
        ...(prev ?? []),
        draftFromExercise(e, defaultSetsFor(e)),
      ]);
    }
    setPicking(false);
    setQuery("");
    setMuscle("");
  }

  function toInput(): NewRoutineInput {
    const exercisesInput: RoutineExerciseInput[] = list.map((d, i) => ({
      exerciseId: d.exerciseId,
      orderIndex: i,
      supersetGroup: d.supersetGroup,
      restSec: d.restSec,
      note: d.note.trim() || null,
      sets: d.sets.map((s, si) => {
        const fields = TYPE_FIELDS[d.exerciseType];
        const reps = parseIntOrNull(s.reps);
        const repsMax = parseIntOrNull(s.repsMax);
        // An inverted range is unreadable as a prescription — drop it rather
        // than persist bounds the session UI would render backwards. The
        // session's logging path swaps instead (a performed set is data, not a
        // prescription); both rules live in lib/rir.ts.
        const { rirMin, rirMax } = parseTargetRirFields(s.rirMin, s.rirMax);
        return {
          setNo: si,
          setType: s.setType,
          // Weight is no longer authored ahead of time (dropped from the
          // form), but an existing target still round-trips: Update Routine
          // Values and the generator both write it, and updateRoutine
          // re-creates the set graph from this input rather than merging.
          targetWeightKg: s.existingTargetWeightKg ?? null,
          targetReps: fields.reps ? reps : null,
          targetRepsMax: fields.reps ? repsMax : null,
          targetDurationSec: fields.duration ? parseDuration(s.duration) : null,
          targetDistanceM: (() => {
            if (!fields.distance || s.distance.trim() === "") return null;
            const v = Number.parseFloat(s.distance);
            if (!Number.isFinite(v)) return null;
            return unit === "kg" ? v * 1000 : v * 1609.344;
          })(),
          targetRirMin: fields.reps ? rirMin : null,
          targetRirMax: fields.reps ? rirMax : null,
          laterality: s.laterality,
        };
      }),
    }));
    return {
      name: routineName.trim() || "Untitled routine",
      folderId: folderId ?? null,
      exercises: exercisesInput,
    };
  }

  async function save() {
    if (saving || !draftReady) return;
    if (
      unmatched.length > 0 &&
      !window.confirm(
        `${unmatched.length} pasted line${unmatched.length === 1 ? "" : "s"} from "Paste workout" ${unmatched.length === 1 ? "is" : "are"} still unresolved and will be left out of this save. Continue?`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const input = toInput();
      if (id) await updateRoutine.mutateAsync({ routineId: id, patch: input });
      else await createRoutine.mutateAsync(input);
      navigate("/routines");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSaving(false);
    }
  }

  const grouped = useMemo(
    () => groupByPrimaryMuscle(filterExercises(exercises, query, muscle)),
    [exercises, query, muscle],
  );

  // Superset color coding: group index → accent border tint.
  const supersetClass = (g: number | null) =>
    g == null ? "" : "border-l-2 border-l-accent";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">
          {id ? "Edit routine" : "New routine"}
        </h1>
        {/* TODO(lessons): <InfoTip lessonId="programming-a-routine" /> once copy exists */}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/routines")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={saving || list.length === 0 || !draftReady}
            data-testid="routine-save-btn"
          >
            {saving ? "Saving…" : "Save routine"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          size="3"
          placeholder="Routine name"
          value={routineName}
          onChange={(e) => setName(e.target.value)}
          // sm:flex-1, not flex-1: below `sm` this row is flex-col, and a
          // flex-basis:0 item there ignores its own explicit height (collapses
          // to content size) — only grow to fill width once the row is
          // actually a row. Mobile already gets full width from the default
          // align-items:stretch cross-axis behavior.
          className="sm:flex-1"
          data-testid="routine-name-input"
        />
        <Select.Root
          value={folderId ?? NO_FOLDER}
          onValueChange={(v) => setFolderId(v === NO_FOLDER ? null : v)}
          size="3"
        >
          <Select.Trigger
            variant="surface"
            className="w-full sm:w-40"
            data-testid="routine-folder-select"
          />
          <Select.Content>
            <Select.Item value={NO_FOLDER}>No folder</Select.Item>
            {folders.map((f) => (
              <Select.Item key={f.id} value={f.id}>
                {f.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>

      {/* Frog frames the failure; the exact error stays outside t() so the
          fact survives every register. */}
      {error && (
        <p className="mt-3 text-xs text-neg">
          {t("Save failed.", "The frog is annoyed (your draft is safe).")}{" "}
          {error}
        </p>
      )}

      {!draftReady && (
        <p
          className={cn(
            "mt-3 text-xs",
            detailBroken ? "text-neg" : "text-soft",
          )}
          data-testid="routine-detail-status"
        >
          {detailBroken
            ? t(
                "Couldn't load this routine. Reload before editing it — saving now would overwrite it.",
                "The frog lost this routine. Reload before you edit it.",
              )
            : t("Loading this routine…", "The frog is reading your routine…")}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {list.map((d, i) => {
          const fields = TYPE_FIELDS[d.exerciseType];
          const linkedWithNext =
            i + 1 < list.length &&
            d.supersetGroup != null &&
            list[i + 1].supersetGroup === d.supersetGroup;
          return (
            <div
              key={d.key}
              className={cn(
                "rounded-lg border border-border bg-surface p-3",
                supersetClass(d.supersetGroup),
              )}
              data-testid={`routine-ex-${i}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium">
                  {d.name}
                </span>
                <ExerciseMenu
                  index={i}
                  hasNext={i + 1 < list.length}
                  linkedWithNext={linkedWithNext}
                  canMoveUp={i > 0}
                  canMoveDown={i < list.length - 1}
                  setsLaterality={d.sets[0]?.laterality ?? "bilateral"}
                  onSetLaterality={(l) =>
                    setDrafts((prev) =>
                      (prev ?? []).map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              sets: x.sets.map((s) => ({
                                ...s,
                                laterality: l,
                              })),
                            }
                          : x,
                      ),
                    )
                  }
                  onAddWarmup={() =>
                    patchExercise(i, {
                      sets: [
                        { ...inheritedSet(d.sets[0]), setType: "warmup" },
                        ...d.sets,
                      ],
                    })
                  }
                  onToggleSuperset={() => toggleSupersetWithNext(i)}
                  onMove={(dir) => move(i, dir)}
                  onRemove={() =>
                    setDrafts((prev) => (prev ?? []).filter((_, j) => j !== i))
                  }
                />
              </div>

              <div className="mt-2">
                <Input
                  placeholder="Exercise note (shows every session)"
                  value={d.note}
                  onChange={(e) => patchExercise(i, { note: e.target.value })}
                  className="h-8 w-full text-xs"
                  data-testid={`routine-ex-${i}-note`}
                />
              </div>

              {/* The machine chip — the routine editor's twin of the session
                  block-header chip (parity rule): attach the remembered
                  machine here so a routine-started session starts with it.
                  Edits the exercise row, so the same setup appears in every
                  future session. */}
              <RoutineMachineChip
                exercise={byId.get(d.exerciseId)}
                machines={machines}
                index={i}
                onPick={(mid) => attachMachine(i, mid)}
              />

              <div className={cn("num mt-2 text-2xs text-faint", ROW_GRID)}>
                <span>SET</span>
                {fields.reps ? (
                  <span>RIR</span>
                ) : fields.duration && !fields.weight ? (
                  <span>TIME</span>
                ) : (
                  <span />
                )}
                {fields.reps ? (
                  <span>MIN</span>
                ) : fields.distance ? (
                  <span>{unit === "kg" ? "KM" : "MI"}</span>
                ) : fields.weight && fields.duration ? (
                  <span>TIME</span>
                ) : (
                  <span />
                )}
                <span />
                <span />
              </div>

              {d.sets.map((s, si) => (
                <div
                  key={s.key}
                  className={cn(
                    "-mx-3 border-t border-border px-3",
                    ROW_GRID,
                    si % 2 === 0 ? "bg-surface" : "bg-surface-2",
                  )}
                >
                  <SetTypeCell
                    setType={s.setType}
                    index={si}
                    onChange={(t) => patchSet(i, si, { setType: t })}
                    testId={`routine-ex-${i}-set-${si}-type`}
                  />
                  {fields.reps ? (
                    <div className="flex items-center gap-1">
                      <Field
                        inputMode="numeric"
                        placeholder="RIR"
                        value={s.rirMin}
                        onChange={(e) =>
                          patchSet(i, si, { rirMin: e.target.value })
                        }
                        className="flex-1 min-w-0"
                        data-testid={`routine-ex-${i}-set-${si}-rirmin`}
                      />
                      <span className="text-2xs text-faint">–</span>
                      <Field
                        inputMode="numeric"
                        placeholder="RIR"
                        title="Target RIR range max"
                        value={s.rirMax}
                        onChange={(e) =>
                          patchSet(i, si, { rirMax: e.target.value })
                        }
                        className="flex-1 min-w-0"
                        data-testid={`routine-ex-${i}-set-${si}-rirmax`}
                      />
                    </div>
                  ) : fields.duration && !fields.weight ? (
                    <Field
                      inputMode="numeric"
                      placeholder="mm:ss"
                      value={s.duration}
                      onChange={(e) =>
                        patchSet(i, si, { duration: e.target.value })
                      }
                    />
                  ) : (
                    <span />
                  )}
                  {fields.reps ? (
                    <div className="flex items-center gap-1">
                      <Field
                        inputMode="numeric"
                        placeholder="min"
                        value={s.reps}
                        onChange={(e) =>
                          patchSet(i, si, { reps: e.target.value })
                        }
                        className="flex-1 min-w-0"
                        data-testid={`routine-ex-${i}-set-${si}-reps`}
                      />
                      <span className="text-2xs text-faint">–</span>
                      <Field
                        inputMode="numeric"
                        placeholder="max"
                        title="Optional rep-range max"
                        value={s.repsMax}
                        onChange={(e) =>
                          patchSet(i, si, { repsMax: e.target.value })
                        }
                        className="flex-1 min-w-0"
                        data-testid={`routine-ex-${i}-set-${si}-repsmax`}
                      />
                    </div>
                  ) : fields.distance ? (
                    <Field
                      inputMode="decimal"
                      placeholder="—"
                      value={s.distance}
                      onChange={(e) =>
                        patchSet(i, si, { distance: e.target.value })
                      }
                    />
                  ) : fields.weight && fields.duration ? (
                    <Field
                      inputMode="numeric"
                      placeholder="mm:ss"
                      value={s.duration}
                      onChange={(e) =>
                        patchSet(i, si, { duration: e.target.value })
                      }
                    />
                  ) : (
                    <span />
                  )}
                  {/* In-row B/L·R — the session parity control (Option A ·
                      Anchor): visible on every set row, one tap flips just
                      this set. Replaces the per-set ⋯ menu's laterality
                      section. */}
                  <SegmentedLaterality
                    value={s.laterality}
                    onChange={(l) => patchSet(i, si, { laterality: l })}
                    testId={`routine-ex-${i}-set-${si}-laterality`}
                  />
                  <SetMenu
                    index={i}
                    si={si}
                    onRemove={() =>
                      patchExercise(i, {
                        sets: d.sets.filter((_, k) => k !== si),
                      })
                    }
                  />
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 ml-10"
                onClick={() =>
                  patchExercise(i, {
                    sets: [...d.sets, inheritedSet(d.sets.at(-1))],
                  })
                }
                data-testid={`routine-ex-${i}-add-set`}
              >
                <Plus className="size-4" /> Add set
              </Button>
            </div>
          );
        })}
      </div>

      {unmatched.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-warn">
            {t(
              `${unmatched.length} pasted line${unmatched.length === 1 ? "" : "s"} didn't match a library exercise.`,
              `The frog couldn't place ${unmatched.length} line${unmatched.length === 1 ? "" : "s"}. Pick one or teach it a name.`,
            )}
          </p>
          {unmatched.map((u) => (
            <div
              key={u.key}
              className="rounded-lg border border-border border-l-2 border-l-warn bg-surface p-3"
              data-testid={`routine-unmatched-${u.key}`}
            >
              {/* Stacked on phones: the name is what the user is resolving,
                and three actions on one row leave it unreadable at 375px. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {u.rawName}{" "}
                  <span className="num text-2xs text-faint">
                    {u.sets}×{u.reps ?? "?"}
                    {u.repsMax ? `–${u.repsMax}` : ""}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => pickManually(u)}
                    data-testid={`routine-unmatched-${u.key}-pick`}
                  >
                    Pick manually
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => createFromUnmatched(u)}
                    data-testid={`routine-unmatched-${u.key}-create`}
                  >
                    Create exercise…
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Dismiss"
                    onClick={() =>
                      setUnmatched((prev) =>
                        prev.filter((x) => x.key !== u.key),
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {unparsed.length > 0 && (
        <div
          className="mt-4 rounded-lg border border-border bg-surface p-3"
          data-testid="routine-unparsed"
        >
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-soft">
              {t(
                `${unparsed.length} pasted line${unparsed.length === 1 ? "" : "s"} had no set×rep to read and ${unparsed.length === 1 ? "was" : "were"} left out.`,
                `The frog couldn't read ${unparsed.length} line${unparsed.length === 1 ? "" : "s"} — no set×rep in ${unparsed.length === 1 ? "it" : "them"}.`,
              )}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss unreadable lines"
              onClick={() => setUnparsed([])}
            >
              <X className="size-4" />
            </Button>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {unparsed.map((line) => (
              <li key={line.key} className="truncate text-xs text-faint">
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {overflowCount > 0 && (
        <div
          className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-surface p-3"
          data-testid="routine-paste-overflow"
        >
          <p className="flex-1 text-xs text-soft">
            {t(
              `Stopped after ${MAX_PARSED_EXERCISES} exercises per paste — ${overflowCount} more line${overflowCount === 1 ? "" : "s"} ${overflowCount === 1 ? "was" : "were"} left out. Paste the rest separately.`,
              `The frog stopped at ${MAX_PARSED_EXERCISES} exercises — ${overflowCount} more line${overflowCount === 1 ? "" : "s"} for another paste.`,
            )}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss overflow notice"
            onClick={() => setOverflowCount(0)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setPicking(true)}
          disabled={!draftReady}
          data-testid="routine-add-exercise-btn"
        >
          <Plus className="size-4" /> Add exercise
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setPasteOpen(true)}
          disabled={!draftReady}
          data-testid="routine-paste-btn"
        >
          <ClipboardPaste className="size-4" /> Paste workout
        </Button>
      </div>

      <Dialog
        open={picking}
        onOpenChange={(o) => {
          setPicking(o);
          if (!o) {
            setPickFor(null);
            setQuery("");
            setMuscle("");
          }
        }}
      >
        <DialogContent
          title={pickFor ? "Match exercise" : "Add exercise"}
          className="max-h-[80vh] overflow-y-auto"
        >
          {pickFor && (
            <p className="mb-2 text-2xs text-faint">
              Matching "{pickFor.rawName}"
            </p>
          )}
          <ExerciseFilterBar
            query={query}
            onQuery={setQuery}
            muscle={muscle}
            onMuscle={setMuscle}
            autoFocus
          />
          <div className="mt-2 flex flex-col gap-3">
            {grouped.length === 0 && (
              <p className="text-xs text-faint">
                {t(
                  "No exercises match your search.",
                  "No exercises match. The frog refuses to speculate.",
                )}
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.key}>
                <p className="text-2xs font-medium tracking-widest text-faint uppercase">
                  {g.label}
                </p>
                <div className="mt-1 flex flex-col">
                  {g.items.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      disabled={pendingExercises.has(e.id)}
                      title={
                        pendingExercises.has(e.id)
                          ? `${e.name} is still saving`
                          : undefined
                      }
                      className="flex h-10 items-center rounded-md px-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                      onClick={() => selectFromPicker(e)}
                      data-testid={`routine-pick-${e.name}`}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ExerciseEditor
        open={!!creatingFor}
        onOpenChange={(o) => !o && setCreatingFor(null)}
        mode="create"
        initialName={creatingFor?.rawName ?? ""}
        onCreated={(id) => {
          // The pasted line, not the name the user saved: the unmatched list
          // is keyed by raw line, so a corrected spelling in the sheet would
          // match none of it and silently resolve nothing.
          if (creatingFor)
            setPendingTwinCreate({ id, forRawName: creatingFor.rawName });
        }}
      />

      <Dialog
        open={pasteOpen}
        onOpenChange={(o) => {
          setPasteOpen(o);
          if (!o) {
            setPasteText("");
            setPasteError(null);
          }
        }}
      >
        <DialogContent
          title="Paste workout"
          className="max-h-[80vh] overflow-y-auto"
        >
          <p className="text-xs text-faint">
            {t(
              'Paste or type a routine, one exercise per line — e.g. "Bench press 4x8". Unmatched exercises can be picked or created afterward.',
              'Feed the frog your scrawl, one exercise per line — e.g. "Bench press 4x8". Anything it can\'t place gets sorted out after.',
            )}
          </p>
          <textarea
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={
              "Push day\nBench press 4x8\nIncline dumbbell press 3x10\nTricep pushdown 3x12"
            }
            className="mt-2 w-full resize-y rounded-md border border-border-strong bg-surface-2 px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring/70"
            data-testid="routine-paste-textarea"
          />
          {pasteError && <p className="mt-2 text-xs text-neg">{pasteError}</p>}
          {libraryFailed && (
            <p
              className="mt-2 text-xs text-neg"
              data-testid="routine-library-status"
            >
              {t(
                "Couldn't load your exercise library. Reload before pasting a workout.",
                "The frog lost your library. Reload before you paste.",
              )}
            </p>
          )}
          <Button
            variant="primary"
            className="mt-2 w-full"
            onClick={parsePaste}
            disabled={!pasteText.trim() || !libraryLoaded || !draftReady}
            data-testid="routine-paste-parse-btn"
          >
            {libraryLoaded && draftReady
              ? "Parse"
              : libraryFailed
                ? "Library unavailable"
                : "Loading…"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The exercise header's ⋯ menu (note 10: parity with the session's BlockMenu
// — move-up/down, superset, warm-up and remove moved in here so the header
// keeps only the name + ⋯). The menu mirrors the session's popup styling:
// `floating` surface, label sections, hover rows. Exercise-level laterality
// writes to every set of the exercise (the session's BlockMenu makes "every
// set of the exercise unilateral (as before)", same bulk semantics) — the
// per-set rows can still diverge via their own ⋯ menu.
function ExerciseMenu({
  index,
  hasNext,
  linkedWithNext,
  canMoveUp,
  canMoveDown,
  setsLaterality,
  onSetLaterality,
  onAddWarmup,
  onToggleSuperset,
  onMove,
  onRemove,
}: {
  index: number;
  hasNext: boolean;
  linkedWithNext: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  setsLaterality: SetLaterality;
  onSetLaterality: (l: SetLaterality) => void;
  onAddWarmup: () => void;
  onToggleSuperset: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const labelCls =
    "px-3 pt-2 pb-1 text-2xs font-medium tracking-widest text-faint uppercase";
  const itemCls =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-soft";

  return (
    <span className="relative">
      <IconButton
        aria-label="Exercise options"
        onClick={() => setOpen((o) => !o)}
        data-testid={`routine-ex-${index}-menu`}
      >
        <MoreVertical className="size-4" />
      </IconButton>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            className="floating absolute top-full right-0 z-20 mt-1 max-h-80 min-w-52 overflow-y-auto py-1"
            data-testid={`routine-ex-${index}-menu-popup`}
          >
            <p className={labelCls}>Superset</p>
            <button
              type="button"
              onClick={() => {
                onToggleSuperset();
                close();
              }}
              disabled={!hasNext && !linkedWithNext}
              data-testid={`routine-ex-${index}-superset`}
              className={itemCls}
            >
              <Link2 className="size-3.5 shrink-0 text-faint" />
              {linkedWithNext ? "Remove from superset" : "Superset with next"}
            </button>
            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => {
                onAddWarmup();
                close();
              }}
              data-testid={`routine-ex-${index}-warmup`}
              className={itemCls}
            >
              <Flame className="size-3.5 shrink-0 text-warn" />
              Add warm-up set
            </button>
            <div className="border-t border-border" />
            <p className={labelCls}>Laterality</p>
            {(
              [
                ["bilateral", LATERALITY_LABELS.bilateral],
                ["unilateral", LATERALITY_LABELS.unilateral],
              ] as const
            ).map(([l, label]) => (
              <button
                key={l}
                type="button"
                onClick={() => {
                  onSetLaterality(l);
                  close();
                }}
                data-testid={`routine-ex-${index}-laterality-${l}`}
                className={itemCls}
              >
                <span className="flex flex-col">
                  {label}
                  <span className="text-2xs font-normal normal-case tracking-normal text-faint">
                    {LATERALITY_EXPLAINERS[l]}
                  </span>
                </span>
                {setsLaterality === l && (
                  <Check className="ml-auto size-3.5 shrink-0 text-accent" />
                )}
              </button>
            ))}
            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => {
                onMove(-1);
                close();
              }}
              disabled={!canMoveUp}
              data-testid={`routine-ex-${index}-move-up`}
              className={itemCls}
            >
              <ArrowUp className="size-3.5 shrink-0 text-faint" />
              Move up
            </button>
            <button
              type="button"
              onClick={() => {
                onMove(1);
                close();
              }}
              disabled={!canMoveDown}
              data-testid={`routine-ex-${index}-move-down`}
              className={itemCls}
            >
              <ArrowDown className="size-3.5 shrink-0 text-faint" />
              Move down
            </button>
            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => {
                onRemove();
                close();
              }}
              data-testid={`routine-ex-${index}-remove`}
              className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg"
            >
              <Trash2 className="size-3.5 shrink-0 text-faint group-hover:text-neg" />
              Remove exercise
            </button>
          </div>
        </>
      )}
    </span>
  );
}

// The per-set row's small ⋯ menu — Remove set only now (the per-set
// laterality moved to the in-row B/L·R segmented control, Option A ·
// Anchor). A unilateral routine set prescribes one pair — two sides, reps
// per side — exactly how the session logs it.
function SetMenu({
  index,
  si,
  onRemove,
}: {
  index: number;
  si: number;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <span className="relative flex justify-self-end">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Set options"
        onClick={() => setOpen((o) => !o)}
        data-testid={`routine-ex-${index}-set-${si}-menu`}
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            className="floating absolute top-full right-0 z-20 mt-1 min-w-44 py-1"
            data-testid={`routine-ex-${index}-set-${si}-menu-popup`}
          >
            <button
              type="button"
              onClick={() => {
                onRemove();
                close();
              }}
              data-testid={`routine-ex-${index}-set-${si}-remove`}
              className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-soft transition-colors duration-150 hover:bg-surface-hover hover:text-neg"
            >
              <Trash2 className="size-3.5 shrink-0 text-faint group-hover:text-neg" />
              Remove set
            </button>
          </div>
        </>
      )}
    </span>
  );
}

// The machine chip on a routine exercise card — the editor's twin of the
// session block-header chip (AGENTS.md parity rule 2026-08-08): empty reads
// "Attach machine", attached shows the remembered setup. Tap opens the shared
// MachineAttachDialog (catalog search + "from your gym"); the write lands on
// exercises.machine_id via the card's attachMachine handler, so a
// routine-started session picks the machine up from the exercise row.
function RoutineMachineChip({
  exercise,
  machines,
  index,
  onPick,
}: {
  exercise: Exercise | undefined;
  machines: Machine[];
  index: number;
  onPick: (machineId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const machine = exercise
    ? machines.find((m) => m.id === exercise.machineId)
    : undefined;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={machine ? "Machine setup" : "Attach a machine"}
        className={cn(
          "mt-2 flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-2xs transition-colors duration-100",
          machine
            ? "border-border bg-surface-2 text-soft hover:bg-surface-hover"
            : "border-dashed border-border-strong bg-surface-2 text-soft hover:bg-surface-hover",
        )}
        data-testid={`routine-ex-${index}-machine`}
      >
        <Wrench className="size-3.5 shrink-0 text-faint" />
        <span className="truncate">
          {machine
            ? `${machine.brand ? `${machine.brand} · ` : ""}${machine.name}`
            : "Attach machine"}
        </span>
      </button>
      <MachineAttachDialog
        blockName={exercise?.name ?? "this exercise"}
        open={open}
        onOpenChange={setOpen}
        onAttach={onPick}
      />
    </>
  );
}
