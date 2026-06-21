import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const base = {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
  dirty: integer("dirty").notNull().default(1),
};

export const exercises = sqliteTable("exercises", {
  ...base,
  name: text("name").notNull(),
  tags: text("tags"),                 // JSON string[] (light tagging only in v1)
  isCustom: integer("is_custom").notNull().default(1),
  ownerId: text("owner_id"),
});

export const metrics = sqliteTable("metrics", {
  ...base,
  name: text("name").notNull(),
  type: text("type").notNull(),        // 'number' | 'scale' | 'text' | 'checkbox'
  scope: text("scope").notNull(),      // 'set' | 'session'
  ownerId: text("owner_id"),
});

export const sessions = sqliteTable("sessions", {
  ...base,
  title: text("title"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  conditionValues: text("condition_values"), // JSON {metricId: value}
});

export const sessionExercises = sqliteTable("session_exercises", {
  ...base,
  sessionId: text("session_id").notNull(),
  exerciseId: text("exercise_id").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const setLogs = sqliteTable("set_logs", {
  ...base,
  sessionExerciseId: text("session_exercise_id").notNull(),
  setNo: integer("set_no").notNull(),
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rir: integer("rir"),
  note: text("note"),
  metricValues: text("metric_values"),  // JSON {metricId: value}
  completed: integer("completed").notNull().default(0),
});
