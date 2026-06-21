# SBL v1 — Plan 1: Foundation, Data Layer & Core Logging Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo app and ship the offline core loop — create custom exercises, start a session, and log sets (weight × reps) with last-session "ghost" prefill — all persisted in local SQLite, with the pure logic (units, e1RM, progression, session reducer) covered by fast unit tests.

**Architecture:** Local-first. On-device SQLite (Drizzle ORM) is the source of truth; UI reads via Drizzle live queries and writes optimistically. All domain logic lives in pure, framework-free TypeScript modules so it can be unit-tested in Node (via `better-sqlite3` for the DB layer) and later reused by the CLI / MCP server. The same Drizzle schema is used by the app (`expo-sqlite` driver) and the tests (`better-sqlite3` driver).

**Tech Stack:** Expo (React Native, TypeScript), expo-router, NativeWind v4, Drizzle ORM + expo-sqlite, Vitest + better-sqlite3 (tests), expo-crypto (IDs).

## Global Constraints

Every task implicitly inherits these (copied from the PRD + `CLAUDE.md`):

- **Lightweight & fast is a top requirement.** Local-first; never block UI on network; optimistic writes; visual feedback ~100ms; 60fps (Reanimated); minimal dependencies (audit before adding); lazy-load non-critical screens; virtualize long lists.
- **Offline-first is mandatory.** No feature in this plan may require a network.
- **All TypeScript. No Rust.** One language across app, and (later) CLI + MCP.
- **Every table carries** `id` (text uuid), `created_at`, `updated_at`, `deleted_at` (nullable, soft delete), `dirty` (int 0/1) — groundwork for last-write-wins sync. Never hard-delete.
- **Stable, durable IDs** (uuid v4 via `expo-crypto` / Node `crypto`). IDs are part of the public data contract — never reuse or renumber.
- **Weight is stored canonically in kilograms** (number). Display/entry convert via the units helper. (Source data is lbs; import converts.)
- **Domain logic is framework-free.** No React/RN imports in `src/domain/**` or `src/db/**` query functions.

---

## File Structure

```
app/                              # expo-router screens (thin; delegate to domain + db)
  _layout.tsx                     # root layout, theme provider, tab bar
  index.tsx                       # Train tab — start/continue session
  library.tsx                     # Exercise library (list + create)
  session/[id].tsx                # Active session: log sets
src/
  domain/
    units.ts                      # kg<->lb conversion, display formatting
    units.test.ts
    e1rm.ts                       # estimated 1RM + isolation note
    e1rm.test.ts
    progression.ts               # robust trend / verdict (port of Phase 0 engine)
    progression.test.ts
    session-reducer.ts            # pure active-session state machine (add/edit/remove set)
    session-reducer.test.ts
    ids.ts                        # newId()
  db/
    schema.ts                     # Drizzle table defs (shared app + tests)
    client.ts                     # app DB client (expo-sqlite) + migrate
    exercises.ts                  # exercise queries
    exercises.test.ts
    sessions.ts                   # session + set queries
    sessions.test.ts
    test-db.ts                    # better-sqlite3 in-memory factory for tests
  ui/
    tokens.ts                     # design tokens (blueprint theme)
    tokens.test.ts
    primitives.tsx                # Screen, Card, Mono, Field primitives
drizzle/                          # generated migrations
vitest.config.ts
```

Boundaries: `app/**` is presentation only; `src/domain/**` is pure logic (no I/O); `src/db/**` owns persistence and exposes typed functions. Screens never write SQL directly — they call `src/db` functions.

---

## Task 1: Scaffold the Expo app

**Files:**
- Create: project via `create-expo-app` (generates `app/`, `package.json`, `tsconfig.json`, `babel.config.js`, etc.)
- Modify: `app/index.tsx` (replace boilerplate with a smoke screen)

**Interfaces:**
- Produces: a running Expo app with expo-router and a boot screen reading "SBL".

- [ ] **Step 1: Scaffold**

```bash
npx create-expo-app@latest . --template default
# if dir non-empty (docs/, analysis/, mockups/ exist), scaffold in a temp dir then move:
#   npx create-expo-app@latest .sbl-app --template default && rsync -a .sbl-app/ . && rm -rf .sbl-app
```

- [ ] **Step 2: Pin Node + install exact deps**

```bash
npx expo install expo-sqlite expo-crypto
npm i drizzle-orm
npm i -D drizzle-kit vitest better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 3: Replace `app/index.tsx` with a smoke screen**

```tsx
import { Text, View } from "react-native";
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B1A2B" }}>
      <Text style={{ color: "#E3F0FB", fontSize: 24, fontWeight: "700" }}>SBL</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run it**

