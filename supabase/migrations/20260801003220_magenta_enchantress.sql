ALTER TABLE "exercises" ADD COLUMN "mechanic" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "movement_pattern" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "laterality" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_reps_min" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_reps_max" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "default_rest_sec" integer;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "aliases" jsonb;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "media_path" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "media_type" text;