CREATE TABLE "machine_catalog" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"owner_id" text DEFAULT (auth.jwt()->>'sub'),
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"aliases" jsonb,
	"category" text NOT NULL,
	"mechanism" text,
	"muscle_targets" jsonb,
	"weight_stack_kg" real,
	"plate_capacity_kg" real,
	"dimensions" jsonb,
	"product_url" text,
	"introduced_year" integer,
	"discontinued_year" integer,
	"source_url" text,
	"source_note" text
);
--> statement-breakpoint
CREATE INDEX "machine_catalog_brand_idx" ON "machine_catalog" USING btree ("brand");