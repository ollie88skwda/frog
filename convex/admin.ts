// Internal (admin-key-only) bulk writers: global seed rows and the one-time
// Supabase → Convex import (scripts/import-from-supabase.ts,
// scripts/seed-convex.ts). Never callable from a client — internal functions
// are reachable only with the deployment's admin/deploy key.
//
// Both are idempotent on the row's uuid `id`: re-running replaces the row
// with the incoming copy, so an interrupted import can simply be re-run.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
  args: { storageId: v.string(), ownerId: v.string() },
  handler: async (ctx, { storageId, ownerId }) => {
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
      });
    }
    return storageId;
  },
});

/** Row counts per table (import verification). */
export const counts = internalMutation({
  args: { tables: v.array(tableValidator) },
  handler: async (ctx, { tables }) => {
    const out: Record<string, number> = {};
    for (const t of tables) {
      out[t] = (await ctx.db.query(t as UidTable).collect()).length;
    }
    return out;
  },
});