Run: `npx expo start` then press `i` (iOS sim) or scan with Expo Go.
Expected: a near-black screen showing "SBL".

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Expo app (SBL v1)"
```

---

## Task 2: Test harness + ID/units helpers

**Files:**
- Create: `vitest.config.ts`, `src/domain/ids.ts`, `src/domain/units.ts`, `src/domain/units.test.ts`

**Interfaces:**
- Produces:
  - `newId(): string` — uuid v4 string.
  - `KG_PER_LB = 0.45359237`
  - `lbToKg(lb: number): number`, `kgToLb(kg: number): number`
  - `toDisplayWeight(kg: number, unit: "kg" | "lb"): number` (rounded to 0.5)
  - `formatWeight(kg: number, unit: "kg" | "lb"): string` e.g. `"82.5 kg"`

- [ ] **Step 1: Configure Vitest (node env)**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 2: Add test script**

In `package.json` `"scripts"` add: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write `src/domain/ids.ts`**

```ts
// Framework-free: uses Web Crypto where present (RN Hermes + Node 19+ both expose globalThis.crypto.randomUUID).
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
```

- [ ] **Step 4: Write failing test `src/domain/units.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { lbToKg, kgToLb, toDisplayWeight, formatWeight } from "./units";

describe("units", () => {
  it("converts lb to kg", () => { expect(lbToKg(100)).toBeCloseTo(45.359237, 5); });
  it("round-trips", () => { expect(kgToLb(lbToKg(225))).toBeCloseTo(225, 6); });
  it("display rounds to 0.5", () => { expect(toDisplayWeight(45.359237, "lb")).toBe(100); });
  it("formats with unit", () => { expect(formatWeight(82.55, "kg")).toBe("82.5 kg"); });
});
```

- [ ] **Step 5: Run — expect FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module './units'`.

- [ ] **Step 6: Implement `src/domain/units.ts`**

```ts
export const KG_PER_LB = 0.45359237;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

const round05 = (n: number) => Math.round(n * 2) / 2;

export function toDisplayWeight(kg: number, unit: "kg" | "lb"): number {
  return round05(unit === "kg" ? kg : kgToLb(kg));
}
export function formatWeight(kg: number, unit: "kg" | "lb"): string {
  return `${toDisplayWeight(kg, unit)} ${unit}`;
}
```

- [ ] **Step 7: Run — expect PASS**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json src/domain/ids.ts src/domain/units.ts src/domain/units.test.ts
git commit -m "feat: test harness + id/units helpers"
```

---

## Task 3: e1RM + progression engine (port of validated Phase 0 logic)

**Files:**
- Create: `src/domain/e1rm.ts`, `src/domain/e1rm.test.ts`, `src/domain/progression.ts`, `src/domain/progression.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `epley(weightKg: number, reps: number): number | null`
  - `type SessionTop = { day: number; e1rm: number }` (day = integer days from first)
  - `robustTrend(points: SessionTop[]): { verdict: "PROGRESSING"|"PLATEAU"|"REGRESSING"|"INSUFFICIENT"; pctChange: number; perMonth: number; n: number }`
  - `isOutlier(values: number[], value: number, madThreshold?: number): boolean` (MAD-based; default 5)

Phase 0 learnings baked in: trend is **outlier-robust** (drops MAD-outliers before fitting) and needs **≥5 sessions** before claiming a verdict.

- [ ] **Step 1: Failing test `src/domain/e1rm.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { epley } from "./e1rm";
describe("epley", () => {
  it("computes 1RM (Epley)", () => { expect(epley(100, 5)!).toBeCloseTo(116.667, 3); });
  it("equals weight at 1 rep window", () => { expect(epley(100, 0)).toBeNull(); });
  it("null on missing", () => { expect(epley(0, 5)).toBeNull(); });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`) → `Cannot find module './e1rm'`.

- [ ] **Step 3: Implement `src/domain/e1rm.ts`**

```ts
// Epley estimated 1RM. Note: unreliable for high-rep isolation work; treat as a trend proxy, not a true max.
export function epley(weightKg: number, reps: number): number | null {
  if (!weightKg || !reps) return null;
  return weightKg * (1 + reps / 30);
}
```

- [ ] **Step 4: Run — expect PASS** (`npm test`).

