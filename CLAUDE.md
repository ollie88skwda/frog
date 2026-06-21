# CLAUDE.md — SBL

SBL is a mobile (iOS + Android) **training lab notebook**: log the work *and* the conditions around it (sleep, carbs, stress, etc.), then surface correlations between inputs and outputs. Full spec: `docs/superpowers/specs/2026-06-20-sbl-prd.html`. Project facts live in Claude's project memory (`MEMORY.md`).

## Top priority: lightweight & fast

**SBL must be super lightweight and fast.** This is a first-class product requirement, not a nice-to-have — weigh every dependency and screen against it. Speed here comes from architecture, not language:

- **Local-first.** All reads/writes hit on-device SQLite instantly. Never block the UI on the network. Sync runs in the background.
- **Optimistic UI.** Reflect the user's action immediately; reconcile with sync later.
- **Interactions feel instant** — visual feedback within ~100ms; animations on the UI thread (Reanimated), target 60fps.
- **Minimal dependencies.** Audit before adding any library; prefer a few lines over a package. Watch bundle size and cold-start time.
- **Lazy-load** non-critical screens; **virtualize** long lists; avoid unnecessary re-renders (memoize the hot paths).
- **Offline-first** is mandatory (gyms have no signal).
- Measure, don't guess: if a change risks startup time, frame rate, or bundle size, profile it.

## Stack

- App: **Expo (React Native)** + NativeWind + `react-native-reusables` + Reanimated.
- Local store (source of truth): **SQLite via Drizzle**.
- Cloud: **Supabase** (Auth + Postgres + auto REST API), last-write-wins sync.
- Dev/integration layer (a major focus): export + personal-token API + **MCP server** + AI-buildable docs — all **TypeScript** (one language across app, CLI, MCP). **No Rust.**

## Working style

- This started via the brainstorming flow; design decisions are captured in the PRD and memory — read those before changing direction.
- Prefer `.html` over `.md` for docs the user will read (per global CLAUDE.md).
