import { defineConfig } from "drizzle-kit";

// Drizzle schema is the DDL source of truth. `bun run db:generate` emits
// Supabase-CLI-compatible SQL into supabase/migrations/. RLS policies and
// seeds are hand-written migrations (`supabase migration new`) — generate
// first, then hand-write, so timestamps interleave correctly.
export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/core/src/db/schema.ts",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
});
