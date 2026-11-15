// Exercise library writes that need more than the generic row layer:
// community publishing (the old publish_exercise SECURITY DEFINER RPC),
// machine detach, and demo-media attach/clear. Plus the machine catalog
// search (the old search_machine_catalog / list_machine_categories RPCs).
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { removeOwnedFile } from "./files";
import { byUid, fail, out, owned, readable, requireUser } from "./lib";
import { updateRows } from "./rows";
import { withDefaults } from "./tables";

const PUBLISH_RATE_PER_HOUR = 1000;

const muscleTarget = v.object({
  muscle: v.string(),
  tier: v.union(v.string(), v.null()),
  role: v.optional(v.string()),
});
const nstr = v.union(v.string(), v.null());
const nnum = v.union(v.number(), v.null());
const nstrs = v.union(v.array(v.string()), v.null());

/**
 * Publishes an exercise to the shared library: ownerId null + isCustom true +
 * createdBy = caller. The ONLY path that creates a global row from a client
 * — validated, rate-limited, and deduped (case-insensitive name) exactly like
 * the publish_exercise RPC it replaces (docs/DECISIONS.md 2026-08-08). The
 * argument list is the whitelist: machineId/media never ride a shared row.
 * Returns the canonical id (the existing row's on a dedupe hit).
 */
export const publish = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    tags: v.optional(nstrs),
    jointActions: v.optional(nstrs),
    muscleTargets: v.optional(v.union(v.array(muscleTarget), v.null())),
    exerciseType: v.optional(v.string()),
    equipment: v.optional(nstr),
    instructions: v.optional(nstrs),
    imageUrls: v.optional(nstrs),
    mechanic: v.optional(nstr),
    movementPattern: v.optional(nstr),
    laterality: v.optional(nstr),
    defaultRepsMin: v.optional(nnum),
    defaultRepsMax: v.optional(nnum),
    defaultRestSec: v.optional(nnum),
    notes: v.optional(nstr),
    aliases: v.optional(nstrs),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const name = args.name.trim();
    if (name === "") fail("name is required");
    if (name.length > 80) fail("name is too long");
    if (/[<>]/.test(name)) fail("name may not contain HTML");
    if (args.notes && /[<>]/.test(args.notes)) {
      fail("notes may not contain HTML");
    }
    for (const t of args.muscleTargets ?? []) {
      if (!t.muscle) fail("muscle_targets entries need a muscle");
    }
    for (const a of args.aliases ?? []) {
      if (a === "" || /[<>]/.test(a)) {
        fail("aliases must be non-empty plain text");
      }
    }

    const now = Date.now();
    const recent = await ctx.db
      .query("exercises")
      .withIndex("by_created_by", (q) =>
        q.eq("createdBy", me).gt("createdAt", now - 3_600_000),
      )
      .collect();
    if (
      recent.filter((r) => r.deletedAt == null).length >= PUBLISH_RATE_PER_HOUR
    ) {
      fail("too many exercises shared recently — try again later");
    }

    const lower = name.toLowerCase();
    const dupes = await ctx.db
      .query("exercises")
      .withIndex("by_owner_name", (q) =>
        q.eq("ownerId", null).eq("nameLower", lower),
      )
      .collect();
    const dupe = dupes.find((r) => r.deletedAt == null);
    if (dupe) return dupe.id;

    // Idempotent on the client id: a retried publish that already landed
    // resolves to the same row.
    const existing = await byUid(ctx, "exercises", args.id);
    if (existing) {
      if (existing.ownerId === null && existing.createdBy === me) {
        return existing.id;
      }
      fail("exercises: id conflict");
    }

    const { id, name: _n, ...fields } = args;
    const row = withDefaults(
      "exercises",
      { ...fields, id, name, isCustom: true },
      now,
    );
    row.ownerId = null;
    row.createdBy = me;
    row.machineId = null;
    row.mediaPath = null;
    row.mediaType = null;
    await ctx.db.insert("exercises", row as never);
    return id;
  },
});

/** Soft-deletes a machine and detaches the caller's exercises from it. */
export const deleteMachine = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    await updateRows(
      ctx,
      "machines",
      me,
      { id },
      { deletedAt: now, updatedAt: now },
    );
    const linked = await ctx.db
      .query("exercises")
      .withIndex("by_owner_machine", (q) =>
        q.eq("ownerId", me).eq("machineId", id),
      )
      .collect();
    for (const e of linked) {
      await ctx.db.patch(e._id, { machineId: null, updatedAt: now });
    }
  },
});

/** Sets (or clears, with storageId null) an owned exercise's demo media. */
export const setMedia = mutation({
  args: {
    exerciseId: v.string(),
    storageId: v.union(v.string(), v.null()),
    kind: v.union(v.literal("image"), v.literal("video"), v.null()),
  },
  handler: async (ctx, { exerciseId, storageId, kind }) => {
    const me = await requireUser(ctx);
    const ex = await owned(ctx, "exercises", exerciseId, me);
    if (!ex) return;
    const previous = ex.mediaPath;
    await updateRows(
      ctx,
      "exercises",
      me,
      { id: exerciseId },
      {
        mediaPath: storageId,
        mediaType: storageId ? kind : null,
        updatedAt: Date.now(),
      },
    );
    if (previous && previous !== storageId) {
      await removeOwnedFile(ctx, previous, me);
    }
  },
});

/** Full exercise row (own or global), including the fat How-to fields. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const row = await readable(ctx, "exercises", id, me);
    return row && row.deletedAt == null ? out(row) : null;
  },
});

// ── Machine catalog ───────────────────────────────────────────────────────

async function catalogRows(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  me: string,
) {
  const rows = [
    ...(await ctx.db
      .query("machine_catalog")
      .withIndex("by_owner", (q) => q.eq("ownerId", null))
      .collect()),
    ...(await ctx.db
      .query("machine_catalog")
      .withIndex("by_owner", (q) => q.eq("ownerId", me))
      .collect()),
  ];
  return rows.filter((r) => r.deletedAt == null);
}

/**
 * AND-ed case-insensitive substring search over brand/model/category/
 * aliases; empty query = browse. Same semantics as search_machine_catalog.
 */
export const searchCatalog = query({
  args: {
    q: v.string(),
    category: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, { q, category, limit }) => {
    const me = await requireUser(ctx);
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = (await catalogRows(ctx, me))
      .filter((r) => category == null || r.category === category)
      .filter((r) =>
        terms.every((t) =>
          [r.brand, r.model, r.category, ...(r.aliases ?? [])].some((f) =>
            f.toLowerCase().includes(t),
          ),
        ),
      )
      .sort(
        (a, b) =>
          a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model),
      )
      .slice(0, Math.max(0, limit));
    return hits.map((r) => ({
      id: r.id,
      brand: r.brand,
      model: r.model,
      category: r.category,
    }));
  },
});

export const catalogCategories = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const set = new Set((await catalogRows(ctx, me)).map((r) => r.category));
    return [...set].sort();
  },
});
