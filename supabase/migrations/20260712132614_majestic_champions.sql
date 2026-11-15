CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid(),
	"name" text NOT NULL,
	"tags" jsonb,
	"is_custom" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid(),
	"name" text NOT NULL,
	"type" text NOT NULL,
	"scope" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"title" text,
	"started_at" bigint NOT NULL,
	"ended_at" bigint,
	"condition_values" jsonb
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_no" integer NOT NULL,
	"weight_kg" real,
	"reps" integer,
	"rir" integer,
	"note" text,
	"metric_values" jsonb,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_owner_idx" ON "exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "metrics_owner_idx" ON "metrics" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_exercises_owner_idx" ON "session_exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_exercises_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_exercises_exercise_created_idx" ON "session_exercises" USING btree ("exercise_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sessions_owner_started_idx" ON "sessions" USING btree ("owner_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "set_logs_owner_idx" ON "set_logs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "set_logs_session_exercise_idx" ON "set_logs" USING btree ("session_exercise_id");