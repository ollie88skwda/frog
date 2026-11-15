ALTER TABLE "routine_sets" ADD COLUMN "target_rir_min" integer;--> statement-breakpoint
ALTER TABLE "routine_sets" ADD COLUMN "target_rir_max" integer;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "rir_min" integer;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "rir_max" integer;