# SBL Overnight Log

> **Format:** Each run appends a dated section. Record what was done, test counts, tsc status, commit hashes, and any decisions that need the user.

---

## 2026-06-24 — Run 5

### Orientation
- Resumed from Run 4. Baseline on `overnight` branch: **140 tests passing**, TypeScript clean.
- Priorities from Run 4: per-exercise detail on Findings screen, set-level metric entry, metric creation UI, `useFindings` live reactivity.

### Work completed
All work on `overnight` branch. Commit: `80585ae`.

**1. `src/db/use-findings.ts` — return full HolisticReport**
- Changed return type from `[ProgressionSummary, refetch]` to `[{summary, report}, refetch]` so the Findings screen can access both the summary lines and the raw `HolisticReport.findings` for per-exercise detail.

**2. `app/findings.tsx` — per-exercise breakdown + live refresh**
- Per-exercise `ExerciseRow` cards below the headline: exercise name, verdict badge (colour-coded pos/neg/soft), session count, % change, and e1RM/month rate for PROGRESSING/REGRESSING lifts.
- Off-day flags section: lists each flagged session day with avg deviation % and exercise count.
- Data quality flags section: lists weight outliers (with z-score) and spike-revert anomalies.
- `useFocusEffect` auto-refreshes findings whenever the Findings tab comes into focus — no manual refetch needed after logging a session.
- Exercise rows sorted: PROGRESSING first, then PLATEAU, REGRESSING, INSUFFICIENT.

**3. `src/ui/SetMetricEntry.tsx` — set-scope metric inputs (new component)**
- Loads set-scope metrics from `listMetricsByScope(db, "set")` once on mount.
- Returns `null` when no set-scope metrics are defined (no clutter).
- For each metric: typed input (numeric for number/scale, text for text, toggle for checkbox).
- On `onEndEditing`, validates via `validateConditionValue` then calls `saveSetMetricValues`.

**4. `app/session/[id].tsx` — track setLogId, render SetMetricEntry**
- `loggedIds.current` changed from `Record<number, boolean>` to `Record<number, string>` to track the actual setLogId returned by `logSet`.
- `SetMetricEntry` renders below each set row once the set has been persisted (i.e., `setLogId` is available).

**5. `app/library.tsx` — metric creation UI**
- Second section below the exercise list: "Conditions & custom metrics".
- Name input + type selector (number/scale/text/checkbox toggle buttons) + scope selector (session/per set).
- "+ Add metric" calls `createMetric(db, name, mType, mScope)` and refreshes the metric list.
- Existing metrics listed below with type·scope label.
- Users can now create metrics from the app without direct DB access.

### Final health gates
- **Tests:** 140 passing (no new test files this run — all changes were UI wiring)
- **TypeScript:** clean (`npx tsc --noEmit` exits 0)
- **Playwright E2E:** skipped — browser download blocked in cloud environment
- **Branch:** `overnight`

### Commits (this run)
- `80585ae` feat: per-exercise Findings detail, set metric entry, metric creation UI, live refresh (Run 5)

### Open questions / decisions for the user
None blocking.

**FYI items:**
- `useFocusEffect` takes a `useCallback` dependency array. The refetch function from `useQueryFn` is stable (wrapped in `useCallback` in `use-live.ts`), so the empty dep array is correct — the effect runs on every focus event.
- `SetMetricEntry` starts with empty `values` (not pre-loaded from DB). If the user navigates away and returns to a session, metric values already entered won't be shown. A future improvement: initialise from `getSetMetricValues(db, setLogId)` once `setLogId` is known.
- The Library metric creation UI has no delete/edit — users can create metrics but not remove them from the UI yet. `deleteMetric` (soft-delete) exists in `src/db/metrics.ts` but is not wired to a button.