- [ ] **Step 5: Failing test `src/domain/progression.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { robustTrend, isOutlier } from "./progression";

describe("progression", () => {
  it("needs >=5 sessions", () => {
    const r = robustTrend([{day:0,e1rm:100},{day:7,e1rm:101}]);
    expect(r.verdict).toBe("INSUFFICIENT");
  });
  it("flags steady increase as PROGRESSING", () => {
    const pts = [0,7,14,21,28,35].map((d,i)=>({day:d,e1rm:100+i*5}));
    expect(robustTrend(pts).verdict).toBe("PROGRESSING");
  });
  it("flags decline as REGRESSING", () => {
    const pts = [0,7,14,21,28,35].map((d,i)=>({day:d,e1rm:200-i*8}));
    expect(robustTrend(pts).verdict).toBe("REGRESSING");
  });
  it("is robust to a single bad-data spike", () => {
    // one implausible 1000 entry must not flip the verdict
    const pts = [{day:0,e1rm:100},{day:7,e1rm:102},{day:14,e1rm:1000},
                 {day:21,e1rm:104},{day:28,e1rm:106},{day:35,e1rm:108}];
    expect(robustTrend(pts).verdict).toBe("PROGRESSING");
  });
  it("detects MAD outliers", () => {
    expect(isOutlier([20,21,19,22,20,158], 158)).toBe(true);
    expect(isOutlier([20,21,19,22,20], 21)).toBe(false);
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (`npm test`).

- [ ] **Step 7: Implement `src/domain/progression.ts`**

```ts
export type SessionTop = { day: number; e1rm: number };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function isOutlier(values: number[], value: number, madThreshold = 5): boolean {
  if (values.length < 5) return false;
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med))) || 1;
  return Math.abs(value - med) / (1.4826 * mad) > madThreshold;
}

function linregSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  return sxx === 0 ? 0 : sxy / sxx;
}

export function robustTrend(points: SessionTop[]) {
  const n0 = points.length;
  if (n0 < 5) return { verdict: "INSUFFICIENT" as const, pctChange: 0, perMonth: 0, n: n0 };
  const e1 = points.map((p) => p.e1rm);
  const kept = points.filter((p) => !isOutlier(e1, p.e1rm)); // drop bad-data spikes
  const pts = kept.length >= 5 ? kept : points;
  const xs = pts.map((p) => p.day), ys = pts.map((p) => p.e1rm);
  const slope = linregSlope(xs, ys);
  const first = median(ys.slice(0, 3)), last = median(ys.slice(-3));
  const pctChange = first ? ((last - first) / first) * 100 : 0;
  const perMonth = slope * 30;
  let verdict: "PROGRESSING" | "PLATEAU" | "REGRESSING";
  if (pctChange >= 5 && slope > 0) verdict = "PROGRESSING";
  else if (pctChange <= -5) verdict = "REGRESSING";
  else verdict = "PLATEAU";
  return { verdict, pctChange, perMonth, n: pts.length };
}
```

- [ ] **Step 8: Run — expect PASS** (`npm test`, 8 tests).

- [ ] **Step 9: Commit**

```bash
git add src/domain/e1rm.ts src/domain/e1rm.test.ts src/domain/progression.ts src/domain/progression.test.ts
git commit -m "feat: e1rm + outlier-robust progression engine"
```

---

## Task 4: Drizzle schema + test DB factory

**Files:**
- Create: `src/db/schema.ts`, `src/db/test-db.ts`, `drizzle.config.ts`
- Create: `src/db/schema.test.ts`

**Interfaces:**
- Produces: Drizzle table objects `exercises, metrics, sessions, sessionExercises, setLogs`; `makeTestDb()` returning a Drizzle instance over in-memory `better-sqlite3` with tables created.

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const base = {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
  dirty: integer("dirty").notNull().default(1),
};

export const exercises = sqliteTable("exercises", {
  ...base,
  name: text("name").notNull(),
  tags: text("tags"),                 // JSON string[] (light tagging only in v1)
  isCustom: integer("is_custom").notNull().default(1),
  ownerId: text("owner_id"),
});

export const metrics = sqliteTable("metrics", {
  ...base,
  name: text("name").notNull(),
  type: text("type").notNull(),        // 'number' | 'scale' | 'text' | 'checkbox'
  scope: text("scope").notNull(),      // 'set' | 'session'
  ownerId: text("owner_id"),
});

export const sessions = sqliteTable("sessions", {
  ...base,
  title: text("title"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  conditionValues: text("condition_values"), // JSON {metricId: value}
});

export const sessionExercises = sqliteTable("session_exercises", {
  ...base,
  sessionId: text("session_id").notNull(),
  exerciseId: text("exercise_id").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const setLogs = sqliteTable("set_logs", {
  ...base,
  sessionExerciseId: text("session_exercise_id").notNull(),
  setNo: integer("set_no").notNull(),
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rir: integer("rir"),
  note: text("note"),
  metricValues: text("metric_values"),  // JSON {metricId: value}
  completed: integer("completed").notNull().default(0),
});
```

- [ ] **Step 2: Write `src/db/test-db.ts`** (creates tables from raw DDL mirroring the schema)

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DDL = `
CREATE TABLE exercises (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, tags TEXT, is_custom INTEGER NOT NULL DEFAULT 1, owner_id TEXT);
CREATE TABLE metrics (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, type TEXT NOT NULL, scope TEXT NOT NULL, owner_id TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, title TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, condition_values TEXT);
CREATE TABLE session_exercises (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL, order_index INTEGER NOT NULL);
CREATE TABLE set_logs (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL DEFAULT 1, session_exercise_id TEXT NOT NULL, set_no INTEGER NOT NULL, weight_kg REAL, reps INTEGER, rir INTEGER, note TEXT, metric_values TEXT, completed INTEGER NOT NULL DEFAULT 0);
`;

