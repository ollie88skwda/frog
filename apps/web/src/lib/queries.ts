import {
  type Exercise,
  type ExerciseFavorite,
  type ExercisePatch,
  type ExercisePref,
  type Machine,
  type MachinePatch,
  type Metric,
  type NewExerciseOpts,
  type NewMachineInput,
  type NewMetricInput,
  newId,
  resolveExerciseShare,
  type Session,
  type TrackedCondition,
} from "@frog/core";
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  markExercisesPending,
  resolveExercisePending,
  usePendingExercises,
} from "./pending-exercises";
import { useRepo } from "./repo";

// Seeded rows live in the cache before their INSERT is dispatched, so any
// refetch that lands mid-run (window refocus, a sibling exercise mutation's
// invalidate) replaces them with server truth that predates them. Re-applying
// them here keeps the list whole no matter what replaces the cache, instead of
// leaning on each create's `onMutate` happening to cancel that refetch first.
function withPendingExercises(
  rows: Exercise[],
  pending: ReadonlyMap<string, Exercise>,
): Exercise[] {
  if (pending.size === 0) return rows;
  const have = new Set(rows.map((e) => e.id));
  const missing = [...pending.values()].filter((r) => !have.has(r.id));
  if (missing.length === 0) return rows;
  return [...rows, ...missing].sort((a, b) => a.name.localeCompare(b.name));
}

export function useExercises() {
  const repo = useRepo();
  const pending = usePendingExercises();
  const select = useCallback(
    (rows: Exercise[]) => withPendingExercises(rows, pending),
    [pending],
  );
  return useQuery({
    queryKey: ["exercises"],
    queryFn: () => repo.listExercises(),
    select,
  });
}

// Full row (instructions/imageUrls included) for exercise-detail — the
// cached list row (already loaded for every screen behind this one) is the
// placeholder, so the header paints instantly while the fat fields arrive.
export function useExercise(id: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["exercise", id],
    queryFn: () => repo.getExercise(id),
    placeholderData: () =>
      qc.getQueryData<Exercise[]>(["exercises"])?.find((e) => e.id === id) ??
      undefined,
    enabled: !!id,
  });
}

// Bulk add fires one create per name, so creates run concurrently. Counted
// here rather than read back off the mutation cache: a mutation is still
// `pending` while its own `onSettled` runs, so two creates settling in the
// same microtask drain would each mistake the other for a live sibling.
const createExercisesInFlight = new WeakMap<QueryClient, number>();

function trackCreateExercise(qc: QueryClient, delta: number): number {
  const next = Math.max(0, (createExercisesInFlight.get(qc) ?? 0) + delta);
  createExercisesInFlight.set(qc, next);
  return next;
}

function optimisticExercise(
  id: string,
  name: string,
  opts?: NewExerciseOpts,
): Exercise {
  const now = Date.now();
  // The resolved share decision, not a hardcoded null: a private create
  // (share: false — a fork or copy-on-write) owns its row, and its
  // optimistic row must not render as community-shared (the badge/Edit gates
  // key on owner_id null) for the seconds until the settle refetch returns
  // the real owned row. "pending" is a transient marker — the refetch
  // replaces it with the caller's actual id; nothing compares owner_id to a
  // concrete value, only to null.
  const ownerId = resolveExerciseShare(opts) ? null : "pending";
  return {
    id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ownerId,
    createdBy: null,
    name,
    tags: null,
    isCustom: true,
    machineId: opts?.machineId ?? null,
    jointActions: opts?.jointActions ?? null,
    muscleTargets: opts?.muscleTargets ?? null,
    imageUrl: null,
    imageAttribution: null,
    exerciseType: opts?.exerciseType ?? "weight_reps",
    equipment: opts?.equipment ?? null,
    instructions: null,
    imageUrls: null,
    mechanic: opts?.mechanic ?? null,
    movementPattern: opts?.movementPattern ?? null,
    laterality: opts?.laterality ?? null,
    defaultRepsMin: opts?.defaultRepsMin ?? null,
    defaultRepsMax: opts?.defaultRepsMax ?? null,
    defaultRestSec: opts?.defaultRestSec ?? null,
    notes: opts?.notes ?? null,
    aliases: opts?.aliases ?? null,
    mediaPath: null,
    mediaType: null,
  };
}