### Next run priorities
1. **`useQueryFn` live update on exercise log**: The Findings screen now auto-refreshes on focus, but the Train tab's "Start session" flow doesn't trigger any reactivity elsewhere. This is fine for now since Findings refreshes on focus anyway.
2. **Metric delete in Library**: Wire a swipe-to-delete or long-press delete to `deleteMetric(db, id)` on the metric list in Library.
3. **DB migration for metric `min`/`max`**: The `metrics` table lacks `min`/`max` columns. The conditions domain uses defaults (1–10 for scale). If the user wants per-metric scale bounds, a migration is needed. This is a user decision — confirm before adding the migration.
4. **Hevy import screen**: A minimal import screen that lets the user paste or share a Hevy CSV file and calls `parseHevyCSV` + `importHevySessions`. Unblocked since both functions exist — only needs a UI entry point.
5. **Export screen**: Surface `buildExportSessions(db)` → `toCSV`/`toJSON` via a Share sheet so users can export their data. A single button on a new Settings/Export screen.

---

## 2026-06-21 — Run 1 (first overnight run)

### Orientation
- Plan 1 (Foundation) was **already complete** on `main`: Expo scaffold, Drizzle schema, exercises/sessions DB layer, domain modules (units, ids, e1rm, progression, session-reducer), tokens, primitives, full offline logging loop with ghost prefill.
- Baseline: **23 tests passing**, TypeScript clean, `npm test` + `npx tsc --noEmit` both green.

### Work completed
All work done on the `overnight` branch.

**1. `src/domain/findings.ts` + `src/domain/findings.test.ts`**  
Full port of `analysis/02_review.py` to TypeScript as pure, framework-free functions:
- `linreg()` — linear regression returning slope, intercept, **and r²** (the Python had this; `progression.ts` only had slope)
- `exerciseFinding()` — per-exercise verdict (PROGRESSING / PLATEAU / REGRESSING / INSUFFICIENT) with outlier-robust linreg and r², reusing `isOutlier` from `progression.ts`
- `detectOffDays()` — flags sessions where the average deviation across ≥3 exercises is below −7% of their trailing 4-session median; directly ports the Python off-day logic
- `detectWeightOutliers()` — per-exercise MAD scan on raw logged weights (catches lb-not-kg typos); requires ≥8 sets before flagging to avoid false positives on sparse data
- `detectSpikeReverts()` — single-session e1RM anomaly detection (b > a×1.4 AND b > c×1.4 — the "lb-not-kg then back to normal" signature)
- `holistic()` — runs all four and returns a combined `HolisticReport`

**2. `src/domain/conditions.ts` + `src/domain/conditions.test.ts`**  
Typed helpers for the `condition_values` JSON blob on sessions:
- `MetricType`, `MetricScope`, `ConditionMap` types
- `encodeConditions` / `decodeConditions` (safe JSON, returns `{}` on bad input)
- `validateConditionValue` — type-safe validation per metric type (number, scale 1-10 with rounding, text, checkbox)
- `mergeConditions` — immutable patch merge

**3. `src/db/metrics.ts` + `src/db/metrics.test.ts`**  
DB CRUD layer for the `metrics` table + condition value persistence on sessions:
- `createMetric(db, name, type, scope)`
- `listMetrics(db)` / `listMetricsByScope(db, scope)` — alpha-ordered, excludes soft-deleted
- `getSessionConditionValues(db, sessionId)` → `ConditionMap`
- `saveSessionConditionValues(db, sessionId, values)` — full-replace write

**4. `src/domain/export.ts` + `src/domain/export.test.ts`**  
Pure export formatter (no DB deps):
- `buildExportRows(sessions)` — adds `weightLb` (1 decimal), `e1rm` (Epley, 1 decimal), ISO date string
- `toCSV(rows)` — RFC 4180 with comma/quote escaping; header row
- `toJSON(rows)` — pretty-printed JSON array

**5. `docs/data-schema.html`**  
Full schema reference doc covering all 5 tables, base columns, relationships, domain module map, export format, and sync strategy (future Plan 4).

### Final health gates
- **Tests:** 72 passing (was 23; +49 new tests)
- **TypeScript:** clean (`npx tsc --noEmit` exits 0)
- **Branch:** `overnight`