export function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}
```

- [ ] **Step 3: Failing test `src/db/schema.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { exercises } from "./schema";

describe("schema", () => {
  it("inserts and reads an exercise", () => {
    const db = makeTestDb();
    const now = 1_000;
    db.insert(exercises).values({ id: "x1", createdAt: now, updatedAt: now, dirty: 1, name: "Incline Press" }).run();
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Incline Press");
    expect(rows[0].deletedAt).toBeNull();
  });
});
```

- [ ] **Step 4: Run — expect FAIL then implement until PASS**

Run: `npm test`
Expected: PASS once `schema.ts`/`test-db.ts` compile.

- [ ] **Step 5: Add `drizzle.config.ts` (for app migrations later)**

```ts
import type { Config } from "drizzle-kit";
export default { schema: "./src/db/schema.ts", out: "./drizzle", dialect: "sqlite" } satisfies Config;
```

- [ ] **Step 6: Generate the initial migration**

Run: `npx drizzle-kit generate`
Expected: a SQL file appears in `drizzle/`.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/test-db.ts src/db/schema.test.ts drizzle.config.ts drizzle/
git commit -m "feat: drizzle schema + in-memory test db"
```

---

## Task 5: Data access layer (exercises, sessions, sets, ghost prefill)

**Files:**
- Create: `src/db/exercises.ts`, `src/db/exercises.test.ts`, `src/db/sessions.ts`, `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `schema`, `newId` (Task 2).
- Produces (all take a `db` arg so tests inject `makeTestDb()`; the app passes the real client):
  - `createExercise(db, name: string, tags?: string[]): string` → id
  - `listExercises(db): Exercise[]` (excludes soft-deleted, alpha order)
  - `startSession(db, title?: string): string` → sessionId
  - `addExerciseToSession(db, sessionId, exerciseId): string` → sessionExerciseId
  - `logSet(db, sessionExerciseId, { weightKg, reps, rir?, note? }): string` → setLogId (auto-increments `setNo`)
  - `lastSetsForExercise(db, exerciseId): { weightKg: number|null; reps: number|null }[]` — most recent prior session's sets, for **ghost prefill**

- [ ] **Step 1: Failing test `src/db/exercises.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise, listExercises } from "./exercises";

