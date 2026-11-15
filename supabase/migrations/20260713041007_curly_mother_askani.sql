CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"catalog_key" text,
	"settings" jsonb,
	"notes" text,
	"photo_path" text
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "machine_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "joint_actions" jsonb;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "muscle_targets" jsonb;--> statement-breakpoint
CREATE INDEX "machines_owner_idx" ON "machines" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;