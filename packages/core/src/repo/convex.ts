// ConvexRepo — the Repo implementation since the 2026-11-01 Supabase →
// Convex switch (docs/DECISIONS.md). Every call is a Convex query/mutation
// in /convex; authorization lives there (convex/lib.ts), so this file is
// pure request shaping and result assembly.
//
// It talks to Convex through the tiny `ConvexTransport` seam (function
// names as strings, e.g. "sessions:start") instead of importing the
// `convex` package or the generated API: @frog/core stays framework-free,
// and the web app (convexHttpTransport, repo/convex-http.ts) and tests
// (ConvexHttpClient) each provide a small adapter.
import type {
  ApiToken,
  CoachEvent,
  Exercise,
  ExerciseFavorite,
  ExercisePref,
  Machine,
  Measurement,
  Metric,
  Program,
  PushSubscription,
  Routine,
  RoutineExercise,
  RoutineFolder,
  RoutineSet,
  Session,
  SessionExercise,
  SessionMediaRow,
  SetLog,
  TrackedCondition,
  UserPrefs,
} from "../db/schema";
import { SEED_CONDITIONS } from "../db/seed-ids";
import { resolveExerciseShare } from "../domain/exercise-share";
import { newId } from "../domain/ids";
import { generateToken, hashToken } from "../domain/tokens";
import { groupSetsBySetNo } from "../domain/volume";
import type { FindingsSessionInput } from "../findings/types";
import type { ImportedSession, ImportResult } from "../import/types";
import type { RecordsSessionInput } from "../records/types";
import type {
  CreatedApiToken,
  ExercisePatch,
  ExportBundle,
  GhostSet,
  MachineCatalogEntry,
  MachinePatch,
  MeasurementPatch,
  NewCoachEventInput,
  NewExerciseOpts,
  NewMachineInput,
  NewMetricInput,
  NewRoutineInput,
  NewSetInput,
  Repo,
  RoutineDetail,
  SessionExerciseDetail,
  SnapshotOverride,
  UserPrefsPatch,
} from "./types";

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;

/** Minimal Convex client surface: function name → result. */
export interface ConvexTransport {
  query<T>(name: string, args: Args): Promise<T>;
  mutation<T>(name: string, args: Args): Promise<T>;
  /** A file's bytes, read as the signed-in user; null when it isn't theirs. */
  file(storageId: string): Promise<Blob | null>;
}

type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };

const live = <T extends { deletedAt?: number | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt == null);

const byCreated = (a: Row, b: Row) =>
  (a.createdAt as number) - (b.createdAt as number) ||
  String(a.id).localeCompare(String(b.id));

/** `[]` → null, the old repo's `x?.length ? x : null` normalisation. */
const arr = <T>(x: T[] | null | undefined): T[] | null =>
  x?.length ? x : null;

/** Copies `keys` present in `patch`, `undefined` → null. */
function present(patch: Row, keys: string[]): Row {
  const r: Row = {};
  for (const k of keys) if (k in patch) r[k] = patch[k] ?? null;
  return r;
}

function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SET_FIELDS = [
  "weightKg",
  "reps",
  "rir",
  "rirMin",
  "rirMax",
  "rpe",
  "note",
  "restSec",
  "metricValues",
  "durationSec",
  "distanceM",
  "side",
  "plannedRirMin",
  "plannedRirMax",
];

const MEASUREMENT_FIELDS = [
  "bodyweightKg",
  "bodyfatPct",
  "neckCm",
  "shouldersCm",
  "chestCm",
  "waistCm",
  "abdomenCm",
  "hipsCm",
  "bicepLCm",
  "bicepRCm",
  "forearmLCm",
  "forearmRCm",
  "thighLCm",
  "thighRCm",
  "calfLCm",
  "calfRCm",
];

const IMPORT_BATCH = 20;
const SLEEP_BATCH = 200;

export class ConvexRepo implements Repo {
  constructor(
    private c: ConvexTransport,
    private opts: { fetch?: typeof fetch } = {},
  ) {}

  // A storage id's bytes never change, so one local object URL per file
  // serves every render for the life of the page. Cleared on auth changes:
  // this map contains private bytes and must not survive an account switch.
  private fileUrls = new Map<string, Promise<string | null>>();
  private fileUrlValues = new Set<string>();
  private fileUrlGeneration = 0;

  clearFileUrls() {
    this.fileUrlGeneration++;
    for (const url of this.fileUrlValues) URL.revokeObjectURL(url);
    this.fileUrlValues.clear();
    this.fileUrls.clear();
  }

