import {
  EQUIPMENT_KINDS,
  EQUIPMENT_LABELS,
  EXERCISE_TYPE_LABELS,
  EXERCISE_TYPES,
  type Exercise,
  type ExerciseType,
  formatWeight,
  groupByPrimaryMuscle,
  JOINT_ACTIONS,
  jointActionLabel,
  type Machine,
  type Metric,
  MUSCLES,
  type MuscleTarget,
  muscleLabel,
  type NewMetricInput,
  ratingsForMuscle,
  type Tier,
  tierRank,
} from "@frog/core";
import { Select } from "@radix-ui/themes";
import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  Info,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import {
  ExerciseThumb,
  FavoriteButton,
  JointActionChips,
  JointActionRatings,
  TierBadge,
  TierLegend,
  tierNameClass,
} from "@/components/anatomy-ui";
import {
  ExerciseFilterBar,
  filterExercises,
} from "@/components/exercise-filter";
import { MachinesSection } from "@/components/machines";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  dismissBulkAddFailures,
  finishBulkAddRun,
  isBulkAddRunActive,
  startBulkAddRun,
  useBulkAddFailures,
} from "@/lib/bulk-add-failures";
import { usePendingExercises } from "@/lib/pending-exercises";
import {
  useCreateExercise,
  useCreateMetric,
  useDeleteExercise,
  useDeleteMetric,
  useExerciseFavorites,
  useExercises,
  useLastSets,
  useMachines,
  useMetrics,
  useSeedExercises,
  useSetExerciseClassification,
  useSetExerciseFavorite,
  useSetExerciseMachine,
  useSetExerciseTags,
  useSetExerciseTypeEquipment,
  useSetMetricExercises,
} from "@/lib/queries";
import { useUnit } from "@/lib/settings";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

const TIERS: Tier[] = ["S", "A", "B", "C"];

// One name per line, trimmed, blanks dropped, case-insensitive dedupe within
// the paste (keeps the first occurrence's casing).
function parseBulkExerciseNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names;
}

// Long name lists (duplicates, failures) are summarised — the full list would
// push the dialog's own controls below the scroll fold.
const NAME_PREVIEW = 5;

function previewNames(names: readonly string[]): string {
  const rest = names.length - NAME_PREVIEW;
  const head = names.slice(0, NAME_PREVIEW).join(", ");
  return rest > 0 ? `${head} +${rest} more` : head;
}

// Bulk add has no `Repo` batch call by design, so bound the fan-out here:
// at most this many inserts in flight regardless of how many names were pasted.
const BULK_ADD_CONCURRENCY = 4;

// Resolves to the items whose run failed, in input order.
async function runBounded<T>(
  items: T[],
  run: (item: T) => Promise<unknown>,
): Promise<T[]> {
  const failed = new Set<number>();
  let next = 0;
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      try {
        await run(items[i]);
      } catch {
        failed.add(i);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(BULK_ADD_CONCURRENCY, items.length) }, () =>
      worker(),
    ),
  );
  return items.filter((_, i) => failed.has(i));
}

// Skip layout/paint for off-screen rows (~900 in the seeded library). The
// `auto` keyword lets the browser cache each row's real height after first
// render, so the estimate only matters before a row has ever been shown.
const CV_ROW: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto 88px",
};

const NO_EXERCISES: Exercise[] = [];

