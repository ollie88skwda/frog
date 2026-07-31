// Personal-access-token read API: GET /api/v1/{exercises|sessions|sets|export}
// Auth: `Authorization: Bearer frog_...` — sha256-matched against api_tokens.
//
// Isolation model: service-role client + explicit owner_id filter on every
// query, all contained in this one file. (The JWT-minting variant — sign a
// short-lived user JWT and proxy to PostgREST so RLS enforces reads — needs
// the project signing key wired as a function secret; swap in here if/when
// that's set up.) Read-only by construction: only GET routes exist.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const ENDPOINTS = ["/v1/exercises", "/v1/sessions", "/v1/sets", "/v1/export"];

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "this API is read-only" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token.startsWith("frog_")) {
    return json({ error: "missing bearer token (frog_...)" }, 401);
  }
  const hash = await sha256hex(token);
  const { data: tokenRow, error: tokenError } = await admin
    .from("api_tokens")
    .select("id, owner_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (tokenError) return json({ error: tokenError.message }, 500);
  if (!tokenRow || tokenRow.revoked_at != null) {
    return json({ error: "invalid or revoked token" }, 401);
  }
  await admin.from("api_tokens").update({ last_used_at: Date.now() }).eq("id", tokenRow.id);

  const owner = tokenRow.owner_id as string;
  const url = new URL(req.url);
  const path = url.pathname.slice(url.pathname.indexOf("/api/") + "/api".length);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 1000);
  const offset = Number(url.searchParams.get("offset") ?? 0) || 0;

  // Full row, like every other resource below — a hand-written column list
  // here silently drops new exercise columns from the API (docs/DECISIONS.md).
  const ownExercises = () =>
    admin
      .from("exercises")
      .select()
      .or(`owner_id.eq.${owner},owner_id.is.null`)
      .is("deleted_at", null);

  switch (path) {
    case "/v1/exercises": {
      const { data, error } = await ownExercises().order("name").range(offset, offset + limit - 1);
      return error ? json({ error: error.message }, 500) : json({ exercises: data });
    }
    case "/v1/sessions": {
      const { data, error } = await admin
        .from("sessions")
        .select("id, title, started_at, ended_at, condition_values, created_at, updated_at")
        .eq("owner_id", owner)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return error ? json({ error: error.message }, 500) : json({ sessions: data });
    }
    case "/v1/sets": {
      const { data, error } = await admin
        .from("set_logs")
        .select(
          "id, session_exercise_id, set_no, weight_kg, reps, rir, rir_min, rir_max, note, metric_values, created_at",
        )
        .eq("owner_id", owner)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return error ? json({ error: error.message }, 500) : json({ sets: data });
    }
    case "/v1/export": {
      const [exercises, metrics, sessions, sessionExercises, setLogs] = await Promise.all([
        ownExercises(),
        admin
          .from("metrics")
          .select()
          .or(`owner_id.eq.${owner},owner_id.is.null`)
          .is("deleted_at", null),
        admin.from("sessions").select().eq("owner_id", owner).is("deleted_at", null),
        admin.from("session_exercises").select().eq("owner_id", owner).is("deleted_at", null),
        admin.from("set_logs").select().eq("owner_id", owner).is("deleted_at", null),
      ]);
      const firstError = [exercises, metrics, sessions, sessionExercises, setLogs].find(
        (r) => r.error,
      )?.error;
      if (firstError) return json({ error: firstError.message }, 500);
      return json({
        schema_version: 1,
        exported_at: Date.now(),
        exercises: exercises.data,
        metrics: metrics.data,
        sessions: sessions.data,
        session_exercises: sessionExercises.data,
        set_logs: setLogs.data,
      });
    }
    default:
      return json({ error: "not found", endpoints: ENDPOINTS }, 404);
  }
});