  // ── plumbing ───────────────────────────────────────────────────────────

  private q<T>(name: string, args: Args = {}) {
    return this.c.query<T>(name, args);
  }
  private m<T>(name: string, args: Args = {}) {
    return this.c.mutation<T>(name, args);
  }

  /** Every page of data:page for a table (own rows, or global rows). */
  private async pageAll<T = Row>(
    table: string,
    opts: { global?: boolean; slim?: boolean; numItems?: number } = {},
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;
    for (;;) {
      const res: Page<T> = await this.q<Page<T>>("data:page", {
        table,
        ...(opts.global ? { global: true } : {}),
        ...(opts.slim ? { slim: true } : {}),
        paginationOpts: { numItems: opts.numItems ?? 1000, cursor },
      });
      rows.push(...res.page);
      if (res.isDone) return rows;
      cursor = res.continueCursor;
    }
  }

  private find<T = Row>(table: string, where?: Row, global?: boolean) {
    return this.q<T[]>("rows:find", {
      table,
      ...(where ? { where } : {}),
      ...(global ? { global: true } : {}),
    });
  }

  private get<T = Row>(table: string, id: string) {
    return this.q<T | null>("rows:get", { table, id });
  }

  private insert<T = Row>(table: string, row: Row): Promise<T> {
    return this.m<T[]>("rows:insert", { table, rows: [row] }).then((r) => r[0]);
  }

  private async update(table: string, where: Row, patch: Row): Promise<void> {
    await this.m("rows:update", { table, where, patch });
  }

  private patchById(table: string, id: string, patch: Row) {
    return this.update(table, { id }, { ...patch, updatedAt: Date.now() });
  }

  private softDelete(table: string, id: string) {
    const now = Date.now();
    return this.update(table, { id }, { deletedAt: now, updatedAt: now });
  }

  /** Uploads a blob to Convex storage and claims it; returns its id. */
  private async upload(file: Blob, contentType: string): Promise<string> {
    const url = await this.m<string>("files:generateUploadUrl");
    const f = this.opts.fetch ?? fetch;
    const res = await f(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    }
    const { storageId } = (await res.json()) as { storageId: string };
    const claimed = await this.m<string | null>("files:claim", { storageId });
    if (!claimed) throw new Error("That file is over the 50 MB limit");
    return storageId;
  }

  private fileUrl(
    storageId: string | null | undefined,
  ): Promise<string | null> {
    if (!storageId) return Promise.resolve(null);
    const cached = this.fileUrls.get(storageId);
    if (cached) return cached;
    const generation = this.fileUrlGeneration;
    const url = this.c.file(storageId).then((blob) => {
      if (!blob || generation !== this.fileUrlGeneration) return null;
      const localUrl = URL.createObjectURL(blob);
      this.fileUrlValues.add(localUrl);
      return localUrl;
    });
    this.fileUrls.set(storageId, url);
    url.then(
      (resolved) => {
        if (resolved === null && this.fileUrls.get(storageId) === url) {
          this.fileUrls.delete(storageId);
        }
      },
      () => {
        if (this.fileUrls.get(storageId) === url)
          this.fileUrls.delete(storageId);
      },
    );
    return url;
  }

  // ── exercises ──────────────────────────────────────────────────────────

  async createExercise(
    name: string,
    opts?: NewExerciseOpts,
  ): Promise<Exercise> {
    // Same publish-vs-private rule as the app's optimistic row
    // (domain/exercise-share.ts): share:false or a machine link → private.
    const share = resolveExerciseShare(opts);
    const id = opts?.id ?? newId();
    const fields = {
      jointActions: arr(opts?.jointActions),
      muscleTargets: arr(opts?.muscleTargets),
      exerciseType: opts?.exerciseType ?? "weight_reps",
      equipment: opts?.equipment ?? null,
      instructions: arr(opts?.instructions),
      imageUrls: arr(opts?.imageUrls),
      mechanic: opts?.mechanic ?? null,
      movementPattern: opts?.movementPattern ?? null,
      laterality: opts?.laterality ?? null,
      defaultRepsMin: opts?.defaultRepsMin ?? null,
      defaultRepsMax: opts?.defaultRepsMax ?? null,
      defaultRestSec: opts?.defaultRestSec ?? null,
      notes: opts?.notes ?? null,
      aliases: arr(opts?.aliases),
    };
    if (share) {
      // Returns the canonical id (an existing global row on a dedupe hit).
      const canonicalId = await this.m<string>("exercises:publish", {
        id,
        name,
        ...fields,
      });
      const row = await this.q<Exercise | null>("exercises:get", {
        id: canonicalId,
      });
      if (!row) throw new Error("Could not publish the exercise");
      return row;
    }
    return this.insert<Exercise>("exercises", {
      id,
      name,
      isCustom: true,
      machineId: opts?.machineId ?? null,
      ...fields,
    });
  }

