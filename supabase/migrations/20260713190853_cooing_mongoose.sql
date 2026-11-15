CREATE TABLE "exercise_favorites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"favorite" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_favorites_owner_idx" ON "exercise_favorites" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_favorites_owner_exercise_idx" ON "exercise_favorites" USING btree ("owner_id","exercise_id");