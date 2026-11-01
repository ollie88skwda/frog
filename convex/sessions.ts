// Workout sessions, their exercise blocks, and logged sets: the multi-row
// reads and writes the generic row layer can't express in one call.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  byUid,
  fail,
  live,
  out,
  owned,
  ownedOrThrow,
  readable,
  requireUser,
} from "./lib";
import { insertRow, softDelete } from "./rows";

type Ctx = QueryCtx | MutationCtx;

function sideRank(side: string | null): number {
  return side === "right" ? 1 : 0;
}
const bySetNoThenSide = (a: Doc<"set_logs">, b: Doc<"set_logs">) =>
  a.setNo - b.setNo || sideRank(a.side) - sideRank(b.side);

async function blocksOf(ctx: Ctx, sessionId: string, owner: string) {
  const rows = await ctx.db
    .query("session_exercises")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  return rows.filter((r) => r.ownerId === owner);
}

async function setsOf(ctx: Ctx, sessionExerciseId: string, owner: string) {
  const rows = await ctx.db
    .query("set_logs")
    .withIndex("by_session_exercise", (q) =>
      q.eq("sessionExerciseId", sessionExerciseId),
    )
    .collect();
  return rows.filter((r) => r.ownerId === owner);
}

async function exerciseFor(ctx: Ctx, id: string, owner: string) {
  return (await readable(
    ctx,
    "exercises",
    id,
    owner,
  )) as Doc<"exercises"> | null;
}

export const active = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("sessions")
      .withIndex("by_owner_ended", (q) =>
        q.eq("ownerId", me).eq("endedAt", null),
      )
      .order("desc")
      .collect();
    const row = rows.find((r) => r.deletedAt == null);
    return row ? out(row) : null;
  },
});

/** Newest-first page of the caller's live sessions (history). */
export const list = query({
  args: { limit: v.number(), offset: v.number() },
  handler: async (ctx, { limit, offset }) => {
    const me = await requireUser(ctx);
    const result: Doc<"sessions">[] = [];
    let skipped = 0;
    for await (const s of ctx.db
      .query("sessions")
      .withIndex("by_owner_started", (q) => q.eq("ownerId", me))
      .order("desc")) {
      if (s.deletedAt != null) continue;
      if (skipped < offset) {
        skipped++;
        continue;
      }
      result.push(s);
      if (result.length >= limit) break;
    }
    return result.map(out);
  },
});

/** Exercises + live sets of one session, in order. */
export const detail = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const me = await requireUser(ctx);
    const blocks = live(await blocksOf(ctx, sessionId, me)).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const result = [];
    for (const b of blocks) {
      const ex = await exerciseFor(ctx, b.exerciseId, me);
      const sets = live(await setsOf(ctx, b.id, me)).sort(bySetNoThenSide);
      result.push({
        id: b.id,
        exerciseId: b.exerciseId,
        exerciseName: ex?.name ?? "",
        orderIndex: b.orderIndex,
        supersetGroup: b.supersetGroup,
        restSec: b.restSec,
        note: b.note,
        routineExerciseId: b.routineExerciseId,
        sets: sets.map((s) => ({
          id: s.id,
          setNo: s.setNo,
          setType: s.setType,
          weightKg: s.weightKg,
          reps: s.reps,
          durationSec: s.durationSec,
          distanceM: s.distanceM,
          rir: s.rir,
          rirMin: s.rirMin,
          rirMax: s.rirMax,
          rpe: s.rpe,
          note: s.note,
          restSec: s.restSec,
          side: (s.side as "left" | "right" | null) ?? null,
        })),
      });
    }
    return result;
  },
});

/**
 * Oldest-first page of the caller's live sessions with their live blocks and
 * sets joined — feeds the findings and records engines (computed
 * client-side). Paged so a long history never exceeds a function's read
 * limits.
 */
export const historyPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const me = await requireUser(ctx);
    const res = await ctx.db
      .query("sessions")
      .withIndex("by_owner_started", (q) => q.eq("ownerId", me))
      .paginate(paginationOpts);
    const exCache = new Map<string, Doc<"exercises"> | null>();
    const page = [];
    for (const s of res.page) {
      if (s.deletedAt != null) continue;
      const blocks = live(await blocksOf(ctx, s.id, me)).sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
      const exercises = [];
      for (const b of blocks) {
        if (!exCache.has(b.exerciseId)) {
          exCache.set(b.exerciseId, await exerciseFor(ctx, b.exerciseId, me));
        }
        const ex = exCache.get(b.exerciseId);
        const sets = live(await setsOf(ctx, b.id, me)).sort(bySetNoThenSide);
        exercises.push({
          exerciseId: b.exerciseId,
          exerciseName: ex?.name ?? "",
          exerciseType: ex?.exerciseType ?? "weight_reps",
          sets: sets.map((sl) => ({
            setNo: sl.setNo,
            side: (sl.side as "left" | "right" | null) ?? null,
            setType: sl.setType,
            weightKg: sl.weightKg,
            reps: sl.reps,
            durationSec: sl.durationSec,
            distanceM: sl.distanceM,
            rir: sl.rir,
            rirMin: sl.rirMin,
            rirMax: sl.rirMax,
            rpe: sl.rpe,
          })),
        });
      }
      page.push({
        sessionId: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        pausedMs: s.pausedMs,
        conditionValues: s.conditionValues ?? null,
        exercises,
      });
    }
    return { page, isDone: res.isDone, continueCursor: res.continueCursor };
  },
});

