import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApiToken,
  Exercise,
  ExerciseFavorite,
  Machine,
  MachineSetting,
  Metric,
  Session,
  SessionExercise,
  SetLog,
  TrackedCondition,
} from "../db/schema";
import { SEED_CONDITIONS } from "../db/seed-ids";
import type { MuscleTarget } from "../domain/anatomy";
import { newId } from "../domain/ids";
import { generateToken, hashToken } from "../domain/tokens";
import type { FindingsSessionInput } from "../findings/types";
import type { ImportedSession, ImportResult } from "../import/types";
import type {
  CreatedApiToken,
  ExerciseClassification,
  ExportBundle,
  GhostSet,
  MachinePatch,
  NewExerciseOpts,
  NewMachineInput,
  NewMetricInput,
  NewSetInput,
  Repo,
  SessionExerciseDetail,
} from "./types";

type Row = Record<string, unknown>;

// PostgREST speaks snake_case; the app speaks the schema's camelCase types.
function toExercise(r: Row): Exercise {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: (r.owner_id as string | null) ?? null,
    name: r.name as string,
    tags: (r.tags as string[] | null) ?? null,
    isCustom: r.is_custom as boolean,
    machineId: (r.machine_id as string | null) ?? null,
    jointActions: (r.joint_actions as string[] | null) ?? null,
    muscleTargets: (r.muscle_targets as MuscleTarget[] | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    imageAttribution: (r.image_attribution as string | null) ?? null,
  };
}

function toMachine(r: Row): Machine {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    name: r.name as string,
    brand: (r.brand as string | null) ?? null,
    catalogKey: (r.catalog_key as string | null) ?? null,
    settings: (r.settings as MachineSetting[] | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    photoPath: (r.photo_path as string | null) ?? null,
  };
}

function toSession(r: Row): Session {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    title: (r.title as string | null) ?? null,
    startedAt: r.started_at as number,
    endedAt: (r.ended_at as number | null) ?? null,
    conditionValues:
      (r.condition_values as Record<string, unknown> | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

function toMetric(r: Row): Metric {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: (r.owner_id as string | null) ?? null,
    name: r.name as string,
    type: r.type as string,
    scope: r.scope as string,
    unit: (r.unit as string | null) ?? null,
    exerciseIds: (r.exercise_ids as string[] | null) ?? null,
  };
}

function toTrackedCondition(r: Row): TrackedCondition {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    metricId: r.metric_id as string,
    tracked: r.tracked as boolean,
    position: (r.position as number | null) ?? null,
  };
}

function toExerciseFavorite(r: Row): ExerciseFavorite {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    exerciseId: r.exercise_id as string,
    favorite: r.favorite as boolean,
  };
}

function toSessionExercise(r: Row): SessionExercise {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    sessionId: r.session_id as string,
    exerciseId: r.exercise_id as string,
    orderIndex: r.order_index as number,
  };
}

function toSetLog(r: Row): SetLog {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    sessionExerciseId: r.session_exercise_id as string,
    setNo: r.set_no as number,
    weightKg: (r.weight_kg as number | null) ?? null,
    reps: (r.reps as number | null) ?? null,
    rir: (r.rir as number | null) ?? null,
    rpe: (r.rpe as number | null) ?? null,
    note: (r.note as string | null) ?? null,
    restSec: (r.rest_sec as number | null) ?? null,
    metricValues: (r.metric_values as Record<string, unknown> | null) ?? null,
    completed: r.completed as boolean,
  };
}

