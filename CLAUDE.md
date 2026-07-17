# CLAUDE.md — SBL

SBL is a **training lab notebook** (web app first; mobile later): log the work *and* the conditions around it (sleep, carbs, stress, etc.), then surface correlations between inputs and outputs. Full spec: `docs/superpowers/specs/2026-06-20-sbl-prd.html`. Architecture + conventions: `AGENTS.md` (read it before coding). Project facts live in Claude's project memory (`MEMORY.md`).

## Top priority: lightweight & fast

**SBL must be super lightweight and fast.** First-class product requirement — weigh every dependency and screen against it:

- **Optimistic UI.** Reflect the user's action immediately; logging a set never waits on the network (client-generated IDs, background mutations with retry).
- **Interactions feel instant** — visual feedback within ~100ms; 100–150ms CSS transitions; nothing animates on the data path.
- **Minimal dependencies.** Audit before adding any library; prefer a few lines over a package. Initial JS budget ≤220 kB gzipped (CI-gated — the honest eager set, measured from `dist/index.html`, not a filename glob).
- **Lazy-load** non-critical routes; **virtualize** long lists only when profiling demands; memoize hot paths.
- Measure, don't guess: if a change risks bundle size or interaction latency, profile it.

Note: v1 web is **online-first** (Supabase-direct; account required). The PRD's offline mandate is deferred to the mobile phase — the `Repo` interface in `packages/core` is the seam where a local store slots in later. Don't promise offline in UI copy.

## Stack

- Monorepo (Bun workspaces): `apps/web` + `packages/core` + `packages/mcp` + `supabase/`.
- App: **Vite + React SPA**, react-router v7, TanStack Query, Tailwind v4 (CSS-first `@theme`), vendored shadcn/ui.
- Data: **Supabase** (Postgres + RLS + PostgREST) via supabase-js; auth is **Clerk** (Google + email, prebuilt UI) via Supabase third-party auth; Drizzle pg-core schema → drizzle-kit → `supabase/migrations/`.
- Domain logic: framework-free TS in `packages/core` (units, e1rm, progression, session-reducer, findings) — keep it free of React/DOM/supabase imports (except `repo/`).
- Dev/integration layer (a major focus): export + personal-token API + **MCP server** + AI-buildable docs — all **TypeScript**. **No Rust.**
- Design: **Frog** — Radix Themes 3 re-skin (`docs/brand/frog-brand-identity.html`): sage lab-ink neutrals, single grass-green accent (= semantic success), 0px radius, 1px borders, dense keyboard-first UI, ⌘K palette, tabular numerals. Frog voice only at the edges (empty states, errors, celebrations) via the Human/Frog/Ultrafrog registers in `apps/web/src/lib/voice.ts`; data zones stay deadpan-serious. (Legacy app archived on branch `legacy/expo`.)

## Working style

- Design decisions are captured in the PRD, AGENTS.md, and memory — read those before changing direction.
- "SBL" is a placeholder name — single source `packages/core/src/config.ts`; never hardcode.
- Prefer `.html` over `.md` for docs the user will read (per global CLAUDE.md).
