// E2E hygiene: hard-deletes an e2e test account's data via the service role.
//
// Why this exists (round-2 evidence, see AGENTS.md): every e2e run creates a
// fresh auth user, and `createExercise()` goes through the app's normal
// create path — which (COMMUNITY_SHARING=true, packages/core/src/config.ts)
// publishes most custom exercises as GLOBAL owner_id-null rows via the
// `publish_exercise` RPC. Nothing ever cleaned those up, so the shared local
// Supabase's `exercises` table grew run over run until it crossed
// PostgREST's default 1000-row cap (observed live at 1,312 rows while
// writing this) and any unpaginated read (the token API's `?limit=1000`,
// etc.) started silently truncating — breaking unrelated specs.
//
// This is a hard delete via the service role, not the app's soft-delete
// convention (AGENTS.md's "never hard-delete" is a product rule for user data
// reached through the app; this is test infrastructure tearing down its own
// throwaway accounts, the same trust boundary seed-e2e.ts already operates
// in). Deletion order matches the FK graph in packages/core/src/db/schema.ts
// (children before parents) so cleanup works even when nothing cascades.
//
// A published (owner_id null) exercise is deleted by `created_by`, which can
// collide with a real FK reference from an account this pass isn't also
// purging (e.g. community-share.spec.ts's second account picking up a shared
// row). Rows are therefore deleted one at a time with an isolated try/catch —
// a blocked row is skipped, not fatal to the rest of the sweep.
import type { SupabaseClient } from "@supabase/supabase-js";

// Order matters: each table is deleted before anything it references.
const OWNER_SCOPED_TABLES = [
  "set_logs",
  "session_media",
  "session_exercises",
  "routine_sets",
  "routine_exercises",
  "sessions",
  "programs",
  "routines",
  "routine_folders",
  "exercise_favorites",
  "exercise_prefs",
  "tracked_conditions",
  "metrics",
  "exercises",
  "machines",
  "machine_catalog",
  "measurements",
  "user_prefs",
  "push_subscriptions",
  "api_tokens",
] as const;

// Tables where a row can also be reachable via `created_by` (global,
// owner_id-null seed/share rows) rather than `owner_id`.
const CREATED_BY_TABLES = new Set(["exercises", "machine_catalog"]);

async function deleteByColumnOneByOne(
  admin: SupabaseClient,
  table: string,
  column: "owner_id" | "created_by",
  userId: string,
) {
  const { data, error } = await admin
    .from(table)
    .select("id")
    .eq(column, userId);
  if (error) {
    console.warn(
      `  ! could not list ${table}.${column}=${userId}: ${error.message}`,
    );
    return;
  }
  for (const row of data ?? []) {
    const { error: delError } = await admin
      .from(table)
      .delete()
      .eq("id", (row as { id: string }).id);
    if (delError) {
      // Most likely a live FK reference from an account this sweep isn't
      // also purging (e.g. a shared exercise another user still points at).
      // Skip it — a stray row surviving one more cleanup pass is cheap;
      // aborting the whole sweep over it is not.
      console.warn(
        `  ! could not delete ${table}.id=${(row as { id: string }).id}: ${delError.message}`,
      );
    }
  }
}

/** Hard-deletes every row this user owns or published, then the auth user
 * itself. Best-effort: logs and continues past individual failures rather
 * than throwing, so one stuck row never blocks the rest of the sweep. */
export async function purgeE2eUser(admin: SupabaseClient, userId: string) {
  for (const table of OWNER_SCOPED_TABLES) {
    await deleteByColumnOneByOne(admin, table, "owner_id", userId);
    if (CREATED_BY_TABLES.has(table)) {
      await deleteByColumnOneByOne(admin, table, "created_by", userId);
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error)
    console.warn(`  ! could not delete auth user ${userId}: ${error.message}`);
}

/** Sweeps every e2e-seeded account (`e2e-*@frog.test`, matching seed-e2e.ts's
 * naming) older than `olderThanMs`. Age-gated rather than "every account but
 * the one this run just made": two agents/lanes can run e2e against the same
 * shared local Supabase at once (see AGENTS.md), and an account mid-run is
 * not stale just because it isn't this process's own. Default threshold
 * (2h) comfortably outlives a full local suite run. */
export async function purgeStaleE2eUsers(
  admin: SupabaseClient,
  olderThanMs = 2 * 60 * 60 * 1000,
): Promise<{ checked: number; purged: string[] }> {
  const cutoff = Date.now() - olderThanMs;
  const purged: string[] = [];
  let checked = 0;
  // admin.auth.admin.listUsers() is paginated (50/page default); walk pages
  // until exhausted rather than assuming the accumulated e2e backlog fits
  // on page 1.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (!u.email?.startsWith("e2e-") || !u.email.endsWith("@frog.test"))
        continue;
      checked++;
      if (new Date(u.created_at).getTime() >= cutoff) continue; // possibly still in flight
      await purgeE2eUser(admin, u.id);
      purged.push(u.email);
    }
    if (users.length < 200) break;
  }
  return { checked, purged };
}

// CLI entry — `bun scripts/e2e-cleanup.ts [maxAgeMinutes]` sweeps stale e2e
// accounts against local Supabase directly (no seed/build/playwright side
// effects). Only runs when invoked directly, matching import.meta.main so
// seed-e2e.ts / run-e2e.ts can import purgeStaleE2eUsers / purgeE2eUser
// without re-running this.
if (import.meta.main) {
  const { execSync } = await import("node:child_process");
  const { createClient } = await import("@supabase/supabase-js");
  const raw = execSync("supabase status -o json", { encoding: "utf8" });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  const url: string = status.API_URL ?? status.api_url;
  const serviceKey: string = status.SERVICE_ROLE_KEY ?? status.service_role_key;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const maxAgeMinutes = Number(process.argv[2] ?? 120);
  const { checked, purged } = await purgeStaleE2eUsers(
    admin,
    maxAgeMinutes * 60 * 1000,
  );
  console.log(
    `Checked ${checked} e2e account(s), purged ${purged.length}: ${purged.join(", ")}`,
  );
}
