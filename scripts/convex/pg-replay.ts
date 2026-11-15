// Replays supabase/migrations into an in-process Postgres (PGlite), with
// just enough Supabase stubs (auth.uid/jwt, storage tables, roles) for the
// migrations to apply. Used by scripts/seed-convex.ts to derive the global
// seed rows (seed exercises, conditions, machine catalog) straight from the
// migrations that defined them — no Docker, no running Supabase.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create schema if not exists storage;
  create schema if not exists extensions;
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create or replace function auth.role() returns text language sql stable as
    $$ select 'service_role'::text $$;
  create table if not exists auth.users (id uuid primary key, email text);
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    owner uuid, owner_id text);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$ select string_to_array(name, '/') $$;
`;

/** Fresh in-memory database with every migration applied. */
export async function replayMigrations(repoRoot: string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUBS);
  const dir = join(repoRoot, "supabase/migrations");
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(
        `SEED_REPLAY_FAILED: migration ${f} did not apply under the PGlite ` +
          `Supabase stubs: ${(e as Error).message}. Next: add the missing stub ` +
          "to STUBS in scripts/convex/pg-replay.ts.",
        { cause: e },
      );
    }
  }
  return db;
}
