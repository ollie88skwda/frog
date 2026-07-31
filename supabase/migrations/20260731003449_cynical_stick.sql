ALTER TABLE "sessions" ADD COLUMN "share_slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_share_slug_idx" ON "sessions" USING btree ("share_slug");