  /** Own + global rows, slim (no How-to fat fields), sorted by name. */
  async listExercises(): Promise<Exercise[]> {
    const [own, global] = await Promise.all([
      this.pageAll<Exercise>("exercises", { slim: true }),
      this.pageAll<Exercise>("exercises", { slim: true, global: true }),
    ]);
    return [...own, ...global]
      .map((e) =>
        Object.assign(
          {
            instructions: null,
            imageUrls: null,
            mediaPath: null,
            mediaType: null,
          },
          e,
        ),
      )
      .sort(
        (a, b) =>
          (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
          a.id.localeCompare(b.id),
      );
  }

  getExercise(id: string): Promise<Exercise | null> {
    return this.q<Exercise | null>("exercises:get", { id });
  }

  async updateExercise(id: string, patch: ExercisePatch): Promise<void> {
    const p = patch as Row;
    const row: Row = present(p, [
      "machineId",
      "equipment",
      "mechanic",
      "movementPattern",
      "laterality",
      "defaultRepsMin",
      "defaultRepsMax",
      "defaultRestSec",
      "notes",
    ]);
    if (patch.name != null) row.name = patch.name;
    if (patch.exerciseType != null) row.exerciseType = patch.exerciseType;
    for (const k of [
      "muscleTargets",
      "jointActions",
      "tags",
      "aliases",
      "instructions",
      "imageUrls",
    ]) {
      if (k in p) row[k] = arr(p[k] as unknown[] | null);
    }
    await this.patchById("exercises", id, row);
  }

  deleteExercise(id: string) {
    return this.softDelete("exercises", id);
  }

  async uploadExerciseMedia(
    exerciseId: string,
    file: Blob,
    kind: "image" | "video",
  ): Promise<void> {
    const storageId = await this.upload(
      file,
      kind === "image" ? "image/jpeg" : file.type || "video/mp4",
    );
    await this.m("exercises:setMedia", { exerciseId, storageId, kind });
  }

  exerciseMediaUrl(exercise: Exercise) {
    return this.fileUrl(exercise.mediaPath);
  }

  async clearExerciseMedia(exerciseId: string): Promise<void> {
    await this.m("exercises:setMedia", {
      exerciseId,
      storageId: null,
      kind: null,
    });
  }

  // ── machines ───────────────────────────────────────────────────────────

  async listMachines(): Promise<Machine[]> {
    return live(await this.find<Machine>("machines")).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  searchMachineCatalog(
    query: string,
    opts: { category?: string | null; limit?: number } = {},
  ): Promise<MachineCatalogEntry[]> {
    return this.q("exercises:searchCatalog", {
      q: query,
      category: opts.category ?? null,
      limit: opts.limit ?? 20,
    });
  }

  listMachineCategories(): Promise<string[]> {
    return this.q("exercises:catalogCategories");
  }

  createMachine(input: NewMachineInput): Promise<Machine> {
    return this.insert<Machine>("machines", {
      id: input.id ?? newId(),
      name: input.name,
      brand: input.brand ?? null,
      catalogKey: input.catalogKey ?? null,
      settings: arr(input.settings),
      notes: input.notes ?? null,
    });
  }

  async updateMachine(id: string, patch: MachinePatch): Promise<void> {
    const row = present(patch as Row, ["brand", "catalogKey", "notes"]);
    if (patch.name != null) row.name = patch.name;
    if ("settings" in patch) row.settings = arr(patch.settings);
    await this.patchById("machines", id, row);
  }

  async deleteMachine(id: string): Promise<void> {
    await this.m("exercises:deleteMachine", { id });
  }

  async uploadMachinePhoto(machineId: string, file: Blob): Promise<void> {
    const storageId = await this.upload(file, "image/jpeg");
    await this.m("user:setPhoto", {
      table: "machines",
      id: machineId,
      storageId,
    });
  }

  machinePhotoUrl(machine: Machine) {
    return this.fileUrl(machine.photoPath);
  }

  uploadMachineSettingPhoto(_machineId: string, file: Blob): Promise<string> {
    // Each upload gets a new storage id. A replaced photo's blob stays stored:
    // the machine row still points at it until the caller saves the new id.
    return this.upload(file, "image/jpeg");
  }

  machineSettingPhotoUrl(path: string) {
    return this.fileUrl(path);
  }

  // ── sessions ───────────────────────────────────────────────────────────

  startSession(title?: string): Promise<Session> {
    return this.m("sessions:start", { id: newId(), title: title ?? null });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.patchById("sessions", sessionId, { endedAt: Date.now() });
  }

  async updateSessionStartedAt(sessionId: string, startedAt: number) {
    await this.patchById("sessions", sessionId, { startedAt });
  }

  activeSession(): Promise<Session | null> {
    return this.q("sessions:active");
  }

  addExerciseToSession(sessionId: string, exerciseId: string) {
    return this.m<string>("sessions:addExercise", {
      id: newId(),
      sessionId,
      exerciseId,
    });
  }

  logSet(
    sessionExerciseId: string,
    set: NewSetInput,
    id: string,
    setNo: number,
  ): Promise<string> {
    return this.m<string>("sessions:logSet", {
      row: {
        id,
        sessionExerciseId,
        setNo,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir ?? null,
        rirMin: set.rirMin ?? null,
        rirMax: set.rirMax ?? null,
        rpe: set.rpe ?? null,
        note: set.note ?? null,
        restSec: set.restSec ?? null,
        metricValues: set.metricValues ?? null,
        setType: set.setType ?? "normal",
        durationSec: set.durationSec ?? null,
        distanceM: set.distanceM ?? null,
        side: set.side ?? null,
        plannedRirMin: set.plannedRirMin ?? null,
        plannedRirMax: set.plannedRirMax ?? null,
        // Retries replay the same id; the server upserts on it.
        deletedAt: null,
      },
    });
  }

  async updateSet(setId: string, patch: Partial<NewSetInput>): Promise<void> {
    const row = present(patch as Row, SET_FIELDS);
    if ("setType" in patch) row.setType = patch.setType ?? "normal";
    await this.patchById("set_logs", setId, row);
  }

  deleteSet(id: string) {
    return this.softDelete("set_logs", id);
  }

  async deleteSessionExercise(id: string): Promise<void> {
    await this.m("sessions:deleteBlock", { id });
  }

  deleteMetric(id: string) {
    return this.softDelete("metrics", id);
  }

  async deleteSession(id: string): Promise<void> {
    await this.m("sessions:remove", { id });
  }

  async importSessions(sessions: ImportedSession[]): Promise<ImportResult> {
    const known = await this.listExercises();
    let exerciseIds = known.map((e) => [e.name.toLowerCase(), e.id]);
    const total: ImportResult = {
      imported: 0,
      skipped: 0,
      sets: 0,
      exercisesCreated: 0,
    };
    for (let i = 0; i < sessions.length; i += IMPORT_BATCH) {
      const batch = sessions.slice(i, i + IMPORT_BATCH).map((s) => ({
        title: s.title ?? null,
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets })),
      }));
      const res = await this.m<ImportResult & { exerciseIds: string[][] }>(
        "sessions:importBatch",
        { sessions: batch, exerciseIds },
      );
      exerciseIds = res.exerciseIds;
      total.imported += res.imported;
      total.skipped += res.skipped;
      total.sets += res.sets;
      total.exercisesCreated += res.exercisesCreated;
    }
    return total;
  }

  async applySleep(sleepHoursByDate: Map<string, number>): Promise<number> {
    // The local calendar date is the user's (browser) timezone, so match
    // here and send the server only session → hours.
    const sessions = await this.pageAll<Session>("sessions");
    const hoursBySession: Record<string, number> = {};
    for (const s of sessions) {
      if (s.conditionValues?.[SEED_CONDITIONS.sleepH] != null) continue;
      const hours = sleepHoursByDate.get(localDate(s.startedAt));
      if (hours != null) hoursBySession[s.id] = hours;
    }
    const entries = Object.entries(hoursBySession);
    let filled = 0;
    for (let i = 0; i < entries.length; i += SLEEP_BATCH) {
      filled += await this.m<number>("user:applySleep", {
        metricId: SEED_CONDITIONS.sleepH,
        hoursBySession: Object.fromEntries(entries.slice(i, i + SLEEP_BATCH)),
      });
    }
    return filled;
  }

  listSessionExercises(sessionId: string): Promise<SessionExerciseDetail[]> {
    return this.q("sessions:detail", { sessionId });
  }

  getSession(sessionId: string): Promise<Session | null> {
    return this.get<Session>("sessions", sessionId);
  }

  async updateSessionConditions(
    sessionId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    await this.patchById("sessions", sessionId, { conditionValues: values });
  }

  async updateSessionNotes(sessionId: string, notes: string | null) {
    await this.patchById("sessions", sessionId, {
      notes: notes?.length ? notes : null,
    });
  }

  listSessions(limit: number, offset: number): Promise<Session[]> {
    return this.q("sessions:list", { limit, offset });
  }

  private async history() {
    type HistorySession = {
      sessionId: string;
      startedAt: number;
      endedAt: number | null;
      pausedMs: number;
      conditionValues: Record<string, unknown> | null;
      exercises: {
        exerciseId: string;
        exerciseName: string;
        exerciseType: string;
        sets: (RecordsSessionInput["exercises"][number]["sets"][number] & {
          rpe: number | null;
        })[];
      }[];
    };
    const rows: HistorySession[] = [];
    let cursor: string | null = null;
    for (;;) {
      const res: Page<HistorySession> = await this.q<Page<HistorySession>>(
        "sessions:historyPage",
        { paginationOpts: { numItems: 50, cursor } },
      );
      rows.push(...res.page);
      if (res.isDone) return rows;
      cursor = res.continueCursor;
    }
  }

  async findingsData(): Promise<FindingsSessionInput[]> {
    return (await this.history()).map((s) => ({
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      conditionValues: s.conditionValues,
      sets: s.exercises.flatMap((e) =>
        e.sets.map((sl) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          weightKg: sl.weightKg,
          reps: sl.reps,
          setType: sl.setType,
          rir: sl.rir,
          rirMin: sl.rirMin,
          rirMax: sl.rirMax,
          rpe: sl.rpe,
        })),
      ),
    }));
  }

  async recordsData(): Promise<RecordsSessionInput[]> {
    return (await this.history()).map((s) => ({
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      pausedMs: s.pausedMs,
      exercises: s.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseType: e.exerciseType,
        sets: e.sets,
      })),
    }));
  }

  async updateSessionTitle(sessionId: string, title: string | null) {
    await this.patchById("sessions", sessionId, { title });
  }

  async updateSessionEndedAt(sessionId: string, endedAt: number) {
    await this.patchById("sessions", sessionId, { endedAt });
  }

  async updateSessionPausedMs(sessionId: string, pausedMs: number) {
    await this.patchById("sessions", sessionId, { pausedMs });
  }

  async updateSessionExercise(
    sessionExerciseId: string,
    patch: {
      supersetGroup?: number | null;
      restSec?: number | null;
      note?: string | null;
      exerciseId?: string;
    },
  ): Promise<void> {
    const row = present(patch as Row, ["supersetGroup", "restSec", "note"]);
    if ("exerciseId" in patch) row.exerciseId = patch.exerciseId;
    await this.patchById("session_exercises", sessionExerciseId, row);
  }

  async getSessionExercise(sessionExerciseId: string) {
    const row = await this.get<SessionExercise>(
      "session_exercises",
      sessionExerciseId,
    );
    return row ? { exerciseId: row.exerciseId } : null;
  }

  async lastSetsForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
    routineId?: string,
  ): Promise<GhostSet[]> {
    const rows = await this.q<
      {
        setNo: number;
        side: string | null;
        weightKg: number | null;
        reps: number | null;
        durationSec: number | null;
        distanceM: number | null;
      }[]
    >("sessions:lastSets", {
      exerciseId,
      ...(excludeSessionExerciseId ? { excludeSessionExerciseId } : {}),
      ...(routineId ? { routineId } : {}),
    });
    return groupSetsBySetNo(rows).map(([left, right]) => ({
      weightKg: left.weightKg,
      reps: left.reps,
      durationSec: left.durationSec,
      distanceM: left.distanceM,
      otherSide: right
        ? {
            weightKg: right.weightKg,
            reps: right.reps,
            durationSec: right.durationSec,
            distanceM: right.distanceM,
          }
        : null,
    }));
  }

  recentExerciseIds(days: number): Promise<string[]> {
    return this.q("sessions:recentExerciseIds", {
      since: Date.now() - days * 86_400_000,
    });
  }

  lastNoteForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
  ): Promise<string | null> {
    return this.q("sessions:lastNote", {
      exerciseId,
      ...(excludeSessionExerciseId ? { excludeSessionExerciseId } : {}),
    });
  }

  // ── metrics & conditions ───────────────────────────────────────────────

  async listMetrics(): Promise<Metric[]> {
    return live(await this.find<Metric>("metrics", undefined, true)).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
  }

  createMetric(input: NewMetricInput): Promise<Metric> {
    return this.insert<Metric>("metrics", {
      id: newId(),
      name: input.name,
      type: input.type,
      scope: input.scope,
      unit: input.unit ?? null,
    });
  }

  async setMetricExercises(metricId: string, exerciseIds: string[]) {
    await this.patchById("metrics", metricId, { exerciseIds });
  }

  async listTrackedConditions(): Promise<TrackedCondition[]> {
    return live(await this.find<TrackedCondition>("tracked_conditions"));
  }

  async setConditionTracked(metricId: string, tracked: boolean) {
    await this.m("user:upsert", {
      table: "tracked_conditions",
      key: metricId,
      patch: { tracked },
    });
  }

  // ── export & tokens ────────────────────────────────────────────────────

  async exportAll(): Promise<ExportBundle> {
    const own = (t: string) => this.pageAll(t).then((r) => r.sort(byCreated));
    const withGlobal = async (t: string) =>
      [
        ...(await this.pageAll(t)),
        ...(await this.pageAll(t, { global: true })),
      ].sort(byCreated);
    const [
      exercises,
      machines,
      metrics,
      sessions,
      sessionExercises,
      setLogs,
      measurements,
      routineFolders,
      routines,
      routineExercises,
      routineSets,
    ] = await Promise.all([
      withGlobal("exercises"),
      own("machines"),
      withGlobal("metrics"),
      own("sessions"),
      own("session_exercises"),
      own("set_logs"),
      own("measurements"),
      own("routine_folders"),
      own("routines"),
      own("routine_exercises"),
      own("routine_sets"),
    ]);
    return {
      schemaVersion: 3,
      exportedAt: Date.now(),
      exercises: exercises as Exercise[],
      machines: machines as Machine[],
      metrics: metrics as Metric[],
      sessions: sessions as Session[],
      sessionExercises: sessionExercises as SessionExercise[],
      setLogs: setLogs as SetLog[],
      measurements: measurements as Measurement[],
      routineFolders: routineFolders as RoutineFolder[],
      routines: routines as Routine[],
      routineExercises: routineExercises as RoutineExercise[],
      routineSets: routineSets as RoutineSet[],
    };
  }

  async listApiTokens(): Promise<ApiToken[]> {
    return (await this.find<ApiToken>("api_tokens")).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async createApiToken(name: string): Promise<CreatedApiToken> {
    const token = generateToken();
    const row = await this.m<ApiToken>("user:createToken", {
      id: newId(),
      name,
      tokenHash: await hashToken(token),
    });
    return { token, row };
  }

  async revokeApiToken(id: string): Promise<void> {
    await this.m("user:revokeToken", { id });
  }

  // ── workout media ──────────────────────────────────────────────────────

  async listSessionMedia(sessionId: string): Promise<SessionMediaRow[]> {
    return live(
      await this.find<SessionMediaRow>("session_media", { sessionId }),
    ).sort((a, b) => a.position - b.position);
  }

  async uploadSessionPhoto(
    sessionId: string,
    file: Blob,
    position: number,
  ): Promise<SessionMediaRow> {
    const storageId = await this.upload(file, "image/jpeg");
    return this.insert<SessionMediaRow>("session_media", {
      id: newId(),
      sessionId,
      path: storageId,
      position,
    });
  }

  async deleteSessionMedia(id: string): Promise<void> {
    await this.m("user:deleteSessionMedia", { id });
  }

  sessionMediaUrl(media: SessionMediaRow) {
    return this.fileUrl(media.path);
  }

  listAllSessionMedia(limit = 30): Promise<SessionMediaRow[]> {
    return this.q("user:recentMedia", { limit });
  }

  // ── favorites & per-exercise prefs ─────────────────────────────────────

  async listExerciseFavorites(): Promise<ExerciseFavorite[]> {
    return live(await this.find<ExerciseFavorite>("exercise_favorites"));
  }

  async setExerciseFavorite(exerciseId: string, favorite: boolean) {
    await this.m("user:upsert", {
      table: "exercise_favorites",
      key: exerciseId,
      patch: { favorite },
    });
  }

  async listExercisePrefs(): Promise<ExercisePref[]> {
    return live(await this.find<ExercisePref>("exercise_prefs"));
  }

  async setExerciseWeightUnit(exerciseId: string, unit: "kg" | "lb" | null) {
    await this.m("user:upsert", {
      table: "exercise_prefs",
      key: exerciseId,
      patch: { weightUnit: unit },
    });
  }

  async setGeneratorExcluded(exerciseId: string, excluded: boolean) {
    await this.m("user:upsert", {
      table: "exercise_prefs",
      key: exerciseId,
      patch: { generatorExcluded: excluded },
    });
  }

  // ── coach events (append-only, idempotent on the client id) ───────────

  recordCoachEvent(
    input: NewCoachEventInput,
    id: string = newId(),
  ): Promise<CoachEvent> {
    return this.m<CoachEvent>("coach:record", {
      id,
      suggestionId: input.suggestionId,
      ruleId: input.ruleId,
      exerciseId: input.exerciseId ?? null,
      sessionId: input.sessionId ?? null,
      state: input.state,
      scope: input.scope ?? null,
      payload: input.payload ?? null,
    });
  }

  listCoachEvents(
    opts: { ruleId?: string; since?: number; limit?: number } = {},
  ): Promise<CoachEvent[]> {
    return this.q<CoachEvent[]>("coach:list", opts);
  }

  async getUserPrefs(): Promise<UserPrefs | null> {
    return live(await this.find<UserPrefs>("user_prefs"))[0] ?? null;
  }

  async updateUserPrefs(patch: UserPrefsPatch): Promise<void> {
    const row: Row = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) row[k] = val;
    }
    for (const k of [
      "defaultRestSec",
      "plateConfig",
      "displayName",
      "bio",
      "goal",
      "trainingStatus",
    ]) {
      if (k in patch) row[k] = (patch as Row)[k] ?? null;
    }
    await this.m("user:updatePrefs", { patch: row });
  }

  // ── routines & folders ─────────────────────────────────────────────────

  async listRoutineFolders(): Promise<RoutineFolder[]> {
    return live(await this.find<RoutineFolder>("routine_folders")).sort(
      (a, b) => a.position - b.position || a.createdAt - b.createdAt,
    );
  }

  createRoutineFolder(name: string): Promise<RoutineFolder> {
    return this.m("routines:createFolder", { id: newId(), name });
  }

  async renameRoutineFolder(id: string, name: string) {
    await this.patchById("routine_folders", id, { name });
  }

  async reorderRoutineFolders(ids: string[]) {
    await this.m("routines:reorder", { table: "routine_folders", ids });
  }

  async deleteRoutineFolder(id: string) {
    await this.m("routines:deleteFolder", { id });
  }

  async listRoutines(): Promise<Routine[]> {
    return live(await this.find<Routine>("routines")).sort(
      (a, b) => a.position - b.position || a.createdAt - b.createdAt,
    );
  }

  getRoutineDetail(routineId: string): Promise<RoutineDetail | null> {
    return this.q("routines:detail", { routineId });
  }

  private routineArgs(input: NewRoutineInput) {
    return {
      name: input.name,
      folderId: input.folderId ?? null,
      description: input.description ?? null,
      exercises: input.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        orderIndex: e.orderIndex,
        supersetGroup: e.supersetGroup ?? null,
        restSec: e.restSec ?? null,
        note: e.note ?? null,
        sets: e.sets.map((s) => ({
          setNo: s.setNo,
          setType: s.setType ?? "normal",
          targetWeightKg: s.targetWeightKg ?? null,
          targetReps: s.targetReps ?? null,
          targetRepsMax: s.targetRepsMax ?? null,
          targetDurationSec: s.targetDurationSec ?? null,
          targetDistanceM: s.targetDistanceM ?? null,
          targetRirMin: s.targetRirMin ?? null,
          targetRirMax: s.targetRirMax ?? null,
          laterality: s.laterality ?? null,
        })),
      })),
    };
  }

  createRoutine(input: NewRoutineInput): Promise<Routine> {
    return this.m("routines:create", {
      id: newId(),
      ...this.routineArgs(input),
    });
  }

  async updateRoutine(routineId: string, input: NewRoutineInput) {
    await this.m("routines:update", { routineId, ...this.routineArgs(input) });
  }

  async moveRoutine(routineId: string, folderId: string | null) {
    await this.patchById("routines", routineId, { folderId });
  }

  async reorderRoutines(ids: string[]) {
    await this.m("routines:reorder", { table: "routines", ids });
  }

  async duplicateRoutine(routineId: string, name?: string): Promise<Routine> {
    const detail = await this.getRoutineDetail(routineId);
    if (!detail) throw new Error("Routine not found");
    return this.createRoutine({
      name: name ?? `${detail.routine.name} (copy)`,
      folderId: detail.routine.folderId,
      description: detail.routine.description,
      exercises: detail.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        orderIndex: e.orderIndex,
        supersetGroup: e.supersetGroup,
        restSec: e.restSec,
        note: e.note,
        sets: e.sets.map((s) => ({
          setNo: s.setNo,
          setType: s.setType,
          targetWeightKg: s.targetWeightKg,
          targetReps: s.targetReps,
          targetRepsMax: s.targetRepsMax,
          targetDurationSec: s.targetDurationSec,
          targetDistanceM: s.targetDistanceM,
          targetRirMin: s.targetRirMin,
          targetRirMax: s.targetRirMax,
          laterality: s.laterality,
        })),
      })),
    });
  }

  async deleteRoutine(routineId: string) {
    await this.m("routines:remove", { routineId });
  }

  startRoutineSession(
    routineId: string,
    prescriptions?: Record<string, SnapshotOverride>,
  ): Promise<Session> {
    return this.m("sessions:startFromRoutine", {
      id: newId(),
      routineId,
      ...(prescriptions ? { prescriptions } : {}),
    });
  }

  async updateRoutineValues(
    routineId: string,
    performed: Parameters<Repo["updateRoutineValues"]>[1],
  ): Promise<void> {
    await this.m("routines:updateValues", { routineId, performed });
  }

  // ── push subscriptions ─────────────────────────────────────────────────

  async listPushSubscriptions(): Promise<PushSubscription[]> {
    return live(await this.find<PushSubscription>("push_subscriptions"));
  }

  async savePushSubscription(
    endpoint: string,
    keys: { p256dh: string; auth: string },
  ) {
    await this.m("user:upsert", {
      table: "push_subscriptions",
      key: endpoint,
      patch: { keys },
    });
  }

  async deletePushSubscription(endpoint: string) {
    const now = Date.now();
    await this.update(
      "push_subscriptions",
      { endpoint },
      { deletedAt: now, updatedAt: now },
    );
  }

  // ── programs ───────────────────────────────────────────────────────────

  async listPrograms(): Promise<Program[]> {
    return live(await this.find<Program>("programs")).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  activeProgram(): Promise<Program | null> {
    return this.q("routines:activeProgram");
  }

  createProgram(input: {
    source: "generated" | "library";
    folderId: string;
    config?: Record<string, unknown> | null;
    libraryKey?: string | null;
  }): Promise<Program> {
    return this.m("routines:createProgram", {
      id: newId(),
      source: input.source,
      folderId: input.folderId,
      config: input.config ?? null,
      libraryKey: input.libraryKey ?? null,
    });
  }

  async setProgramActive(programId: string, active: boolean) {
    await this.patchById("programs", programId, { active });
  }

  async updateProgramConfig(
    programId: string,
    config: Record<string, unknown>,
  ) {
    await this.patchById("programs", programId, { config });
  }

  async deleteProgram(programId: string) {
    const now = Date.now();
    await this.update(
      "programs",
      { id: programId },
      { deletedAt: now, active: false, updatedAt: now },
    );
  }

  // ── measurements ───────────────────────────────────────────────────────

  async listMeasurements(): Promise<Measurement[]> {
    return (await this.pageAll<Measurement>("measurements")).sort(
      (a, b) =>
        (a.measuredOn < b.measuredOn
          ? 1
          : a.measuredOn > b.measuredOn
            ? -1
            : 0) || a.id.localeCompare(b.id),
    );
  }

  upsertMeasurement(
    measuredOn: string,
    patch: MeasurementPatch,
  ): Promise<Measurement> {
    return this.m("user:upsertMeasurement", {
      measuredOn,
      patch: present(patch as Row, MEASUREMENT_FIELDS),
    });
  }

  deleteMeasurement(id: string) {
    return this.softDelete("measurements", id);
  }

  async uploadProgressPhoto(measurementId: string, file: Blob) {
    const storageId = await this.upload(file, "image/jpeg");
    await this.m("user:setPhoto", {
      table: "measurements",
      id: measurementId,
      storageId,
    });
  }

  async clearProgressPhoto(measurementId: string) {
    await this.m("user:setPhoto", {
      table: "measurements",
      id: measurementId,
      storageId: null,
    });
  }

  progressPhotoUrl(m: Measurement) {
    return this.fileUrl(m.photoPath);
  }

  latestBodyweightKg(onOrBefore?: string): Promise<number | null> {
    return this.q("user:latestBodyweight", onOrBefore ? { onOrBefore } : {});
  }
}
