// User file storage (machine photos, exercise demo media, progress photos,
// workout photos) — replaces the four private Supabase Storage buckets and
// their owner-path RLS policies. Flow: generateUploadUrl → the client POSTs
// the blob → claim(storageId) records the uploader → the storage id is saved
// into the row's *Path column. Only the uploader can claim, resolve a URL
// for, attach, or remove a file.
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { fail, requireUser } from "./lib";

async function fileRow(ctx: QueryCtx | MutationCtx, storageId: string) {
  const id = ctx.db.system.normalizeId("_storage", storageId);
  if (!id) return null;
  return await ctx.db
    .query("files")
    .withIndex("by_storage", (q) => q.eq("storageId", id))
    .unique();
}

export async function ownsFile(
  ctx: QueryCtx | MutationCtx,
  storageId: string,
  owner: string,
): Promise<boolean> {
  const row = await fileRow(ctx, storageId);
  return row?.ownerId === owner;
}

/** Deletes a file the owner uploaded; anything else is ignored. */
export async function removeOwnedFile(
  ctx: MutationCtx,
  storageId: string | null | undefined,
  owner: string,
): Promise<void> {
  if (!storageId) return;
  const row = await fileRow(ctx, storageId);
  if (!row || row.ownerId !== owner) return;
  await ctx.db.delete(row._id);
  await ctx.storage.delete(row.storageId);
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Records the caller as the uploader of a freshly uploaded blob. */
export const claim = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const me = await requireUser(ctx);
    const id = ctx.db.system.normalizeId("_storage", storageId);
    if (!id || !(await ctx.db.system.get(id))) fail("upload not found");
    const existing = await fileRow(ctx, storageId);
    if (existing) {
      if (existing.ownerId !== me) fail("upload not found");
      return storageId;
    }
    await ctx.db.insert("files", {
      storageId: id,
      ownerId: me,
      createdAt: Date.now(),
    });
    return storageId;
  },
});

/** Short-lived download URL for one of the caller's files, else null. */
export const url = query({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const me = await requireUser(ctx);
    const row = await fileRow(ctx, storageId);
    if (!row || row.ownerId !== me) return null;
    return await ctx.storage.getUrl(row.storageId);
  },
});

export const remove = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const me = await requireUser(ctx);
    await removeOwnedFile(ctx, storageId, me);
  },
});
