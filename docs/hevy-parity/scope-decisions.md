# Context for Frog ← Hevy feature-parity implementation plan

## Task
Clone the Hevy MOBILE app's feature set into Frog (feature parity, built in Frog's own Linear-style design language — no copying of Hevy assets/copy/prose). User will prune later; err toward inclusion within the scope decisions below.

## User scope decisions (final, from Oliver)
1. **Skip social entirely.** No profiles-of-others, follow graph, feeds, likes/comments, discover, leaderboards, suggested users, contact sync, user search, athlete workouts, comparisons, Hevy Coach. Frog stays personal/single-user. DO keep: own profile/stats screen, share-as-image (shareable workout/stat cards, client-side rendered).
2. **Trainer = rule-based generator only.** Deterministic program generator (goal/experience/equipment/frequency/duration/focus-muscle questionnaire → program of routines), progressive-overload rule (advance weight when top of rep range hit on all sets), progress report dashboard. NO LLM, no HevyGPT analog.
3. **Platform extras → web equivalents where sane.** PWA install + web push (rest timer done, PR notifications) + screen wake-lock during workout. Watch apps, home-screen widgets, Live Activity, Apple Health/Health Connect/Strava sync: document as mobile-phase backlog only, zero web work.
4. Implied: NO paywall — everything ungated in Frog (ignore Hevy Pro caps: unlimited routines, unlimited custom exercises, full history ranges, all measurements).
5. Preserve Frog's unique features untouched: conditions tracking + findings correlations, muscle-tier science library, machines (catalog/settings-memory/photos), CSV/JSON export, PAT API, MCP server, Hevy/Fitbit importers.

## Key source documents (READ THESE)
- **Master Hevy mobile spec** (screens, features w/ build-ready specs, global rules, pro list, integrations, gaps): `/private/tmp/claude-502/-Users-Ollie-Documents-Code-sbl/5074eb6e-0488-4551-976f-65fcaa4042c3/tasks/wxf6t3g6d.output` — JSON, read `result.master` (lines 8–723). 405 source feature entries distilled into ~14 screen groups.
- **Frog current-state inventory**: `/private/tmp/claude-502/-Users-Ollie-Documents-Code-sbl/5074eb6e-0488-4551-976f-65fcaa4042c3/scratchpad/hevy/sbl-inventory.md` (written alongside this file).
- Frog repo: `/Users/Ollie/Documents/Code/sbl` — read `AGENTS.md`, `CLAUDE.md`, `packages/core/src/db/schema.ts`, `apps/web/src/screens/session.tsx`, `apps/web/src/lib/queries.ts` for conventions.

## Hard constraints (from Frog CLAUDE.md/AGENTS.md)
- Initial JS ≤220 kB gzipped (CI-gated). ~~Charts must be tiny custom SVG or a micro-lib, lazy-loaded — NOT recharts~~ **→ stats graphs are now shadcn charts over recharts 3.8, lazy-loaded in the stats chunk (2026-08-08 stats-screen batch); the ≤220 kB eager gate still holds**.
- Optimistic UI everywhere on the logging path; mobile-first (bottom tabs, ≥40px targets); online-first Supabase-direct via the `Repo` seam; `packages/core` framework-free.
- Migrations: Drizzle schema → `bun run db:generate`, hand-written RLS + seeds interleaved; soft-delete only; owner_id/RLS pattern; seed rows owner_id NULL.
- Design: current Frog monochrome/0px-radius/8px-grid theme. NO Hevy visual cloning.

## Known open implementation choices the plan should resolve (recommend, don't ask)
- Exercise library expansion: recommend seeding from free-exercise-db (public-domain, ~870 exercises w/ images + instructions) mapped into Frog's schema + muscle/tier taxonomy; keep Frog's 20 curated seeds as the "classified" core; classification of the rest can be incremental.
- Exercise types (8 Hevy types: weight&reps, bodyweight reps, weighted bodyweight, assisted bodyweight, duration, duration&weight, distance&duration, weight&distance) — schema approach for set_logs (add durationSec, distanceM, exercise.exerciseType; bodyweight volume math needs a bodyweight source = Measures latest weight).
- Charts: ~~recommend one tiny in-house SVG chart kit (line, bar, grouped bar, heatmap-body) in apps/web, lazy-loaded~~ **SUPERSEDED → 2026-08-08 (stats-screen batch): stats graphs are shadcn charts (recharts 3.8) and the body heat map is the react-body-highlighter library figure; the in-house kit survives for the other screens.** ~~the in-house kit survives for the other screens~~ **SUPERSEDED → 2026-08-08 (chart conversions): the kit is deleted — the remaining screens (profile, year-review, monthly-report, findings, exercise-detail, trainer) also render shadcn charts; only the body heat maps stay hand-drawn (no library heatmap exists).**
- Body heat map: Frog already has anatomy muscle taxonomy; needs front/back SVG body diagram component.
