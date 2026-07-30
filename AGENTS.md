# AGENTS.md — Frog

Read this before writing any code in this repo.

**Decisions: see `docs/DECISIONS.md` — the running log of product/design/architecture calls. Read it before changing direction; append to it (same commit) when you make a new call.**

## What Frog is

Frog is a **training lab notebook**, not a workout tracker. Every session is treated as a controlled experiment: you log the work (exercises, sets, reps × weight, RIR) *and* the conditions around it (sleep hours, bodyweight, pre-workout carbs, caffeine, stress, meal timing), and the app surfaces correlations between inputs and outputs — **"Findings"** ("your top sets average heavier on 7h+ sleep"). Findings are transparent statistics (robust trend fitting, median-split heuristics) with honest guardrails: minimum sample sizes, visible confidence, and an explicit "correlation, not causation" caveat. No AI/ML black boxes.

The second moat is **open, code-accessible data**: JSON/CSV export, a personal-access-token read API, an MCP server, and AI-buildable docs (`llms.txt`), so users can point their own tools and AI at their training data. Full product spec: `docs/superpowers/specs/2026-06-20-frog-prd.html`.

Target user: intermediate/advanced lifters who autoregulate and control variables — especially the quantified-self slice. But a minimalist logging only reps × weight still gets a clean, fast tracker.

## The name

The app is **Frog**. The single source of truth for the display name is `APP_NAME` in `packages/core/src/config.ts` — never hardcode the literal anywhere else, so a future rebrand stays a one-line change. (The single sanctioned exception is `supabase/functions/send-rest-push`: Edge Functions are Deno and cannot import `@frog/core`.)

Technical identifiers agree with the display name as of 2026-07-28 — package scope `@frog/*`, `FROG_*` env vars, the `frog_` PAT prefix, the `__frog` E2E bridge global. See `docs/DECISIONS.md` for what was deliberately *not* renamed (`sbl.pastUsers`, the Vercel project).

## Architecture

Web-first rewrite (the original Expo/React Native app is archived on branch `legacy/expo`, tag `expo-final`). One language: TypeScript. No Rust.

| Path | What | Stack |
|---|---|---|
| `apps/web` | The app — Vite React SPA | React, react-router v7, TanStack Query, Tailwind v4, shadcn/ui (vendored), supabase-js |
| `packages/core` | Framework-free domain logic, findings engine, Drizzle pg schema, `Repo` interface | Pure TS, zero UI imports |
| `packages/mcp` | MCP server (stdio) — thin client over the PAT API | @modelcontextprotocol/sdk |
| `supabase/` | Postgres migrations, RLS policies, Edge Functions, seeds | Supabase CLI |

**Storage is Supabase-direct, online-first** (Postgres + RLS + PostgREST via supabase-js in the browser). **Identity is Clerk** (Google + email, prebuilt UI) via Supabase third-party auth: the browser client sends Clerk session tokens (`accessToken` option — note this disables `supabase.auth.*` on the app client), and RLS keys off the JWT `sub` claim as text. An account is required; there is no local database on web. **Do not promise offline in UI copy.**

**The Repo seam:** all data access goes through the `Repo` interface in `packages/core/src/repo/`. `SupabaseRepo` is the v1 implementation. This is deliberate: a future mobile app (Capacitor wrap or native) adds a local-store/offline `SqliteRepo` behind the same interface without touching screens or domain code. Keep the SPA Capacitor-compatible: no SSR, no Node APIs in `apps/web`, browser APIs behind capability guards.

`packages/core` must stay framework-free — no React, no DOM, no supabase-js imports outside `repo/`. Domain modules (`units`, `e1rm`, `progression`, `session-reducer`, `ids`) are pure and unit-tested; the findings engine builds on them.