### Commits
See git log on `overnight` branch.

### Open questions / decisions for the user
None blocking. All work this run was design-agnostic (pure domain logic + DB functions + tests).

**FYI items:**
- `detectOffDays` threshold is hardcoded at −7% average deviation across ≥3 exercises. This could become a user preference later.
- The `findings.ts` functions take `Record<string, ExerciseRecord[]>` (a map of exercise name → records). A future DB query function in `src/db/findings.ts` will need to assemble this from the join of sessions → session_exercises → exercises → set_logs. Not written yet (not needed until the Findings screen — Plan 3).
- Export (`toCSV`/`toJSON`) produces flat rows with no condition/metric values yet. Those will be addable as extra columns once the Conditions UI exists (Plan 2).

### Next run priorities
1. **Plan 3 teaser (pure logic):** a `sessionHistoryForExercise(db, exerciseId)` query that assembles `ExerciseRecord[]` from the DB so `findings.ts` can be fed real data. Then a `progressionSummary` aggregator that emits human-readable strings ("You're making progress on 3 of 5 tracked lifts").
2. **Plan 2 data/logic remaining:** per-set metric values (the `metric_values` JSON blob on `set_logs`) — query helpers + reducer actions for logging set-level custom metrics (RIR override, form score, etc.).
3. **Hevy CSV import** (Plan 4 groundwork): a pure `parseHevyCSV(text)` function that produces `ExportSession[]` rows, converting lbs → kg, reusing the parser sketch in `analysis/01_explore.py`. This unlocks backfill for findings on real historical data.

---

## 2026-06-22 — Run 2

### Orientation
- Resumed from Run 1. Baseline on `overnight` branch: **72 tests passing**, TypeScript clean.
- All three priorities from Run 1 were completed this session.

### Work completed

**1. `src/db/findings.ts` + `src/db/findings.test.ts`** (Plan 3 teaser — DB bridge)
- `sessionHistoryForExercise(db, exerciseId)` — joins `set_logs → session_exercises → sessions` via Drizzle `innerJoin`, filters soft-deleted rows, computes `sessionDay` and Epley `e1rm`, returns `ExerciseRecord[]` sorted by `startedAt ASC`.
- `buildExerciseMap(db)` — iterates all non-deleted exercises and builds a `Record<string, ExerciseRecord[]>` map ready to pass directly to `holistic()`. Omits exercises with no logged sets.
- 13 new tests covering: empty state, correct field assembly, same-session day grouping, ordering across sessions, null-weight/null-reps exclusion, multi-exercise map, and the full pipeline to `findings.ts`.

**2. `src/domain/progressionSummary.ts` + `src/domain/progressionSummary.test.ts`** (Plan 3 teaser — aggregator)
- `summarizeReport(report: HolisticReport)` — emits structured `SummaryLine[]` with type tags (`progress`, `plateau`, `regressing`, `insufficient`, `offdays`, `dataissues`) and a single `headline` string. Handles: all-progressing, all-plateauing, mixed, regression, off-day flags, data issues, and empty (not-enough-data) state.
- `sessionsUntilFirstFinding(findings)` — returns how many more sessions the least-progressed INSUFFICIENT lift needs before it can produce a real verdict. Returns 0 when all lifts have real verdicts.
- 13 new tests.

**3. `src/domain/import.ts` + `src/domain/import.test.ts`** (Plan 4 groundwork — Hevy CSV)
- `parseHevyCSV(text)` handles both Hevy export formats:
  - **Classic (≤2023):** `Date, Workout Name, Exercise Name, Weight (lbs), Reps, RPE`
  - **New (2024+):** `Title, Start Time, Exercise Title, Weight, Reps, Set Type, Weight Unit`
- Auto-detects columns by header name (normalised). Weight is converted lbs→kg via `KG_PER_LB` unless a `Weight Unit` column says `kg`. RPE→RIR approximation: `RIR = clamp(round(10 − RPE), 0, ∞)`.
- Full RFC 4180 CSV parser (quoted fields, escaped double-quotes, trailing comma).
- Returns `{ sessions: ExportSession[], warnings: HevyCsvWarning[] }` — never throws; bad rows add a warning and are skipped.
- 24 new tests.

