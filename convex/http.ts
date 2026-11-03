// Personal-access-token read API, ported from the Supabase Edge Function
// (supabase/functions/api). Served from the deployment's HTTP actions URL:
//   GET <CONVEX_SITE_URL>/api/v1/{exercises|sessions|sets|export}
// Auth: `Authorization: Bearer frog_...`, sha256-matched against api_tokens.
// Read-only by construction (only GET routes). Every query runs as the
// token's owner via internal functions; the response keeps the old
// snake_case column names so packages/mcp and existing scripts keep working
// (docs/api.md).
//
// Also serves the signed-in user's private files at GET <site>/files/<id>
// (Clerk token, same ownership rule as every other file operation).

import type { FunctionReturnType } from "convex/server";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { type ActionCtx, httpAction } from "./_generated/server";

const ENDPOINTS = ["/v1/exercises", "/v1/sessions", "/v1/sets", "/v1/export"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** camelCase row → the API's snake_case contract. */
function toApi(row: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) {
    // Convex-era detail: the four `*Path` columns hold storage ids now; the
    // API never exposed photo paths usefully, keep the field names stable.
    r[snake(k)] = val;
  }
  return r;
}

function pickCols(
  row: Record<string, unknown>,
  cols: string[],
): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const c of cols) r[c] = row[c] ?? null;
  return r;
}

type PageResult = FunctionReturnType<typeof internal.tokenApi.page>;

async function allRows(
  ctx: ActionCtx,
  table:
    | "exercises"
    | "metrics"
    | "sessions"
    | "session_exercises"
    | "set_logs",
  owner: string | null,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (;;) {
    const res: PageResult = await ctx.runQuery(internal.tokenApi.page, {
      table,
      owner,
      paginationOpts: { numItems: 1000, cursor },
    });
    rows.push(...res.page);
    if (res.isDone) return rows;
    cursor = res.continueCursor;
  }
}

const byCreated = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  (a.createdAt as number) - (b.createdAt as number) ||
  String(a.id).localeCompare(String(b.id));

const handler = httpAction(async (ctx, req) => {
  if (req.method !== "GET")
    return json({ error: "this API is read-only" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token.startsWith("frog_")) {
    return json({ error: "missing bearer token (frog_...)" }, 401);
  }
  const tok = await ctx.runQuery(internal.tokenApi.resolveToken, {
    tokenHash: await sha256hex(token),
  });
  if (!tok) return json({ error: "invalid or revoked token" }, 401);
  await ctx.runMutation(internal.tokenApi.touchToken, { id: tok.id });

  const owner = tok.ownerId;
  const url = new URL(req.url);
  const path = url.pathname.slice(
    url.pathname.indexOf("/api/") + "/api".length,
  );
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? 100) || 100,
    1000,
  );
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  try {
    switch (path) {
      case "/v1/exercises": {
        const rows = [
          ...(await allRows(ctx, "exercises", owner)),
          ...(await allRows(ctx, "exercises", null)),
        ].sort(
          (a, b) =>
            String(a.name).localeCompare(String(b.name)) ||
            String(a.id).localeCompare(String(b.id)),
        );
        return json({
          exercises: rows.slice(offset, offset + limit).map(toApi),
        });
      }
      case "/v1/sessions": {
        const rows = await ctx.runQuery(internal.tokenApi.newest, {
          table: "sessions",
          owner,
          limit,
          offset,
        });
        return json({
          sessions: rows.map((r) =>
            pickCols(toApi(r), [
              "id",
              "title",
              "started_at",
              "ended_at",
              "condition_values",
              "created_at",
              "updated_at",
            ]),
          ),
        });
      }
      case "/v1/sets": {
        const rows = await ctx.runQuery(internal.tokenApi.newest, {
          table: "set_logs",
          owner,
          limit,
          offset,
        });
        return json({
          sets: rows.map((r) =>
            pickCols(toApi(r), [
              "id",
              "session_exercise_id",
              "set_no",
              "side",
              "weight_kg",
              "reps",
              "rir",
              "rir_min",
              "rir_max",
              "note",
              "metric_values",
              "created_at",
            ]),
          ),
        });
      }
      case "/v1/export": {
        const [exOwn, exGlobal, mOwn, mGlobal, sessions, blocks, sets] =
          await Promise.all([
            allRows(ctx, "exercises", owner),
            allRows(ctx, "exercises", null),
            allRows(ctx, "metrics", owner),
            allRows(ctx, "metrics", null),
            allRows(ctx, "sessions", owner),
            allRows(ctx, "session_exercises", owner),
            allRows(ctx, "set_logs", owner),
          ]);
        return json({
          schema_version: 1,
          exported_at: Date.now(),
          exercises: [...exOwn, ...exGlobal].sort(byCreated).map(toApi),
          metrics: [...mOwn, ...mGlobal].sort(byCreated).map(toApi),
          sessions: sessions.map(toApi),
          session_exercises: blocks.map(toApi),
          set_logs: sets.map(toApi),
        });
      }
      default:
        return json({ error: "not found", endpoints: ENDPOINTS }, 404);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// The web app reads files from its own origin with an Authorization header.
// No cookies are involved, so the header alone is the credential.
const FILE_CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization",
  "access-control-allow-methods": "GET",
};

const fileHandler = httpAction(async (ctx, req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: FILE_CORS });
  }
  const refuse = (status: number) =>
    new Response(null, { status, headers: FILE_CORS });
  const identity = await ctx.auth.getUserIdentity().catch(() => null);
  if (!identity) return refuse(401);
  const id = await ctx.runQuery(internal.files.ownedBlobId, {
    storageId: decodeURIComponent(
      new URL(req.url).pathname.slice("/files/".length),
    ),
    ownerId: identity.subject,
  });
  const blob = id ? await ctx.storage.get(id) : null;
  if (!blob) return refuse(404);
  return new Response(blob, {
    headers: {
      ...FILE_CORS,
      "content-type": blob.type || "application/octet-stream",
      "cache-control": "private, no-store",
    },
  });
});

const http = httpRouter();
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
  http.route({ pathPrefix: "/api/", method, handler });
}
for (const method of ["GET", "OPTIONS"] as const) {
  http.route({ pathPrefix: "/files/", method, handler: fileHandler });
}
export default http;