export default function LibraryScreen() {
  const { t } = useVoice();
  const { data, isLoading, isError, refetch } = useExercises();
  // Presence, not query status: a failed background refetch (every bulk run
  // ends in one) flips `status` to error while the fetched list is still in
  // `data` and on screen — bulk add only needs the list, not a fresh fetch.
  const exercises = data ?? NO_EXERCISES;
  const libraryLoaded = data !== undefined;
  const { data: metrics = [] } = useMetrics();
  const { data: machines = [] } = useMachines();
  const { data: favorites = [] } = useExerciseFavorites();
  // Rows whose INSERT hasn't landed: favorites, tags, metrics and archive all
  // key off exercise id server-side, so they must wait for the real row.
  const pendingExercises = usePendingExercises();
  const setFavorite = useSetExerciseFavorite();
  const favoriteIds = useMemo(
    () => new Set(favorites.filter((f) => f.favorite).map((f) => f.exerciseId)),
    [favorites],
  );
  const create = useCreateExercise();
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [type, setType] = useState<ExerciseType>("weight_reps");
  const [equipment, setEquipment] = useState("");
  const [query, setQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const setMetrics = useMemo(
    () => metrics.filter((m) => m.scope === "set" && m.ownerId !== null),
    [metrics],
  );
  // Derived off the whole ~900-row library: every optimistic write re-renders
  // this screen, and a bulk run does one write per pasted name.
  const filtered = useMemo(
    () => filterExercises(exercises, query, filterMuscle),
    [exercises, query, filterMuscle],
  );
  const groups = useMemo(() => groupByPrimaryMuscle(filtered), [filtered]);

  // Stable identities keep the memoized rows out of the re-render that every
  // optimistic write triggers — a bulk run does one write per name.
  const favoriteMutate = setFavorite.mutate;
  const onToggleFavorite = useCallback(
    (exerciseId: string, favorite: boolean) =>
      favoriteMutate({ exerciseId, favorite }),
    [favoriteMutate],
  );
  const onToggleExpanded = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    [],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({
      name: trimmed,
      opts: {
        ...(muscle ? { muscleTargets: [{ muscle, tier: "S" }] } : {}),
        exerciseType: type,
        equipment: equipment || null,
      },
    });
    setName("");
    setMuscle("");
    setType("weight_reps");
    setEquipment("");
  }

  function toggleGroup(key: string) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Library</h1>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            placeholder="New exercise name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="exercise-name-input"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={name.trim().length === 0}
            data-testid="add-exercise-btn"
          >
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select.Root
            value={muscle || undefined}
            onValueChange={setMuscle}
            size="2"
          >
            <Select.Trigger
              variant="surface"
              placeholder="Muscle…"
              className="flex-1 basis-28"
              data-testid="exercise-muscle-select"
            />
            <Select.Content>
              {MUSCLES.map((m) => (
                <Select.Item key={m.key} value={m.key}>
                  {m.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={type}
            onValueChange={(v) => setType(v as ExerciseType)}
            size="2"
          >
            <Select.Trigger
              variant="surface"
              className="flex-1 basis-28"
              data-testid="exercise-type-select"
            />
            <Select.Content>
              {EXERCISE_TYPES.map((t) => (
                <Select.Item key={t} value={t}>
                  {EXERCISE_TYPE_LABELS[t]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={equipment || undefined}
            onValueChange={setEquipment}
            size="2"
          >
            <Select.Trigger
              variant="surface"
              placeholder="Equipment…"
              className="flex-1 basis-28"
              data-testid="exercise-equipment-select"
            />
            <Select.Content>
              {EQUIPMENT_KINDS.map((k) => (
                <Select.Item key={k} value={k}>
                  {EQUIPMENT_LABELS[k]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
      </form>

      <BulkAddDialog
        exercises={exercises}
        libraryLoaded={libraryLoaded}
        libraryFailed={isError && !libraryLoaded}
        onRetryLibrary={() => void refetch()}
      />

      <div className="mt-4">
        <ExerciseFilterBar
          query={query}
          onQuery={setQuery}
          muscle={filterMuscle}
          onMuscle={setFilterMuscle}
        />
        <TierLegend className="mt-2" />
      </div>

      <div className="mt-4 overflow-hidden border border-border bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-xs text-faint">
            {t("Loading…", "The frog is thinking…")}
          </p>
        ) : exercises.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-faint">
            {t(
              "No exercises yet. Add your first above.",
              "No specimens yet. Add your first above.",
            )}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-faint">
            {t("No exercises match your search.", "No specimens match.")}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} data-testid={`muscle-group-${group.key}`}>
              <header className="flex h-8 items-center gap-2 border-b border-border bg-surface-2 px-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  data-testid={`muscle-group-toggle-${group.key}`}
                >
                  {collapsed.has(group.key) ? (
                    <ChevronRight className="size-4 shrink-0 text-faint" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-faint" />
                  )}
                  <span className="truncate text-2xs font-medium tracking-widest uppercase">
                    {group.label}
                  </span>
                  <span className="num text-2xs text-faint">
                    {group.items.length}
                  </span>
                </button>
                {group.key !== "other" && (
                  <BestForMuscle muscle={group.key} exercises={exercises} />
                )}
              </header>
              {!collapsed.has(group.key) && (
                <ul className="divide-y divide-border">
                  {group.items.map((ex) => (
                    <ExerciseRow
                      key={ex.id}
                      exercise={ex}
                      groupMuscle={group.key}
                      setMetrics={setMetrics}
                      machines={machines}
                      isFavorite={favoriteIds.has(ex.id)}
                      onToggleFavorite={onToggleFavorite}
                      pending={pendingExercises.has(ex.id)}
                      expanded={expandedId === ex.id}
                      onToggle={onToggleExpanded}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>

      <MachinesSection machines={machines} />
      <MetricsSection metrics={metrics} />
    </div>
  );
}

// Owns its own draft state so typing a paste in here never re-renders the
// ~900-row library list behind the dialog.
function BulkAddDialog({
  exercises,
  libraryLoaded,
  libraryFailed,
  onRetryLibrary,
}: {
  exercises: Exercise[];
  libraryLoaded: boolean;
  libraryFailed: boolean;
  onRetryLibrary: () => void;
}) {
  const create = useCreateExercise();
  const seedExercises = useSeedExercises();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const failed = useBulkAddFailures();

  const existingNames = useMemo(
    () => new Set(exercises.map((e) => e.name.toLowerCase())),
    [exercises],
  );
  const names = parseBulkExerciseNames(text);
  const duplicates = names.filter((n) => existingNames.has(n.toLowerCase()));
  const toCreate = skipDuplicates
    ? names.filter((n) => !existingNames.has(n.toLowerCase()))
    : names;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // `existingNames` is only trustworthy once the list query has resolved —
    // submitting against an empty library would silently create duplicates.
    if (!libraryLoaded || toCreate.length === 0) return;
    setText("");
    setSkipDuplicates(true);
    setOpen(false);
    const runId = startBulkAddRun();
    // Every row lands now; only the inserts behind them are bounded.
    const queued = seedExercises(toCreate);
    void runBounded(queued, ({ id, name }) =>
      // A user change mid-run retires the run: the names belong to the account
      // that pasted them, and the pool would otherwise insert the rest into
      // whoever signed in next.
      isBulkAddRunActive(runId)
        ? create.mutateAsync({ name, opts: { id } })
        : Promise.resolve(),
    ).then((rows) =>
      finishBulkAddRun(
        runId,
        rows.map((r) => r.name),
      ),
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            // Reopening is the retry path the notice points at, so hand the
            // full failed list back as the draft — not the truncated preview.
            if (next) setText(failed.join("\n"));
            else {
              setText("");
              setSkipDuplicates(true);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              // Duplicate detection reads the loaded library, so the dialog
              // stays shut until there is one — otherwise "Skip duplicates"
              // silently protects nothing.
              disabled={!libraryLoaded}
              title={
                libraryLoaded
                  ? undefined
                  : libraryFailed
                    ? "Couldn't load your library — retry first"
                    : "Loading your library…"
              }
              data-testid="bulk-add-exercises-trigger"
            >
              Bulk add
            </Button>
          </DialogTrigger>
          <DialogContent title="Bulk add exercises">
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="One exercise name per line"
                rows={8}
                className="w-full border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-faint"
                data-testid="bulk-add-textarea"
              />
              {duplicates.length > 0 && (
                <p
                  className="text-2xs text-warn"
                  data-testid="bulk-add-duplicate-warning"
                >
                  {duplicates.length} name{duplicates.length === 1 ? "" : "s"}{" "}
                  already in your library: {previewNames(duplicates)}
                </p>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="size-4 accent-(--accent)"
                  data-testid="bulk-add-skip-duplicates"
                />
                Skip duplicates
              </label>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!libraryLoaded || toCreate.length === 0}
                  data-testid="bulk-add-submit"
                >
                  {toCreate.length > 0
                    ? `Add ${toCreate.length} exercise${toCreate.length === 1 ? "" : "s"}`
                    : "Add exercises"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {libraryFailed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetryLibrary}
            data-testid="bulk-add-retry-library"
          >
            Retry loading library
          </Button>
        )}
      </div>
      {failed.length > 0 && (
        <p
          role="status"
          className="mt-1 flex items-start gap-1 text-2xs text-neg"
          data-testid="bulk-add-failures"
        >
          <span className="min-w-0 flex-1">
            {failed.length} name{failed.length === 1 ? "" : "s"} didn't save:{" "}
            {previewNames(failed)}. Open bulk add to try again.
          </span>
          <button
            type="button"
            title="Dismiss"
            onClick={dismissBulkAddFailures}
            className="shrink-0 px-1 text-faint transition-colors duration-100 hover:text-neg"
            data-testid="bulk-add-failures-dismiss"
          >
            ×
          </button>
        </p>
      )}
    </div>
  );
}

// Ranked joint actions (with nuance + citations) and the user's best
// exercises for one muscle — the "pick the best exercise" view.
function BestForMuscle({
  muscle,
  exercises,
}: {
  muscle: string;
  exercises: Exercise[];
}) {
  const { t } = useVoice();
  const ratings = ratingsForMuscle(muscle);
  const ranked = exercises
    .map((e) => ({
      exercise: e,
      target: e.muscleTargets?.find((t) => t.muscle === muscle),
    }))
    .filter((x): x is { exercise: Exercise; target: MuscleTarget } =>
      Boolean(x.target),
    )
    .sort((a, b) => tierRank(a.target.tier) - tierRank(b.target.tier));

  return (
    <Dialog>
      <DialogTrigger
        className="p-1 text-faint transition-colors duration-100 hover:text-ink"
        title={`Best for ${muscleLabel(muscle)}`}
        data-testid={`best-for-${muscle}`}
      >
        <Info className="size-4" />
      </DialogTrigger>
      <DialogContent title={`Best for ${muscleLabel(muscle)}`}>
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
          <div>
            <h3 className="text-2xs font-medium tracking-widest text-faint uppercase">
              Joint actions, ranked
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {ratings.map((r) => (
                <li key={r.jointAction} className="flex items-start gap-2">
                  <TierBadge tier={r.tier} />
                  <span className="min-w-0 text-xs">
                    <span className="text-ink">
                      {jointActionLabel(r.jointAction)}
                    </span>
                    {r.note && (
                      <span className="block text-2xs text-soft">{r.note}</span>
                    )}
                    {r.citations && r.citations.length > 0 && (
                      <span className="block truncate text-2xs text-faint">
                        {r.citations.join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-2xs font-medium tracking-widest text-faint uppercase">
              Your exercises
            </h3>
            {ranked.length === 0 ? (
              <p className="mt-2 text-2xs text-faint">
                {t(
                  "Nothing targets this muscle yet.",
                  "Nothing targets this muscle yet. The frog refuses to speculate.",
                )}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {ranked.map(({ exercise, target }) => (
                  <li key={exercise.id} className="flex items-center gap-2">
                    <TierBadge tier={target.tier} />
                    <ExerciseThumb
                      imageUrl={exercise.imageUrl}
                      name={exercise.name}
                    />
                    <span className="truncate text-xs">{exercise.name}</span>
                    <JointActionChips actions={exercise.jointActions} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoized: the seeded library renders ~900 of these, and every optimistic
// create re-renders the screen around them.
const ExerciseRow = memo(function ExerciseRow({
  exercise,
  groupMuscle,
  setMetrics,
  machines,
  isFavorite,
  onToggleFavorite,
  pending,
  expanded,
  onToggle,
}: {
  exercise: Exercise;
  groupMuscle: string;
  setMetrics: Metric[];
  machines: Machine[];
  isFavorite: boolean;
  onToggleFavorite: (exerciseId: string, favorite: boolean) => void;
  pending: boolean;
  expanded: boolean;
  onToggle: (exerciseId: string) => void;
}) {
  const { t } = useVoice();
  const toggleMetric = useSetMetricExercises();
  const setTags = useSetExerciseTags();
  const deleteExercise = useDeleteExercise();
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  // Gate the per-row last-set lookup on visibility — otherwise the seeded
  // library fires one query per row (~900) on open, saturating the network.
  const [rowRef, inView] = useInView<HTMLLIElement>();
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const groupTier = exercise.muscleTargets?.find(
    (t) => t.muscle === groupMuscle,
  )?.tier;
  const machine = machines.find((m) => m.id === exercise.machineId);

  return (
    <li
      ref={rowRef}
      style={CV_ROW}
      data-testid={`exercise-row-${exercise.name}`}
    >
      {/* Ribbon: big diagram anchors the row; the name carries the most weight
          and its brightness encodes exercise quality for this muscle (see
          TierLegend); joint actions sit under it as plain labels; metadata
          (machine, last set) is smallest/faintest. */}
      <div className="flex w-full items-start gap-3 px-4 py-3 transition-colors duration-150 ease-(--ease-out-quad) hover:bg-surface-hover">
        <ExerciseThumb
          imageUrl={exercise.imageUrl}
          name={exercise.name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onToggle(exercise.id)}
              // The panel behind this toggle edits tags, metrics, machine and
              // archive state — every one of them keyed by an id Postgres
              // doesn't have yet while the create is queued.
              disabled={pending}
              className="flex min-w-0 items-center gap-1.5 text-left"
              data-testid={`exercise-row-toggle-${exercise.name}`}
            >
              <span
                className={cn(
                  "truncate text-sm font-semibold",
                  tierNameClass(groupTier),
                )}
              >
                {exercise.name}
              </span>
              {pending ? (
                <span className="shrink-0 text-2xs text-faint">saving…</span>
              ) : (
                <Chevron className="size-4 shrink-0 text-faint" />
              )}
            </button>
            <span className="flex shrink-0 items-center gap-1">
              {!exercise.isCustom && (
                <span className="bg-translucent px-2 py-0.5 text-2xs text-faint">
                  seed
                </span>
              )}
              <FavoriteButton
                favorite={isFavorite}
                onToggle={() => onToggleFavorite(exercise.id, !isFavorite)}
                name={exercise.name}
                disabled={pending}
              />
              <Link
                to={`/exercises/${exercise.id}`}
                title={`Open ${exercise.name}`}
                className="flex size-8 items-center justify-center text-faint transition-colors duration-150 hover:text-ink"
                data-testid={`open-exercise-${exercise.name}`}
              >
                <ArrowRight className="size-4" />
              </Link>
            </span>
          </div>

          <JointActionRatings exercise={exercise} className="mt-1.5" />

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-faint">
            {machine && (
              <span className="flex items-center gap-1 truncate">
                <Dumbbell className="size-3 shrink-0" />
                {machine.brand ? `${machine.brand} · ` : ""}
                {machine.name}
              </span>
            )}
            {inView && <LastSetSummary exerciseId={exercise.id} />}
            {exercise.tags?.map((t) => (
              <span key={t} className="flex shrink-0 items-center gap-1">
                <span className="size-1 bg-accent" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border bg-surface-2 px-4 py-2 pl-10">
          {setMetrics.length === 0 ? (
            <p className="text-2xs text-faint">
              {t(
                "No custom set metrics yet — create one below to track it per set here.",
                "No custom set metrics yet. Create one below and the frog will track it per set.",
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {setMetrics.map((m) => {
                const enabled = m.exerciseIds?.includes(exercise.id) ?? false;
                return (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() =>
                        toggleMetric.mutate({
                          metricId: m.id,
                          exerciseIds: enabled
                            ? (m.exerciseIds ?? []).filter(
                                (id) => id !== exercise.id,
                              )
                            : [...(m.exerciseIds ?? []), exercise.id],
                        })
                      }
                      className="size-4 accent-(--accent)"
                      data-testid={`enable-metric-${m.name}-${exercise.name}`}
                    />
                    <span className={cn(enabled ? "text-ink" : "text-soft")}>
                      {m.name}
                    </span>
                    <span className="text-2xs text-faint">{m.type}</span>
                  </label>
                );
              })}
            </div>
          )}

          {exercise.isCustom && (
            <CustomExerciseEditor exercise={exercise} machines={machines} />
          )}

          {exercise.isCustom && (
            <div className="mt-3 border-t border-border pt-2">
              <TagEditor exercise={exercise} setTags={setTags} />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-soft"
                onClick={() => setConfirmingArchive(true)}
                data-testid={`archive-exercise-${exercise.name}`}
              >
                <Archive className="size-4" />
                Archive exercise
              </Button>
              <Dialog
                open={confirmingArchive}
                onOpenChange={setConfirmingArchive}
              >
                <DialogContent title="Archive this exercise?">
                  <p className="text-xs text-soft">
                    It's hidden from your library and the exercise picker. Your
                    past sessions and findings keep it — nothing logged is lost.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingArchive(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        deleteExercise.mutate(exercise.id);
                        setConfirmingArchive(false);
                      }}
                      data-testid={`confirm-archive-${exercise.name}`}
                    >
                      Archive
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      )}
    </li>
  );
});

// "Last set" line — reuses the ghost-prefill lookup (most recent prior
// session's sets), no separate history query needed.
function LastSetSummary({ exerciseId }: { exerciseId: string }) {
  const { unit } = useUnit();
  const { data: sets = [] } = useLastSets(exerciseId);
  if (sets.length === 0) return null;
  const summary = sets
    .map((s) =>
      s.weightKg != null && s.reps != null
        ? `${formatWeight(s.weightKg, unit)}\u00d7${s.reps}`
        : null,
    )
    .filter((s): s is string => s != null)
    .join(", ");
  if (!summary) return null;
  return (
    <span className="flex items-center gap-1 truncate">
      <History className="size-3 shrink-0" />
      Last: {summary}
    </span>
  );
}

// Muscle targets (first = primary), joint-action labels, machine link —
// custom exercises only (seed rows are read-only under RLS).
function CustomExerciseEditor({
  exercise,
  machines,
}: {
  exercise: Exercise;
  machines: Machine[];
}) {
  const classify = useSetExerciseClassification();
  const setMachine = useSetExerciseMachine();
  const setTypeEquip = useSetExerciseTypeEquipment();
  const { data: history = [] } = useLastSets(exercise.id);
  const [muscleDraft, setMuscleDraft] = useState("");
  const [tierDraft, setTierDraft] = useState<Tier>("S");
  const targets = exercise.muscleTargets ?? [];
  const actions = exercise.jointActions ?? [];
  // Measurement type is immutable once sets exist (volume/records depend on it);
  // duplicate-as-custom is the reset path. Equipment stays editable.
  const exType = (exercise.exerciseType as ExerciseType) ?? "weight_reps";
  const typeLocked = history.length > 0;

  function setTargets(next: MuscleTarget[]) {
    classify.mutate({
      exerciseId: exercise.id,
      classification: { muscleTargets: next },
    });
  }
  function setActions(next: string[]) {
    classify.mutate({
      exerciseId: exercise.id,
      classification: { jointActions: next },
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-faint">Type</span>
        <select
          value={exType}
          disabled={typeLocked}
          onChange={(e) =>
            setTypeEquip.mutate({
              exerciseId: exercise.id,
              exerciseType: e.target.value,
              equipment: exercise.equipment ?? null,
            })
          }
          className="h-6 max-w-40 border border-border bg-surface px-1 text-2xs text-ink disabled:opacity-50"
          data-testid={`exercise-type-select-${exercise.name}`}
        >
          {EXERCISE_TYPES.map((t) => (
            <option key={t} value={t}>
              {EXERCISE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {typeLocked && (
          <span className="text-2xs text-faint">locked — has logged sets</span>
        )}
        <span className="text-2xs text-faint">Equipment</span>
        <select
          value={exercise.equipment ?? ""}
          onChange={(e) =>
            setTypeEquip.mutate({
              exerciseId: exercise.id,
              exerciseType: exType,
              equipment: e.target.value || null,
            })
          }
          className="h-6 max-w-40 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`exercise-equipment-select-${exercise.name}`}
        >
          <option value="">No equipment</option>
          {EQUIPMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {EQUIPMENT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-faint">Muscles</span>
        {targets.map((t) => (
          <span
            key={t.muscle}
            className="flex items-center gap-1 border border-border bg-surface px-1 py-0.5 text-2xs text-soft"
          >
            <TierBadge tier={t.tier} />
            {muscleLabel(t.muscle)}
            <button
              type="button"
              title={`Remove ${muscleLabel(t.muscle)}`}
              onClick={() =>
                setTargets(targets.filter((x) => x.muscle !== t.muscle))
              }
              className="text-faint hover:text-neg"
            >
              ×
            </button>
          </span>
        ))}
        <select
          value={muscleDraft}
          onChange={(e) => setMuscleDraft(e.target.value)}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`muscle-select-${exercise.name}`}
        >
          <option value="">+ muscle</option>
          {MUSCLES.filter((m) => !targets.some((t) => t.muscle === m.key)).map(
            (m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ),
          )}
        </select>
        <select
          value={tierDraft}
          onChange={(e) => setTierDraft(e.target.value as Tier)}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          title="Tier for this muscle"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!muscleDraft}
          onClick={() => {
            if (!muscleDraft) return;
            setTargets([...targets, { muscle: muscleDraft, tier: tierDraft }]);
            setMuscleDraft("");
            setTierDraft("S");
          }}
          data-testid={`add-muscle-${exercise.name}`}
        >
          Add
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-faint">Joint actions</span>
        {actions.map((a) => (
          <span
            key={a}
            className="flex items-center gap-1 border border-border bg-surface px-1 py-0.5 text-2xs text-soft"
          >
            {jointActionLabel(a)}
            <button
              type="button"
              title={`Remove ${jointActionLabel(a)}`}
              onClick={() => setActions(actions.filter((x) => x !== a))}
              className="text-faint hover:text-neg"
            >
              ×
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setActions([...actions, e.target.value]);
          }}
          className="h-6 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`joint-action-select-${exercise.name}`}
        >
          <option value="">+ action</option>
          {JOINT_ACTIONS.filter((a) => !actions.includes(a.key)).map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-2xs text-faint">Machine</span>
        <select
          value={exercise.machineId ?? ""}
          onChange={(e) =>
            setMachine.mutate({
              exerciseId: exercise.id,
              machineId: e.target.value || null,
            })
          }
          className="h-6 max-w-64 border border-border bg-surface px-1 text-2xs text-ink"
          data-testid={`machine-select-${exercise.name}`}
        >
          <option value="">No machine</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.brand ? `${m.brand} · ` : ""}
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TagEditor({
  exercise,
  setTags,
}: {
  exercise: Exercise;
  setTags: ReturnType<typeof useSetExerciseTags>;
}) {
  const [tagDraft, setTagDraft] = useState("");
  // Hold the latest tags so a rapid second add appends to the first instead of
  // reading stale props (the optimistic cache update lags a render behind).
  const tagsRef = useRef(exercise.tags ?? []);
  tagsRef.current = exercise.tags ?? [];

  function addTag() {
    const tag = tagDraft.trim().replace(/,+$/, "");
    setTagDraft("");
    if (!tag) return;
    const current = tagsRef.current;
    if (current.includes(tag)) return;
    const nextTags = [...current, tag];
    tagsRef.current = nextTags;
    setTags.mutate({ exerciseId: exercise.id, tags: nextTags });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(exercise.tags ?? []).map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 border border-border bg-surface px-2 py-0.5 text-2xs text-soft"
        >
          {t}
          <button
            type="button"
            title={`Remove tag ${t}`}
            onClick={() =>
              setTags.mutate({
                exerciseId: exercise.id,
                tags: (exercise.tags ?? []).filter((x) => x !== t),
              })
            }
            className="text-faint hover:text-neg"
          >
            ×
          </button>
        </span>
      ))}
      <Input
        value={tagDraft}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) {
            setTagDraft(e.target.value);
            addTag();
          } else {
            setTagDraft(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="+ tag"
        className="h-6 w-24 text-2xs"
        data-testid={`tag-input-${exercise.name}`}
      />
    </div>
  );
}

const METRIC_TYPES: NewMetricInput["type"][] = [
  "number",
  "scale",
  "text",
  "checkbox",
];

function MetricsSection({ metrics }: { metrics: Metric[] }) {
  const create = useCreateMetric();
  const deleteMetric = useDeleteMetric();
  const [name, setName] = useState("");
  const [type, setType] = useState<NewMetricInput["type"]>("number");

  const custom = metrics.filter((m) => m.ownerId !== null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed, type, scope: "set" });
    setName("");
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xs font-medium tracking-widest text-faint uppercase">
        Custom metrics
      </h2>
      <p className="mt-0.5 text-2xs text-faint">
        Everything logged is a metric. Set-scope metrics attach to exercises
        above.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input
          placeholder="New metric name (e.g. Tempo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="metric-name-input"
        />
        <Select.Root
          value={type}
          onValueChange={(v) => setType(v as NewMetricInput["type"])}
          size="2"
        >
          <Select.Trigger variant="surface" data-testid="metric-type-select" />
          <Select.Content>
            {METRIC_TYPES.map((t) => (
              <Select.Item key={t} value={t}>
                {t}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Button
          type="submit"
          variant="primary"
          disabled={name.trim().length === 0}
          data-testid="add-metric-btn"
        >
          Add
        </Button>
      </form>

      {custom.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden border border-border bg-surface">
          {custom.map((m) => (
            <li
              key={m.id}
              data-testid={`metric-row-${m.name}`}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span>{m.name}</span>
              <span className="flex items-center gap-2">
                <span className="num text-2xs text-faint">
                  {m.type} · {m.scope} · {m.exerciseIds?.length ?? 0} exercises
                </span>
                <button
                  type="button"
                  title="Delete metric"
                  onClick={() => deleteMetric.mutate(m.id)}
                  className="p-0.5 text-faint transition-colors duration-100 hover:text-neg"
                  data-testid={`delete-metric-${m.name}`}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
