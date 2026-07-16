# SBL ← Hevy feature parity — implementation plan

## Context

SBL currently nails its niche (logging + conditions + findings) but is missing most of what a full workout tracker offers. Oliver asked to clone the **Hevy mobile app** feature-for-feature into SBL so he can start from a feature-rich baseline and prune later.

Research performed (this session): 48 Hevy feature articles + 86 help-center docs + 15 legacy help pages + App Store/Play/pricing pages read by a 22-agent workflow → synthesized into a build-ready master spec (14 screen groups, 24 global behavior rules, Pro matrix, integrations), completeness-audited at ~90–95 % of Hevy's own taxonomy. A logged-in web-app walk was prepared but deferred (plan-mode); it runs at implementation start for pixel-level reference.

**We clone functionality, never assets/copy** — everything is built in SBL's own design language (blue monochrome #034078, 0px radius, 8px grid, Bricolage Grotesque, dense mobile-first). No Hevy images, icons, prose, or exercise media.

### Source documents (implementation step 0 copies these into `docs/hevy-parity/`)
- Master Hevy spec (JSON): `/private/tmp/claude-502/-Users-Ollie-Documents-Code-sbl/5074eb6e-0488-4551-976f-65fcaa4042c3/tasks/wxf6t3g6d.output` (`result.master`)
- SBL inventory: `.../scratchpad/hevy/sbl-inventory.md` · Scope context: `.../scratchpad/hevy/plan-context.md`
- Logged-in Hevy session for the reference walk: `.../scratchpad/hevy/state.json` (⚠ single-use rotating refresh token — ONE browser context at a time, sequential only)

