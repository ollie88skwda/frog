// Routine templates (routine → routine_exercises → routine_sets), folders,
// and programs: graph reads and the multi-row writes.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { fail, live, out, owned, readable, requireUser } from "./lib";
import { insertRow, softDelete, updateRows } from "./rows";

type Ctx = QueryCtx | MutationCtx;

const setInput = v.object({
  setNo: v.number(),
  setType: v.optional(v.string()),
  targetWeightKg: v.optional(v.union(v.number(), v.null())),
  targetReps: v.optional(v.union(v.number(), v.null())),
  targetRepsMax: v.optional(v.union(v.number(), v.null())),
  targetDurationSec: v.optional(v.union(v.number(), v.null())),
  targetDistanceM: v.optional(v.union(v.number(), v.null())),
  targetRirMin: v.optional(v.union(v.number(), v.null())),
  targetRirMax: v.optional(v.union(v.number(), v.null())),
  laterality: v.optional(v.union(v.string(), v.null())),
});

const exerciseInput = v.object({
  exerciseId: v.string(),
  orderIndex: v.number(),
  supersetGroup: v.optional(v.union(v.number(), v.null())),
  restSec: v.optional(v.union(v.number(), v.null())),
  note: v.optional(v.union(v.string(), v.null())),
  sets: v.array(setInput),
});

const routineInput = {
  name: v.string(),
  folderId: v.optional(v.union(v.string(), v.null())),
  description: v.optional(v.union(v.string(), v.null())),
  exercises: v.array(exerciseInput),
};

async function childrenOf(ctx: Ctx, routineId: string, owner: string) {
  return live(
    (
      await ctx.db
        .query("routine_exercises")
        .withIndex("by_routine", (q) => q.eq("routineId", routineId))
        .collect()
    ).filter((r) => r.ownerId === owner),
  );
}

async function setsOf(ctx: Ctx, routineExerciseId: string, owner: string) {
  return live(
    (
      await ctx.db
        .query("routine_sets")
        .withIndex("by_routine_exercise", (q) =>
          q.eq("routineExerciseId", routineExerciseId),
        )
        .collect()
    ).filter((r) => r.ownerId === owner),
  );
}

export async function routineDetail(
  ctx: Ctx,
  routineId: string,
  owner: string,
) {
  const routine = await owned(ctx, "routines", routineId, owner);
  if (!routine || routine.deletedAt != null) return null;
  const blocks = (await childrenOf(ctx, routineId, owner)).sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const exercises = [];
  for (const re of blocks) {
    const ex = (await readable(
      ctx,
      "exercises",
      re.exerciseId,
      owner,
    )) as Doc<"exercises"> | null;
    const sets = (await setsOf(ctx, re.id, owner)).sort(
      (a, b) => a.setNo - b.setNo,
    );
    exercises.push({
      id: re.id,
      exerciseId: re.exerciseId,
      exerciseName: ex?.name ?? "",
      orderIndex: re.orderIndex,
      supersetGroup: re.supersetGroup,
      restSec: re.restSec,
      note: re.note,
      sets: sets.map(out),
    });
  }
  return { routine: out(routine), exercises };
}

export const detail = query({
  args: { routineId: v.string() },
  handler: async (ctx, { routineId }) => {
    const me = await requireUser(ctx);
    return await routineDetail(ctx, routineId, me);
  },
});

type ExerciseIn = {
  exerciseId: string;
  orderIndex: number;
  supersetGroup?: number | null;
  restSec?: number | null;
  note?: string | null;
  sets: Record<string, unknown>[];
};