// The duplicate-exercise field contract (DECISIONS.md 2026-07-30): every field
// the editor writes is carried except `aliases` — two rows sharing an alias
// would make `matchExerciseName` ambiguous for voice/paste logging. One list
// shared by the detail screen's Duplicate action and the session's
// copy-on-write (laterality/machine edits on RLS-read-only seed rows), so the
// two can't drift.
export function copyExerciseOpts(ex: Exercise): NewExerciseOpts {
  return {
    muscleTargets: ex.muscleTargets,
    jointActions: ex.jointActions,
    exerciseType: ex.exerciseType,
    equipment: ex.equipment,
    machineId: ex.machineId,
    mechanic: ex.mechanic,
    movementPattern: ex.movementPattern,
    laterality: ex.laterality,
    defaultRepsMin: ex.defaultRepsMin,
    defaultRepsMax: ex.defaultRepsMax,
    defaultRestSec: ex.defaultRestSec,
    notes: ex.notes,
    instructions: ex.instructions,
    imageUrls: ex.imageUrls,
  };
}

// An optimistic write updates the library; it never *creates* it. A `(old = [])`
// updater would build the cache entry out of one optimistic row during the cold
// ~1 MB load — which reads downstream as a loaded library (bulk add gates its
// duplicate detection on exactly that) — and would resurrect an entry that
// `queryClient.clear()` just dropped on sign-out. Returning `undefined` makes
// `setQueryData` a no-op; the row arrives with the pending fetch instead, kept
// by the pending-row merge in `useExercises`.
function updateExerciseRows(
  qc: QueryClient,
  update: (rows: Exercise[]) => Exercise[],
) {
  qc.setQueryData<Exercise[]>(["exercises"], (old) => old && update(old));
}

