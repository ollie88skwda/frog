// Internal (admin-key-only) bulk writers: global seed rows and the one-time
// Supabase → Convex import (scripts/import-from-supabase.ts,
// scripts/seed-convex.ts). Never callable from a client — internal functions
// are reachable only with the deployment's admin/deploy key.
//
// Both are idempotent on the row's uuid `id`: re-running replaces the row
// with the incoming copy, so an interrupted import can simply be re-run.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { tableValidator } from "./data";
import { byUid, fail, GLOBAL_READABLE, type UidTable } from "./lib";
import { withDefaults } from "./tables";

type Row = Record<string, unknown>;

async function upsert(
  ctx: Parameters<typeof byUid>[0] & {
    db: import("./_generated/server").MutationCtx["db"];
  },
  table: UidTable,
  row: Row,
): Promise<"inserted" | "updated"> {
  if (typeof row.id !== "string") fail(`${table}: row without id`);
  const createdAt =
    typeof row.createdAt === "number" ? row.createdAt : Date.now();
  const full = withDefaults(table, row, createdAt);
  // Imported rows keep their own timestamps (withDefaults stamps `now`).
  for (const k of ["createdAt", "updatedAt"]) {
    if (typeof row[k] === "number") full[k] = row[k];
  }
  const existing = await byUid(ctx, table, row.id);
  if (existing) {
    await ctx.db.replace(existing._id as never, full as never);
    return "updated";
  }
  await ctx.db.insert(table, full as never);
  return "inserted";
}

/** Upserts global (ownerId null) seed rows into a global-readable table. */
export const upsertGlobal = internalMutation({
  args: { table: tableValidator, rows: v.array(v.any()) },
  handler: async (ctx, { table, rows }) => {
    const t = table as UidTable;
    if (!GLOBAL_READABLE.has(t)) fail(`${t} has no global rows`);
    let inserted = 0;
    for (const r of rows as Row[]) {
      if (r.ownerId !== null) fail(`${t}: seed row ${r.id} has an owner`);
      if ((await upsert(ctx, t, r)) === "inserted") inserted++;
    }
    return { inserted, updated: rows.length - inserted };
  },
});

/**
 * Upserts imported rows verbatim (ownerId preserved). Relationships are
 * uuid strings, so they survive unchanged; the caller imports parents
 * before children.
 */
export const importRows = internalMutation({
  args: { table: tableValidator, rows: v.array(v.any()) },
  handler: async (ctx, { table, rows }) => {
    const t = table as UidTable;
    let inserted = 0;
    for (const r of rows as Row[]) {
      if (r.ownerId === null && !GLOBAL_READABLE.has(t)) {
        fail(`${t}: row ${r.id} has no owner`);
      }
      if ((await upsert(ctx, t, r)) === "inserted") inserted++;
    }
    return { inserted, updated: rows.length - inserted };
  },
});

/** Upload URL for an imported storage object. */
export const generateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Records an imported blob's owner (what files:claim does for clients). */
export const claimFile = internalMutation({
  args: {
    storageId: v.string(),
    ownerId: v.string(),
    importKey: v.optional(v.string()),
  },
  handler: async (ctx, { storageId, ownerId, importKey }) => {
    const id = ctx.db.system.normalizeId("_storage", storageId);
    if (!id) fail("bad storage id");
    const existing = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", id))
      .unique();
    if (!existing) {
      await ctx.db.insert("files", {
        storageId: id,
        ownerId,
        createdAt: Date.now(),
        ...(importKey ? { importKey } : {}),
      });
    }
    return storageId;
  },
});

/** The storage id an earlier import run copied `importKey` to, if any. */
export const fileByImportKey = internalMutation({
  args: { importKey: v.string() },
  handler: async (ctx, { importKey }) => {
    const row = await ctx.db
      .query("files")
      .withIndex("by_import_key", (q) => q.eq("importKey", importKey))
      .first();
    return row ? (row.storageId as string) : null;
  },
});

/** One page's row count for a table, optionally one owner's rows (import
 * verification, dev seeder). Paged: whole-table reads exceed function limits. */