/** Latest prior block of an exercise (optionally from one routine). */
async function latestBlock(
  ctx: Ctx,
  owner: string,
  exerciseId: string,
  exclude: string | undefined,
  accept: (b: Doc<"session_exercises">) => Promise<boolean> | boolean,
) {
  for await (const b of ctx.db
    .query("session_exercises")
    .withIndex("by_owner_exercise", (q) =>
      q.eq("ownerId", owner).eq("exerciseId", exerciseId),
    )
    .order("desc")) {
    if (b.deletedAt != null || b.id === exclude) continue;
    if (await accept(b)) return b;
  }
  return null;
}

export const lastSets = query({
  args: {
    exerciseId: v.string(),
    excludeSessionExerciseId: v.optional(v.string()),
    routineId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const block = await latestBlock(
      ctx,
      me,
      args.exerciseId,
      args.excludeSessionExerciseId,
      async (b) => {
        if (!args.routineId) return true;
        const s = await byUid(ctx, "sessions", b.sessionId);
        return s?.routineId === args.routineId;
      },
    );
    if (!block) return [];
    const sets = live(await setsOf(ctx, block.id, me)).sort(bySetNoThenSide);
    return sets.map((r) => ({
      setNo: r.setNo,
      side: r.side,
      weightKg: r.weightKg,
      reps: r.reps,
      durationSec: r.durationSec,
      distanceM: r.distanceM,
    }));
  },
});

export const lastNote = query({
  args: {
    exerciseId: v.string(),
    excludeSessionExerciseId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const block = await latestBlock(
      ctx,
      me,
      args.exerciseId,
      args.excludeSessionExerciseId,
      (b) => b.note != null,
    );
    return block?.note ?? null;
  },
});

/** Exercise ids with a set logged since `since`, most recent first. */
export const recentExerciseIds = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const me = await requireUser(ctx);
    const sets = await ctx.db
      .query("set_logs")
      .withIndex("by_owner", (q) => q.eq("ownerId", me).gte("createdAt", since))
      .order("desc")
      .collect();
    const seen = new Set<string>();
    const ids: string[] = [];
    const blockCache = new Map<string, string | null>();
    for (const s of sets) {
      if (s.deletedAt != null) continue;
      if (!blockCache.has(s.sessionExerciseId)) {
        const b = await owned(
          ctx,
          "session_exercises",
          s.sessionExerciseId,
          me,
        );
        blockCache.set(s.sessionExerciseId, b?.exerciseId ?? null);
      }
      const exId = blockCache.get(s.sessionExerciseId);
      if (!exId || seen.has(exId)) continue;
      seen.add(exId);
      ids.push(exId);
    }
    return ids;
  },
});

// ── Writes ────────────────────────────────────────────────────────────────

export const start = mutation({
  args: { id: v.string(), title: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, title }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    return out(
      await insertRow(ctx, "sessions", me, { id, title, startedAt: now }),
    );
  },
});

export const addExercise = mutation({
  args: { id: v.string(), sessionId: v.string(), exerciseId: v.string() },
  handler: async (ctx, { id, sessionId, exerciseId }) => {
    const me = await requireUser(ctx);
    const existing = await owned(ctx, "session_exercises", id, me);
    if (existing) return id;
    const count = (await blocksOf(ctx, sessionId, me)).length;
    await insertRow(ctx, "session_exercises", me, {
      id,
      sessionId,
      exerciseId,
      orderIndex: count,
    });
    return id;
  },
});

/** Upsert on the client id — retries overwrite rather than duplicate. */
export const logSet = mutation({
  args: { row: v.any() },
  handler: async (ctx, { row }) => {
    const me = await requireUser(ctx);
    const stored = await insertRow(ctx, "set_logs", me, {
      ...(row as Record<string, unknown>),
      completed: true,
    });
    return stored.id as string;
  },
});

async function deleteBlocks(
  ctx: MutationCtx,
  owner: string,
  blockIds: string[],
  now: number,
) {
  if (blockIds.length === 0) return;
  // Children first: reads key off each table's own deletedAt, so a deleted
  // parent must tombstone its sets or they resurface in ghost prefill.
  await softDelete(
    ctx,
    "set_logs",
    owner,
    { sessionExerciseId: blockIds },
    now,
  );
  await softDelete(ctx, "session_exercises", owner, { id: blockIds }, now);
}