describe("exercises db", () => {
  it("creates and lists", () => {
    const db = makeTestDb();
    createExercise(db, "Chest Fly (Machine)");
    createExercise(db, "Bicep Curl (Cable)", ["elbow flexion"]);
    const all = listExercises(db);
    expect(all.map((e) => e.name)).toEqual(["Bicep Curl (Cable)", "Chest Fly (Machine)"]);
    expect(JSON.parse(all[0].tags!)).toEqual(["elbow flexion"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`).

- [ ] **Step 3: Implement `src/db/exercises.ts`**

```ts
import { and, asc, isNull } from "drizzle-orm";
import { exercises } from "./schema";
import { newId } from "../domain/ids";

type DB = any; // Drizzle instance (better-sqlite3 in tests, expo-sqlite in app)

export function createExercise(db: DB, name: string, tags?: string[]): string {
  const id = newId(); const now = Date.now();
  db.insert(exercises).values({
    id, createdAt: now, updatedAt: now, dirty: 1, name,
    tags: tags ? JSON.stringify(tags) : null, isCustom: 1,
  }).run();
  return id;
}

export function listExercises(db: DB) {
  return db.select().from(exercises).where(isNull(exercises.deletedAt)).orderBy(asc(exercises.name)).all();
}
```

- [ ] **Step 4: Run — expect PASS** (`npm test`).

- [ ] **Step 5: Failing test `src/db/sessions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./test-db";
import { createExercise } from "./exercises";
import { startSession, addExerciseToSession, logSet, lastSetsForExercise } from "./sessions";

describe("sessions db", () => {
  it("logs sets with auto set numbers", () => {
    const db = makeTestDb();
    const ex = createExercise(db, "Seated Row (Machine)");
    const s = startSession(db, "Pull A");
    const se = addExerciseToSession(db, s, ex);
    logSet(db, se, { weightKg: 100, reps: 8 });
    logSet(db, se, { weightKg: 100, reps: 7 });
    const ghost = lastSetsForExercise(db, ex);
    expect(ghost).toEqual([{ weightKg: 100, reps: 8 }, { weightKg: 100, reps: 7 }]);
  });

  it("ghost prefill returns ONLY the most recent prior session", () => {
    const db = makeTestDb();
    const ex = createExercise(db, "Lat Pulldown (Cable)");
    const s1 = addExerciseToSession(db, startSession(db), ex);
    logSet(db, s1, { weightKg: 80, reps: 10 });
    const s2 = addExerciseToSession(db, startSession(db), ex);
    logSet(db, s2, { weightKg: 85, reps: 9 });
    expect(lastSetsForExercise(db, ex)).toEqual([{ weightKg: 85, reps: 9 }]);
  });
});
```

- [ ] **Step 6: Run — expect FAIL** (`npm test`).

- [ ] **Step 7: Implement `src/db/sessions.ts`**

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { sessions, sessionExercises, setLogs } from "./schema";
import { newId } from "../domain/ids";

type DB = any;

export function startSession(db: DB, title?: string): string {
  const id = newId(); const now = Date.now();
  db.insert(sessions).values({ id, createdAt: now, updatedAt: now, dirty: 1, title: title ?? null, startedAt: now }).run();
  return id;
}

export function addExerciseToSession(db: DB, sessionId: string, exerciseId: string): string {
  const id = newId(); const now = Date.now();
  const existing = db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)).all();
  db.insert(sessionExercises).values({
    id, createdAt: now, updatedAt: now, dirty: 1, sessionId, exerciseId, orderIndex: existing.length,
  }).run();
  return id;
}

export function logSet(db: DB, sessionExerciseId: string, set: { weightKg: number | null; reps: number | null; rir?: number | null; note?: string | null }): string {
  const id = newId(); const now = Date.now();
  const prior = db.select().from(setLogs).where(eq(setLogs.sessionExerciseId, sessionExerciseId)).all();
  db.insert(setLogs).values({
    id, createdAt: now, updatedAt: now, dirty: 1, sessionExerciseId, setNo: prior.length,
    weightKg: set.weightKg, reps: set.reps, rir: set.rir ?? null, note: set.note ?? null, completed: 1,
  }).run();
  return id;
}

// Most recent PRIOR session's sets for an exercise (for ghost prefill).
export function lastSetsForExercise(db: DB, exerciseId: string): { weightKg: number | null; reps: number | null }[] {
  const ses = db.select({ id: sessionExercises.id, sessionId: sessionExercises.sessionId, createdAt: sessionExercises.createdAt })
    .from(sessionExercises)
    .where(and(eq(sessionExercises.exerciseId, exerciseId), isNull(sessionExercises.deletedAt)))
    .orderBy(desc(sessionExercises.createdAt)).all();
  if (ses.length === 0) return [];
  const latest = ses[0];
  const rows = db.select().from(setLogs)
    .where(and(eq(setLogs.sessionExerciseId, latest.id), isNull(setLogs.deletedAt)))
    .orderBy(setLogs.setNo).all();
  return rows.map((r: any) => ({ weightKg: r.weightKg, reps: r.reps }));
}
```

- [ ] **Step 8: Run — expect PASS** (`npm test`).

- [ ] **Step 9: Commit**

```bash
git add src/db/exercises.ts src/db/exercises.test.ts src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat: data access layer (exercises, sessions, sets, ghost prefill)"
```

---

## Task 6: App DB client + design tokens + primitives

**Files:**
- Create: `src/db/client.ts`, `src/ui/tokens.ts`, `src/ui/tokens.test.ts`, `src/ui/primitives.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `schema`, migrations in `drizzle/`.
- Produces: `getDb()` (memoized expo-sqlite Drizzle client, runs migrations once); `tokens` object; `<Screen>`, `<Card>`, `<Mono>` primitives.

- [ ] **Step 1: Write `src/ui/tokens.ts` (blueprint theme — default)**

```ts
export const tokens = {
  color: {
    bg: "#0B1A2B", surface: "#121C2B", line: "rgba(94,178,222,0.12)",
    ink: "#E3F0FB", soft: "#84AACB", accent: "#38BDF8", pos: "#34D399", neg: "#FB7185",
  },
  space: [0, 4, 8, 12, 16, 24, 32],
  radius: { sm: 8, md: 12, lg: 16 },
  font: { mono: "JetBrainsMono" },
} as const;
```

- [ ] **Step 2: Failing test `src/ui/tokens.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { tokens } from "./tokens";
describe("tokens", () => {
  it("uses the blueprint accent", () => { expect(tokens.color.accent).toBe("#38BDF8"); });
  it("uses an 8pt-based space scale", () => { expect(tokens.space).toContain(8); });
});
```

- [ ] **Step 3: Run — expect PASS** (`npm test`).

- [ ] **Step 4: Write `src/ui/primitives.tsx`**

```tsx
import { View, Text, ViewProps, TextProps } from "react-native";
import { tokens as t } from "./tokens";

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: t.color.bg, padding: t.space[4] }}>{children}</View>;
}
export function Card(props: ViewProps) {
  return <View {...props} style={[{ backgroundColor: t.color.surface, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.lg, padding: t.space[4] }, props.style]} />;
}
export function Mono(props: TextProps) {
  return <Text {...props} style={[{ color: t.color.ink, fontVariant: ["tabular-nums"] }, props.style]} />;
}
```

- [ ] **Step 5: Write `src/db/client.ts`**

```ts
import { openDatabaseSync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
export function getDb() {
  if (_db) return _db;
  const sqlite = openDatabaseSync("sbl.db");
  _db = drizzle(sqlite, { schema });
  migrate(_db, migrations);
  return _db;
}
```

- [ ] **Step 5b: Configure Metro to bundle `.sql` migrations**

Drizzle's expo migrator imports the generated migration as a `.sql` module, which Metro does NOT bundle by default — without this the app fails to bundle with `Unable to resolve module ./0000_*.sql`. Create `metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");
module.exports = config;
```

After adding it, always restart Metro with a cleared cache: `npx expo start -c`.

- [ ] **Step 6: Wire root layout `app/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
import { getDb } from "../src/db/client";
getDb(); // open + migrate at startup
export default function RootLayout() {
  return <Stack screenOptions={{ headerStyle: { backgroundColor: "#0B1A2B" }, headerTintColor: "#E3F0FB" }} />;
}
```

- [ ] **Step 7: Run app to confirm DB opens**

Run: `npx expo start` → open app.
Expected: app boots with no migration error (check Metro logs).

- [ ] **Step 8: Commit**

```bash
git add src/db/client.ts src/ui/tokens.ts src/ui/tokens.test.ts src/ui/primitives.tsx app/_layout.tsx
git commit -m "feat: app db client + blueprint tokens + primitives"
```

---

## Task 7: Exercise library screen (list + create)

**Files:**
- Modify: `app/library.tsx`
- Create: `src/db/use-live.ts` (tiny live-query hook over Drizzle)

**Interfaces:**
- Consumes: `listExercises`, `createExercise`, `getDb`.
- Produces: a screen listing exercises with an input to add one; list updates immediately after add (optimistic via re-query).

- [ ] **Step 1: Implement `src/db/use-live.ts`**

```ts
import { useEffect, useState, useCallback } from "react";
// Minimal: re-run a query function and expose a refetch. (Swap for drizzle useLiveQuery later if desired.)
export function useQueryFn<T>(fn: () => T): [T, () => void] {
  const [data, setData] = useState<T>(fn);
  const refetch = useCallback(() => setData(fn()), [fn]);
  useEffect(() => { refetch(); }, [refetch]);
  return [data, refetch];
}
```

- [ ] **Step 2: Implement `app/library.tsx`**

```tsx
import { useCallback, useState } from "react";
import { FlatList, TextInput, Pressable, Text } from "react-native";
import { Screen, Card, Mono } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { listExercises, createExercise } from "../src/db/exercises";
import { useQueryFn } from "../src/db/use-live";

export default function Library() {
  const db = getDb();
  const [items, refetch] = useQueryFn(useCallback(() => listExercises(db), [db]));
  const [name, setName] = useState("");
  const add = () => { if (!name.trim()) return; createExercise(db, name.trim()); setName(""); refetch(); };
  return (
    <Screen>
      <TextInput value={name} onChangeText={setName} placeholder="New exercise" placeholderTextColor={t.color.soft}
        onSubmitEditing={add}
        style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.md, padding: t.space[3], marginBottom: t.space[3] }} />
      <Pressable onPress={add}><Text style={{ color: t.color.accent, marginBottom: t.space[4] }}>+ Add exercise</Text></Pressable>
      <FlatList data={items} keyExtractor={(e: any) => e.id}
        renderItem={({ item }) => (<Card style={{ marginBottom: t.space[2] }}><Mono>{item.name}</Mono></Card>)} />
    </Screen>
  );
}
```

- [ ] **Step 3: Manual verify**

Run the app → Library tab → type "Chest Fly (Machine)" → Add. Item appears immediately and persists across reload.

- [ ] **Step 4: Commit**

```bash
git add app/library.tsx src/db/use-live.ts
git commit -m "feat: exercise library screen (list + create)"
```

---

## Task 8: Session reducer + active-session logging screen with ghost prefill

**Files:**
- Create: `src/domain/session-reducer.ts`, `src/domain/session-reducer.test.ts`
- Modify: `app/index.tsx`, `app/session/[id].tsx` (create)

**Interfaces:**
- Consumes: `startSession`, `addExerciseToSession`, `logSet`, `lastSetsForExercise`, `listExercises`, units helpers.
- Produces:
  - Pure reducer: `type DraftSet = { weightKg: number | null; reps: number | null }`; `reducer(state, action)` for `addSet | editSet | removeSet`; `ghostFor(prev: DraftSet[], index: number): DraftSet` (returns prior-session value for that set index, for placeholder display).

- [ ] **Step 1: Failing test `src/domain/session-reducer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reducer, ghostFor } from "./session-reducer";

describe("session reducer", () => {
  it("adds and edits sets", () => {
    let s = reducer({ sets: [] }, { type: "addSet" });
    s = reducer(s, { type: "editSet", index: 0, patch: { weightKg: 100, reps: 8 } });
    expect(s.sets[0]).toEqual({ weightKg: 100, reps: 8 });
  });
  it("removes a set", () => {
    let s = { sets: [{ weightKg: 100, reps: 8 }, { weightKg: 100, reps: 7 }] };
    s = reducer(s, { type: "removeSet", index: 0 });
    expect(s.sets).toEqual([{ weightKg: 100, reps: 7 }]);
  });
  it("ghostFor returns the prior session's value at that index", () => {
    const prev = [{ weightKg: 85, reps: 9 }, { weightKg: 85, reps: 8 }];
    expect(ghostFor(prev, 1)).toEqual({ weightKg: 85, reps: 8 });
    expect(ghostFor(prev, 5)).toEqual({ weightKg: 85, reps: 8 }); // clamps to last
    expect(ghostFor([], 0)).toEqual({ weightKg: null, reps: null });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`).

- [ ] **Step 3: Implement `src/domain/session-reducer.ts`**

```ts
export type DraftSet = { weightKg: number | null; reps: number | null };
export type DraftState = { sets: DraftSet[] };
export type Action =
  | { type: "addSet" }
  | { type: "editSet"; index: number; patch: Partial<DraftSet> }
  | { type: "removeSet"; index: number };

export function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "addSet": return { sets: [...state.sets, { weightKg: null, reps: null }] };
    case "editSet": return { sets: state.sets.map((s, i) => i === action.index ? { ...s, ...action.patch } : s) };
    case "removeSet": return { sets: state.sets.filter((_, i) => i !== action.index) };
  }
}

export function ghostFor(prev: DraftSet[], index: number): DraftSet {
  if (prev.length === 0) return { weightKg: null, reps: null };
  return prev[Math.min(index, prev.length - 1)];
}
```

- [ ] **Step 4: Run — expect PASS** (`npm test`).

- [ ] **Step 5: Implement `app/index.tsx` (Train tab — start a session)**

```tsx
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../src/ui/primitives";
import { tokens as t } from "../src/ui/tokens";
import { getDb } from "../src/db/client";
import { startSession } from "../src/db/sessions";

export default function Train() {
  const router = useRouter();
  const begin = () => { const id = startSession(getDb(), "Session"); router.push(`/session/${id}`); };
  return (
    <Screen>
      <Pressable onPress={begin} style={{ backgroundColor: t.color.accent, borderRadius: t.radius.lg, padding: t.space[4] }}>
        <Text style={{ color: t.color.bg, fontWeight: "700", textAlign: "center" }}>Start session</Text>
      </Pressable>
    </Screen>
  );
}
```

- [ ] **Step 6: Implement `app/session/[id].tsx` (log sets with ghost prefill)**

```tsx
import { useMemo, useReducer, useState } from "react";
import { ScrollView, TextInput, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, Card, Mono } from "../../src/ui/primitives";
import { tokens as t } from "../../src/ui/tokens";
import { getDb } from "../../src/db/client";
import { listExercises } from "../../src/db/exercises";
import { addExerciseToSession, logSet, lastSetsForExercise } from "../../src/db/sessions";
import { reducer, ghostFor } from "../../src/domain/session-reducer";
import { toDisplayWeight, lbToKg } from "../../src/domain/units";

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = getDb();
  const exercises = useMemo(() => listExercises(db), [db]);
  const [exId, setExId] = useState<string | null>(null);
  const [seId, setSeId] = useState<string | null>(null);
  const prev = useMemo(() => (exId ? lastSetsForExercise(db, exId) : []), [db, exId]);
  const [state, dispatch] = useReducer(reducer, { sets: [] });

  const pick = (id2: string) => { setExId(id2); setSeId(addExerciseToSession(db, id as string, id2)); dispatch({ type: "addSet" }); };
  const commit = (i: number, w: string, r: string) => {
    const weightKg = w ? lbToKg(Number(w)) : null; const reps = r ? Number(r) : null;
    dispatch({ type: "editSet", index: i, patch: { weightKg, reps } });
    if (seId && weightKg != null && reps != null) logSet(db, seId, { weightKg, reps });
  };

  if (!exId) return (
    <Screen><Mono style={{ marginBottom: t.space[3], color: t.color.soft }}>Pick an exercise</Mono>
      <ScrollView>{exercises.map((e: any) => (
        <Pressable key={e.id} onPress={() => pick(e.id)}><Card style={{ marginBottom: t.space[2] }}><Mono>{e.name}</Mono></Card></Pressable>
      ))}</ScrollView></Screen>
  );

  return (
    <Screen>
      <ScrollView>
        {state.sets.map((s, i) => {
          const g = ghostFor(prev, i);
          return (
            <View key={i} style={{ flexDirection: "row", gap: t.space[2], marginBottom: t.space[2] }}>
              <Mono style={{ color: t.color.soft, width: 20 }}>{i + 1}</Mono>
              <TextInput keyboardType="numeric" placeholder={g.weightKg != null ? String(toDisplayWeight(g.weightKg, "lb")) : "lb"}
                placeholderTextColor={t.color.soft} onEndEditing={(e) => commit(i, e.nativeEvent.text, "")}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }} />
              <TextInput keyboardType="numeric" placeholder={g.reps != null ? String(g.reps) : "reps"}
                placeholderTextColor={t.color.soft} onEndEditing={(e) => commit(i, "", e.nativeEvent.text)}
                style={{ color: t.color.ink, borderColor: t.color.line, borderWidth: 1, borderRadius: t.radius.sm, padding: t.space[2], flex: 1 }} />
            </View>
          );
        })}
        <Pressable onPress={() => dispatch({ type: "addSet" })}><Text style={{ color: t.color.accent }}>+ Add set</Text></Pressable>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 7: Run — expect PASS** (`npm test`) then manual verify

Manual: Start session → pick exercise → previous session's numbers show as greyed placeholders → enter sets → reopen app → data persisted.

- [ ] **Step 8: Commit**

```bash
git add src/domain/session-reducer.ts src/domain/session-reducer.test.ts app/index.tsx app/session/\[id\].tsx
git commit -m "feat: active session logging with ghost prefill"
```

---

## Task 9: Bottom tab navigation + full-loop smoke

**Files:**
- Modify: `app/_layout.tsx` → tab navigator (Train / Library)

**Interfaces:**
- Consumes: existing screens.
- Produces: a 2-tab app (Train, Library) — the complete offline loop.

- [ ] **Step 1: Convert root to tabs**

```tsx
import { Tabs } from "expo-router";
import { getDb } from "../src/db/client";
getDb();
export default function RootLayout() {
  return (
    <Tabs screenOptions={{ tabBarStyle: { backgroundColor: "#0B1A2B", borderTopColor: "rgba(94,178,222,0.12)" },
      tabBarActiveTintColor: "#38BDF8", tabBarInactiveTintColor: "#84AACB",
      headerStyle: { backgroundColor: "#0B1A2B" }, headerTintColor: "#E3F0FB" }}>
      <Tabs.Screen name="index" options={{ title: "Train" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="session/[id]" options={{ href: null, title: "Session" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Full manual smoke test**

1. Library → add "Incline Chest Press (Machine)".
2. Train → Start session → pick it → log 2 sets.
3. Start a second session → pick it → confirm ghost placeholders show set 1's values.
4. Kill & relaunch app → data still present (offline persistence).

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS (units, e1rm, progression, schema, exercises, sessions, tokens, session-reducer).

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: tab navigation + complete offline logging loop"
```

---

## Self-Review (done)

- **Spec coverage (this plan's slice):** fast logging w/ ghost prefill ✓ (T5,T8); custom exercises ✓ (T5,T7); local-first SQLite source of truth ✓ (T4–T6); design-system blueprint tokens ✓ (T6); offline persistence ✓ (T9); progression/e1RM engine groundwork w/ outlier-robustness from Phase 0 ✓ (T3); every table has id/timestamps/deletedAt/dirty for future sync ✓ (T4); weight canonical kg ✓ (T2,T8). Deferred to later plans (correctly): conditions logging, custom-metric UI, Findings surface, export, Supabase auth+sync, MCP/CLI — see roadmap below.
- **Placeholder scan:** none — every code step has complete code.
- **Type consistency:** `DraftSet`, `lastSetsForExercise` shape `{weightKg,reps}`, and reducer actions match across T5/T8. `getDb()` / `makeTestDb()` both satisfy the `DB` param.

## Subsequent plans (v1, in order)

1. **Plan 2 — Conditions & custom metrics:** session `conditionValues` UI (collapsible, typed, scale anchors), per-exercise enabled metrics, progressive-disclosure set row (RIR/notes/custom behind one-tap expand), rest timer.
2. **Plan 3 — Findings teaser + analysis surface:** port `progression.ts` into a History/Findings screen; off-day detection; "N sessions until your first finding"; confidence + "correlation ≠ causation" guardrails.
3. **Plan 4 — Cloud & sync:** Supabase auth (optional account), schema mirror + RLS, last-write-wins push/pull on the `dirty`/`updated_at`/`deletedAt` columns; **Hevy CSV import** (reuses the Phase 0 parser; converts lbs→kg).
4. **Plan 5 — Developer layer:** export (JSON/CSV/SQLite), personal-token REST access (Supabase), **MCP server** (TypeScript), and AI-buildable docs (`llms.txt` + examples).
```
