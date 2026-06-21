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
