import type { FindingsSessionInput } from "@sbl/core";

// Thin client over the personal-access-token REST API — the MCP server
// deliberately dogfoods the public API instead of talking to the database.
const API_URL =
  process.env.SBL_API_URL ?? "http://127.0.0.1:54321/functions/v1/api";
const TOKEN = process.env.SBL_TOKEN ?? "";

export async function api<T>(path: string): Promise<T> {
  if (!TOKEN)
    throw new Error(
      "SBL_TOKEN env var is required (create one in Settings → API tokens)",
    );
  const res = await fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

type Row = Record<string, unknown>;

export type ExportJson = {
  schema_version: number;
  exported_at: number;
  exercises: Row[];
  metrics: Row[];
  sessions: Row[];
  session_exercises: Row[];
  set_logs: Row[];
};

export const fetchExport = () => api<ExportJson>("/v1/export");

/** Joins the export bundle into the findings engine's session shape. */
export function toFindingsInputs(bundle: ExportJson): FindingsSessionInput[] {
  const exerciseName = new Map(
    bundle.exercises.map((e) => [e.id as string, e.name as string]),
  );
  const seById = new Map(
    bundle.session_exercises.map((se) => [se.id as string, se]),
  );
  const setsBySession = new Map<string, FindingsSessionInput["sets"]>();
  for (const sl of bundle.set_logs) {
    const se = seById.get(sl.session_exercise_id as string);
    if (!se) continue;
    const sessionId = se.session_id as string;
    const list = setsBySession.get(sessionId) ?? [];
    list.push({
      exerciseId: se.exercise_id as string,
      exerciseName: exerciseName.get(se.exercise_id as string) ?? "",
      weightKg: (sl.weight_kg as number | null) ?? null,
      reps: (sl.reps as number | null) ?? null,
    });
    setsBySession.set(sessionId, list);
  }
  return bundle.sessions.map((s) => ({
    sessionId: s.id as string,
    startedAt: s.started_at as number,
    conditionValues:
      (s.condition_values as Record<string, unknown> | null) ?? null,
    sets: setsBySession.get(s.id as string) ?? [],
  }));
}