// Idempotent by id: a row seeded before its create was dispatched must not be
// added a second time when that create's own `onMutate` runs.
function addExerciseRows(qc: QueryClient, rows: Exercise[]) {
  updateExerciseRows(qc, (old) => {
    const have = new Set(old.map((e) => e.id));
    const fresh = rows.filter((r) => !have.has(r.id));
    if (fresh.length === 0) return old;
    return [...old, ...fresh].sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Puts every name on screen in one write, before any insert is dispatched —
// bulk add bounds its network fan-out, and the user must not watch their paste
// trickle in one worker slot at a time. Returns the ids to create under.
//
// Also the only way to register a row as pending *synchronously*: TanStack
// awaits `onMutate`, so a create dispatched from a click is not in the pending
// registry until a microtask later — one render too late for the FK guards
// that read it (the session picker's auto-pick). Any create whose id is handed
// straight to a consumer must seed here first; `useCreateExercise.onMutate` is
// idempotent by id, so the two together write the row exactly once. Pass the
// same `opts` the create gets, or the optimistic row loses them.
export function useSeedExercises() {
  const qc = useQueryClient();
  return (items: { name: string; opts?: NewExerciseOpts }[]) => {
    const rows = items.map(({ name, opts }) =>
      optimisticExercise(opts?.id ?? newId(), name, opts),
    );
    addExerciseRows(qc, rows);
    markExercisesPending(rows);
    return rows.map(({ id, name }) => ({ id, name }));
  };
}

export function useCreateExercise() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, opts }: { name: string; opts?: NewExerciseOpts }) =>
      repo.createExercise(name, opts),
    // Synchronous onMutate: the optimistic write must land before React's
    // next render, or controlled inputs flash back to the stale value.
    onMutate: (vars) => {
      trackCreateExercise(qc, 1);
      const { name } = vars;
      // Share one client id between the optimistic row and the server insert
      // (see useCreateMachine) so a classification edit made before the create
      // settles targets the real row instead of a throwaway id.
      vars.opts ??= {};
      const id = vars.opts.id ?? newId();
      vars.opts.id = id;
      const opts = vars.opts;
      // Only once there is a list to protect: the single-add form is live
      // during the cold load, and cancelling that first fetch reverts it
      // without restarting — leaving an empty library until this create's own
      // `onSettled` invalidate re-downloads it.
      if (qc.getQueryData(["exercises"]) !== undefined) {
        void qc.cancelQueries({ queryKey: ["exercises"] });
      }
      const row = optimisticExercise(id, name, opts);
      addExerciseRows(qc, [row]);
      markExercisesPending([row]);
      return { id };
    },
    // Roll back by removing only this mutation's optimistic row — a snapshot
    // restore would clobber sibling optimistic rows when creates run
    // concurrently (bulk add fires one mutation per name). Drop it from the
    // pending registry first, or the re-apply in `useExercises` would put the
    // row straight back until `onSettled` runs.
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      resolveExercisePending(ctx.id);
      updateExerciseRows(qc, (old) => old.filter((e) => e.id !== ctx.id));
    },
    // Only the last create of a batch refetches. An earlier one would pull
    // server truth that predates its siblings' inserts and overwrite their
    // optimistic rows — and re-download the whole library once per name. The
    // count drops before the check, so the last one out always invalidates.
    // The refetch is deliberately not awaited: holding this callback open for
    // the whole ~1 MB round-trip would keep a create dispatched inside that
    // window from ever seeing the count reach zero.
    onSettled: (data, _err, vars, ctx) => {
      const id = ctx?.id ?? vars.opts?.id;
      if (id) resolveExercisePending(id);
      // Dupe-hit reconciliation (community sharing): the publish RPC's dedupe
      // backstop returned an existing row's id, so this create's optimistic
      // row never became real — drop it now rather than letting it linger
      // until the invalidate below repaints the list with the canonical row.
      if (data && id && data.id !== id) {
        updateExerciseRows(qc, (old) => old.filter((e) => e.id !== id));
      }
      if (trackCreateExercise(qc, -1) > 0) return;
      // Any fetch already running predates this insert, so its response can't
      // contain the row. Retire it first: `invalidateQueries` only cancels an
      // in-flight fetch once the query has data, so during the cold load it
      // would instead be handed that fetch's promise — and its pre-insert
      // payload clears the invalidation, leaving the new exercise off the list
      // until something else refetches.
      void qc.cancelQueries({ queryKey: ["exercises"] });
      void qc.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useDeleteExercise() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteExercise(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      updateExerciseRows(qc, (old) => old.filter((e) => e.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useDeleteMetric() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMetric(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

// Replaces useSetExerciseClassification/useSetExerciseTypeEquipment/
// useSetExerciseTags/useSetExerciseMachine — one optimistic patch mutation
// instead of a narrow hook per editable field. Patch keys match Exercise's
// own field shape, so the optimistic write is a plain spread.
export function useUpdateExercise() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { exerciseId: string; patch: ExercisePatch }) =>
      repo.updateExercise(input.exerciseId, input.patch),
    // Both caches, not just the list: the detail screen reads `useExercise`,
    // whose own entry holds real (non-placeholder) data once it has fetched,
    // so patching only ["exercises"] leaves the header stale for a whole round
    // trip. While the detail query has never resolved there is no entry to
    // patch — the updater returns `old` (undefined), TanStack treats that as a
    // no-op, and the placeholder it paints from is the list row above.
    onMutate: ({ exerciseId, patch }) => {
      void qc.cancelQueries({ queryKey: ["exercises"] });
      void qc.cancelQueries({ queryKey: ["exercise", exerciseId] });
      const prev = qc.getQueryData<Exercise[]>(["exercises"]);
      const prevDetail = qc.getQueryData<Exercise | null>([
        "exercise",
        exerciseId,
      ]);
      updateExerciseRows(qc, (old) =>
        old.map((e) => (e.id === exerciseId ? { ...e, ...patch } : e)),
      );
      qc.setQueryData<Exercise | null>(["exercise", exerciseId], (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { prev, prevDetail };
    },
    onError: (_e, { exerciseId }, ctx) => {
      if (ctx?.prev) qc.setQueryData(["exercises"], ctx.prev);
      if (ctx?.prevDetail !== undefined)
        qc.setQueryData(["exercise", exerciseId], ctx.prevDetail);
    },
    onSettled: (_d, _e, { exerciseId }) => {
      void qc.invalidateQueries({ queryKey: ["exercises"] });
      void qc.invalidateQueries({ queryKey: ["exercise", exerciseId] });
    },
  });
}

export function useMachines() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machines"],
    queryFn: () => repo.listMachines(),
  });
}

// Server-side catalog search (machine_catalog). Debounce upstream — the query
// key holds the trimmed text, so a keystroke that doesn't change the trimmed
// value re-renders without refetching. Empty query + no category = disabled
// (the picker shows browse chips instead of a request).
export function useMachineCatalogSearch(
  query: string,
  category: string | null,
) {
  const repo = useRepo();
  const q = query.trim();
  return useQuery({
    queryKey: ["machine-catalog-search", q, category],
    queryFn: () => repo.searchMachineCatalog(q, { category, limit: 20 }),
    enabled: q !== "" || category != null,
    staleTime: 60_000,
  });
}

