import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";

// Conventions (see AGENTS.md): ids are client-generated uuid v4 (newId());
// timestamps are bigint millisecond epochs managed by the app (Date.now());
// rows are soft-deleted via deleted_at; owner_id + RLS on every table.
const base = {
  id: uuid("id").primaryKey(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }),
};

// owner_id null = global seed row (readable by everyone, RLS-enforced).
const seedableOwner = uuid("owner_id").default(sql`auth.uid()`);
const requiredOwner = uuid("owner_id").notNull().default(sql`auth.uid()`);

export const exercises = pgTable(
  "exercises",
  {
    ...base,
    ownerId: seedableOwner,
    name: text("name").notNull(),
    tags: jsonb("tags").$type<string[]>(), // light tagging only in v1
    isCustom: boolean("is_custom").notNull().default(true),
  },
  (t) => [index("exercises_owner_idx").on(t.ownerId)],
);

export const metrics = pgTable(
  "metrics",
  {
    ...base,
    ownerId: seedableOwner,
    name: text("name").notNull(),
    type: text("type").notNull(), // 'number' | 'scale' | 'text' | 'checkbox'
    scope: text("scope").notNull(), // 'set' | 'session'
    // Set-scope metrics: which exercises show this metric. Lives on the metric
    // (user-owned) rather than the exercise so it works on seed exercises too.
    exerciseIds: jsonb("exercise_ids").$type<string[]>(),
  },
  (t) => [index("metrics_owner_idx").on(t.ownerId)],
);

export const sessions = pgTable(
  "sessions",
  {
    ...base,
    ownerId: requiredOwner,
    title: text("title"),
    startedAt: bigint("started_at", { mode: "number" }).notNull(),
    endedAt: bigint("ended_at", { mode: "number" }),
    conditionValues: jsonb("condition_values").$type<Record<string, unknown>>(), // {metricId: value}
  },
  (t) => [
    index("sessions_owner_started_idx").on(t.ownerId, t.startedAt.desc()),
  ],
);

export const sessionExercises = pgTable(
  "session_exercises",
  {
    ...base,
    ownerId: requiredOwner,
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer("order_index").notNull(),
  },
  (t) => [
    index("session_exercises_owner_idx").on(t.ownerId),
    index("session_exercises_session_idx").on(t.sessionId),
    // Serves the ghost-prefill lookup: latest prior session for an exercise.
    index("session_exercises_exercise_created_idx").on(
      t.exerciseId,
      t.createdAt.desc(),
    ),
  ],
);

export const setLogs = pgTable(
  "set_logs",
  {
    ...base,
    ownerId: requiredOwner,
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id),
    setNo: integer("set_no").notNull(),
    weightKg: real("weight_kg"), // canonical kg; kg/lb is a display setting
    reps: integer("reps"),
    rir: integer("rir"),
    note: text("note"),
    metricValues: jsonb("metric_values").$type<Record<string, unknown>>(), // {metricId: value}
    completed: boolean("completed").notNull().default(false),
  },
  (t) => [
    index("set_logs_owner_idx").on(t.ownerId),
    index("set_logs_session_exercise_idx").on(t.sessionExerciseId),
  ],
);

export type Exercise = typeof exercises.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