**4. `src/db/metrics.ts` + `src/db/metrics.test.ts`** — set-level metric helpers
- `getSetMetricValues(db, setLogId)` → `ConditionMap` — reads `set_logs.metric_values` JSON.
- `saveSetMetricValues(db, setLogId, values)` → void — full-replace write to `set_logs.metric_values`.
- 4 new tests.

**5. `src/domain/session-reducer.ts` + `src/domain/session-reducer.test.ts`** — `setMetricValue` action
- New action `{ type: "setMetricValue"; index: number; metricId: string; value: ConditionValue }` — merges a single metric value into the set's optional `metricValues: ConditionMap` field.
- Backward-compatible: `addSet` still creates `{ weightKg: null, reps: null }` with no `metricValues` key; existing tests unaffected.
- 4 new tests.

### Final health gates
- **Tests:** 117 passing (was 72; +45 new tests)
- **TypeScript:** clean (`npx tsc --noEmit` exits 0)
- **Branch:** `overnight` — pushed to origin

### Commits (this run)
- `b4e3a57` feat: DB findings bridge — sessionHistoryForExercise + buildExerciseMap
- `c808a50` feat: Hevy CSV import parser (Plan 4 groundwork)
- `bbb8cdf` feat: set-level metric values + setMetricValue reducer action

### Open questions / decisions for the user
None blocking.

**FYI items:**
- `parseHevyCSV` treats dates as local time (Hevy exports local timestamps without timezone). If you've been logging in multiple timezones, `sessionDay` could straddle midnight in unexpected ways. Not a concern for normal use, but worth noting for edge-case testing.
- The `sessionsUntilFirstFinding` function looks at the "worst" INSUFFICIENT lift (fewest sessions logged). You may want to show this per-exercise in the UI rather than as a single aggregate, depending on the Findings screen design.
- `buildExerciseMap` makes N+1 queries (one per exercise). For now this is fine (SQLite is fast and exercise counts are small), but if a user has hundreds of exercises it could be batched into a single join query. Not an issue at current scale.

### Next run priorities
1. **Export with conditions:** extend `buildExportRows` / `toCSV` to include session-level `conditionValues` as extra columns (requires a DB query to assemble rows with condition values attached).
2. **`src/db/export.ts`:** a DB-level query function `buildExportSessions(db)` that joins all tables into `ExportSession[]` (including condition values + set metric values), so export can be done in one call.
3. **Hevy import DB writer:** a function `importHevySessions(db, sessions: ExportSession[])` that upserts the parsed rows into the DB (creates exercises by name if not found, creates sessions, adds sets). This completes the backfill loop.
4. **Plan 2 UI groundwork (minimal):** unstyled Conditions entry on the Session screen — a flat list of session-scope metrics with typed inputs that call `saveSessionConditionValues`. No visual design; just wires the DB functions to the screen so the data can be logged.

---

## 2026-06-23 — Run 3

### Orientation
- Resumed from Run 2. Baseline on `overnight` branch: **117 tests passing**, TypeScript clean.
- Priorities from Run 2: export with conditions, DB export assembly, Hevy import DB writer.
- NOTE: An earlier session this run started from the wrong baseline (no overnight log visible) and duplicated some work with different interfaces. That duplicate work was discarded; this run continues cleanly from Run 2.

### Work completed
All work done on the `overnight` branch. Commit: `f4d899e`.

**1. `src/domain/export.ts` — export with conditions**
- `ExportSession` gained two optional fields: `conditionValues?: ConditionMap` (session-level) and `setMetricValues?: ConditionMap` (set-level).
- `ExportRow` gained `conditions: ConditionMap` — a merged view of both.
- `buildExportRows` merges session + set conditions into `conditions`.
- `toCSV` auto-detects all unique condition keys across all rows and appends them as extra columns (alpha-sorted) after the 9 fixed columns. Sessions/rows without a given condition key get an empty field. CSV output with no conditions is unchanged from Run 2.
- 4 new tests covering condition merging, dynamic column order, no-condition backward compat, and empty-field handling.

