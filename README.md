# SBL

A **training lab notebook**: log the work *and* the conditions around it (sleep, carbs, caffeine, stress), then surface correlations between inputs and outputs — with your data fully open via export, a personal-token API, and an MCP server.

> "SBL" is a working title.

## Layout

- `apps/web` — Vite + React SPA (the app)
- `packages/core` — framework-free domain logic, findings engine, schema, data-access interface
- `packages/mcp` — MCP server over the personal-token API
- `supabase/` — Postgres migrations, RLS, Edge Functions
- `docs/` — PRD and specs

The original Expo/React Native app is archived on branch `legacy/expo` (tag `expo-final`).

## Develop

```sh
bun install
supabase start        # local Postgres/Auth (Docker)
bun run dev           # app at localhost:5173
bun run test          # unit + integration
bun run e2e           # Playwright
```

See `AGENTS.md` for architecture and conventions.
