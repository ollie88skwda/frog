// Generic paged reader for whole-table reads (library, history graph for the
// findings/records engines, export). Convex caps the documents one function
// may read, so large reads are cursor-paged here and stitched together by
// ConvexRepo (packages/core/src/repo/convex.ts) — the counterpart of the old
// PostgREST `selectAll` loop.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { fail, GLOBAL_READABLE, out, requireUser, type UidTable } from "./lib";

export const TABLES = [
  "machines",
  "machine_catalog",
  "exercises",
  "metrics",
  "tracked_conditions",
  "exercise_favorites",
  "routine_folders",
  "routines",
  "routine_exercises",
  "routine_sets",
  "programs",
  "sessions",
  "session_exercises",
  "set_logs",
  "measurements",
  "exercise_prefs",
  "user_prefs",
  "session_media",
  "push_subscriptions",
  "api_tokens",
] as const satisfies readonly UidTable[];

export const tableValidator = v.union(...TABLES.map((t) => v.literal(t)));

// Exercise list rows skip the How-to-only fat fields (instructions/imageUrls
// were ~60% of the library payload) — getExercise fetches them per row.
const FAT_EXERCISE_FIELDS = [
  "instructions",
  "imageUrls",
  "mediaPath",
  "mediaType",
];

/**
 * One page of the caller's rows in `table` (or the global rows when
 * `global`, allowed only for exercises/metrics/machine_catalog), oldest
 * first. Soft-deleted rows are skipped unless `includeDeleted`.
 */
export const page = query({
  args: {
    table: tableValidator,
    global: v.optional(v.boolean()),
    includeDeleted: v.optional(v.boolean()),
    slim: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const table = args.table as UidTable;
    if (args.global && !GLOBAL_READABLE.has(table)) {
      fail(`${table} has no global rows`);
    }
    const owner = args.global ? null : me;
    const res = await ctx.db
      .query(table)
      // biome-ignore lint/suspicious/noExplicitAny: every UidTable has by_owner
      .withIndex("by_owner" as any, (q: any) => q.eq("ownerId", owner))
      .paginate(args.paginationOpts);
    let rows = res.page as Record<string, unknown>[];
    if (!args.includeDeleted && table !== "api_tokens") {
      rows = rows.filter((r) => r.deletedAt == null);
    }
    const shaped = rows.map((r) => {
      const o = out(r) as Record<string, unknown>;
      if (args.slim && table === "exercises") {
        for (const f of FAT_EXERCISE_FIELDS) delete o[f];
      }
      return o;
    });
    return {
      page: shaped,
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});