// Catalog categories for the browse view. DB-derived so a later seed batch
// that introduces a new category shows up without a code change.
export function useMachineCategories() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machine-categories"],
    queryFn: () => repo.listMachineCategories(),
    staleTime: Infinity,
  });
}

export function useCreateMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMachineInput) => repo.createMachine(input),
    onMutate: (input) => {
      // Share one client id between the optimistic row and the server insert
      // (onMutate runs before mutationFn with the same variables object).
      // Otherwise a follow-up settings edit targets the optimistic id and is
      // dropped when the create settles to a different server-generated id.
      input.id ??= newId();
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      const now = Date.now();
      const optimistic: Machine = {
        id: input.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ownerId: "",
        name: input.name,
        brand: input.brand ?? null,
        catalogKey: input.catalogKey ?? null,
        settings: input.settings ?? null,
        notes: input.notes ?? null,
        photoPath: null,
      };
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useUpdateMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: MachinePatch }) =>
      repo.updateMachine(input.id, input.patch),
    // Powers in-session setup edits — must feel instant.
    onMutate: ({ id, patch }) => {
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        old.map((m) =>
          m.id === id
            ? {
                ...m,
                ...("name" in patch && patch.name != null
                  ? { name: patch.name }
                  : {}),
                ...("brand" in patch ? { brand: patch.brand ?? null } : {}),
                ...("settings" in patch
                  ? { settings: patch.settings ?? null }
                  : {}),
                ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
              }
            : m,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["machines"] }),
  });
}

export function useDeleteMachine() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteMachine(id),
    onMutate: (id) => {
      void qc.cancelQueries({ queryKey: ["machines"] });
      const prev = qc.getQueryData<Machine[]>(["machines"]);
      qc.setQueryData<Machine[]>(["machines"], (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["machines"], ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["machines"] });
      void qc.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useUploadMachinePhoto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { machineId: string; file: Blob }) =>
      repo.uploadMachinePhoto(input.machineId, input.file),
    // Off the logging hot path — no optimistic write; thumbnail appears on settle.
    onSettled: (_d, _e, { machineId }) => {
      void qc.invalidateQueries({ queryKey: ["machines"] });
      void qc.invalidateQueries({ queryKey: ["machine-photo", machineId] });
    },
  });
}

export function useMachinePhotoUrl(machine: Machine | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machine-photo", machine?.id, machine?.photoPath],
    queryFn: () => (machine ? repo.machinePhotoUrl(machine) : null),
    enabled: !!machine?.photoPath,
    staleTime: 45 * 60_000, // signed URLs live an hour
  });
}

export function useUploadMachineSettingPhoto() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      machineId: string;
      file: Blob;
      existingPath: string | null;
    }) =>
      repo.uploadMachineSettingPhoto(
        input.machineId,
        input.file,
        input.existingPath,
      ),
    // Replacing a setting photo upserts the same object path, so the
    // signed-URL query (keyed on path alone) would keep serving its cached
    // URL — and the browser-cached image bytes under it — until the 45-min
    // staleTime refetch. The mutation resolves the path; invalidate on it.
    onSettled: (path) => {
      if (path) {
        void qc.invalidateQueries({
          queryKey: ["machine-setting-photo", path],
        });
      }
    },
  });
}

export function useMachineSettingPhotoUrl(path: string | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["machine-setting-photo", path],
    queryFn: () => (path ? repo.machineSettingPhotoUrl(path) : null),
    enabled: !!path,
    staleTime: 45 * 60_000, // signed URLs live an hour
  });
}

export function useUploadExerciseMedia() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      exerciseId: string;
      file: Blob;
      kind: "image" | "video";
    }) => repo.uploadExerciseMedia(input.exerciseId, input.file, input.kind),
    // Off the logging hot path — no optimistic write; thumbnail appears on settle.
    onSettled: (_d, _e, { exerciseId }) => {
      void qc.invalidateQueries({ queryKey: ["exercise", exerciseId] });
      void qc.invalidateQueries({ queryKey: ["exercise-media", exerciseId] });
    },
  });
}

