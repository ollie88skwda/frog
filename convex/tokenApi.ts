// Internal functions behind the personal-access-token read API (http.ts).
// Not callable from clients: the HTTP action authenticates the bearer token
// (sha256 match against api_tokens) and passes the resolved owner here.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { out } from "./lib";

export const resolveToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query("api_tokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!row || row.revokedAt != null) return null;
    return { id: row.id, ownerId: row.ownerId };
  },
});

export const touchToken = internalMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("api_tokens")
      .withIndex("by_uid", (q) => q.eq("id", id))
      .unique();
    if (row) await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
  },
});

const API_TABLES = v.union(
  v.literal("exercises"),
  v.literal("metrics"),
  v.literal("sessions"),
  v.literal("session_exercises"),
  v.literal("set_logs"),
);

/** One page of an owner's (or, `global`, the shared) live rows, oldest first. */
export const page = internalQuery({
  args: {
    table: API_TABLES,
    owner: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { table, owner, paginationOpts }) => {
    if (owner === null && table !== "exercises" && table !== "metrics") {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const res = await ctx.db
      .query(table)
      // biome-ignore lint/suspicious/noExplicitAny: every API table has by_owner
      .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", owner))
      .paginate(paginationOpts);
    return {
      page: (res.page as Record<string, unknown>[])
        .filter((r) => r.deletedAt == null)
        .map(out),
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});

/** Newest-first window of an owner's sessions or sets. */
export const newest = internalQuery({
  args: {
    table: v.union(v.literal("sessions"), v.literal("set_logs")),
    owner: v.string(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, { table, owner, limit, offset }) => {
    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    const q =
      table === "sessions"
        ? ctx.db
            .query("sessions")
            .withIndex("by_owner_started", (x) => x.eq("ownerId", owner))
        : ctx.db
            .query("set_logs")
            .withIndex("by_owner", (x) => x.eq("ownerId", owner));
    for await (const r of q.order("desc")) {
      if (r.deletedAt != null) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      rows.push(out(r as Record<string, unknown>));
      if (rows.length >= limit) break;
    }
    return rows;
  },
});