async function insertChildren(
  ctx: MutationCtx,
  owner: string,
  routineId: string,
  exercises: ExerciseIn[],
  now: number,
) {
  for (const e of exercises) {
    const reId = crypto.randomUUID();
    await insertRow(ctx, "routine_exercises", owner, {
      id: reId,
      routineId,
      exerciseId: e.exerciseId,
      orderIndex: e.orderIndex,
      supersetGroup: e.supersetGroup ?? null,
      restSec: e.restSec ?? null,
      note: e.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
    for (const s of e.sets) {
      await insertRow(ctx, "routine_sets", owner, {
        ...s,
        id: crypto.randomUUID(),
        routineExerciseId: reId,
        setType: (s.setType as string | undefined) ?? "normal",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function nextPosition(
  ctx: Ctx,
  table: "routines" | "routine_folders",
  owner: string,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_owner", (q) => q.eq("ownerId", owner))
    .collect();
  return live(rows).length;
}

export const create = mutation({
  args: { id: v.string(), ...routineInput },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await owned(ctx, "routines", args.id, me);
    if (existing) return out(existing);
    const now = Date.now();
    const row = await insertRow(ctx, "routines", me, {
      id: args.id,
      name: args.name,
      folderId: args.folderId ?? null,
      description: args.description ?? null,
      position: await nextPosition(ctx, "routines", me),
      createdAt: now,
      updatedAt: now,
    });
    await insertChildren(ctx, me, args.id, args.exercises, now);
    return out(row);
  },
});

/** Replaces metadata + the child graph (old children soft-deleted). */
export const update = mutation({
  args: { routineId: v.string(), ...routineInput },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const routine = await owned(ctx, "routines", args.routineId, me);
    if (!routine) return;
    const now = Date.now();
    await updateRows(
      ctx,
      "routines",
      me,
      { id: args.routineId },
      {
        name: args.name,
        folderId: args.folderId ?? null,
        description: args.description ?? null,
        updatedAt: now,
      },
    );
    const old = await childrenOf(ctx, args.routineId, me);
    const oldIds = old.map((r) => r.id);
    if (oldIds.length) {
      await softDelete(
        ctx,
        "routine_sets",
        me,
        { routineExerciseId: oldIds },
        now,
      );
      await softDelete(ctx, "routine_exercises", me, { id: oldIds }, now);
    }
    await insertChildren(ctx, me, args.routineId, args.exercises, now);
  },
});

export const remove = mutation({
  args: { routineId: v.string() },
  handler: async (ctx, { routineId }) => {
    const me = await requireUser(ctx);
    await softDelete(ctx, "routines", me, { id: routineId });
  },
});

export const reorder = mutation({
  args: {
    table: v.union(v.literal("routines"), v.literal("routine_folders")),
    ids: v.array(v.string()),
  },
  handler: async (ctx, { table, ids }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    for (const [i, id] of ids.entries()) {
      await updateRows(ctx, table, me, { id }, { position: i, updatedAt: now });
    }
  },
});

export const createFolder = mutation({
  args: { id: v.string(), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const me = await requireUser(ctx);
    const existing = await owned(ctx, "routine_folders", id, me);
    if (existing) return out(existing);
    return out(
      await insertRow(ctx, "routine_folders", me, {
        id,
        name,
        position: await nextPosition(ctx, "routine_folders", me),
      }),
    );
  },
});

/** Soft-deletes a folder; its routines become unfiled. */
export const deleteFolder = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const filed = await ctx.db
      .query("routines")
      .withIndex("by_owner_folder", (q) =>
        q.eq("ownerId", me).eq("folderId", id),
      )
      .collect();
    for (const r of filed) {
      await ctx.db.patch(r._id, { folderId: null, updatedAt: now });
    }
    await softDelete(ctx, "routine_folders", me, { id }, now);
  },
});

/** Update Routine Values: performed → targets (rep-range sets skipped). */
export const updateValues = mutation({
  args: {
    routineId: v.string(),
    performed: v.array(
      v.object({
        routineExerciseId: v.string(),
        sets: v.array(
          v.object({
            setNo: v.number(),
            weightKg: v.union(v.number(), v.null()),
            reps: v.union(v.number(), v.null()),
            durationSec: v.union(v.number(), v.null()),
            distanceM: v.union(v.number(), v.null()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { routineId, performed }) => {
    const me = await requireUser(ctx);
    const detail = await routineDetail(ctx, routineId, me);
    if (!detail) return;
    const now = Date.now();
    for (const block of performed) {
      const re = detail.exercises.find((e) => e.id === block.routineExerciseId);
      if (!re) continue;
      for (const s of block.sets) {
        const target = re.sets.find((t) => t.setNo === s.setNo);
        if (!target || target.targetRepsMax != null) continue;
        await updateRows(
          ctx,
          "routine_sets",
          me,
          { id: target.id },
          {
            targetWeightKg: s.weightKg,
            targetReps: s.reps,
            targetDurationSec: s.durationSec,
            targetDistanceM: s.distanceM,
            updatedAt: now,
          },
        );
      }
    }
  },
});

// ── Programs ──────────────────────────────────────────────────────────────

/** One active program at a time: deactivates the current one first. */
export const createProgram = mutation({
  args: {
    id: v.string(),
    source: v.union(v.literal("generated"), v.literal("library")),
    folderId: v.string(),
    config: v.optional(v.any()),
    libraryKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await owned(ctx, "programs", args.id, me);
    if (existing) return out(existing);
    const now = Date.now();
    await updateRows(
      ctx,
      "programs",
      me,
      { active: true },
      { active: false, updatedAt: now },
    );
    return out(
      await insertRow(ctx, "programs", me, {
        id: args.id,
        source: args.source,
        folderId: args.folderId,
        config: args.config ?? null,
        libraryKey: args.libraryKey ?? null,
        active: true,
      }),
    );
  },
});

export const activeProgram = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = live(
      await ctx.db
        .query("programs")
        .withIndex("by_owner", (q) => q.eq("ownerId", me))
        .order("desc")
        .collect(),
    );
    const row = rows.find((p) => p.active);
    return row ? out(row) : null;
  },
});

export function assertString(x: unknown, what: string): string {
  if (typeof x !== "string") fail(`${what} must be a string`);
  return x;
}