**2. `src/db/export.ts` + `src/db/export.test.ts`** — DB-level export assembly
- `buildExportSessions(db)` joins `set_logs → session_exercises → sessions → exercises` in one query.
- Includes `conditionValues` from `sessions.condition_values` and `setMetricValues` from `set_logs.metric_values` via `decodeConditions`.
- Omits both fields when empty (clean JSON/CSV output for plain sessions).
- 9 tests covering: empty DB, row count, core field values, conditions, set metrics, ordering, CSV integration.

**3. `src/db/import.ts` + `src/db/import.test.ts`** — Hevy import DB writer
- `importHevySessions(db, rows)` takes `ExportSession[]` (from `parseHevyCSV`) and writes to the DB.
- Groups rows by `(date, title)` to reconstruct sessions.
- Idempotent: skips sessions whose `startedAt` already exists (safe to re-run on same file).
- Resolves exercise names by lookup; creates new exercises only when name is new.
- Converts Hevy 1-indexed `setNo` to SBL 0-indexed on insert.
- 8 tests covering: empty input, classic CSV parse→import, exercise creation/reuse, duplicate-skip idempotency, title/timestamp preservation, lbs→kg conversion, kg passthrough, round-trip exercise names.
- Added `listSessions` helper to `sessions.ts` (needed for test assertions + future UI).

### Final health gates
- **Tests:** 139 passing (was 117; +22 new tests in 2 new test files)
- **TypeScript:** clean (`npx tsc --noEmit` exits 0)
- **Branch:** `overnight`

### Commits
- `f4d899e` feat: export with conditions, DB export assembly, and Hevy import writer (Run 3)

### Open questions / decisions for the user
None blocking.

**FYI items:**
- `importHevySessions` skips duplicate sessions by `startedAt` exact match. If a Hevy export has two sessions on the same second (unlikely but possible), they'd collide. For now this is acceptable; a more robust dedup key could be `(startedAt, title, setCount)`.
- The Hevy `setNo` → SBL `setNo` conversion (`Hevy 1-indexed → SBL 0-indexed`) is `Math.max(0, row.setNo - 1)`. If Hevy set orders are ever non-sequential (e.g. 1,3,5), the SBL set numbers will have gaps but will still be ordered correctly.
- `toCSV` with conditions: metric IDs (not metric names) are used as column headers (since `ConditionMap` is keyed by metric ID). Until a "friendly name" mapping is added, users will see UUID-like column headers for custom metrics in the CSV export. Consider resolving metric names in `buildExportSessions` in a future run.

### Next run priorities
1. **Resolve metric IDs → names in export CSV:** `buildExportSessions` currently passes raw metric IDs as condition keys. A `listMetrics(db)` call to build an `id → name` map, then apply it when building `conditionValues` / `setMetricValues`, would make the CSV human-readable.
2. **Findings screen teaser (Plan 3 start):** a minimal unstyled screen that calls `buildExerciseMap(db)` → `holistic()` → `summarizeReport()` and renders the headline + per-exercise verdict. No visual design — just the data pipeline wired to a screen so the feature can be demoed.
3. **`progressionSummary` + Findings hook:** expose `summarizeReport` via a `useFindings(db)` hook (or just an inline `useMemo` in the screen) so the Findings screen is reactive to new sessions.
4. **Conditions entry (Plan 2, minimal):** unstyled `SessionConditionsEntry` component that renders session-scope metrics as typed inputs and calls `saveSessionConditionValues`. Needed before any real findings-condition correlation can be observed.

---

## 2026-06-23 — Run 4

### Orientation
- Resumed from Run 3. Baseline on `overnight` branch: **139 tests passing**, TypeScript clean.
- All four priorities from Run 3 completed this session.