export const countPage = internalQuery({
  args: {
    table: tableValidator,
    ownerId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { table, ownerId, paginationOpts }) => {
    const rows = ctx.db.query(table as UidTable);
    const res = await (ownerId
      ? // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
        rows.withIndex("by_owner" as any, (q: any) => q.eq("ownerId", ownerId))
      : rows
    ).paginate(paginationOpts);
    return {
      count: res.page.length,
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});

// --- Test-account teardown (scripts/e2e-cleanup.ts) ---------------------------
//
// Hard-deletes everything a throwaway test identity owns or published. Only
// identities following the test naming scheme are accepted (`e2e-…` subs
// minted by scripts/convex-test-auth.ts), so this can never be pointed at a
// real Clerk user (`user_…`). Test-infra teardown, not the app's soft-delete
// convention — see AGENTS.md "E2E hygiene".
const TEST_SUB = /^e2e-[a-z0-9-]+$/;

/** Deletes up to `budget` rows for one test identity; returns how many were
 * deleted (call again until 0 — one call stays inside mutation limits). */
export const purgeTestUser = internalMutation({
  args: { sub: v.string(), budget: v.optional(v.number()) },
  handler: async (ctx, { sub, budget = 2000 }) => {
    if (!TEST_SUB.test(sub)) fail(`refusing to purge non-test identity ${sub}`);
    let deleted = 0;
    for (const t of PURGE_ORDER) {
      for (const field of ["ownerId", "createdBy"] as const) {
        if (field === "createdBy" && t !== "exercises") continue;
        const idx = field === "ownerId" ? "by_owner" : "by_created_by";
        const rows = await ctx.db
          .query(t)
          // biome-ignore lint/suspicious/noExplicitAny: index chosen per table
          .withIndex(idx as any, (q: any) => q.eq(field, sub))
          .take(budget - deleted);
        for (const r of rows) {
          await ctx.db.delete(r._id);
          deleted++;
        }
        if (deleted >= budget) return deleted;
      }
    }
    const files = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", sub))
      .take(budget - deleted);
    for (const f of files) {
      await ctx.storage.delete(f.storageId);
      await ctx.db.delete(f._id);
      deleted++;
    }
    return deleted;
  },
});

/** One page of a table's test identities, with their newest createdAt (the
 * stale-sweep's input, stitched together by scripts/e2e-cleanup.ts). */
export const testOwnersPage = internalQuery({
  args: { table: tableValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { table, paginationOpts }) => {
    const res = await ctx.db.query(table as UidTable).paginate(paginationOpts);
    const newest: Record<string, number> = {};
    for (const r of res.page as Row[]) {
      const sub = (r.ownerId ?? r.createdBy) as string | null | undefined;
      if (!sub || !TEST_SUB.test(sub)) continue;
      newest[sub] = Math.max(newest[sub] ?? 0, r.createdAt as number);
    }
    return { newest, isDone: res.isDone, continueCursor: res.continueCursor };
  },
});

const PURGE_ORDER = [
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
  "measurements",
  "user_prefs",
  "push_subscriptions",
  "api_tokens",
] as const satisfies readonly UidTable[];

/** Any row by uuid, owner-agnostic (import verification). */
export const getRow = internalQuery({
  args: { table: tableValidator, id: v.string() },
  handler: async (ctx, { table, id }) => {
    const row = await byUid(ctx, table as UidTable, id);
    if (!row) return null;
    const { _id, _creationTime, nameLower, ...rest } = row as Row;
    return rest;
  },
});

// --- Dev-account seeding (scripts/seed-dev-account.ts) ----------------------

/** HARD-deletes up to `budget` of one owner's rows in one table (the dev
 * seeder's explicit --confirm-reset path). Returns how many it deleted. */
export const resetOwnerTable = internalMutation({
  args: {
    ownerId: v.string(),
    table: tableValidator,
    budget: v.optional(v.number()),
  },
  handler: async (ctx, { ownerId, table, budget = 2000 }) => {
    if (!ownerId) fail("ownerId is required");
    const rows = await ctx.db
      .query(table as UidTable)
      // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
      .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", ownerId))
      .take(budget);
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});

/** Global (seed/shared) exercises with one of `names`. */
export const globalExercisesByName = internalQuery({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const out: { id: string; name: string; exerciseType: string }[] = [];
    for (const name of names) {
      const hits = await ctx.db
        .query("exercises")
        .withIndex("by_owner_name", (q) =>
          q.eq("ownerId", null).eq("nameLower", name.trim().toLowerCase()),
        )
        .collect();
      for (const h of hits) {
        if (h.name === name) {
          out.push({ id: h.id, name: h.name, exerciseType: h.exerciseType });
        }
      }
    }
    return out;
  },
});
