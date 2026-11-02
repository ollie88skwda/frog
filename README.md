# Frog

A **training lab notebook**: log the work *and* the conditions around it (sleep, carbs, caffeine, stress), then surface correlations between inputs and outputs — with your data fully open via export, a personal-token API, and an MCP server.

## Layout

- `apps/web` — Vite + React SPA (the app)
- `packages/core` — framework-free domain logic, findings engine, schema, data-access interface
- `packages/mcp` — MCP server over the personal-token API
- `convex/` — backend: schema, owner-scoped functions, file storage, token API (HTTP actions)
- `supabase/migrations/` — frozen pre-Convex Postgres history (kept until the prod data import has run)
- `docs/` — PRD and specs

The original Expo/React Native app is archived on branch `legacy/expo` (tag `expo-final`).

## Develop

```sh
bun install
CONVEX_AGENT_MODE=anonymous bunx convex dev   # local backend on :3210 (own terminal; long-lived)
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://top-parakeet-48.clerk.accounts.dev   # once per new backend; function pushes fail until it's set
bun run convex:seed   # global exercise library / conditions / machine catalog (admin env, see AGENTS.md)
bun run dev           # app at localhost:5173 (apps/web/.env.local: VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY)
bun run test          # unit
bun run test:integration
bun run e2e           # Playwright against the local backend
```

See `AGENTS.md` for architecture and conventions.