### Work completed
All work done on the `overnight` branch. Commit: `b373e4b`.

**1. `src/db/export.ts` — metric ID → friendly name resolution**
- Added `remapConditionKeys(map, nameById)` helper — remaps known metric IDs to their `name` field; unknown keys pass through unchanged (backward compat with arbitrary string keys in tests / legacy data).
- `buildExportSessions` now calls `listMetrics(db)` to build a `Map<id, name>` and applies it to both `conditionValues` and `setMetricValues` before returning rows.
- CSV export columns now show metric names (e.g. "Sleep Quality") instead of UUIDs.
- 1 new test: creates a metric by name, stores a condition under its ID, verifies the exported row carries the name as the key.

**2. `src/db/use-findings.ts` — Findings hook (new)**
- `useFindings(db)` wraps the full pipeline: `buildExerciseMap(db)` → `holistic()` → `summarizeReport()`.
- Returns `[ProgressionSummary, refetch]` via `useQueryFn`, making the Findings screen reactive (re-runs on explicit `refetch()` call — swap for live query later if needed).

**3. `app/findings.tsx` — Findings screen (new)**
- New `"Findings"` tab added to `app/_layout.tsx` and file-routed screen at `app/findings.tsx`.
- Calls `useFindings(db)` and renders `summary.headline` + `summary.lines` with type-based colour coding (`pos` for progress, `neg` for regressing, `accent` for off-days).
- No visual design — just the data pipeline wired to the screen.

**4. `src/ui/SessionConditionsEntry.tsx` + `app/session/[id].tsx` — Conditions entry (new)**
- `SessionConditionsEntry` component: loads `listMetricsByScope(db, "session")` metrics and current `getSessionConditionValues`, renders each as a typed input (`TextInput` for number/scale/text, `Pressable` toggle for checkbox). On `onEndEditing`, validates via `validateConditionValue` and calls `saveSessionConditionValues`.
- Returns `null` when no session-scope metrics exist (no clutter for users who haven't created any).
- Wired into the session screen above the exercise picker — conditions can now be logged before or between exercises.

### Final health gates
- **Tests:** 140 passing (was 139; +1 new test)
- **TypeScript:** clean (`npx tsc --noEmit` exits 0)
- **Branch:** `overnight` — pushed to origin; PR #1 updated

### Commits (this run)
- `b373e4b` feat: metric name resolution in export, Findings screen, conditions entry (Run 4)

### Open questions / decisions for the user
None blocking.

**FYI items:**
- `useFindings` uses `useQueryFn` (re-fetches on `refetch()` call only). It will NOT auto-update when a new session is logged in the same app session — the user needs to navigate away and back to the Findings tab, or we wire `refetch` to an app-level event later.
- `SessionConditionsEntry` initialises `metrics` and `values` once on mount (via `useState(() => ...)`). If new metrics are added while the session screen is open, they won't appear until remount. For now this is fine.
- The Findings tab colour-codes lines by verdict type, but the exercise names aren't shown yet — the screen only renders the `SummaryLine.text` strings from `summarizeReport`. Per-exercise detail (which lift is progressing/plateauing) is the natural next step.

### Next run priorities
1. **Per-exercise detail on Findings screen:** `HolisticReport.findings` contains per-exercise verdicts with slopes and r² values. Render a per-exercise breakdown below the headline (exercise name + verdict + sessions logged) so the user can see which lifts are progressing.
2. **Set-level metric entry in session screen:** add set-scope conditions (RIR override, form score) to the per-set row in the logging UI. Follows the same `SessionConditionsEntry` pattern but scoped to `"set"` and saving via `saveSetMetricValues`.
3. **Metric creation UI:** a minimal screen (or inline add in Library) that lets users call `createMetric(db, name, type, scope)`. Without this, users can only get conditions data via `importHevySessions` or direct DB calls.
4. **`useFindings` live reactivity:** connect `refetch` to a coarse app-level "session changed" signal (e.g. focus event on the Findings tab via `useFocusEffect` from expo-router) so findings auto-update after logging.


