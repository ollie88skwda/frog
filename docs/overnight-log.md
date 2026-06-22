# SBL Overnight Log

> **Format:** Each run appends a dated section. Record what was done, test counts, tsc status, commit hashes, and any decisions that need the user.

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
