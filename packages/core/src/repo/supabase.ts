import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exercise, Session } from "../db/schema";
import { newId } from "../domain/ids";
import type { GhostSet, NewSetInput, Repo } from "./types";

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
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseRepo implements Repo {
  constructor(private client: SupabaseClient) {}

  async createExercise(name: string): Promise<Exercise> {
    const now = Date.now();
    const row = {
      id: newId(),
      created_at: now,
      updated_at: now,
      name,
      is_custom: true,
    };
    const { data, error } = await this.client
      .from("exercises")
      .insert(row)
      .select()
      .single();
    throwIf(error);
    return toExercise(data as Row);
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
      note: set.note ?? null,
      completed: true,
    };
    const { error } = await this.client.from("set_logs").insert(row);
    throwIf(error);
    return row.id;
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
}
