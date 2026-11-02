// User file storage (machine photos, exercise demo media, progress photos,
// workout photos) — replaces the four private Supabase Storage buckets and
// their owner-path RLS policies. Flow: generateUploadUrl → the client POSTs
// the blob → claim(storageId) records the uploader → the storage id is saved
// into the row's *Path column. Only the uploader can claim, read, attach, or
// remove a file. Bytes leave only through the authenticated HTTP action
// GET <site>/files/<id> (convex/http.ts): ctx.storage.getUrl links carry no
// auth and never expire, so they are never handed out.
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, mutation } from "./_generated/server";
import { fail, requireUser } from "./lib";

// The old exercise-media bucket's file_size_limit; a claim is the one way a
// client's blob becomes attachable, so the limit is enforced there.
const MAX_FILE_BYTES = 50 * 1024 * 1024;

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

/** Records the caller as the uploader of a freshly uploaded blob. An
 * over-limit blob is deleted and null returned (throwing would roll the
 * delete back). */
export const claim = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    const me = await requireUser(ctx);
    const id = ctx.db.system.normalizeId("_storage", storageId);
    const blob = id ? await ctx.db.system.get(id) : null;
    if (!id || !blob) fail("upload not found");
    const existing = await fileRow(ctx, storageId);
    if (existing) {
      if (existing.ownerId !== me) fail("upload not found");
      return storageId;
    }
    if (blob.size > MAX_FILE_BYTES) {
      await ctx.storage.delete(id);
      return null;
    }
    await ctx.db.insert("files", {
      storageId: id,
      ownerId: me,
      createdAt: Date.now(),
    });
    return storageId;
  },
});

/** The blob behind a storage id when `ownerId` uploaded it, else null. */
export const ownedBlobId = internalQuery({
  args: { storageId: v.string(), ownerId: v.string() },
  handler: async (ctx, { storageId, ownerId }) => {
    const row = await fileRow(ctx, storageId);
    return row?.ownerId === ownerId ? row.storageId : null;
  },
});