export const deleteBlock = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    await deleteBlocks(ctx, me, [id], Date.now());
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const blocks = await blocksOf(ctx, id, me);
    await deleteBlocks(
      ctx,
      me,
      blocks.map((b) => b.id),
      now,
    );
    await softDelete(ctx, "sessions", me, { id }, now);
  },
});

/** Live session from a routine template (blocks copy the prescription). */
export const startFromRoutine = mutation({
  args: {
    id: v.string(),
    routineId: v.string(),
    blockIds: v.array(v.string()),
  },
  handler: async (ctx, { id, routineId, blockIds }) => {
    const me = await requireUser(ctx);
    const routine = await ownedOrThrow(ctx, "routines", routineId, me);
    if (routine.deletedAt != null) fail("Routine not found");
    const existing = await owned(ctx, "sessions", id, me);
    if (existing) return out(existing);
    const now = Date.now();
    const session = await insertRow(ctx, "sessions", me, {
      id,
      title: routine.name,
      startedAt: now,
      routineId,
    });
    const templates = live(
      (
        await ctx.db
          .query("routine_exercises")
          .withIndex("by_routine", (q) => q.eq("routineId", routineId))
          .collect()
      ).filter((r) => r.ownerId === me),
    ).sort((a, b) => a.orderIndex - b.orderIndex);
    for (const [i, e] of templates.entries()) {
      await insertRow(ctx, "session_exercises", me, {
        id: blockIds[i] ?? crypto.randomUUID(),
        sessionId: id,
        exerciseId: e.exerciseId,
        orderIndex: e.orderIndex,
        supersetGroup: e.supersetGroup,
        restSec: e.restSec,
        routineExerciseId: e.id,
      });
    }
    return out(session);
  },
});

/** Bulk history import: find-or-create exercises, skip known start times. */
export const importBatch = mutation({
  args: {
    sessions: v.array(
      v.object({
        title: v.union(v.string(), v.null()),
        startedAt: v.number(),
        endedAt: v.union(v.number(), v.null()),
        exercises: v.array(
          v.object({
            name: v.string(),
            sets: v.array(v.any()),
          }),
        ),
      }),
    ),
    exerciseIds: v.any(), // { lowerName: id } resolved by the client
  },
  handler: async (ctx, { sessions, exerciseIds }) => {
    const me = await requireUser(ctx);
    const ids = exerciseIds as Record<string, string>;
    const existing = new Set(
      (
        await ctx.db
          .query("sessions")
          .withIndex("by_owner_started", (q) => q.eq("ownerId", me))
          .collect()
      ).map((s) => s.startedAt),
    );
    let imported = 0;
    let skipped = 0;
    let sets = 0;
    let exercisesCreated = 0;
    for (const s of sessions) {
      if (existing.has(s.startedAt)) {
        skipped++;
        continue;
      }
      existing.add(s.startedAt);
      const t = s.startedAt;
      const sessionId = crypto.randomUUID();
      await insertRow(ctx, "sessions", me, {
        id: sessionId,
        title: s.title,
        startedAt: t,
        endedAt: s.endedAt,
        createdAt: t,
        updatedAt: t,
      });
      for (const [orderIndex, ex] of s.exercises.entries()) {
        const key = ex.name.toLowerCase();
        let exId = ids[key];
        if (!(await readable(ctx, "exercises", exId ?? "", me))) {
          exId = exId ?? crypto.randomUUID();
          ids[key] = exId;
          await insertRow(ctx, "exercises", me, {
            id: exId,
            name: ex.name,
            isCustom: true,
            createdAt: t,
            updatedAt: t,
          });
          exercisesCreated++;
        }
        const seId = crypto.randomUUID();
        await insertRow(ctx, "session_exercises", me, {
          id: seId,
          sessionId,
          exerciseId: exId,
          orderIndex,
          createdAt: t,
          updatedAt: t,
        });
        for (const [setNo, set] of ex.sets.entries()) {
          await insertRow(ctx, "set_logs", me, {
            id: crypto.randomUUID(),
            createdAt: t,
            updatedAt: t,
            sessionExerciseId: seId,
            setNo,
            setType: set.setType ?? "normal",
            weightKg: set.weightKg ?? null,
            reps: set.reps ?? null,
            durationSec: set.durationSec ?? null,
            distanceM: set.distanceM ?? null,
            rir: set.rir ?? null,
            note: set.note ?? null,
            completed: true,
          });
          sets++;
        }
      }
      imported++;
    }
    return { imported, skipped, sets, exercisesCreated, exerciseIds: ids };
  },
});