**Freeform-text → structured-data matching — TWO matchers exist, unreconciled.** `packages/core/src/generator/match-exercise.ts` (routine builder's "Paste workout" import, `parse-routine.ts` same dir) and `packages/core/src/domain/match-exercise.ts` (voice logging) were built independently and export the same names (`MatchCandidate`, `matchExerciseName`, `normalizeExerciseName`) with different shapes — `generator/`'s `matchExerciseName` returns a plain candidate or `null`; `domain/`'s returns an `ExerciseMatch` with `matchType`/`tied` disambiguation. Because of the name clash, **only `domain/match-exercise` is barrel-exported** from `@frog/core`; `generator/match-exercise` must be imported by its exact subpath (`@frog/core/generator/match-exercise`) — `packages/core/src/index.ts` documents why inline. Before adding a *third* matcher for some new freeform-text feature, or before touching either file: this pair should be consolidated into one, not extended in parallel again — check both, don't just extend one.

## Constraints (product requirements, not preferences)

- **Mobile-first, always.** Frog is a **mobile web app**. Design and build every screen for a phone / touch viewport *first*; desktop is only a secondary widening of the same layout, never the starting point. Tap targets on the logging path are ≥40 px; never gate an action behind hover-only affordances (a mobile user can't hover). Popups/menus must open fully visible on a phone — never clipped by an `overflow-hidden` ancestor or hidden behind sibling controls.
- **Buttons are never bare text.** Every button and actionable control carries a *visible* background — filled, translucent, or an outline surface — so it reads as pressable at rest, without relying on a hover state. A hover-only background does not count. (`ghost` in `ui/button.tsx` keeps a translucent fill for exactly this reason.)
- **Lightweight & fast.** Audit every dependency before adding it; prefer a few lines over a package. Initial JS budget: **≤220 kB gzipped**, gated in CI by `scripts/check-bundle.ts`. That script carries a *second*, unrelated gate: it greps every emitted chunk for the `__frog` E2E auth-bridge marker (`apps/web/src/lib/test-hooks.ts`) and fails the build if it ships. The marker name is written out in both files — **rename it in both or the gate silently passes while protecting nothing.** Prove it still bites by inverting it: a `VITE_E2E=1` build must fail the script, a clean build must pass.
- **Optimistic UI.** Logging a set never waits on the network: client-generated UUIDs (`newId()`), fire-and-forget mutations with retry, UI state already correct. Visual feedback within ~100 ms.
- **Lazy-load** non-critical routes (findings/history/settings/library); virtualize long lists only when profiling demands it.
- Measure, don't guess: profile before and after anything that risks bundle size or interaction latency.

## Conventions

- **IDs:** uuid v4, generated client-side via `newId()` from `@frog/core`.
- **Timestamps:** `created_at` / `updated_at` / `deleted_at` are bigint millisecond epochs, app-managed (`Date.now()`).
- **Soft delete only:** set `deleted_at`; never hard-delete; IDs are never reused.
- **Weight:** stored canonically in **kg** (`weight_kg`); kg/lb is a display setting (`domain/units.ts`).
- **Ownership + RLS:** every table has `owner_id` **text** (default `auth.jwt()->>'sub'` — a Clerk user ID, or a uuid string for Supabase-native E2E sessions) and row-level security; global seed rows have `owner_id null`. No service-role keys in app code. Supabase-native signups stay disabled (Clerk owns sign-up — enforced on BOTH local config.toml and the hosted project; verify with a `POST /auth/v1/signup` → 422). `anon` holds zero table privileges, enforced by `20260716051430_revoke_anon_grants.sql` — never grant anon SELECT to "fix" a boot-time auth race. Note hosted Supabase grants anon full DML by default while local images ship hardened defaults, so **privilege posture must be asserted in a migration, not assumed** — and security checks must be re-run against hosted, not just local.
- **Migrations:** Drizzle `pg-core` schema in `packages/core/src/db/schema.ts` is the DDL source of truth; `bun run db:generate` (drizzle-kit) emits SQL into `supabase/migrations/`; RLS/seeds are hand-written migrations via `supabase migration new`. Generate first, then hand-write — timestamps must interleave correctly.
- Tables: `exercises`, `metrics`, `sessions`, `session_exercises`, `set_logs` (+ `api_tokens`). Custom metric/condition values live in jsonb (`condition_values`, `metric_values`).
- **"What's next" is one rule.** Whatever routine the app offers next — Home's hero card, the Trainer's next-workout card — comes from `suggestRoutineId` in `packages/core/src/domain/plan.ts` (longest since *completed*, scoped to the active program's folder). Call it; never add a second, subtly different definition. Two screens disagreeing about what today is is a bug, and this repo has already paid for parallel implementations once (see the matcher note above).
- **Ambient browser-API types:** non-standard vendor APIs not in TS's DOM lib (e.g. the Web Speech API) get a minimal ambient `.d.ts` under `apps/web/src/types/` rather than an `any` cast — see `speech-recognition.d.ts`.
- **Per-user module state:** module stores in `apps/web/src/lib/` that hold *user* data (not device prefs) must register their own reset via `registerUserScopedReset` in `lib/user-scoped-state.ts` — `queryClient.clear()` on sign-out / user change doesn't reach module state, so the next account on the device would inherit it. Registration lives in the store, not in `auth.tsx`, which keeps lazy-route-only stores out of the eager bundle.
- **Week start is hardcoded Sunday** — `FIRST_WEEKDAY` in `packages/core/src/config.ts` (barrel-exported), not a user preference; there is no settings picker (see `docs/DECISIONS.md` 2026-07-30). `weekStart`/`computeStreak` and the stats/report `firstWeekday` options still take it as a parameter (they're generic pure functions), every call site just passes the constant.

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

**Frog** (see `docs/brand/frog-brand-identity.html` — the brand spec — and `docs/DECISIONS.md` 2026-07-16): a Radix Themes 3 re-skin. `<Theme accentColor="grass" grayColor="sage" radius="none">` in `app.tsx` is the single source of look-and-feel; `apps/web/src/styles/theme.css` bridges legacy Tailwind tokens onto the Radix scales. Green-cool lab-ink neutrals (sage), one frog-green accent (grass) that **doubles as semantic success**; red/amber survive as small text/icons only (never large fills). **0 px border radius** (square/brutalist; circles only for avatars and inside the frog mark). Crisp 1 px low-contrast borders, flat surfaces (shadows only on floating layers). **The split rule:** the closer to the data the more serious — logging hot path, charts, findings statistics are sacred and never goofy; the frog voice lives only at the edges (empty states, loading, toasts, errors, PR banners, 404, settings corners). Copy in playground zones routes through the language registers (`apps/web/src/lib/voice.ts`: Human / Frog / Ultrafrog — a render-time text transform that never changes what is reported). Keyboard-first: ⌘K command palette, single-key shortcuts on the logging path. All numeric data (weights, reps, e1RM, timers) uses tabular numerals (`.num` utility) and is never inside a joke. Micro-interactions are 100–150 ms CSS transitions; nothing animates on the data path.

**Brand mark.** `apps/web/public/icon.svg` is the single source for the shipped assets: every PNG in `apps/web/public/` is a render of it via `bun scripts/gen-pwa-icons.ts` (re-run after any edit; never hand-edit a PNG). **The vector is a trace of the supplied art**, kept in the repo as `docs/brand/frog-source-1024.png` — the geometry was fitted to that bitmap, not drawn by eye, because an earlier hand-authored redraw drifted from what we were given. If the mark changes, re-fit against the reference and check the render over it; don't nudge control points. Its geometry is **hand-copied in two other places** — `apps/web/src/components/frog-mark.tsx` (the in-app mark) and the brand spec's inline samples — so re-sync both by hand. **The tiles show an *icon cut*, not the whole mark** — a square window on the head + body with the haunches, feet and ground bar bleeding off the sides, because the mark is 1.6:1 and centring all of it leaves the frog floating (see `docs/DECISIONS.md` → "icon cut"). The generator derives that window from the mark's measured geometry, so it follows the frog; it also asserts `icon.svg`'s own `viewBox` and `#pad` translate still match, and prints the replacements if they don't — that assert firing is the expected way to learn the cut moved. The tile is **black line work `#131426` on the source art's grass green `#6AB347`**, body the same green as the ground — **ground and line work move together**; flipping one alone breaks the mark (`GROUND` in the generator must match the `#ground` fill in `icon.svg`). Below 25px `icon.svg` swaps in a small-size treatment, including light eyes — a dark eye under a dark brow is invisible at that size. The in-app mark is a separate simplified cut and must stay `currentColor` + `var(--accent)` so it survives both themes (never the tile's fixed colours), and must stay vector for the 220 kB bundle gate. Sizing and padding rules are in the brand spec's "The mark" section. **Needing the mark as a raster (canvas, `<img>`) is not license for a third hand-copy**: `components/share-card.tsx` rasterizes the live `FrogMark` component — mount into a detached host via `react-dom/client` + `flushSync`, serialize the committed `<svg>` with `XMLSerializer`, `drawImage` it — rather than duplicating path data again. Don't reach for `react-dom/server`'s `renderToStaticMarkup` for this: it added ~61 kB gz to that lazy chunk (it re-implements a chunk of react-dom instead of reusing the client renderer already loaded), against a few hundred bytes for the `createRoot`+`flushSync` route.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