### Locked scope decisions (Oliver, this session)
1. **No social.** No follows/feed/likes/comments/discover/leaderboards/strength-level cohorts/user search/Coach/HevyGPT. Keep single-user reinterpretations: own profile/stats, share-as-image (client-rendered PNG, no links/hosting).
2. **Trainer = rule-based generator** (deterministic, built on SBL's muscle-tier science). No LLM.
3. **Platform extras → web equivalents**: PWA install, web-push/SW notifications (rest timer, PR), screen wake-lock. Watch/widgets/Live Activity/Apple Health/Strava → `docs/backlog-mobile.md` only.
4. **No paywall** — every Hevy Pro gate ships ungated (unlimited routines/customs, full history ranges, all measurements).
5. **SBL uniques untouched**: conditions + findings engine, tier science, machines, PAT API/MCP, export/importers.
6. Nav: keep today's **3-tab decision** (Home / Training / Profile — DECISIONS.md 2026-07-14); everything maps onto it.

---

## A. Gap matrix (Hevy → SBL)

✅ exists · 🟡 partial · ❌ missing

| Hevy feature | Status | Maps onto |
|---|---|---|
| Routines (list/start/duplicate/reorder/delete) | ❌ | New `routines`+`routine_exercises`+`routine_sets`; `/train` becomes routines home |
| Routine folders (+share-as-image) | ❌ | `routine_folders`; PNG share |
| Routine builder (targets, rep ranges, set types, rest, notes, supersets) | ❌ | `/routines/:id/edit`, reuses `exercise-filter.tsx` |
| Start Empty Workout | ✅ | `useStartSession` |
| Explore program library | ❌ | SBL-authored static catalog (12 programs v1), import → user routines |
| Trainer (questionnaire→program, overload rule, exclusions, progress report) | ❌ | `packages/core/src/generator/` + `programs` table |
| Live logging, optimistic, ghost prefill | ✅ | `session.tsx` |
| Set types (Normal/Warmup/Failure/Drop) | ❌ | `set_type` on `set_logs` + `routine_sets` |
| 8 exercise types + duration/distance + volume math | ❌ | `exercises.exercise_type`, `set_logs.duration_sec/distance_m`, `domain/volume.ts` |
| Supersets/circuits, color groups, smart scrolling | ❌ | `superset_group` on session+routine exercises |
| Rest count-up | ✅ | exists |
| Rest countdown/exercise (±15s, sound, notification, drop-set suppression) | ❌ | `session_exercises.rest_sec` + `domain/rest-timer.ts` + WebAudio/SW |
| PREVIOUS column (any-workout vs same-routine, tap-fill, per set index) | 🟡 | extend ghost → `domain/previous.ts` + `sessions.routine_id` |
| RPE/RIR per set | ✅ | richer than Hevy (native RIR) |
| Plate calculator (+custom bars/plates) | ❌ | `domain/plates.ts` + sheet; config in `user_prefs` |
| Warm-up calculator (formula+rounding) | ❌ | `domain/warmup.ts` |
| Duration inline timer | ❌ | count-up stopwatch on duration set rows |
| Per-exercise session note + carry-forward ghost | 🟡 | `session_exercises.note` |
| Live PR banner + medals; PR taxonomy per type | ❌ | `records/` engine (client-computed) |
| Set Records table (heaviest per rep count) | ❌ | same engine |
| Pause timer, edit duration/date | 🟡 | `sessions.paused_ms` + endedAt edit |
| Finish/save screen (title/desc/duration/date/media/routine-update toggles), discard | 🟡 | new finish overlay + `session_media` |
| Update Routine Values + structural-change prompt | ❌ | diff vs source routine at finish |
| Post-save celebration + share cards | ❌ | summary overlay + canvas PNG renderer |
| Exercise library 400+ w/ instructions | 🟡 | seed ~870 from free-exercise-db (public domain) + instructions; static frames, no animations |
| Custom exercises (type/equipment) | 🟡 | add fields; duplicate-as-reset |
| Exercise detail (charts/records/history/how-to) | ❌ | `/exercises/:id` + in-house SVG chart kit |
| Per-exercise unit override | ❌ | `exercise_prefs` satellite (favorites pattern) |
| Profile + dashboard | 🟡 | fill `profile.tsx` stub |
| History full edit / Copy Workout / Save as Routine | 🟡 | extend `history-detail.tsx` |
| Calendar (month/year/all-time, retro-log, first-weekday) | ❌ | `/calendar` |
| Weekly streak + rest-day counter + backdate repair | ❌ | `domain/streak.ts` (computed) |
| Statistics hub (7-day body map, sets/muscle, distribution vs prior period, main exercises) | ❌ | `/stats` + `stats/aggregate.ts` + body heat-map SVG |
| Monthly report / Year in Review | ❌ | report builders + screens (SBL keeps archive — improvement) |
| Measures (weight/bodyfat/14 girths, 1/day) + progress photos (private, compare) | ❌ | `measurements` table + `/measures` + private bucket |
| Settings: units(3 kinds), workouts hub(12), first weekday, sounds, notifications | 🟡 | expand settings + `user_prefs` |
| Warm-ups-in-stats toggle w/ retroactive recompute | ❌ | pref + cache invalidation (recompute free — client-computed) |
| Keep awake / PWA / push | ❌ | Wake Lock API, manifest+SW, thin web-push |
| Strong CSV import; measurements CSV export | ❌ | `import/strong.ts`; extend `export/csv.ts` |
| Workout media (3 photos) | ❌ | `session_media` (photos v1, video backlog) |
| 150-set cap | — | deliberately dropped (no caps) |
| Social/Coach/HevyGPT; watch/widgets/Health/Strava | — | out of scope / backlog doc |

---

## B. Schema changes

House convention throughout: uuid client id, bigint-ms timestamps, soft delete, `owner_id` RLS. Workflow: edit `packages/core/src/db/schema.ts` → `bun run db:generate` → hand-written RLS via `supabase migration new` (interleaved timestamps) → `supabase db reset`. Update `docs/schema.md` + `docs/DECISIONS.md` same-commit.

**New tables**
- `routine_folders` — name, position
- `routines` — name, folderId (null=unfiled), position, description
- `routine_exercises` — routineId, exerciseId, orderIndex, supersetGroup (int, null=none), restSec (null=default, 0=off), note (persistent template note)
- `routine_sets` — routineExerciseId, setNo, setType (`normal|warmup|failure|drop`), targetWeightKg, targetReps, targetRepsMax (non-null ⇒ rep range), targetDurationSec, targetDistanceM
- `programs` — source (`generated|library`), libraryKey, config jsonb (questionnaire), folderId, active. Progression state NOT stored (overload rule reads history via `sessions.routine_id`)
- `measurements` — measuredOn `YYYY-MM-DD` + unique(owner,date) (1/day), bodyweightKg, bodyfatPct, 14 circumference cols, photoPath (progress photo = part of day's entry → 1/day falls out structurally). **Bodyweight duplication resolved**: `measurements` = canonical store; seeded Bodyweight condition stays as correlation entry point — setting it upserts a measurement; ConditionsChip prefills from latest. Findings engine unchanged.
- `exercise_prefs` — satellite on seed rows (favorites pattern): weightUnit override (`kg|lb`|null), generatorExcluded bool
- `user_prefs` — 1 row/user: firstWeekday, includeWarmupsInStats, defaultRestSec, previousValuesScope (`any|routine`), bodyDiagram, plateConfig jsonb, displayName. **Split rule**: semantics-bearing/cross-device → server; pure device behavior (theme, display unit, sounds/volumes, keep-awake, column visibility, smart scrolling, PR-banner toggle) → localStorage (existing `lib/settings.ts` pattern)
- `session_media` — sessionId, path, position, mediaType (`photo` v1). Private buckets `session-media` + `progress-photos` (policies cloned from `machine-photos`)

**Existing tables**
- `exercises` + `exerciseType` (8 values: `weight_reps|bodyweight_reps|weighted_bodyweight|assisted_bodyweight|duration|weight_duration|distance_duration|weight_distance`; immutable once logged — duplicate-as-custom is the reset path), + `equipment`, + `instructions` jsonb, + `imageUrls` jsonb
- `set_logs` + `setType`, `durationSec`, `distanceM` (weightKg reinterpreted per type: added/assistance weight)
- `session_exercises` + `supersetGroup`, `restSec`, `note`, `routineExerciseId` (provenance → routine write-back + same-routine PREVIOUS)
- `sessions` + `routineId`, `pausedMs` (duration = ended − started − paused)

**Records: computed, not stored.** `records/` engine computes PR taxonomy + timeline + set-records client-side from a `recordsData()` repo fetch (mirrors `findingsData()` pattern), TanStack-cached. Retroactive edits/imports/warm-up-toggle become cache invalidations — no server recompute subsystem. Live PR banner reads a cached bests snapshot at session mount (no network on logging path). Repo seam keeps a stored fallback open if profiling demands.

**Volume math deviation (record in DECISIONS.md)**: volume follows `exerciseType` uniformly for ALL exercises including customs (Hevy excludes customs from bodyweight math — artifact of their flags; SBL is consistent). No bodyweight logged ⇒ bodyweight volume skipped.

---

## C. New domain modules (`packages/core`, framework-free, unit-tested)

- `domain/exercise-types.ts` — type enum, per-type column config, validation, weight semantics
- `domain/volume.ts` — per-set volume incl. bodyweight variants; session totals; per-muscle set counts
- `records/records.ts` + `records/live.ts` — PR taxonomy per exercise type (weight_reps: Heaviest/Best e1RM/Best Set Volume/Best Session Volume; assisted: reps-only PRs; duration: Best Time; cardio: Longest Distance/Time/Best Pace; etc. per master spec), set-records table, first-log-never-PRs, ties-never-PR; pure `checkSetForPR` for the banner
- `domain/streak.ts` — calendar-week streak (firstWeekday-aware), rest-day counter, backdate repair via recompute
- `domain/warmup.ts` — %-based warm-up generation, editable method, plate/dumbbell rounding
- `domain/plates.ts` — per-side arrangement or closest-achievable
- `domain/rest-timer.ts` — countdown model, ±15s, drop-set suppression
- `domain/previous.ts` — PREVIOUS resolver (any-workout vs same-routine, per set index, tap-fill payloads)
- `generator/generate.ts` + `generator/overload.ts` — questionnaire → program from tier science (S/A exercises, equipment + exclusions respected, starting weights from history); advance weight only when top of rep range hit on ALL sets; progressing/maintaining flags
- `stats/aggregate.ts` — sets-per-muscle (range × granularity), distribution + prior-equal-period compare, totals w/ deltas, main exercises, consistency series
- `stats/monthly-report.ts`, `stats/year-review.ts`
- `import/strong.ts` — Strong CSV (idempotent by started_at, like hevy.ts; no one-import cap/revert — idempotency + soft delete cover it)

Extended: `session-reducer.ts` (set types, duration/distance drafts, superset order, note ghost), `export/csv.ts` (+new columns, +measurements CSV), `units.ts` (+distance, +cm/in), `anatomy.ts` (+`MUSCLE_REGION` rollup → chest/back/legs/shoulders/arms/core). `findings/` untouched.

---

## D. Screens (3-tab shell; all new routes lazy)

**Chart kit** `apps/web/src/components/charts/` — in-house SVG only (line, bars, grouped-bars, sparkline, body-heatmap), zero deps, theme tokens, tabular numerals, only in lazy chunks. Body heat map = hand-built front/back SVG, 6–10 region paths per view keyed to `MUSCLE_REGION`, neutral figure v1.

| Route | Work |
|---|---|
| `/` Home | + streak/rest-day card, week mini heat map, monthly-report promo (dismissible), Dec year-review banner |
| `/train` | rebuild → routines home: empty-workout, resume, folders (drag reorder), routine cards (Start + edit/duplicate/move/share-PNG/delete-confirm), Programs + Trainer links |
| `/routines/new`, `/routines/:id/edit` | builder: multi-select picker, per-set targets (weight, reps ⇄ rep-range, time/distance), set types, per-exercise rest + note, supersets, reorder/replace/remove, folder |
| `/programs`, `/programs/:key` | 12 SBL-authored programs (static lazy catalog `packages/core/src/data/program-catalog.ts`, 4 per level across gym/dumbbell/bodyweight); Save → folder of routines |
| `/trainer` | questionnaire → generated program; next-workout card; modify (4 tier-ranked alternatives, exclude, reorder); settings; progress report (consistency, volume/sets, per-exercise flags, distribution + recommended band, bodyweight trend) |
| `/session/:id` | set-type cell menu; PREVIOUS column + tap-fill; per-type columns + inline duration stopwatch; superset color bars + smart scroll; rest countdown chip (±15s/sound/notification); plate-calc sheet (barbell-class); warm-up insert; per-exercise note + carry-forward; live PR banner; pause; name-tap → exercise detail; draft keystrokes → localStorage |
| `/session/:id/finish` | new overlay: totals; title/notes/date/duration; photos ≤3 (reorder/remove); Update-Routine-Values toggle (rep-range sets never auto-updated) + structural-diff prompt; Discard; Save → summary |
| post-save summary | overlay on `/history/:id?summary=1`: ordinal, streak (first-of-week), slides (PRs, consistency, overview, exercises + mini heat map), share per slide |
| `components/share-card.tsx` | canvas → PNG (light/dark/transparent), `navigator.share` + download fallback; used everywhere share appears |
| `/exercises/:id` | Summary (metric-chip line chart per type, 3m/1y/all; records w/ deep links; set-records table) · History (per-session breakdowns) · How-to (frames + steps + SBL tier/science block) |
| `/profile` | fill stub: name, counts, streak, media strip, 3-month activity bars, dashboard buttons (Exercises/Stats/Measures/Calendar), recent history, gear |
| `/history/:id` | full retroactive edit (session components in edit mode), Copy Workout, Save as Routine, share, media |
| `/calendar` | month grid (0px squares), tap-through, retro-log + multi-workout "+", year/all-time zooms, streak header, share |
| `/stats` | 7-day consistency + body heat map; sets-per-muscle (range × granularity × multi-muscle); distribution vs grey prior period + totals w/ deltas; weekly body view; main exercises; report links |
| `/stats/monthly`, `/stats/year` | report slides, month archive picker, shareable |
| `/measures` | entry editor (backdate, any subset, 1/day upsert), trend graph + metric switcher + list, photo gallery/compare/replace/delete, `<input capture>` camera v1 |
| `/settings` | units ×3 + per-exercise note; workouts hub (default rest, previous scope, warm-up method editor, warm-ups-in-stats, RPE/RIR visibility, inline timer, smart scrolling, PR banner, plate gear, keep awake, sounds w/ WebAudio volumes); first weekday; body diagram; notifications; Install app; Strong import; measurements export |

Extended: `exercise-filter.tsx` (equipment filter, multi-select, `content-visibility` perf), `command-palette.tsx` (+routes), `anatomy-ui.tsx` (thumb fallbacks). `/findings` untouched.

---

## E. Milestones (each ends green + DECISIONS/schema updated)

Standard verify each: `bun run test && bun run typecheck && bun run lint && supabase db reset && bun run build && bun run e2e` (+ milestone specs; build runs the 220 kB gate).

- **M0 (S)** — persist research: copy master spec + inventory into `docs/hevy-parity/`; run the prepared sequential logged-in Hevy web walk (ONE context; walk plan at `~/.claude/plans/i-feel-like-the-eager-stroustrup-agent-a2ad38ec46cce7807.md`) for UI reference shots; `docs/backlog-mobile.md`.
- **M1 (L)** — exercise & set types foundation: migrations (exercises type/equipment/instructions/imageUrls; set_logs setType/duration/distance; session_exercises supersetGroup/restSec/note/routineExerciseId; sessions routineId/pausedMs; user_prefs; exercise_prefs; seed-stamp 20 seeds), `exercise-types.ts`, `volume.ts`, reducer/csv/units extensions, set-type menu, per-type columns, inline duration timer, unit override, custom-exercise form fields. e2e: set-types, exercise-types.
- **M2 (L)** — routines & folders: 4 tables, `previous.ts`, routines home, builder, start-routine → prefilled session, PREVIOUS column, finish overlay v1 (+update-values toggle + structural prompt, discard), save-as-routine + copy-workout. e2e: routines, finish-flow.
- **M3 (L)** — active-session upgrades: `rest-timer.ts`, `plates.ts`, `warmup.ts`, `records/*`; supersets + smart scrolling, rest countdown, plate sheet, warm-up insert, notes carry-forward, live PR banner + medals, pause, draft localStorage. e2e: supersets, rest-timer, live-pr.
- **M4 (M)** — library expansion: `scripts/import-free-exercise-db.ts` → seed migration (~870 exercises, hand-reviewed muscle map, untiered sorts below curated 20, jsDelivr images), picker perf. Verify license (Unlicense) + spot-check 20 rows. e2e: library-expansion.
- **M5 (M)** — chart kit + `/exercises/:id` + `recordsData()` + duplicate-exercise. e2e: exercise-detail.
- **M6 (M)** — profile fill, `/calendar`, `streak.ts`, streak cards. e2e: calendar-streak.
- **M7 (M)** — measures & photos: `measurements` + buckets + RLS, bodyweight condition↔measurement mirror, `/measures`, finish-photo attach, media strip; bodyweight volume goes live. e2e: measures.
- **M8 (L)** — stats hub + body heat-map SVG + `stats/aggregate.ts` + Home mini map. e2e: stats.
- **M9 (M)** — post-save summary + share-card renderer everywhere. e2e: share-summary (asserts PNG blob).
- **M10 (M)** — monthly report (archived) + year in review + promo cards. e2e: reports.
- **M11 (L)** — programs + generator: `programs` table, `generator/*`, 12-program catalog, `/programs`, `/trainer`, overload prescriptions + badges. e2e: generator, programs.
- **M12 (M)** — settings hub build-out, WebAudio sounds, wake lock, PWA manifest + SW, notifications + thin web-push (`push_subscriptions` + `send-rest-push` Edge Function, ≤300s delay; degrades to in-page audio + SW local notification; iOS needs installed PWA — say so in settings copy), `import/strong.ts`, measurements CSV. e2e: settings, strong-import.

Dependencies: M1 first. Then {M2, M3, M4, M7} parallel (M2→M3 sequenced inside session.tsx or partitioned by component). Then {M5, M6} → {M8, M9, M11} → M10, M12.

## F. Risks & guardrails

- **220 kB gate**: zero new runtime deps planned (charts/canvas/CSV/push all hand-rolled or existing). Only session.tsx grows in the eager chunk — measure per milestone; `React.lazy` islands for plate/warm-up sheets if needed.
- **870-row picker**: `content-visibility` + group collapse first; virtualize only if profiling demands.
- **free-exercise-db**: verify Unlicense + image provenance at M4 before seeding; hand-review the muscle-name map.
- **Storage**: private buckets, owner-prefix policies cloned from machine-photos, client-side resize, signed URLs.
- **Hevy session fragility** (M0 walk): single-use rotating refresh tokens — one sequential browser context only.
- **Online-first unchanged**: active session already server-persisted; only uncommitted keystrokes go to localStorage. No offline promises in copy.

## Deliberate deviations (flag in DECISIONS.md; Oliver prunes later)

No 150-set cap · photos-only workout media v1 (video backlog) · no camera ghost-overlay v1 · neutral heat-map figure v1 · uniform bodyweight-volume rule for customs · Strong import without one-import/revert restrictions · static how-to frames (no animations) · monthly-report archive kept (Hevy deletes) · no paywall anywhere.

## Verification (end-to-end)

Per milestone: full suite + new e2e specs against local Supabase + vite preview. After M3 and again after M12: scripted month-long journey e2e (existing `docs/2026-07-13-e2e-month-journey-report.html` precedent) covering routine creation → generated program → sessions with supersets/set-types/PRs → measures → stats/report screens, plus a real-browser mobile-viewport pass (390×844) with pixel-hygiene review per global standards.
