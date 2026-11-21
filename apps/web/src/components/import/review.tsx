import {
  draftStats,
  draftToImportedSessions,
  type Exercise,
  type ExerciseMatch,
  findDuplicateSessions,
  type ImportDraft,
  type ImportDraftExercise,
  type ImportDraftSession,
  type ImportDraftSet,
  type ImportResult,
  isConfidentMatch,
  isLowConfidence,
  matchExerciseName,
  type NewRoutineInput,
  setDraftUnit,
  unitLabel,
  type WeightUnit,
  weightToKg,
} from "@frog/core";
import { Plus, Trash } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExerciseEditor } from "@/components/exercise-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { usePendingExercises } from "@/lib/pending-exercises";
import { useAllSessions } from "@/lib/profile-queries";
import { useExercises } from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import { userFacingRepoError } from "@/lib/repo-error";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

/**
 * The one shared review screen for every import path (files, pasted text,
 * screenshots). Contract — keep it this small:
 *
 *   <ImportReview draft={draft} onDraftChange={setDraft}
 *                 onCancel={() => …} onDone={(result) => …} />
 *
 * `draft` is an ImportDraft (packages/core/src/import/draft.ts). The screen
 * edits it in place through `onDraftChange`, matches exercise names through
 * `matchExerciseName`, flags duplicates against History, and writes NOTHING
 * until the user taps Import. frog-import-ocr only has to produce an
 * ImportDraft (usually `parseWorkoutText(ocrText, { ocr: true })`) and render
 * this component; it must not reimplement matching, dedupe or commit.
 */
export type ImportReviewProps = {
  draft: ImportDraft;
  onDraftChange: (draft: ImportDraft) => void;
  onCancel: () => void;
  onDone: (summary: ReviewSummary) => void;
};

export type ReviewSummary = {
  sessions: ImportResult;
  routines: number;
};

type Resolution =
  | { kind: "match"; id: string; name: string }
  | { kind: "create" };

const norm = (s: string) => s.toLowerCase().trim();

function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const LOW = "bg-attn-soft";

const numText = (n: number | null) => (n == null ? "" : String(n));

/** Keeps the typed text (so "102." survives) and commits each parseable value. */
function NumField({
  value,
  label,
  className,
  onCommit,
}: {
  value: number | null;
  label: string;
  className: string;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(numText(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(numText(value));
  }
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className={className}
      value={text}
      placeholder="–"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const v = t.trim().replace(",", ".");
        const n = v === "" ? null : Number(v);
        if (n != null && Number.isNaN(n)) return;
        setShown(n);
        onCommit(n);
      }}
    />
  );
}

function SetRow({
  set,
  unit,
  onChange,
  onRemove,
}: {
  set: ImportDraftSet;
  unit: WeightUnit;
  onChange: (s: ImportDraftSet) => void;
  onRemove: () => void;
}) {
  const low = isLowConfidence(set.confidence);
  const numField = (
    value: number | null,
    label: string,
    key: "weight" | "reps" | "rir",
    width: string,
  ) => (
    <NumField
      value={value}
      label={label}
      className={cn("num", width, low && "bg-transparent")}
      onCommit={(n) =>
        onChange({
          ...set,
          [key]: n,
          ...(key === "rir" ? { rirMin: null, rirMax: null, rpe: null } : {}),
          confidence: 1,
          flags: [],
        })
      }
    />
  );
  return (
    <li
      className={cn("rounded-sm px-2 py-1.5", low && LOW)}
      data-testid="review-set"
      data-low={low ? "1" : undefined}
    >
      <div className="flex items-center gap-1.5">
        {set.setType === "warmup" ? (
          <Badge className="w-9 justify-center">W</Badge>
        ) : set.side ? (
          <Badge className="w-9 justify-center">
            {set.side === "left" ? "L" : "R"}
          </Badge>
        ) : (
          <span className="w-9 shrink-0" />
        )}
        {numField(
          set.weight,
          `Weight (${unitLabel(unit)})`,
          "weight",
          "w-[5.5rem]",
        )}
        <span className="text-faint">×</span>
        {numField(set.reps, "Reps", "reps", "w-16")}
        <span className="text-2xs text-faint">RIR</span>
        {numField(set.rir, "RIR", "rir", "w-14")}
        <IconButton
          aria-label="Remove set"
          danger
          className="ml-auto"
          onClick={onRemove}
        >
          <Trash className="size-4" />
        </IconButton>
      </div>
      {low && set.flags.length > 0 && (
        <p className="mt-1 text-2xs text-attn">{set.flags.join(" · ")}</p>
      )}
    </li>
  );
}

