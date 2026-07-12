# AGENTS.md — SBL

Read this before writing any code in this repo.

## What SBL is

SBL is a **training lab notebook**, not a workout tracker. Every session is treated as a controlled experiment: you log the work (exercises, sets, reps × weight, RIR) *and* the conditions around it (sleep hours, bodyweight, pre-workout carbs, caffeine, stress, meal timing), and the app surfaces correlations between inputs and outputs — **"Findings"** ("your top sets average heavier on 7h+ sleep"). Findings are transparent statistics (robust trend fitting, median-split heuristics) with honest guardrails: minimum sample sizes, visible confidence, and an explicit "correlation, not causation" caveat. No AI/ML black boxes.

The second moat is **open, code-accessible data**: JSON/CSV export, a personal-access-token read API, an MCP server, and AI-buildable docs (`llms.txt`), so users can point their own tools and AI at their training data. Full product spec: `docs/superpowers/specs/2026-06-20-sbl-prd.html`.

Target user: intermediate/advanced lifters who autoregulate and control variables — especially the quantified-self slice. But a minimalist logging only reps × weight still gets a clean, fast tracker.

## The name

"SBL" is a **placeholder**, not the real name. The single source of truth is `APP_NAME` in `packages/core/src/config.ts`. Never hardcode the literal anywhere else — a rebrand must stay a one-line change.

## Architecture

Web-first rewrite (the original Expo/React Native app is archived on branch `legacy/expo`, tag `expo-final`). One language: TypeScript. No Rust.

| Path | What | Stack |
|---|---|---|
| `apps/web` | The app — Vite React SPA | React, react-router v7, TanStack Query, Tailwind v4, shadcn/ui (vendored), supabase-js |
| `packages/core` | Framework-free domain logic, findings engine, Drizzle pg schema, `Repo` interface | Pure TS, zero UI imports |
| `packages/mcp` | MCP server (stdio) — thin client over the PAT API | @modelcontextprotocol/sdk |
| `supabase/` | Postgres migrations, RLS policies, Edge Functions, seeds | Supabase CLI |

**Storage is Supabase-direct, online-first** (Postgres + Auth + RLS + PostgREST via supabase-js in the browser). An account is required; there is no local database on web. **Do not promise offline in UI copy.**

**The Repo seam:** all data access goes through the `Repo` interface in `packages/core/src/repo/`. `SupabaseRepo` is the v1 implementation. This is deliberate: a future mobile app (Capacitor wrap or native) adds a local-store/offline `SqliteRepo` behind the same interface without touching screens or domain code. Keep the SPA Capacitor-compatible: no SSR, no Node APIs in `apps/web`, browser APIs behind capability guards.

`packages/core` must stay framework-free — no React, no DOM, no supabase-js imports outside `repo/`. Domain modules (`units`, `e1rm`, `progression`, `session-reducer`, `ids`) are pure and unit-tested; the findings engine builds on them.

## Constraints (product requirements, not preferences)

- **Lightweight & fast.** Audit every dependency before adding it; prefer a few lines over a package. Initial JS budget: **≤220 kB gzipped**, gated in CI.
- **Optimistic UI.** Logging a set never waits on the network: client-generated UUIDs (`newId()`), fire-and-forget mutations with retry, UI state already correct. Visual feedback within ~100 ms.
- **Lazy-load** non-critical routes (findings/history/settings/library); virtualize long lists only when profiling demands it.
- Measure, don't guess: profile before and after anything that risks bundle size or interaction latency.

## Conventions

- **IDs:** uuid v4, generated client-side via `newId()` from `@sbl/core`.
- **Timestamps:** `created_at` / `updated_at` / `deleted_at` are bigint millisecond epochs, app-managed (`Date.now()`).
- **Soft delete only:** set `deleted_at`; never hard-delete; IDs are never reused.
- **Weight:** stored canonically in **kg** (`weight_kg`); kg/lb is a display setting (`domain/units.ts`).
- **Ownership + RLS:** every table has `owner_id` (default `auth.uid()`) and row-level security; global seed rows have `owner_id null`. No service-role keys in app code.
- **Migrations:** Drizzle `pg-core` schema in `packages/core/src/db/schema.ts` is the DDL source of truth; `bun run db:generate` (drizzle-kit) emits SQL into `supabase/migrations/`; RLS/seeds are hand-written migrations via `supabase migration new`. Generate first, then hand-write — timestamps must interleave correctly.
- Tables: `exercises`, `metrics`, `sessions`, `session_exercises`, `set_logs` (+ `api_tokens`). Custom metric/condition values live in jsonb (`condition_values`, `metric_values`).

## Commands

```sh
bun install            # workspace install
bun run test           # vitest across packages
bun run typecheck      # tsc across packages
bun run lint           # biome
bun run dev            # vite dev server (apps/web)
supabase start         # local Postgres/Auth/PostgREST (Docker)
supabase db reset      # re-apply migrations + seed
bun run db:generate    # drizzle-kit → supabase/migrations
bun run e2e            # Playwright against vite preview + local Supabase
```

Local Supabase is the default for all dev and tests; the hosted project exists only for production.

## Design language

Techie-modern, Linear-style: neutral near-black grays (dark default) + off-white light theme, a single restrained indigo accent, crisp 1 px low-contrast borders, flat surfaces (no heavy shadows/glassmorphism), dense 13 px UI. Keyboard-first: ⌘K command palette, single-key shortcuts on the logging path. All numeric data (weights, reps, e1RM, timers) uses tabular numerals (`.num` utility). Micro-interactions are 100–150 ms CSS transitions; nothing animates on the data path.
