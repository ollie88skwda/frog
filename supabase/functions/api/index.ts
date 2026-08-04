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

// PostgREST caps every `select()` at 1000 rows, so an unbounded select on a
// table that can grow past that silently truncates instead of erroring. Loop
// `.range()` until the rows collected so far cover the total PostgREST reports,
// so the common single-page case costs exactly one request; `page` must ask for
// that total with `.select(cols, { count: "exact" })`, and a page that doesn't
// falls back to the empty-page stop rule (still correct, one request slower).
// Advance by the rows actually returned so a server whose `max_rows` is
// configured below PAGE_SIZE still paginates. `page` must apply a deterministic
// order (the callers below order by `created_at` with an `id` tiebreak, since
// ids are random uuid v4) so rows aren't skipped or repeated across pages.
// Mirrors `SupabaseRepo.selectAll` in packages/core — this function is Deno and
// can't import it.
const PAGE_SIZE = 1000;

async function selectAll(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
    count: number | null;
  }>,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let from = 0;
  for (;;) {
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length === 0 || (count != null && rows.length >= count)) return rows;
    from += batch.length;
  }
}

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
  // `opts` carries `{ count: "exact" }` for the paginating export path only —
  // the single-page endpoints below don't need the row count.
  const ownExercises = (opts?: { count: "exact" }) =>
    admin
      .from("exercises")
      .select("*", opts)
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
          "id, session_exercise_id, set_no, side, weight_kg, reps, rir, rir_min, rir_max, note, metric_values, created_at",
        )
        .eq("owner_id", owner)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      return error ? json({ error: error.message }, 500) : json({ sets: data });
    }
    case "/v1/export": {
      // Every table here can grow past PostgREST's 1000-row cap, so each one
      // paginates rather than returning a silently truncated export.
      const ownedRows = (table: string) =>
        selectAll((from, to) =>
          admin
            .from(table)
            .select("*", { count: "exact" })
            .eq("owner_id", owner)
            .is("deleted_at", null)
            .order("created_at")
            .order("id")
            .range(from, to),
        );
      try {
        const [exercises, metrics, sessions, sessionExercises, setLogs] = await Promise.all([
          selectAll((from, to) =>
            ownExercises({ count: "exact" })
              .order("created_at")
              .order("id")
              .range(from, to),
          ),
          selectAll((from, to) =>
            admin
              .from("metrics")
              .select("*", { count: "exact" })
              .or(`owner_id.eq.${owner},owner_id.is.null`)
              .is("deleted_at", null)
              .order("created_at")
              .order("id")
              .range(from, to),
          ),
          ownedRows("sessions"),
          ownedRows("session_exercises"),
          ownedRows("set_logs"),
        ]);
        return json({
          schema_version: 1,
          exported_at: Date.now(),
          exercises,
          metrics,
          sessions,
          session_exercises: sessionExercises,
          set_logs: setLogs,
        });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    default:
      return json({ error: "not found", endpoints: ENDPOINTS }, 404);
  }
});