export function useClearExerciseMedia() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exerciseId: string) => repo.clearExerciseMedia(exerciseId),
    onSettled: (_d, _e, exerciseId) => {
      void qc.invalidateQueries({ queryKey: ["exercise", exerciseId] });
      void qc.invalidateQueries({ queryKey: ["exercise-media", exerciseId] });
    },
  });
}

export function useExerciseMediaUrl(exercise: Exercise | null | undefined) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["exercise-media", exercise?.id, exercise?.mediaPath],
    queryFn: () => (exercise ? repo.exerciseMediaUrl(exercise) : null),
    enabled: !!exercise?.mediaPath,
    staleTime: 45 * 60_000, // signed URLs live an hour
  });
}

export function useSessionExercises(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session-exercises", sessionId],
    queryFn: () => repo.listSessionExercises(sessionId),
    // Fresh for the lifetime of one mount, but never served stale to a later
    // mount (resuming a session must see sets logged since the first fetch).
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}

export function useSession(sessionId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => repo.getSession(sessionId),
  });
}

export function useUpdateSessionStartedAt(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (startedAt: number) =>
      repo.updateSessionStartedAt(sessionId, startedAt),
    onMutate: (startedAt) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, startedAt } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      // started_at drives every trend/correlation — recompute.
      void qc.invalidateQueries({ queryKey: ["findings-data"] });
    },
  });
}

export function useUpdateConditions(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      repo.updateSessionConditions(sessionId, values),
    // Auto-save fires on every keystroke/tap — reflect it instantly (see
    // useCreateExercise). Replace semantics: callers pass the full value set.
    onMutate: (values) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, conditionValues: values } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateSessionNotes(sessionId: string) {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["session", sessionId];
  return useMutation({
    mutationFn: (notes: string | null) =>
      repo.updateSessionNotes(sessionId, notes),
    onMutate: (notes) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Session | null>(key);
      qc.setQueryData<Session | null>(key, (old) =>
        old ? { ...old, notes } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useMetrics() {
  const repo = useRepo();
  return useQuery({ queryKey: ["metrics"], queryFn: () => repo.listMetrics() });
}

export function useCreateMetric() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewMetricInput) => repo.createMetric(input),
    // Optimistic append (see useCreateExercise) — reconciled by the settle
    // invalidate. The real row's id arrives via mutateAsync's return value.
    onMutate: (input) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      const now = Date.now();
      const optimistic: Metric = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ownerId: null,
        name: input.name,
        type: input.type,
        scope: input.scope,
        unit: input.unit ?? null,
        exerciseIds: null,
      };
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export function useTrackedConditions() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["tracked-conditions"],
    queryFn: () => repo.listTrackedConditions(),
  });
}

