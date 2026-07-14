CREATE TABLE "tracked_conditions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"metric_id" uuid NOT NULL,
	"tracked" boolean DEFAULT true NOT NULL,
	"position" integer
);
--> statement-breakpoint
ALTER TABLE "metrics" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tracked_conditions" ADD CONSTRAINT "tracked_conditions_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_conditions_owner_idx" ON "tracked_conditions" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_conditions_owner_metric_idx" ON "tracked_conditions" USING btree ("owner_id","metric_id");