function ExercisePickerDialog({
  open,
  onOpenChange,
  exercises,
  seed,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  exercises: Exercise[];
  seed: string;
  onPick: (e: Exercise) => void;
}) {
  const [q, setQ] = useState(seed);
  const shown = useMemo(() => {
    const t = norm(q);
    const list = t
      ? exercises.filter(
          (e) =>
            norm(e.name).includes(t) ||
            (e.aliases ?? []).some((a) => norm(a).includes(t)),
        )
      : exercises;
    return list.slice(0, 30);
  }, [q, exercises]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Pick an exercise">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your library"
          aria-label="Search exercises"
        />
        <ul className="mt-3 space-y-0.5">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex h-10 w-full items-center rounded-sm bg-surface-2 px-3 text-left text-sm hover:bg-surface-hover"
                onClick={() => onPick(e)}
                data-testid={`review-pick-${e.name}`}
              >
                {e.name}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-1 py-3 text-xs text-faint">No matches.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ExerciseBlock({
  ex,
  unit,
  resolution,
  inLibrary,
  onResolve,
  onCreate,
  onPickOpen,
  onChange,
  onRemove,
}: {
  ex: ImportDraftExercise;
  unit: WeightUnit;
  resolution: Resolution;
  /** Raw name already names a library exercise, so "new" would merge into it. */
  inLibrary: boolean;
  onResolve: (r: Resolution) => void;
  onCreate: () => void;
  onPickOpen: () => void;
  onChange: (e: ImportDraftExercise) => void;
  onRemove: () => void;
}) {
  const low = isLowConfidence(ex.confidence);
  return (
    <div
      className="mt-2 rounded-md bg-surface-2 p-2"
      data-testid="review-exercise"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{ex.rawName}</p>
          {resolution.kind === "match" ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-soft">
              <Badge tone="accent">Matched</Badge>
              <span className="truncate" data-testid="review-matched-name">
                {resolution.name}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-soft">
              <Badge tone="warn">New exercise</Badge>
              <span>Frog will add it to your library</span>
            </p>
          )}
        </div>
        <IconButton aria-label="Remove exercise" danger onClick={onRemove}>
          <Trash className="size-4" />
        </IconButton>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={onPickOpen}
          data-testid="review-pick-btn"
        >
          Pick existing
        </Button>
        {resolution.kind === "match" ? (
          !inLibrary && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onResolve({ kind: "create" })}
            >
              Add as new instead
            </Button>
          )
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCreate}
            data-testid="review-create-btn"
          >
            Set it up…
          </Button>
        )}
      </div>
      <ul className="mt-2 space-y-0.5">
        {ex.sets.map((s, i) => (
          <SetRow
            key={s.id}
            set={s}
            unit={unit}
            onChange={(ns) =>
              onChange({
                ...ex,
                sets: ex.sets.map((x, j) => (j === i ? ns : x)),
                confidence: 1,
              })
            }
            onRemove={() =>
              onChange({ ...ex, sets: ex.sets.filter((_, j) => j !== i) })
            }
          />
        ))}
      </ul>
      {low && ex.sets.length === 0 && (
        <p className="mt-1 text-2xs text-attn">
          No sets read for this exercise.
        </p>
      )}
    </div>
  );
}