function toApiToken(r: Row): ApiToken {
  return {
    id: r.id as string,
    createdAt: r.created_at as number,
    lastUsedAt: (r.last_used_at as number | null) ?? null,
    revokedAt: (r.revoked_at as number | null) ?? null,
    ownerId: r.owner_id as string,
    name: r.name as string,
    tokenHash: r.token_hash as string,
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepo implements Repo {
  constructor(private client: SupabaseClient) {}

  async createExercise(
    name: string,
    opts?: NewExerciseOpts,
  ): Promise<Exercise> {
    const now = Date.now();
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      name,
      is_custom: true,
      machine_id: opts?.machineId ?? null,
      joint_actions: opts?.jointActions?.length ? opts.jointActions : null,
      muscle_targets: opts?.muscleTargets?.length ? opts.muscleTargets : null,
    };
    const { data, error } = await this.client
      .from("exercises")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return toExercise(data as Row);
  }

  async listMachines(): Promise<Machine[]> {
    const { data, error } = await this.client
      .from("machines")
      .select()
      .is("deleted_at", null)
      .order("name");
    throwIf(error);
    return (data as Row[]).map(toMachine);
  }

  async createMachine(input: NewMachineInput): Promise<Machine> {
    const now = Date.now();
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      name: input.name,
      brand: input.brand ?? null,
      catalog_key: input.catalogKey ?? null,
      settings: input.settings?.length ? input.settings : null,
      notes: input.notes ?? null,
    };
    const { data, error } = await this.client
      .from("machines")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return toMachine(data as Row);
  }

  async updateMachine(id: string, patch: MachinePatch): Promise<void> {
    const row: Row = { updated_at: Date.now() };
    if ("name" in patch && patch.name != null) row.name = patch.name;
    if ("brand" in patch) row.brand = patch.brand ?? null;
    if ("catalogKey" in patch) row.catalog_key = patch.catalogKey ?? null;
    if ("settings" in patch)
      row.settings = patch.settings?.length ? patch.settings : null;
    if ("notes" in patch) row.notes = patch.notes ?? null;
    const { error } = await this.client
      .from("machines")
      .update(row)
      .eq("id", id);
    throwIf(error);
  }

  async deleteMachine(id: string): Promise<void> {
    await this.softDelete("machines", id);
    const { error } = await this.client
      .from("exercises")
      .update({ machine_id: null, updated_at: Date.now() })
      .eq("machine_id", id);
    throwIf(error);
  }

  async setExerciseMachine(
    exerciseId: string,
    machineId: string | null,
  ): Promise<void> {
    const { error } = await this.client
      .from("exercises")
      .update({ machine_id: machineId, updated_at: Date.now() })
      .eq("id", exerciseId);
    throwIf(error);
  }

  async setExerciseClassification(
    exerciseId: string,
    classification: ExerciseClassification,
  ): Promise<void> {
    const row: Row = { updated_at: Date.now() };
    if ("jointActions" in classification)
      row.joint_actions = classification.jointActions?.length
        ? classification.jointActions
        : null;
    if ("muscleTargets" in classification)
      row.muscle_targets = classification.muscleTargets?.length
        ? classification.muscleTargets
        : null;
    const { error } = await this.client
      .from("exercises")
      .update(row)
      .eq("id", exerciseId);
    throwIf(error);
  }

  private async ownerId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
    return data.user.id;
  }

  async uploadMachinePhoto(machineId: string, file: Blob): Promise<void> {
    const uid = await this.ownerId();
    const path = `${uid}/${machineId}.jpg`;
    const { error: uploadError } = await this.client.storage
      .from("machine-photos")
      .upload(path, file, { upsert: true, contentType: "image/jpeg" });
    throwIf(uploadError);
    const { error } = await this.client
      .from("machines")
      .update({ photo_path: path, updated_at: Date.now() })
      .eq("id", machineId);
    throwIf(error);
  }

  async machinePhotoUrl(machine: Machine): Promise<string | null> {
    if (!machine.photoPath) return null;
    const { data, error } = await this.client.storage
      .from("machine-photos")
      .createSignedUrl(machine.photoPath, 60 * 60);
    throwIf(error);
    return data?.signedUrl ?? null;
  }

  async listExercises(): Promise<Exercise[]> {
    const { data, error } = await this.client
      .from("exercises")
      .select()
      .is("deleted_at", null)
      .order("name");
    throwIf(error);
    return (data as Row[]).map(toExercise);
  }

  async startSession(title?: string): Promise<Session> {
    const now = Date.now();
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      title: title ?? null,
      started_at: now,
    };
    const { data, error } = await this.client
      .from("sessions")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return toSession(data as Row);
  }

  async endSession(sessionId: string): Promise<void> {
    const now = Date.now();
    const { error } = await this.client
      .from("sessions")
      .update({ ended_at: now, updated_at: now })
      .eq("id", sessionId);
    throwIf(error);
  }

  async updateSessionStartedAt(
    sessionId: string,
    startedAt: number,
  ): Promise<void> {
    const { error } = await this.client
      .from("sessions")
      .update({ started_at: startedAt, updated_at: Date.now() })
      .eq("id", sessionId);
    throwIf(error);
  }

  async activeSession(): Promise<Session | null> {
    const { data, error } = await this.client
      .from("sessions")
      .select()
      .is("ended_at", null)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1);
    throwIf(error);
    const row = (data as Row[] | null)?.[0];
    return row ? toSession(row) : null;
  }

  private async softDelete(table: string, id: string): Promise<void> {
    const now = Date.now();
    const { error } = await this.client
      .from(table)
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id);
    throwIf(error);
  }

  deleteSet(id: string) {
    return this.softDelete("set_logs", id);
  }
  deleteExercise(id: string) {
    return this.softDelete("exercises", id);
  }
  deleteMetric(id: string) {
    return this.softDelete("metrics", id);
  }

  // Soft-delete cascade helper. Reads that key off session_exercises/set_logs
  // (ghost prefill, export) filter each table's own deleted_at without joining
  // the parent, so a soft-deleted parent must tombstone its children too — else
  // orphaned rows resurface (e.g. a deleted session's sets in ghost prefill).
  private async softDeleteSetsOf(
    sessionExerciseIds: string[],
    now: number,
  ): Promise<void> {
    if (sessionExerciseIds.length === 0) return;
    const { error } = await this.client
      .from("set_logs")
      .update({ deleted_at: now, updated_at: now })
      .in("session_exercise_id", sessionExerciseIds);
    throwIf(error);
  }

  async deleteSessionExercise(id: string): Promise<void> {
    const now = Date.now();
    await this.softDeleteSetsOf([id], now);
    const { error } = await this.client
      .from("session_exercises")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id);
    throwIf(error);
  }

  async deleteSession(id: string): Promise<void> {
    const now = Date.now();
    const { data: ses, error: seErr } = await this.client
      .from("session_exercises")
      .select("id")
      .eq("session_id", id);
    throwIf(seErr);
    const seIds = (ses ?? []).map((r) => r.id as string);
    await this.softDeleteSetsOf(seIds, now);
    if (seIds.length > 0) {
      const { error: seUpdErr } = await this.client
        .from("session_exercises")
        .update({ deleted_at: now, updated_at: now })
        .eq("session_id", id);
      throwIf(seUpdErr);
    }
    const { error } = await this.client
      .from("sessions")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id);
    throwIf(error);
  }

  async updateSet(setId: string, patch: Partial<NewSetInput>): Promise<void> {
    const row: Row = { updated_at: Date.now() };
    if ("weightKg" in patch) row.weight_kg = patch.weightKg ?? null;
    if ("reps" in patch) row.reps = patch.reps ?? null;
    if ("rir" in patch) row.rir = patch.rir ?? null;
    if ("rpe" in patch) row.rpe = patch.rpe ?? null;
    if ("note" in patch) row.note = patch.note ?? null;
    if ("restSec" in patch) row.rest_sec = patch.restSec ?? null;
    if ("metricValues" in patch) row.metric_values = patch.metricValues ?? null;
    const { error } = await this.client
      .from("set_logs")
      .update(row)
      .eq("id", setId);
    throwIf(error);
  }

  async setExerciseTags(exerciseId: string, tags: string[]): Promise<void> {
    const { error } = await this.client
      .from("exercises")
      .update({ tags: tags.length ? tags : null, updated_at: Date.now() })
      .eq("id", exerciseId);
    throwIf(error);
  }

  async addExerciseToSession(
    sessionId: string,
    exerciseId: string,
  ): Promise<string> {
    const now = Date.now();
    const { count, error: countError } = await this.client
      .from("session_exercises")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    throwIf(countError);
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      session_id: sessionId,
      exercise_id: exerciseId,
      order_index: count ?? 0,
    };
    const { error } = await this.client.from("session_exercises").insert(row);
    throwIf(error);
    return row.id;
  }

  async logSet(sessionExerciseId: string, set: NewSetInput): Promise<string> {
    const now = Date.now();
    const { count, error: countError } = await this.client
      .from("set_logs")
      .select("id", { count: "exact", head: true })
      .eq("session_exercise_id", sessionExerciseId);
    throwIf(countError);
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      session_exercise_id: sessionExerciseId,
      set_no: count ?? 0,
      weight_kg: set.weightKg,
      reps: set.reps,
      rir: set.rir ?? null,
      rpe: set.rpe ?? null,
      note: set.note ?? null,
      rest_sec: set.restSec ?? null,
      metric_values: set.metricValues ?? null,
      completed: true,
    };
    const { error } = await this.client.from("set_logs").insert(row);
    throwIf(error);
    return row.id;
  }

  async listSessionExercises(
    sessionId: string,
  ): Promise<SessionExerciseDetail[]> {
    const { data, error } = await this.client
      .from("session_exercises")
      .select(
        "id, exercise_id, order_index, exercises(name), set_logs(id, set_no, weight_kg, reps, rir, rpe, note, rest_sec, deleted_at)",
      )
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("order_index");
    throwIf(error);
    return ((data as Row[]) ?? []).map((r) => ({
      id: r.id as string,
      exerciseId: r.exercise_id as string,
      exerciseName: ((r.exercises as Row | null)?.name as string) ?? "",
      orderIndex: r.order_index as number,
      sets: ((r.set_logs as Row[]) ?? [])
        .filter((s) => s.deleted_at == null)
        .sort((a, b) => (a.set_no as number) - (b.set_no as number))
        .map((s) => ({
          id: s.id as string,
          setNo: s.set_no as number,
          weightKg: (s.weight_kg as number | null) ?? null,
          reps: (s.reps as number | null) ?? null,
          rir: (s.rir as number | null) ?? null,
          rpe: (s.rpe as number | null) ?? null,
          note: (s.note as string | null) ?? null,
          restSec: (s.rest_sec as number | null) ?? null,
        })),
    }));
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from("sessions")
      .select()
      .eq("id", sessionId)
      .maybeSingle();
    throwIf(error);
    return data ? toSession(data as Row) : null;
  }

  async updateSessionConditions(
    sessionId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    // Replace semantics: the conditions dialog owns the full set, so removing
    // a condition sticks. (applySleep does its own read-merge-write.)
    const { error } = await this.client
      .from("sessions")
      .update({ condition_values: values, updated_at: Date.now() })
      .eq("id", sessionId);
    throwIf(error);
  }

  async updateSessionNotes(
    sessionId: string,
    notes: string | null,
  ): Promise<void> {
    const { error } = await this.client
      .from("sessions")
      .update({
        notes: notes?.length ? notes : null,
        updated_at: Date.now(),
      })
      .eq("id", sessionId);
    throwIf(error);
  }

  async listSessions(limit: number, offset: number): Promise<Session[]> {
    const { data, error } = await this.client
      .from("sessions")
      .select()
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    throwIf(error);
    return (data as Row[]).map(toSession);
  }

  async findingsData(): Promise<FindingsSessionInput[]> {
    const { data, error } = await this.client
      .from("sessions")
      .select(
        "id, started_at, condition_values, deleted_at, session_exercises(exercise_id, deleted_at, exercises(name), set_logs(weight_kg, reps, deleted_at))",
      )
      .is("deleted_at", null)
      .order("started_at", { ascending: true });
    throwIf(error);
    return ((data as Row[]) ?? []).map((s) => ({
      sessionId: s.id as string,
      startedAt: s.started_at as number,
      conditionValues:
        (s.condition_values as Record<string, unknown> | null) ?? null,
      sets: ((s.session_exercises as Row[]) ?? [])
        .filter((se) => se.deleted_at == null)
        .flatMap((se) =>
          (
            ((se.set_logs as Row[]) ?? []).filter(
              (sl) => sl.deleted_at == null,
            ) ?? []
          ).map((sl) => ({
            exerciseId: se.exercise_id as string,
            exerciseName: ((se.exercises as Row | null)?.name as string) ?? "",
            weightKg: (sl.weight_kg as number | null) ?? null,
            reps: (sl.reps as number | null) ?? null,
          })),
        ),
    }));
  }

  async listMetrics(): Promise<Metric[]> {
    const { data, error } = await this.client
      .from("metrics")
      .select()
      .is("deleted_at", null)
      .order("name");
    throwIf(error);
    return (data as Row[]).map(toMetric);
  }

  async createMetric(input: NewMetricInput): Promise<Metric> {
    const now = Date.now();
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      name: input.name,
      type: input.type,
      scope: input.scope,
      unit: input.unit ?? null,
    };
    const { data, error } = await this.client
      .from("metrics")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return toMetric(data as Row);
  }

  async listTrackedConditions(): Promise<TrackedCondition[]> {
    const { data, error } = await this.client
      .from("tracked_conditions")
      .select()
      .is("deleted_at", null);
    throwIf(error);
    return (data as Row[]).map(toTrackedCondition);
  }

  async setConditionTracked(metricId: string, tracked: boolean): Promise<void> {
    // Upsert one row per (owner, metric). RLS scopes rows to the caller, so an
    // update by metric_id targets only their own row; insert falls back when
    // none exists yet. owner_id defaults to auth.uid().
    const now = Date.now();
    const { data: updated, error: updateError } = await this.client
      .from("tracked_conditions")
      .update({ tracked, deleted_at: null, updated_at: now })
      .eq("metric_id", metricId)
      .select("id");
    throwIf(updateError);
    if (updated && updated.length > 0) return;
    const { error } = await this.client.from("tracked_conditions").insert({
      id: newId(),
      created_at: now,
      updated_at: now,
      metric_id: metricId,
      tracked,
    });
    throwIf(error);
  }

  async setMetricExercises(
    metricId: string,
    exerciseIds: string[],
  ): Promise<void> {
    const { error } = await this.client
      .from("metrics")
      .update({ exercise_ids: exerciseIds, updated_at: Date.now() })
      .eq("id", metricId);
    throwIf(error);
  }

  private async chunkedInsert(table: string, rows: Row[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.client
        .from(table)
        .insert(rows.slice(i, i + CHUNK));
      throwIf(error);
    }
  }

  async importSessions(sessions: ImportedSession[]): Promise<ImportResult> {
    // Idempotency: a session is identified by its started_at timestamp.
    const { data: existingRows, error: existingError } = await this.client
      .from("sessions")
      .select("started_at");
    throwIf(existingError);
    const existing = new Set(
      ((existingRows as Row[]) ?? []).map((r) => r.started_at as number),
    );

    const fresh = sessions.filter((s) => !existing.has(s.startedAt));
    const skipped = sessions.length - fresh.length;
    if (fresh.length === 0) {
      return { imported: 0, skipped, sets: 0, exercisesCreated: 0 };
    }

    // Find-or-create exercises by case-insensitive name (seeds included).
    const known = await this.listExercises();
    const idByName = new Map(known.map((e) => [e.name.toLowerCase(), e.id]));
    const newExercises: Row[] = [];
    for (const session of fresh) {
      for (const ex of session.exercises) {
        const key = ex.name.toLowerCase();
        if (!idByName.has(key)) {
          const id = newId();
          idByName.set(key, id);
          newExercises.push({
            id,
            created_at: session.startedAt,
            updated_at: session.startedAt,
            name: ex.name,
            is_custom: true,
          });
        }
      }
    }
    await this.chunkedInsert("exercises", newExercises);

    // Historical created_at keeps ghost-prefill ordering chronological.
    const sessionRows: Row[] = [];
    const seRows: Row[] = [];
    const setRows: Row[] = [];
    for (const session of fresh) {
      const sessionId = newId();
      const t = session.startedAt;
      sessionRows.push({
        id: sessionId,
        created_at: t,
        updated_at: t,
        title: session.title,
        started_at: t,
        ended_at: session.endedAt,
      });
      session.exercises.forEach((ex, orderIndex) => {
        const seId = newId();
        seRows.push({
          id: seId,
          created_at: t,
          updated_at: t,
          session_id: sessionId,
          exercise_id: idByName.get(ex.name.toLowerCase()),
          order_index: orderIndex,
        });
        ex.sets.forEach((set, setNo) => {
          setRows.push({
            id: newId(),
            created_at: t,
            updated_at: t,
            session_exercise_id: seId,
            set_no: setNo,
            weight_kg: set.weightKg,
            reps: set.reps,
            rir: set.rir,
            note: set.note,
            completed: true,
          });
        });
      });
    }
    await this.chunkedInsert("sessions", sessionRows);
    await this.chunkedInsert("session_exercises", seRows);
    await this.chunkedInsert("set_logs", setRows);

    return {
      imported: fresh.length,
      skipped,
      sets: setRows.length,
      exercisesCreated: newExercises.length,
    };
  }

  async applySleep(sleepHoursByDate: Map<string, number>): Promise<number> {
    const { data, error } = await this.client
      .from("sessions")
      .select("id, started_at, condition_values")
      .is("deleted_at", null);
    throwIf(error);
    const rows = (data as Row[]) ?? [];

    const updates: { id: string; merged: Record<string, unknown> }[] = [];
    for (const r of rows) {
      const conditions =
        (r.condition_values as Record<string, unknown> | null) ?? {};
      if (conditions[SEED_CONDITIONS.sleepH] != null) continue; // never overwrite
      const d = new Date(r.started_at as number);
      const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hours = sleepHoursByDate.get(dateISO);
      if (hours == null) continue;
      updates.push({
        id: r.id as string,
        merged: { ...conditions, [SEED_CONDITIONS.sleepH]: hours },
      });
    }

    const now = Date.now();
    for (const u of updates) {
      const { error: updateError } = await this.client
        .from("sessions")
        .update({ condition_values: u.merged, updated_at: now })
        .eq("id", u.id);
      throwIf(updateError);
    }
    return updates.length;
  }

  async exportAll(): Promise<ExportBundle> {
    const [exercises, machines, metrics, sessions, sessionExercises, setLogs] =
      await Promise.all([
        this.client.from("exercises").select().is("deleted_at", null),
        this.client.from("machines").select().is("deleted_at", null),
        this.client.from("metrics").select().is("deleted_at", null),
        this.client.from("sessions").select().is("deleted_at", null),
        this.client.from("session_exercises").select().is("deleted_at", null),
        this.client.from("set_logs").select().is("deleted_at", null),
      ]);
    for (const r of [
      exercises,
      machines,
      metrics,
      sessions,
      sessionExercises,
      setLogs,
    ])
      throwIf(r.error);
    return {
      schemaVersion: 2,
      exportedAt: Date.now(),
      exercises: (exercises.data as Row[]).map(toExercise),
      machines: (machines.data as Row[]).map(toMachine),
      metrics: (metrics.data as Row[]).map(toMetric),
      sessions: (sessions.data as Row[]).map(toSession),
      sessionExercises: (sessionExercises.data as Row[]).map(toSessionExercise),
      setLogs: (setLogs.data as Row[]).map(toSetLog),
    };
  }

  async listApiTokens(): Promise<ApiToken[]> {
    const { data, error } = await this.client
      .from("api_tokens")
      .select()
      .order("created_at", { ascending: false });
    throwIf(error);
    return (data as Row[]).map(toApiToken);
  }

  async createApiToken(name: string): Promise<CreatedApiToken> {
    const token = generateToken();
    const row = {
      id: newId(),
      created_at: Date.now(),
      name,
      token_hash: await hashToken(token),
    };
    const { data, error } = await this.client
      .from("api_tokens")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return { token, row: toApiToken(data as Row) };
  }

  async revokeApiToken(id: string): Promise<void> {
    const { error } = await this.client
      .from("api_tokens")
      .update({ revoked_at: Date.now() })
      .eq("id", id);
    throwIf(error);
  }

  async lastSetsForExercise(
    exerciseId: string,
    excludeSessionExerciseId?: string,
  ): Promise<GhostSet[]> {
    let query = this.client
      .from("session_exercises")
      .select("id, set_logs(weight_kg, reps, set_no, deleted_at)")
      .eq("exercise_id", exerciseId)
      .is("deleted_at", null)
      // created_at is millisecond-resolution and can tie; id desc breaks ties
      // deterministically (replaces the SQLite rowid-desc tiebreak).
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    if (excludeSessionExerciseId)
      query = query.neq("id", excludeSessionExerciseId);
    const { data, error } = await query;
    throwIf(error);
    const latest = (data as Row[] | null)?.[0];
    if (!latest) return [];
    const sets = (latest.set_logs as Row[]) ?? [];
    return sets
      .filter((s) => s.deleted_at == null)
      .sort((a, b) => (a.set_no as number) - (b.set_no as number))
      .map((s) => ({
        weightKg: (s.weight_kg as number | null) ?? null,
        reps: (s.reps as number | null) ?? null,
      }));
  }

  async listExerciseFavorites(): Promise<ExerciseFavorite[]> {
    const { data, error } = await this.client
      .from("exercise_favorites")
      .select()
      .is("deleted_at", null);
    throwIf(error);
    return (data as Row[]).map(toExerciseFavorite);
  }

  async setExerciseFavorite(
    exerciseId: string,
    favorite: boolean,
  ): Promise<void> {
    // Upsert one row per (owner, exercise), same pattern as setConditionTracked.
    const now = Date.now();
    const { data: updated, error: updateError } = await this.client
      .from("exercise_favorites")
      .update({ favorite, deleted_at: null, updated_at: now })
      .eq("exercise_id", exerciseId)
      .select("id");
    throwIf(updateError);
    if (updated && updated.length > 0) return;
    const { error } = await this.client.from("exercise_favorites").insert({
      id: newId(),
      created_at: now,
      updated_at: now,
      exercise_id: exerciseId,
      favorite,
    });
    throwIf(error);
  }
}
