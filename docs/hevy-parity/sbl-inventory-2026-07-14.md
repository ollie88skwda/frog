# SBL — Current Feature Inventory (as of 2026-07-14, main + uncommitted working tree)

SBL = training lab notebook: log work + surrounding conditions (sleep, carbs, stress), surface correlations ("Findings"). Web-first Vite React SPA + Supabase-direct, online-first.

## Routes / Screens
Router: `apps/web/src/app.tsx` (react-router v7; lazy routes except Train; `RequireAuth` → `AppShell`). Shell: `apps/web/src/components/app-shell.tsx` (desktop sidebar + mobile bottom tabs, theme toggle, ⌘K).

| Route | File | Function |
|---|---|---|
| `/` Train | `screens/train.tsx` | Start/resume session, `S` hotkey, findings teaser card |
| `/session/:id` | `screens/session.tsx` | Core logging screen (~1210 lines) |
| `/library` | `screens/library.tsx` | Exercise library + machines + custom metrics |
| `/history` | `screens/history.tsx` | Paginated session list (infinite, 50/page) |
| `/history/:id` | `screens/history-detail.tsx` | Read-only session, backdate, soft-delete |
| `/findings` | `screens/findings.tsx` | Progression/conditions correlations + countdowns |
| `/settings` | `screens/settings.tsx` | Units, export, import, API tokens, sign out |
| `/auth` | `screens/auth.tsx` | Magic-link OTP |

Global: command palette (cmdk), single-key hotkeys (`a` add exercise, `e` end, `s/l/h/f` nav) via `lib/hotkeys.ts`.

## Data model (`packages/core/src/db/schema.ts`, Drizzle)
Convention: client uuid `id`, bigint ms `created_at/updated_at/deleted_at` (soft-delete only), `owner_id` default `auth.uid()` (NULL = global seed), RLS everywhere.
- `exercises`: name, tags jsonb, isCustom, machineId, jointActions jsonb, muscleTargets jsonb ({muscle,tier}[], first=primary), imageUrl+attribution
- `machines`: name, brand, catalogKey, settings jsonb ({label,value}[]), notes, photoPath
- `metrics`: name, type(number|scale|text|checkbox), scope(set|session), unit, exerciseIds jsonb
- `tracked_conditions`: metricId, tracked, position
- `exercise_favorites`: exerciseId, favorite
- `sessions`: title, startedAt, endedAt(null=active), conditionValues jsonb, notes
- `session_exercises`: sessionId, exerciseId, orderIndex
- `set_logs`: sessionExerciseId, setNo, weightKg (canonical kg), reps, rir, rpe, note, restSec, metricValues jsonb, completed
- `api_tokens`: name, tokenHash, lastUsedAt, revokedAt

Seeds: ~20 lifts w/ full muscle/joint classification; 7 condition metrics (Sleep, Bodyweight, Pre-carbs, Caffeine, Stress, Last meal, Meal note) in `packages/core/src/db/seed-ids.ts`; static machine catalog (~40 categories) `packages/core/src/data/machine-catalog.ts` (lazy chunk).

## Domain (`packages/core/src/`)
- `domain/e1rm.ts`: Epley e1RM + effort-aware (RIR / RIR≈10−RPE)
- `domain/anatomy.ts`: 51 muscles, joint-action catalog, S/A/B/C tiers, ACTION_RATINGS with citations
- `domain/progression.ts`: robust linear fit (MAD outliers, ≥5 sessions) → PROGRESSING/PLATEAU/REGRESSING
- `domain/conditions.ts`, `domain/session-reducer.ts` (draft sets + ghost prefill), `domain/units.ts`, `domain/ids.ts`, `domain/tokens.ts`
- `findings/teaser.ts`, `findings/conditions.ts` (median-split correlation engine w/ guardrails)
- `export/csv.ts`; `import/hevy.ts` (CSV, idempotent), `import/fitbit-sleep.ts`

## Logging flow today (`screens/session.tsx`)
Optimistic, client UUIDs. One active session. Add exercises via muscle-grouped tier-sorted picker (`components/exercise-filter.tsx`) with per-exercise last-session toggle. Weight×reps grid; ghost prefill from last session (Enter accepts); per-set opt-in extras: RIR, RPE, note, custom set metrics; e1RM in set menu. Rest counts up from last commit, restSec auto-recorded/set. Machine setup strip (remembered settings). ConditionsChip: tracked vars, type-to-add, autosave. Inline edit/delete sets, end session.

**Missing vs Hevy**: routines/templates (zero), supersets, set types (warmup/failure/drop), rest-timer countdown w/ target+notification, plate calculator, warm-up calculator, duration/distance exercise types, per-exercise detail screen (history/charts/records), PRs/records system, charts anywhere, body measurements/progress photos, calendar/streaks, statistics hub, monthly/yearly reports, program library, program generator, PWA/push, profile screen, share cards, Strong CSV import, workout media, saved-workout full edit (only backdate/delete), copy workout, save-as-routine, workout visibility (n/a single-user), duration edit, workout notes carry-forward, previous-values column semantics (has ghost variant), per-exercise units override, first-day-of-week, sounds, keep-awake, exercise instructions/media for most exercises.

## Library screen
Muscle-grouped collapsible, tier-colored, search+filter, "Best for muscle" science dialog, custom exercise create/edit (targets, tiers, joint actions, machine link, tags), archive, favorites, last-set summary, line-art thumbnails (seeds), machines section (catalog + settings + photos), custom metrics section.

## Findings/analytics
Text/percentage rows only: progression verdicts, condition correlations (median-split, confidence labels), unlock countdowns. No charts, no PRs, no per-exercise history screen, no measurements, no calendar.

## Settings
kg/lb (device-local, default lb; storage kg), dark/light theme, JSON/CSV export, Hevy CSV + Fitbit sleep import, API tokens, sign out. Placeholder micro-lessons system (`lib/lessons.ts`).

## Repo seam (`packages/core/src/repo/`)
`Repo` interface (types.ts) — screens never touch supabase directly; `SupabaseRepo` impl. Full CRUD: exercises/machines/metrics/tracked-conditions/sessions/session-exercises/sets/ghost/imports/applySleep/findingsData/exportAll/tokens. Plus PAT REST API (Edge Function `supabase/functions/api/index.ts`, GET-only) and MCP server (`packages/mcp/`).

## Conventions (AGENTS.md)
- Migrations: edit Drizzle schema → `bun run db:generate` → hand-write RLS/seeds via `supabase migration new` (interleaved timestamps) → `supabase db reset` to verify.
- RLS: owner_id default auth.uid(); seed rows NULL owner readable-all non-writable; owner-scoped satellite tables extend seed rows (favorites pattern).
- TanStack Query: one hook per op in `apps/web/src/lib/queries.ts`; optimistic = onMutate snapshot/setQueryData + onError rollback + onSettled invalidate. Existing keys: exercises, machines, session, session-exercises, active-session, sessions(infinite), findings-data, ghost, metrics, tracked-conditions, exercise-favorites, api-tokens.
- ≤220kB gzip initial JS (CI-gated); mobile-first ≥40px targets; lazy non-critical routes; `packages/core` framework-free.
- `docs/DECISIONS.md` append same-commit; `docs/schema.md`; e2e Playwright suites in `e2e/` against vite preview + local Supabase.
- "SBL" name via `packages/core/src/config.ts` only.

## SBL uniques to preserve
Conditions + findings correlation engine, muscle-tier science + citations, machines system, PAT API + MCP + open export, effort-aware e1RM, importers.