export function useSetConditionTracked() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["tracked-conditions"];
  return useMutation({
    mutationFn: (input: { metricId: string; tracked: boolean }) =>
      repo.setConditionTracked(input.metricId, input.tracked),
    onMutate: ({ metricId, tracked }) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TrackedCondition[]>(key);
      const now = Date.now();
      qc.setQueryData<TrackedCondition[]>(key, (old = []) => {
        const existing = old.find((t) => t.metricId === metricId);
        if (existing)
          return old.map((t) =>
            t.metricId === metricId ? { ...t, tracked, updatedAt: now } : t,
          );
        return [
          ...old,
          {
            id: newId(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ownerId: "",
            metricId,
            tracked,
            position: null,
          },
        ];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useExerciseFavorites() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["exercise-favorites"],
    queryFn: () => repo.listExerciseFavorites(),
  });
}

export function useSetExerciseFavorite() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["exercise-favorites"];
  return useMutation({
    mutationFn: (input: { exerciseId: string; favorite: boolean }) =>
      repo.setExerciseFavorite(input.exerciseId, input.favorite),
    onMutate: ({ exerciseId, favorite }) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ExerciseFavorite[]>(key);
      const now = Date.now();
      qc.setQueryData<ExerciseFavorite[]>(key, (old = []) => {
        const existing = old.find((f) => f.exerciseId === exerciseId);
        if (existing)
          return old.map((f) =>
            f.exerciseId === exerciseId
              ? { ...f, favorite, updatedAt: now }
              : f,
          );
        return [
          ...old,
          {
            id: newId(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ownerId: "",
            exerciseId,
            favorite,
          },
        ];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// Per-exercise prefs (weight-unit override etc.) — satellite rows, works on
// shared seed exercises. Same upsert/optimistic shape as favorites.
export function useExercisePrefs() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["exercise-prefs"],
    queryFn: () => repo.listExercisePrefs(),
  });
}

export function useSetExerciseWeightUnit() {
  const repo = useRepo();
  const qc = useQueryClient();
  const key = ["exercise-prefs"];
  return useMutation({
    mutationFn: (input: { exerciseId: string; unit: "kg" | "lb" | null }) =>
      repo.setExerciseWeightUnit(input.exerciseId, input.unit),
    onMutate: ({ exerciseId, unit }) => {
      void qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ExercisePref[]>(key);
      const now = Date.now();
      qc.setQueryData<ExercisePref[]>(key, (old = []) => {
        const existing = old.find((p) => p.exerciseId === exerciseId);
        if (existing)
          return old.map((p) =>
            p.exerciseId === exerciseId
              ? { ...p, weightUnit: unit, updatedAt: now }
              : p,
          );
        return [
          ...old,
          {
            id: newId(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ownerId: "",
            exerciseId,
            weightUnit: unit,
            generatorExcluded: false,
          },
        ];
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useSetMetricExercises() {
  const repo = useRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { metricId: string; exerciseIds: string[] }) =>
      repo.setMetricExercises(input.metricId, input.exerciseIds),
    // Synchronous (see useCreateExercise): controlled checkboxes revert if the
    // optimistic write lands after React re-renders.
    onMutate: ({ metricId, exerciseIds }) => {
      void qc.cancelQueries({ queryKey: ["metrics"] });
      const prev = qc.getQueryData<Metric[]>(["metrics"]);
      qc.setQueryData<Metric[]>(["metrics"], (old = []) =>
        old.map((m) => (m.id === metricId ? { ...m, exerciseIds } : m)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["metrics"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["metrics"] }),
  });
}

export function useActiveSession() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["active-session"],
    queryFn: () => repo.activeSession(),
    staleTime: 0,
  });
}

export const HISTORY_PAGE = 50;

export function useSessionHistory() {
  const repo = useRepo();
  return useInfiniteQuery({
    queryKey: ["sessions"],
    queryFn: ({ pageParam }) => repo.listSessions(HISTORY_PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < HISTORY_PAGE ? undefined : pages.length * HISTORY_PAGE,
  });
}

export function useFindingsData() {
  const repo = useRepo();
  return useQuery({
    queryKey: ["findings-data"],
    queryFn: () => repo.findingsData(),
    staleTime: 60_000,
  });
}

export function useGhost(
  exerciseId: string,
  excludeSessionExerciseId: string,
  // When set, the PREVIOUS lookup is narrowed to same-routine sessions (the
  // "routine" previous-values scope); null/undefined = any workout.
  routineId?: string | null,
) {
  const repo = useRepo();
  return useQuery({
    queryKey: [
      "ghost",
      exerciseId,
      excludeSessionExerciseId,
      routineId ?? null,
    ],
    queryFn: () =>
      repo.lastSetsForExercise(
        exerciseId,
        excludeSessionExerciseId,
        routineId ?? undefined,
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// Previous session's per-exercise note (carry-forward ghost, M3). Cached like
// the ghost so mounting a block never blocks the logging path.
export function useLastNote(
  exerciseId: string,
  excludeSessionExerciseId: string,
) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["last-note", exerciseId, excludeSessionExerciseId],
    queryFn: () =>
      repo.lastNoteForExercise(exerciseId, excludeSessionExerciseId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// Library card "last set" summary — same underlying lookup as ghost prefill,
// with no session-exercise to exclude.
export function useLastSets(exerciseId: string) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["last-sets", exerciseId],
    queryFn: () => repo.lastSetsForExercise(exerciseId),
    staleTime: 60_000,
    enabled: !!exerciseId,
  });
}

// Exercise ids logged within the last `days` days, most-recent first — the
// Library's "Recent" band. One query for the whole screen (vs. the
// per-row useLastSets lookups, which are viewport-gated).
export function useRecentExerciseIds(days: number) {
  const repo = useRepo();
  return useQuery({
    queryKey: ["recent-exercise-ids", days],
    queryFn: () => repo.recentExerciseIds(days),
    staleTime: 60_000,
  });
}