export function ImportReview({
  draft,
  onDraftChange,
  onCancel,
  onDone,
}: ImportReviewProps) {
  const repo = useRepo();
  const qc = useQueryClient();
  const { t } = useVoice();
  const {
    data: exercises = [],
    isSuccess: libraryOk,
    isError: libraryFailed,
  } = useExercises();
  const {
    data: sessions = [],
    isSuccess: historyOk,
    isError: historyFailed,
  } = useAllSessions();
  // A failed library/history load must never lock the Import button: names
  // then just become new custom exercises (the server dedupes by name).
  const libraryLoaded = libraryOk || libraryFailed;
  const historyLoaded = historyOk || historyFailed;
  const pending = usePendingExercises();

  const duplicates = useMemo(
    () => findDuplicateSessions(draft.sessions, sessions),
    [draft.sessions, sessions],
  );

  // Exercise resolution, keyed by lower-cased raw name (one answer per name
  // across the whole draft). Auto-matches only when confident and unambiguous;
  // everything else becomes "new exercise", which the importer creates.
  const [overrides, setOverrides] = useState<Map<string, Resolution>>(
    new Map(),
  );
  const autoResolution = useMemo(() => {
    const m = new Map<string, Resolution>();
    const names = [
      ...draft.sessions.flatMap((s) => s.exercises.map((e) => e.rawName)),
      ...draft.routines.flatMap((r) => r.exercises.map((e) => e.rawName)),
    ];
    for (const n of names) {
      const k = norm(n);
      if (m.has(k)) continue;
      const hit: ExerciseMatch | null = matchExerciseName(n, exercises);
      m.set(
        k,
        hit && hit.tied.length === 1 && isConfidentMatch(hit)
          ? { kind: "match", id: hit.id, name: hit.name }
          : { kind: "create" },
      );
    }
    return m;
  }, [draft.sessions, draft.routines, exercises]);
  const resolve = (raw: string): Resolution =>
    overrides.get(norm(raw)) ??
    autoResolution.get(norm(raw)) ?? { kind: "create" };
  const setResolution = (raw: string, r: Resolution) =>
    setOverrides((prev) => new Map(prev).set(norm(raw), r));

  // Sessions the user switched off; duplicates start switched off.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [dupeOn, setDupeOn] = useState<Set<string>>(new Set());
  const included = (s: ImportDraftSession) =>
    !skipped.has(s.id) && (!duplicates.has(s.id) || dupeOn.has(s.id));
  const toggleSession = (s: ImportDraftSession, on: boolean) => {
    if (duplicates.has(s.id))
      setDupeOn((p) => {
        const n = new Set(p);
        if (on) n.add(s.id);
        else n.delete(s.id);
        return n;
      });
    else
      setSkipped((p) => {
        const n = new Set(p);
        if (on) n.delete(s.id);
        else n.add(s.id);
        return n;
      });
  };

  const [pickFor, setPickFor] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (fn: (d: ImportDraft) => ImportDraft) =>
    onDraftChange(fn(draft));
  const mapSession = (
    id: string,
    fn: (s: ImportDraftSession) => ImportDraftSession,
  ) =>
    edit((d) => ({
      ...d,
      sessions: d.sessions.map((s) => (s.id === id ? fn(s) : s)),
    }));

  const chosen = draft.sessions.filter(included);
  // No date in the source: save as today (editable above) rather than block.
  const undated = chosen.filter((s) => s.startedAt == null);
  const stats = draftStats({ ...draft, sessions: chosen });
  const newNames = new Set<string>();
  for (const e of [
    ...chosen.flatMap((s) => s.exercises),
    ...draft.routines.flatMap((r) => r.exercises),
  ])
    if (resolve(e.rawName).kind === "create") newNames.add(norm(e.rawName));
  const canImport =
    !busy &&
    libraryLoaded &&
    historyLoaded &&
    pending.size === 0 &&
    chosen.length + draft.routines.length > 0;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const nameFor = (raw: string) => {
        const r = resolve(raw);
        return r.kind === "match" ? r.name : raw.trim();
      };
      const now = Date.now();
      let n = 0;
      const dated: ImportDraft = {
        ...draft,
        sessions: draft.sessions.map((s) =>
          s.startedAt == null ? { ...s, startedAt: now - 60_000 * n++ } : s,
        ),
      };
      const payload = draftToImportedSessions(dated, nameFor, included);
      const result: ImportResult =
        payload.length > 0
          ? await repo.importSessions(payload)
          : { imported: 0, skipped: 0, sets: 0, exercisesCreated: 0 };
      let routines = 0;
      for (const r of draft.routines) {
        const ids: NewRoutineInput["exercises"] = [];
        for (const [i, e] of r.exercises.entries()) {
          const res = resolve(e.rawName);
          const exerciseId =
            res.kind === "match"
              ? res.id
              : (
                  exercises.find((x) => norm(x.name) === norm(e.rawName)) ??
                  (await repo.createExercise(e.rawName.trim()))
                ).id;
          ids.push({
            exerciseId,
            orderIndex: i,
            sets: Array.from({ length: Math.max(1, e.sets) }, (_, n) => ({
              setNo: n,
              targetReps: e.reps,
              targetRepsMax: e.repsMax,
              targetWeightKg: weightToKg(e.weight, draft.unit),
            })),
          });
        }
        await repo.createRoutine({
          name: r.name?.trim() || "Imported routine",
          exercises: ids,
        });
        routines++;
      }
      await qc.invalidateQueries();
      onDone({ sessions: result, routines });
    } catch (e) {
      setError(userFacingRepoError(e));
      setBusy(false);
    }
  }

  const picker = pickFor;
  return (
    <div data-testid="import-review">
      <div className="rounded-md bg-surface p-4">
        <h2 className="text-sm font-medium">Review before importing</h2>
        <p className="num mt-1 text-xs text-soft" data-testid="review-counts">
          {stats.sessions} sessions · {stats.routines} routines · {stats.sets}{" "}
          sets · {stats.exercises} exercises
        </p>
        <p className="mt-1 text-2xs text-faint">
          Nothing is saved until you tap Import. Highlighted rows are guesses;
          fix or remove them.
        </p>
        {draft.unitDetected ? (
          <p className="mt-3 text-xs text-soft" data-testid="review-unit-read">
            Weights in {unitLabel(draft.unit)} · Unit read from{" "}
            {draft.source === "text" ? "text" : "file"}
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-xs text-soft">
            <span>Weights are in</span>
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={draft.unit === u}
                onClick={() => onDraftChange(setDraftUnit(draft, u))}
                data-testid={`review-unit-${u}`}
                className={cn(
                  "h-10 rounded-sm px-3 text-xs font-semibold md:h-8",
                  draft.unit === u
                    ? "bg-accent-soft text-accent-ink"
                    : "bg-secondary/60 text-on-secondary",
                )}
              >
                {u}
              </button>
            ))}
            <Badge tone="warn">Guessed</Badge>
          </div>
        )}
        {draft.notes.map((n) => (
          <p
            key={n}
            className="mt-2 rounded-sm bg-attn-soft px-3 py-2 text-2xs text-attn"
          >
            {n}
          </p>
        ))}
      </div>

      {draft.sessions.map((s) => {
        const dupe = duplicates.get(s.id);
        const on = included(s);
        const low = isLowConfidence(s.confidence) || s.startedAt == null;
        return (
          <section
            key={s.id}
            className={cn(
              "mt-3 rounded-md bg-surface p-3",
              !on && "opacity-60",
            )}
            data-testid="review-session"
            data-low={low ? "1" : undefined}
          >
            <div className="flex items-center gap-2">
              <label
                htmlFor={`inc-${s.id}`}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2"
              >
                <Checkbox
                  id={`inc-${s.id}`}
                  checked={on}
                  onCheckedChange={(c) => toggleSession(s, c === true)}
                  aria-label="Include this session"
                  data-testid="review-session-include"
                />
                <span className="truncate text-sm font-medium">
                  {s.title ||
                    (s.startedAt != null
                      ? formatDate(s.startedAt)
                      : "Untitled session")}
                </span>
              </label>
              {dupe && (
                <Badge tone="warn" data-testid="review-dupe">
                  {dupe === "exact"
                    ? "Already in History"
                    : "Same day in History"}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                aria-label="Session name"
                className="min-w-0 flex-1 basis-40"
                placeholder="Session name"
                value={s.title ?? ""}
                onChange={(e) =>
                  mapSession(s.id, (x) => ({
                    ...x,
                    title: e.target.value || null,
                  }))
                }
              />
              <Input
                type="datetime-local"
                aria-label="Date and time"
                data-testid="review-date"
                className={cn(
                  "min-w-0 flex-1 basis-48",
                  s.startedAt == null && "border-neg",
                )}
                value={toLocalInput(s.startedAt)}
                onChange={(e) => {
                  const ms = e.target.value
                    ? new Date(e.target.value).getTime()
                    : null;
                  mapSession(s.id, (x) => ({
                    ...x,
                    startedAt: Number.isNaN(ms) ? x.startedAt : ms,
                    hasTime: true,
                    confidence:
                      ms == null ? x.confidence : Math.max(x.confidence, 1),
                    flags: [],
                  }));
                }}
              />
            </div>
            {low && s.flags.length > 0 && (
              <p className="mt-1.5 text-2xs text-attn">{s.flags.join(" · ")}</p>
            )}
            {s.exercises.map((e) => (
              <ExerciseBlock
                key={e.id}
                ex={e}
                unit={draft.unit}
                resolution={resolve(e.rawName)}
                inLibrary={exercises.some(
                  (x) => norm(x.name) === norm(e.rawName),
                )}
                onResolve={(r) => setResolution(e.rawName, r)}
                onCreate={() => setCreatingFor(e.rawName)}
                onPickOpen={() => setPickFor(e.rawName)}
                onChange={(ne) =>
                  mapSession(s.id, (x) => ({
                    ...x,
                    exercises: x.exercises.map((y) => (y.id === e.id ? ne : y)),
                  }))
                }
                onRemove={() =>
                  mapSession(s.id, (x) => ({
                    ...x,
                    exercises: x.exercises.filter((y) => y.id !== e.id),
                  }))
                }
              />
            ))}
          </section>
        );
      })}

      {draft.routines.map((r) => (
        <section
          key={r.id}
          className="mt-3 rounded-md bg-surface p-3"
          data-testid="review-routine"
        >
          <p className="text-2xs font-medium tracking-widest text-faint uppercase">
            Routine
          </p>
          <Input
            aria-label="Routine name"
            className="mt-1"
            value={r.name ?? ""}
            placeholder="Routine name"
            onChange={(e) =>
              edit((d) => ({
                ...d,
                routines: d.routines.map((x) =>
                  x.id === r.id ? { ...x, name: e.target.value || null } : x,
                ),
              }))
            }
          />
          {r.exercises.map((e) => {
            const res = resolve(e.rawName);
            return (
              <div
                key={e.id}
                className={cn(
                  "mt-2 flex items-center gap-2 rounded-md bg-surface-2 p-2",
                  isLowConfidence(e.confidence) && LOW,
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{e.rawName}</p>
                  <p className="num text-2xs text-soft">
                    {e.sets} × {e.reps ?? "?"}
                    {e.repsMax ? `–${e.repsMax}` : ""} ·{" "}
                    {res.kind === "match" ? res.name : "new exercise"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPickFor(e.rawName)}
                >
                  Pick
                </Button>
                <IconButton
                  aria-label="Remove exercise"
                  danger
                  onClick={() =>
                    edit((d) => ({
                      ...d,
                      routines: d.routines.map((x) =>
                        x.id === r.id
                          ? {
                              ...x,
                              exercises: x.exercises.filter(
                                (y) => y.id !== e.id,
                              ),
                            }
                          : x,
                      ),
                    }))
                  }
                >
                  <Trash className="size-4" />
                </IconButton>
              </div>
            );
          })}
        </section>
      ))}

      {draft.unparsed.length > 0 && (
        <details
          className="mt-3 rounded-md bg-surface p-3"
          data-testid="review-unparsed"
        >
          <summary className="min-h-10 cursor-pointer text-xs font-medium">
            {draft.unparsed.length} lines not used
          </summary>
          <ul className="mt-1 space-y-0.5 text-2xs text-faint">
            {draft.unparsed.slice(0, 40).map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list of strings
              <li key={i} className="truncate">
                {l}
              </li>
            ))}
          </ul>
        </details>
      )}

      {draft.sessions.length + draft.routines.length === 0 && (
        <p className="mt-3 rounded-md bg-surface p-4 text-xs text-soft">
          {t(
            "Nothing readable in there. Try the paste box with one workout, or check the file.",
            "The frog found nothing to chew on. Try one workout in the paste box.",
          )}
        </p>
      )}

      {undated.length > 0 && (
        <p className="mt-3 text-xs text-soft">
          {undated.length === 1 ? "One session has" : "Some sessions have"} no
          date, so {undated.length === 1 ? "it" : "they"} will be saved as
          today. Change the date above if needed.
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs text-neg" data-testid="review-error">
          {error}
        </p>
      )}

      {newNames.size > 0 && (
        <p className="mt-3 text-xs text-soft" data-testid="review-new-note">
          {newNames.size} new custom exercise{newNames.size === 1 ? "" : "s"}{" "}
          will be created. Tap an exercise above to match an existing one
          instead.
        </p>
      )}

      <div className="sticky bottom-16 z-10 mt-4 flex gap-2 rounded-md bg-surface p-3 shadow-lg md:bottom-4">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Start over
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          disabled={!canImport}
          onClick={() => void confirm()}
          data-testid="review-confirm"
        >
          <Plus className="size-4" />
          {busy
            ? "Importing…"
            : `Import ${stats.sessions + stats.routines} item${stats.sessions + stats.routines === 1 ? "" : "s"}`}
        </Button>
      </div>

      {picker != null && (
        <ExercisePickerDialog
          key={picker}
          open
          onOpenChange={(o) => !o && setPickFor(null)}
          exercises={exercises}
          seed={picker}
          onPick={(e) => {
            setResolution(picker, { kind: "match", id: e.id, name: e.name });
            setPickFor(null);
          }}
        />
      )}
      <ExerciseEditor
        open={creatingFor != null}
        onOpenChange={(o) => !o && setCreatingFor(null)}
        mode="create"
        initialName={creatingFor ?? ""}
        onCreated={(id, name) => {
          if (creatingFor)
            setResolution(creatingFor, { kind: "match", id, name });
        }}
      />
    </div>
  );
}
