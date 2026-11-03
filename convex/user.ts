// Per-user satellite rows (one row per owner+key upserts), measurements,
// API tokens, and the bulk helpers (sleep backfill, export).
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { removeOwnedFile } from "./files";
import { fail, out, owned, requireUser, type UidTable } from "./lib";
import { insertRow, softDelete, updateRows } from "./rows";

type Row = Record<string, unknown>;

/**
 * Upsert one row per (owner, key): updates (and undeletes) the caller's row
 * matching `where`, else inserts one. The tracked-conditions / favorites /
 * exercise-prefs / user-prefs / push-subscription pattern.
 */
async function upsertOne(
  ctx: MutationCtx,
  table: UidTable,
  owner: string,
  where: Row,
  patch: Row,
  undelete = true,
): Promise<Row> {
  const now = Date.now();
  const extra: Row = { updatedAt: now };
  if (undelete) extra.deletedAt = null;
  const updated = await updateRows(ctx, table, owner, where, {
    ...patch,
    ...extra,
  });
  if (updated.length > 0) return updated[0];
  return insertRow(ctx, table, owner, {
    id: crypto.randomUUID(),
    ...where,
    ...patch,
  });
}

const UPSERT_KEYS = {
  tracked_conditions: "metricId",
  exercise_favorites: "exerciseId",
  exercise_prefs: "exerciseId",
  push_subscriptions: "endpoint",
} as const;

export const upsert = mutation({
  args: {
    table: v.union(
      v.literal("tracked_conditions"),
      v.literal("exercise_favorites"),
      v.literal("exercise_prefs"),
      v.literal("push_subscriptions"),
    ),
    key: v.string(),
    patch: v.any(),
  },
  handler: async (ctx, { table, key, patch }) => {
    const me = await requireUser(ctx);
    if (table === "push_subscriptions") {
      // Endpoints are globally unique; another account's row for the same
      // browser endpoint must not be hijacked or block this one silently.
      const taken = await ctx.db
        .query("push_subscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", key))
        .unique();
      if (taken && taken.ownerId !== me) fail("push subscription conflict");
    }
    await upsertOne(
      ctx,
      table,
      me,
      { [UPSERT_KEYS[table]]: key },
      patch as Row,
    );
  },
});

export const updatePrefs = mutation({
  args: { patch: v.any() },
  handler: async (ctx, { patch }) => {
    const me = await requireUser(ctx);
    // One row per owner (unique by_owner); `{}` matches it in any state.
    await upsertOne(ctx, "user_prefs", me, {}, patch as Row);
  },
});

// ── Measurements ──────────────────────────────────────────────────────────

/** Upsert the day's entry; returns the stored row. */
export const upsertMeasurement = mutation({
  args: { measuredOn: v.string(), patch: v.any() },
  handler: async (ctx, { measuredOn, patch }) => {
    const me = await requireUser(ctx);
    return out(
      await upsertOne(ctx, "measurements", me, { measuredOn }, patch as Row),
    );
  },
});

export const latestBodyweight = query({
  args: { onOrBefore: v.optional(v.string()) },
  handler: async (ctx, { onOrBefore }) => {
    const me = await requireUser(ctx);
    for await (const m of ctx.db
      .query("measurements")
      .withIndex("by_owner_date", (q) =>
        onOrBefore
          ? q.eq("ownerId", me).lte("measuredOn", onOrBefore)
          : q.eq("ownerId", me),
      )
      .order("desc")) {
      if (m.deletedAt == null && m.bodyweightKg != null) return m.bodyweightKg;
    }
    return null;
  },
});

/** Sets/clears a photo column, deleting the replaced file. */
export const setPhoto = mutation({
  args: {
    table: v.union(v.literal("machines"), v.literal("measurements")),
    id: v.string(),
    storageId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { table, id, storageId }) => {
    const me = await requireUser(ctx);
    const row = await owned(ctx, table, id, me);
    if (!row) return;
    await updateRows(
      ctx,
      table,
      me,
      { id },
      {
        photoPath: storageId,
        updatedAt: Date.now(),
      },
    );
    if (row.photoPath && row.photoPath !== storageId) {
      await removeOwnedFile(ctx, row.photoPath, me);
    }
  },
});

export const deleteSessionMedia = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const row = await owned(ctx, "session_media", id, me);
    if (!row) return;
    await removeOwnedFile(ctx, row.path, me);
    await softDelete(ctx, "session_media", me, { id });
  },
});

export const recentMedia = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const me = await requireUser(ctx);
    const rows = [];
    for await (const m of ctx.db
      .query("session_media")
      .withIndex("by_owner", (q) => q.eq("ownerId", me))
      .order("desc")) {
      if (m.deletedAt != null) continue;
      rows.push(out(m));
      if (rows.length >= limit) break;
    }
    return rows;
  },
});

// ── API tokens ────────────────────────────────────────────────────────────

/** Stores only the sha256 hash; the client shows the plaintext once. */
export const createToken = mutation({
  args: { id: v.string(), name: v.string(), tokenHash: v.string() },
  handler: async (ctx, { id, name, tokenHash }) => {
    const me = await requireUser(ctx);
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) fail("tokenHash must be sha256 hex");
    return out(await insertRow(ctx, "api_tokens", me, { id, name, tokenHash }));
  },
});

export const revokeToken = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    await updateRows(ctx, "api_tokens", me, { id }, { revokedAt: Date.now() });
  },
});

// ── Bulk helpers ──────────────────────────────────────────────────────────

/**
 * Sleep backfill: fills `metricId` on sessions whose LOCAL start date (the
 * client sends its UTC offset per date via `dates`) has a value, never
 * overwriting. `dates` maps sessionId → hours, resolved client-side.
 */
export const applySleep = mutation({
  args: { metricId: v.string(), hoursBySession: v.any() },
  handler: async (ctx, { metricId, hoursBySession }) => {
    const me = await requireUser(ctx);
    let filled = 0;
    const now = Date.now();
    for (const [sessionId, hours] of Object.entries(
      hoursBySession as Record<string, number>,
    )) {
      const s = await owned(ctx, "sessions", sessionId, me);
      if (!s || s.deletedAt != null) continue;
      const cv = (s.conditionValues as Row | null) ?? {};
      if (cv[metricId] != null) continue;
      await ctx.db.patch(s._id, {
        conditionValues: { ...cv, [metricId]: hours },
        updatedAt: now,
      });
      filled++;
    }
    return filled;
  },
});
