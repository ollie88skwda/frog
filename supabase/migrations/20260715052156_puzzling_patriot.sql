CREATE TABLE "exercise_prefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"weight_unit" text,
	"generator_excluded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"measured_on" text NOT NULL,
	"bodyweight_kg" real,
	"bodyfat_pct" real,
	"neck_cm" real,
	"shoulders_cm" real,
	"chest_cm" real,
	"waist_cm" real,
	"abdomen_cm" real,
	"hips_cm" real,
	"bicep_l_cm" real,
	"bicep_r_cm" real,
	"forearm_l_cm" real,
	"forearm_r_cm" real,
	"thigh_l_cm" real,
	"thigh_r_cm" real,
	"calf_l_cm" real,
	"calf_r_cm" real,
	"photo_path" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"source" text NOT NULL,
	"library_key" text,
	"config" jsonb,
	"folder_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"superset_group" integer,
	"rest_sec" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "routine_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"routine_exercise_id" uuid NOT NULL,
	"set_no" integer NOT NULL,
	"set_type" text DEFAULT 'normal' NOT NULL,
	"target_weight_kg" real,
	"target_reps" integer,
	"target_reps_max" integer,
	"target_duration_sec" integer,
	"target_distance_m" real
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"folder_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "session_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"session_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"media_type" text DEFAULT 'photo' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"first_weekday" integer DEFAULT 1 NOT NULL,
	"include_warmups_in_stats" boolean DEFAULT true NOT NULL,
	"default_rest_sec" integer,
	"previous_values_scope" text DEFAULT 'any' NOT NULL,
	"body_diagram" text DEFAULT 'neutral' NOT NULL,
	"plate_config" jsonb,
	"display_name" text
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "exercise_type" text DEFAULT 'weight_reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "equipment" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "instructions" jsonb;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "image_urls" jsonb;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "superset_group" integer;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "rest_sec" integer;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "routine_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "paused_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "set_type" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "duration_sec" integer;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "distance_m" real;--> statement-breakpoint
ALTER TABLE "exercise_prefs" ADD CONSTRAINT "exercise_prefs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_folder_id_routine_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."routine_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_sets" ADD CONSTRAINT "routine_sets_routine_exercise_id_routine_exercises_id_fk" FOREIGN KEY ("routine_exercise_id") REFERENCES "public"."routine_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_folder_id_routine_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."routine_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_media" ADD CONSTRAINT "session_media_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_prefs_owner_idx" ON "exercise_prefs" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_prefs_owner_exercise_idx" ON "exercise_prefs" USING btree ("owner_id","exercise_id");--> statement-breakpoint
CREATE INDEX "measurements_owner_idx" ON "measurements" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_owner_date_idx" ON "measurements" USING btree ("owner_id","measured_on");--> statement-breakpoint
CREATE INDEX "programs_owner_idx" ON "programs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner_idx" ON "push_subscriptions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "routine_exercises_owner_idx" ON "routine_exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "routine_exercises_routine_idx" ON "routine_exercises" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "routine_folders_owner_idx" ON "routine_folders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "routine_sets_owner_idx" ON "routine_sets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "routine_sets_routine_exercise_idx" ON "routine_sets" USING btree ("routine_exercise_id");--> statement-breakpoint
CREATE INDEX "routines_owner_idx" ON "routines" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "routines_folder_idx" ON "routines" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "session_media_owner_idx" ON "session_media" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_media_session_idx" ON "session_media" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_prefs_owner_idx" ON "user_prefs" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_routine_exercise_id_routine_exercises_id_fk" FOREIGN KEY ("routine_exercise_id") REFERENCES "public"."routine_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_routine_idx" ON "sessions" USING btree ("routine_id");