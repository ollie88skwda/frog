// ConvexRepo against a running LOCAL Convex backend (the port of the old
// supabase.itest.ts — same behaviours, Convex-native probes). Prepare the
// backend once with `bun scripts/convex-test-env.ts` (sets TEST_JWKS, pushes
// functions, seeds global rows); `bun run test:integration` does that.
//
// Env: CONVEX_URL or CONVEX_SELF_HOSTED_URL (cloud API URL of the backend),
// FROG_TEST_KEY (signing key path; default <repo>/.convex-test/key.json).
import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { beforeAll, describe, expect, it } from "vitest";
import { loadOrCreateTestAuth } from "../../../../scripts/convex-test-auth";
import { SEED_CONDITIONS } from "../db/seed-ids";
import { newId } from "../domain/ids";
import type { ImportedSession } from "../import/types";
import { ConvexRepo, type ConvexTransport } from "./convex";

const URL_ =
  process.env.CONVEX_URL ??
  process.env.CONVEX_SELF_HOSTED_URL ??
  "http://127.0.0.1:3210";
// HTTP actions are served on the next port for local backends.
const SITE_URL =
  process.env.CONVEX_SITE_URL ??
  URL_.replace(/:(\d+)$/, (_, p) => `:${Number(p) + 1}`);
const KEY =
  process.env.FROG_TEST_KEY ??
  join(__dirname, "../../../../.convex-test/key.json");

type Raw = {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
};

async function makeUser(fetchImpl?: typeof fetch) {
  const auth = await loadOrCreateTestAuth(KEY);
  const sub = `user_test_${newId().slice(0, 12)}`;
  const client = new ConvexHttpClient(URL_, {
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  } as never);
  client.setAuth(await auth.mint(sub));
  const raw: Raw & ConvexTransport = {
    query: (n, a) => client.query(n as never, a as never) as never,
    mutation: (n, a) => client.mutation(n as never, a as never) as never,
  };
  return { sub, raw, repo: new ConvexRepo(raw) };
}

// The only seed exercises that end up with no muscle targets (sorted by name).
const NECK_ONLY_SEEDS = [
  "Isometric Neck Exercise - Front And Back",
  "Isometric Neck Exercise - Sides",
  "Lying Face Down Plate Neck Resistance",
  "Lying Face Up Plate Neck Resistance",
  "Neck-SMR",
  "Seated Head Harness Neck Resistance",
  "Side Neck Stretch",
];

type Row = Record<string, unknown>;

describe("ConvexRepo (integration, local convex)", () => {
  let a: Awaited<ReturnType<typeof makeUser>>;
  let b: Awaited<ReturnType<typeof makeUser>>;
  let repoA: ConvexRepo;
  let repoB: ConvexRepo;

  beforeAll(async () => {
    a = await makeUser();
    b = await makeUser();
    repoA = a.repo;
    repoB = b.repo;
  });

  const setsOf = (raw: Raw, sessionExerciseId: string) =>
    raw.query<Row[]>("rows:find", {
      table: "set_logs",
      where: { sessionExerciseId },
    });

  it("rejects calls without an identity", async () => {
    const anon = new ConvexHttpClient(URL_);
    await expect(
      anon.query("sessions:active" as never, {} as never),
    ).rejects.toThrow(/Not signed in/);
  });

  it("creates and lists exercises", async () => {
    const name = `Bench Press ${newId().slice(0, 8)}`;
    const created = await repoA.createExercise(name);
    expect(created.name).toBe(name);
    expect(created.isCustom).toBe(true);
    // Community population phase: a plain create publishes (ownerId null).
    expect(created.ownerId).toBeNull();
    expect(created.createdBy).toBe(a.sub);

    const listed = await repoA.listExercises();
    expect(listed.map((e) => e.id)).toContain(created.id);
  });

  it("community sharing: global visibility, provenance, dupe backstop, frozen rows, private fork", async () => {
    const name = `Community Lift ${newId().slice(0, 8)}`;
    const shared = await repoA.createExercise(name, {
      muscleTargets: [{ muscle: "quads", tier: "B" }],
    });
    expect(shared.ownerId).toBeNull();
    expect(shared.createdBy).toBe(a.sub);
    expect(shared.muscleTargets).toEqual([{ muscle: "quads", tier: "B" }]);
    expect((await repoB.listExercises()).map((e) => e.id)).toContain(shared.id);

    // Dupe backstop: case-insensitive re-publish returns the canonical row.
    const dupe = await repoA.createExercise(name.toLowerCase());
    expect(dupe.id).toBe(shared.id);
    const same = (await repoA.listExercises()).filter(
      (e) => e.name.toLowerCase() === name.toLowerCase(),
    );
    expect(same).toHaveLength(1);

    // Frozen: an update on a shared row is a silent no-op (the fork contract).
    await repoA.updateExercise(shared.id, { notes: "should not stick" });
    expect((await repoA.getExercise(shared.id))?.notes).toBeNull();

    const priv = await repoA.createExercise(`Private ${newId().slice(0, 8)}`, {
      share: false,
    });
    expect(priv.ownerId).toBe(a.sub);
    expect((await repoB.listExercises()).map((e) => e.id)).not.toContain(
      priv.id,
    );

    // A machine-linked create stays private even without an explicit flag.
    const machine = await repoA.createMachine({ name: "A's Hack Squat" });
    const machineEx = await repoA.createExercise(
      `Machine Shared Guard ${newId().slice(0, 8)}`,
      { machineId: machine.id },
    );
    expect(machineEx.ownerId).toBe(a.sub);
    expect(machineEx.machineId).toBe(machine.id);
    expect((await repoB.listExercises()).map((e) => e.id)).not.toContain(
      machineEx.id,
    );
  });

  it("starts a session and logs ordered sets (idempotent on the client id)", async () => {
    const ex = await repoA.createExercise(`Squat ${newId().slice(0, 8)}`);
    const session = await repoA.startSession();
    expect(session.startedAt).toBeGreaterThan(0);
    expect(await repoA.activeSession()).toMatchObject({ id: session.id });

    const se = await repoA.addExerciseToSession(session.id, ex.id);
    const first = newId();
    await repoA.logSet(se, { weightKg: 100, reps: 5 }, first, 0);
    // A retried write replays the same id: overwrites, never duplicates.
    await repoA.logSet(se, { weightKg: 100, reps: 5 }, first, 0);
    await repoA.logSet(se, { weightKg: 102.5, reps: 3, rir: 1 }, newId(), 1);

    const rows = (await setsOf(a.raw, se))
      .sort((x, y) => (x.setNo as number) - (y.setNo as number))
      .map((r) => ({
        setNo: r.setNo,
        weightKg: r.weightKg,
        reps: r.reps,
        rir: r.rir,
      }));
    expect(rows).toEqual([
      { setNo: 0, weightKg: 100, reps: 5, rir: null },
      { setNo: 1, weightKg: 102.5, reps: 3, rir: 1 },
    ]);

    const detail = await repoA.listSessionExercises(session.id);
    expect(detail).toHaveLength(1);
    expect(detail[0].exerciseName).toBe(ex.name);
    expect(detail[0].sets.map((s) => s.setNo)).toEqual([0, 1]);

    await repoA.endSession(session.id);
    expect(await repoA.activeSession()).toBeNull();
  });

  it("logs a unilateral pair as two rows sharing one set_no", async () => {
    const ex = await repoA.createExercise(`One-Arm Row ${newId().slice(0, 8)}`);
    const session = await repoA.startSession();
    const se = await repoA.addExerciseToSession(session.id, ex.id);
    await repoA.logSet(
      se,
      { weightKg: 30, reps: 10, side: "left" },
      newId(),
      0,
    );
    await repoA.logSet(
      se,
      { weightKg: 28, reps: 8, side: "right" },
      newId(),
      0,
    );

    const rows = (await setsOf(a.raw, se))
      .map((r) => ({
        setNo: r.setNo,
        side: r.side,
        weightKg: r.weightKg,
        reps: r.reps,
      }))
      .sort((x, y) => String(x.side).localeCompare(String(y.side)));
    expect(rows).toEqual([
      { setNo: 0, side: "left", weightKg: 30, reps: 10 },
      { setNo: 0, side: "right", weightKg: 28, reps: 8 },
    ]);
  });

  it("ghost-prefills from the most recent prior session", async () => {
    const ex = await repoA.createExercise(`Deadlift ${newId().slice(0, 8)}`);
    expect(await repoA.lastSetsForExercise(ex.id)).toEqual([]);

    const s1 = await repoA.startSession();
    const se1 = await repoA.addExerciseToSession(s1.id, ex.id);
    await repoA.logSet(se1, { weightKg: 140, reps: 5 }, newId(), 0);
    await repoA.logSet(se1, { weightKg: 150, reps: 3 }, newId(), 1);

    const s2 = await repoA.startSession();
    const se2 = await repoA.addExerciseToSession(s2.id, ex.id);
    expect(await repoA.lastSetsForExercise(ex.id, se2)).toEqual([
      {
        weightKg: 140,
        reps: 5,
        durationSec: null,
        distanceM: null,
        otherSide: null,
      },
      {
        weightKg: 150,
        reps: 3,
        durationSec: null,
        distanceM: null,
        otherSide: null,
      },
    ]);

    // Deleting the prior session tombstones its sets: no ghost resurfaces.
    await repoA.deleteSession(s1.id);
    expect(await repoA.lastSetsForExercise(ex.id, se2)).toEqual([]);
  });

  it("ghost-prefills a unilateral pair as one grouped ghost with otherSide", async () => {
    const ex = await repoA.createExercise(`One-Arm Row ${newId().slice(0, 8)}`);
    const s1 = await repoA.startSession();
    const se1 = await repoA.addExerciseToSession(s1.id, ex.id);
    await repoA.logSet(
      se1,
      { weightKg: 30, reps: 10, side: "left" },
      newId(),
      0,
    );
    await repoA.logSet(
      se1,
      { weightKg: 28, reps: 8, side: "right" },
      newId(),
      0,
    );

    const s2 = await repoA.startSession();
    const se2 = await repoA.addExerciseToSession(s2.id, ex.id);
    expect(await repoA.lastSetsForExercise(ex.id, se2)).toEqual([
      {
        weightKg: 30,
        reps: 10,
        durationSec: null,
        distanceM: null,
        otherSide: {
          weightKg: 28,
          reps: 8,
          durationSec: null,
          distanceM: null,
        },
      },
    ]);
  });

  it("recentExerciseIds returns recently-logged exercise ids, most recent first", async () => {
    const older = await repoA.createExercise(`Older ${newId().slice(0, 8)}`);
    const newer = await repoA.createExercise(`Newer ${newId().slice(0, 8)}`);
    const session = await repoA.startSession();
    const seOlder = await repoA.addExerciseToSession(session.id, older.id);
    const seNewer = await repoA.addExerciseToSession(session.id, newer.id);
    await repoA.logSet(seOlder, { weightKg: 100, reps: 5 }, newId(), 0);
    await new Promise((r) => setTimeout(r, 5));
    await repoA.logSet(seNewer, { weightKg: 80, reps: 8 }, newId(), 0);

    const recent = await repoA.recentExerciseIds(30);
    expect(recent.slice(0, 2)).toEqual([newer.id, older.id]);
    expect(await repoA.recentExerciseIds(0)).not.toContain(newer.id);
  });

  it("imports sessions idempotently and applies sleep without overwriting", async () => {
    const day = 86_400_000;
    const base = Date.now() - 30 * day;
    const sessions: ImportedSession[] = [0, 1, 2].map((i) => ({
      title: `Imported ${i}`,
      startedAt: base + i * day,
      endedAt: base + i * day + 3_600_000,
      exercises: [
        {
          name: `Import Lift ${base}`,
          sets: [
            { weightKg: 100 + i, reps: 5, rir: 1, note: null },
            { weightKg: 90, reps: 8, rir: null, note: "backoff" },
          ],
        },
      ],
    }));
    expect(await repoA.importSessions(sessions)).toEqual({
      imported: 3,
      skipped: 0,
      sets: 6,
      exercisesCreated: 1,
    });
    const second = await repoA.importSessions(sessions);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(3);

    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const all = await a.raw.query<Row[]>("rows:find", { table: "sessions" });
    const s0 = all.find((s) => s.startedAt === base);
    await repoA.updateSessionConditions(s0?.id as string, {
      [SEED_CONDITIONS.sleepH]: 9,
    });
    const filled = await repoA.applySleep(
      new Map([
        [iso(new Date(base)), 6.5],
        [iso(new Date(base + day)), 7.5],
      ]),
    );
    expect(filled).toBe(1);
    const after = await a.raw.query<Row[]>("rows:find", { table: "sessions" });
    const cv = (start: number) =>
      (after.find((s) => s.startedAt === start)?.conditionValues as Row)?.[
        SEED_CONDITIONS.sleepH
      ];
    expect(cv(base)).toBe(9);
    expect(cv(base + day)).toBe(7.5);

    // History feeds the findings/records engines.
    const findings = await repoA.findingsData();
    expect(
      findings.filter(
        (f) => f.startedAt >= base && f.startedAt <= base + 2 * day,
      ),
    ).toHaveLength(3);
    const records = await repoA.recordsData();
    const rec = records.find((r) => r.startedAt === base);
    expect(rec?.exercises[0].sets.map((s) => s.weightKg)).toEqual([100, 90]);
  });

  it("machines: CRUD round-trip, exercise link, delete detaches", async () => {
    const machine = await repoA.createMachine({
      name: `Row Machine ${newId().slice(0, 8)}`,
      brand: "Matrix",
      catalogKey: "matrix-ultra-seated-row",
      settings: [
        { label: "Seat height", value: 4 },
        { label: "Chest pad", value: null },
      ],
    });
    expect(machine.brand).toBe("Matrix");
    expect(machine.settings).toEqual([
      { label: "Seat height", value: 4 },
      { label: "Chest pad", value: null },
    ]);
    await repoA.updateMachine(machine.id, {
      settings: [{ label: "Seat height", value: 5 }],
      notes: "lean forward",
    });
    const updated = (await repoA.listMachines()).find(
      (m) => m.id === machine.id,
    );
    expect(updated?.settings).toEqual([{ label: "Seat height", value: 5 }]);
    expect(updated?.notes).toBe("lean forward");

    const ex = await repoA.createExercise(
      `Machine Row ${newId().slice(0, 8)}`,
      {
        share: false,
        machineId: machine.id,
        jointActions: ["shoulder-extension", "elbow-flexion"],
        muscleTargets: [{ muscle: "lats", tier: "A" }],
      },
    );
    expect(ex.machineId).toBe(machine.id);
    await repoA.deleteMachine(machine.id);
    expect((await repoA.listMachines()).map((m) => m.id)).not.toContain(
      machine.id,
    );
    const after = (await repoA.listExercises()).find((e) => e.id === ex.id);
    expect(after?.machineId).toBeNull();
  });

  it("machines: users are isolated; seed classifications are visible and read-only", async () => {
    const machine = await repoA.createMachine({ name: "A's Leg Press" });
    expect((await repoB.listMachines()).map((m) => m.id)).not.toContain(
      machine.id,
    );

    const seeds = (await repoB.listExercises()).filter((e) => !e.isCustom);
    expect(seeds.length).toBeGreaterThan(0);
    expect(
      seeds
        .filter((e) => !e.muscleTargets?.length)
        .map((e) => e.name)
        .sort(),
    ).toEqual(NECK_ONLY_SEEDS);

    const squat = seeds.find((e) => e.name === "Squat");
    const touched = await b.raw.mutation<Row[]>("rows:update", {
      table: "exercises",
      where: { id: squat?.id },
      patch: { muscleTargets: [{ muscle: "abs", tier: "S" }] },
    });
    expect(touched).toHaveLength(0);

    expect(seeds.filter((e) => e.laterality === "unilateral")).toHaveLength(49);
    expect(seeds.filter((e) => e.laterality === "alternating")).toHaveLength(
      10,
    );
  });

  it("machine catalog: search matches brand/model/alias and browse filters by category", async () => {
    const bareMatrix = await repoA.searchMachineCatalog("matrix");
    expect(bareMatrix.length).toBeGreaterThan(0);
    expect(bareMatrix.length).toBeLessThanOrEqual(20);
    expect(bareMatrix.every((r) => r.brand === "Matrix")).toBe(true);

    const byTerms = await repoA.searchMachineCatalog("matrix diverging seated");
    expect(byTerms.map((r) => r.model)).toContain("Ultra Diverging Seated Row");

    const byAlias = await repoA.searchMachineCatalog("g628");
    expect(
      byAlias.some(
        (r) => r.brand === "Freemotion" && r.model === "Total Quad / Hip",
      ),
    ).toBe(true);

    const chest = await repoA.searchMachineCatalog("", {
      category: "chest-press",
      limit: 5,
    });
    expect(chest).toHaveLength(5);
    expect(chest.every((r) => r.category === "chest-press")).toBe(true);
    expect(await repoA.searchMachineCatalog("zzzz-no-such-machine")).toEqual(
      [],
    );
    expect(Object.keys(byTerms[0]).sort()).toEqual([
      "brand",
      "category",
      "id",
      "model",
    ]);
  });

  it("machine catalog: categories are distinct and sorted", async () => {
    const cats = await repoA.listMachineCategories();
    expect(cats.length).toBeGreaterThan(20);
    expect(cats[0]).toBe("ab-crunch");
    expect([...cats].sort()).toEqual(cats);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("machine photos: owner can upload and read, others cannot", async () => {
    const machine = await repoA.createMachine({ name: "Photo Machine" });
    const pixel = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await repoA.uploadMachinePhoto(machine.id, pixel);
    const updated = (await repoA.listMachines()).find(
      (m) => m.id === machine.id,
    );
    expect(updated?.photoPath).toBeTruthy();
    const url = await repoA.machinePhotoUrl(updated ?? machine);
    expect(url).toMatch(/^https?:\/\//);
    expect((await fetch(url as string)).ok).toBe(true);

    // B can't resolve a URL for A's file, nor attach it to its own row.
    expect(
      await b.raw.query("files:url", { storageId: updated?.photoPath }),
    ).toBeNull();
    const bMachine = await repoB.createMachine({ name: "B's machine" });
    await expect(
      b.raw.mutation("user:setPhoto", {
        table: "machines",
        id: bMachine.id,
        storageId: updated?.photoPath,
      }),
    ).rejects.toThrow(/file not found/);
  });

  it("exercise editor fields round-trip through createExercise", async () => {
    const ex = await repoA.createExercise(
      `Zercher Squat ${newId().slice(0, 8)}`,
      {
        mechanic: "compound",
        movementPattern: "squat",
        laterality: "bilateral",
        defaultRepsMin: 6,
        defaultRepsMax: 10,
        defaultRestSec: 150,
        notes: "brace before you unrack",
        aliases: ["Zercher squats"],
      },
    );
    expect(ex).toMatchObject({
      mechanic: "compound",
      movementPattern: "squat",
      laterality: "bilateral",
      defaultRepsMin: 6,
      defaultRepsMax: 10,
      defaultRestSec: 150,
      notes: "brace before you unrack",
      aliases: ["Zercher squats"],
    });
    expect((await repoA.getExercise(ex.id))?.notes).toBe(
      "brace before you unrack",
    );
  });

  it("listExercises omits the fat fields getExercise includes, but not notes", async () => {
    const ex = await repoA.createExercise(
      `Fat Field Test ${newId().slice(0, 8)}`,
      {
        instructions: ["Step one"],
        notes: "a note",
      },
    );
    const listed = (await repoA.listExercises()).find((e) => e.id === ex.id);
    expect(listed?.instructions).toBeNull();
    expect(listed?.notes).toBe("a note");
    const full = await repoA.getExercise(ex.id);
    expect(full?.instructions).toEqual(["Step one"]);
    expect(full?.notes).toBe("a note");
  });

  it("listExercises, exportAll and listMeasurements page past 1000 rows", async () => {
    const c = await makeUser();
    const TOTAL = 1100;
    const marker = `Page Cap Test ${newId().slice(0, 8)}`;
    const rows = Array.from({ length: TOTAL }, (_, i) => ({
      id: newId(),
      name: `${marker} ${i.toString().padStart(4, "0")}`,
      isCustom: true,
    }));
    const meas = Array.from({ length: TOTAL }, (_, i) => ({
      id: newId(),
      measuredOn: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10),
      bodyweightKg: 70 + i / 100,
    }));
    for (let i = 0; i < TOTAL; i += 200) {
      await c.raw.mutation("rows:insert", {
        table: "exercises",
        rows: rows.slice(i, i + 200),
      });
      await c.raw.mutation("rows:insert", {
        table: "measurements",
        rows: meas.slice(i, i + 200),
      });
    }
    expect(
      (await c.repo.listExercises()).filter((e) => e.name.startsWith(marker)),
    ).toHaveLength(TOTAL);
    expect(
      (await c.repo.exportAll()).exercises.filter((e) =>
        e.name.startsWith(marker),
      ),
    ).toHaveLength(TOTAL);
    const listed = await c.repo.listMeasurements();
    expect(listed).toHaveLength(TOTAL);
    expect(listed[0]?.measuredOn).toBe(meas[TOTAL - 1].measuredOn);
    expect(listed[TOTAL - 1]?.measuredOn).toBe(meas[0].measuredOn);
  }, 120_000);

  it("exercise media: owner can upload/clear, others cannot read", async () => {
    const ex = await repoA.createExercise(`Media Test ${newId().slice(0, 8)}`, {
      share: false,
    });
    const pixel = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await repoA.uploadExerciseMedia(ex.id, pixel, "image");
    const updated = await repoA.getExercise(ex.id);
    expect(updated?.mediaPath).toBeTruthy();
    expect(updated?.mediaType).toBe("image");
    expect(await repoA.exerciseMediaUrl(updated!)).toMatch(/^https?:\/\//);
    expect(
      await b.raw.query("files:url", { storageId: updated?.mediaPath }),
    ).toBeNull();

    await repoA.clearExerciseMedia(ex.id);
    const cleared = await repoA.getExercise(ex.id);
    expect(cleared?.mediaPath).toBeNull();
    expect(cleared?.mediaType).toBeNull();
    // The object itself is gone too.
    expect(
      await a.raw.query("files:url", { storageId: updated?.mediaPath }),
    ).toBeNull();
  });

  it("isolation: users cannot see or write each other's data", async () => {
    const exA = await repoA.createExercise(
      `Private Curl ${newId().slice(0, 8)}`,
      {
        share: false,
      },
    );
    const sessionA = await repoA.startSession("A's session");
    expect((await repoB.listExercises()).map((e) => e.id)).not.toContain(
      exA.id,
    );
    expect(await repoB.getSession(sessionA.id)).toBeNull();
    expect((await repoB.listSessions(100, 0)).map((s) => s.id)).not.toContain(
      sessionA.id,
    );

    // A spoofed ownerId is ignored: the row is stamped with the caller.
    const spoof = await b.raw.mutation<Row[]>("rows:insert", {
      table: "sessions",
      rows: [{ id: newId(), startedAt: Date.now(), ownerId: a.sub }],
    });
    expect(spoof[0].ownerId).toBe(b.sub);
    // Reusing A's id is a conflict, not an overwrite.
    await expect(
      b.raw.mutation("rows:insert", {
        table: "sessions",
        rows: [{ id: sessionA.id, startedAt: 1 }],
      }),
    ).rejects.toThrow(/id conflict/);
    // Writes against A's rows are no-ops.
    await repoB.updateSessionTitle(sessionA.id, "hijacked");
    await repoB.deleteSession(sessionA.id);
    const still = await repoA.getSession(sessionA.id);
    expect(still?.title).toBe("A's session");
    expect(still?.deletedAt).toBeNull();
    // B can't hang a block off A's session.
    await expect(
      repoB.addExerciseToSession(sessionA.id, exA.id),
    ).rejects.toThrow();
  });

  it("session notes round-trip and clear", async () => {
    const s = await repoA.startSession();
    await repoA.updateSessionNotes(s.id, "legs felt heavy, cleared by set 2");
    expect((await repoA.getSession(s.id))?.notes).toBe(
      "legs felt heavy, cleared by set 2",
    );
    await repoA.updateSessionNotes(s.id, null);
    expect((await repoA.getSession(s.id))?.notes).toBeNull();
  });

  it("custom conditions carry type + unit; seed conditions are listed", async () => {
    const scale = await repoA.createMetric({
      name: `RPE ${newId().slice(0, 8)}`,
      type: "scale",
      scope: "session",
    });
    expect(scale.type).toBe("scale");
    expect(scale.unit).toBeNull();
    const water = await repoA.createMetric({
      name: `Water ${newId().slice(0, 8)}`,
      type: "number",
      scope: "session",
      unit: "ml",
    });
    expect(water.unit).toBe("ml");
    const ids = (await repoA.listMetrics()).map((m) => m.id);
    expect(ids).toContain(SEED_CONDITIONS.sleepH);
    expect(ids).toContain(water.id);
    expect((await repoB.listMetrics()).map((m) => m.id)).not.toContain(
      water.id,
    );
  });

  it("tracked conditions: empty for a fresh user, upserts one row per metric", async () => {
    const metric = await repoA.createMetric({
      name: `Soreness ${newId().slice(0, 8)}`,
      type: "scale",
      scope: "session",
    });
    expect(
      (await repoA.listTrackedConditions()).some(
        (t) => t.metricId === metric.id,
      ),
    ).toBe(false);
    await repoA.setConditionTracked(metric.id, true);
    let mine = (await repoA.listTrackedConditions()).filter(
      (t) => t.metricId === metric.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].tracked).toBe(true);
    await repoA.setConditionTracked(metric.id, false);
    mine = (await repoA.listTrackedConditions()).filter(
      (t) => t.metricId === metric.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].tracked).toBe(false);
    expect(
      (await repoB.listTrackedConditions()).some(
        (t) => t.metricId === metric.id,
      ),
    ).toBe(false);
  });

  it("routines: create, detail, update, duplicate, start, write back values", async () => {
    const ex = await repoA.createExercise(
      `Routine Lift ${newId().slice(0, 8)}`,
    );
    const folder = await repoA.createRoutineFolder("Push");
    const routine = await repoA.createRoutine({
      name: "Push A",
      folderId: folder.id,
      exercises: [
        {
          exerciseId: ex.id,
          orderIndex: 0,
          restSec: 90,
          sets: [
            { setNo: 0, targetWeightKg: 60, targetReps: 8 },
            {
              setNo: 1,
              targetReps: 8,
              targetRepsMax: 12,
              laterality: "unilateral",
            },
          ],
        },
      ],
    });
    const detail = await repoA.getRoutineDetail(routine.id);
    expect(detail?.exercises[0].exerciseName).toBe(ex.name);
    expect(detail?.exercises[0].sets.map((s) => s.laterality)).toEqual([
      null,
      "unilateral",
    ]);
    expect(await repoB.getRoutineDetail(routine.id)).toBeNull();

    const session = await repoA.startRoutineSession(routine.id);
    expect(session.routineId).toBe(routine.id);
    const blocks = await repoA.listSessionExercises(session.id);
    expect(blocks[0].routineExerciseId).toBe(detail?.exercises[0].id);

    await repoA.updateRoutineValues(routine.id, [
      {
        routineExerciseId: detail?.exercises[0].id as string,
        sets: [
          {
            setNo: 0,
            weightKg: 65,
            reps: 8,
            durationSec: null,
            distanceM: null,
          },
          {
            setNo: 1,
            weightKg: 20,
            reps: 10,
            durationSec: null,
            distanceM: null,
          },
        ],
      },
    ]);
    const after = await repoA.getRoutineDetail(routine.id);
    expect(after?.exercises[0].sets[0].targetWeightKg).toBe(65);
    // Rep-range sets are never auto-updated.
    expect(after?.exercises[0].sets[1].targetWeightKg).toBeNull();

    const copy = await repoA.duplicateRoutine(routine.id);
    expect(copy.name).toBe("Push A (copy)");
    expect(
      (await repoA.getRoutineDetail(copy.id))?.exercises[0].sets,
    ).toHaveLength(2);

    await repoA.updateRoutine(routine.id, {
      name: "Push A2",
      folderId: null,
      exercises: [],
    });
    const replaced = await repoA.getRoutineDetail(routine.id);
    expect(replaced?.routine.name).toBe("Push A2");
    expect(replaced?.exercises).toEqual([]);

    await repoA.deleteRoutineFolder(folder.id);
    expect(
      (await repoA.listRoutines()).find((r) => r.id === copy.id)?.folderId,
    ).toBeNull();
    await repoA.deleteRoutine(copy.id);
    expect((await repoA.listRoutines()).map((r) => r.id)).not.toContain(
      copy.id,
    );
  });

  it("prefs, favorites, programs, measurements and push subscriptions upsert one row", async () => {
    const c = await makeUser();
    expect(await c.repo.getUserPrefs()).toBeNull();
    await c.repo.updateUserPrefs({
      bodyDiagram: "female",
      displayName: "Frog",
    });
    await c.repo.updateUserPrefs({ displayName: null });
    const prefs = await c.repo.getUserPrefs();
    expect(prefs).toMatchObject({
      bodyDiagram: "female",
      displayName: null,
      includeWarmupsInStats: true,
    });

    const squatId = "00000000-0000-4000-8000-000000000001";
    await c.repo.setExerciseFavorite(squatId, true);
    await c.repo.setExerciseFavorite(squatId, false);
    const favs = await c.repo.listExerciseFavorites();
    expect(favs).toHaveLength(1);
    expect(favs[0].favorite).toBe(false);
    await c.repo.setExerciseWeightUnit(squatId, "lb");
    await c.repo.setGeneratorExcluded(squatId, true);
    expect(await c.repo.listExercisePrefs()).toMatchObject([
      { exerciseId: squatId, weightUnit: "lb", generatorExcluded: true },
    ]);

    const folder = await c.repo.createRoutineFolder("Program");
    const p1 = await c.repo.createProgram({
      source: "generated",
      folderId: folder.id,
    });
    const p2 = await c.repo.createProgram({
      source: "library",
      folderId: folder.id,
    });
    expect((await c.repo.activeProgram())?.id).toBe(p2.id);
    expect(
      (await c.repo.listPrograms()).find((p) => p.id === p1.id)?.active,
    ).toBe(false);

    const m1 = await c.repo.upsertMeasurement("2026-01-01", {
      bodyweightKg: 80,
    });
    const m2 = await c.repo.upsertMeasurement("2026-01-01", { waistCm: 85 });
    expect(m2.id).toBe(m1.id);
    expect(m2.bodyweightKg).toBe(80);
    expect(await c.repo.latestBodyweightKg()).toBe(80);
    expect(await c.repo.latestBodyweightKg("2025-12-31")).toBeNull();

    // Endpoints are globally unique (one browser = one endpoint), so a
    // fixed URL would collide with an earlier run's identity.
    const endpoint = `https://push.example/${newId()}`;
    await c.repo.savePushSubscription(endpoint, {
      p256dh: "a",
      auth: "b",
    });
    await c.repo.savePushSubscription(endpoint, {
      p256dh: "c",
      auth: "d",
    });
    const subs = await c.repo.listPushSubscriptions();
    expect(subs).toHaveLength(1);
    expect(subs[0].keys).toEqual({ p256dh: "c", auth: "d" });
    await c.repo.deletePushSubscription(endpoint);
    expect(await c.repo.listPushSubscriptions()).toEqual([]);
  });

  it("session photos: upload, list, url, delete", async () => {
    const s = await repoA.startSession();
    const pixel = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    const row = await repoA.uploadSessionPhoto(s.id, pixel, 0);
    expect((await repoA.listSessionMedia(s.id)).map((m) => m.id)).toEqual([
      row.id,
    ]);
    expect(await repoA.sessionMediaUrl(row)).toMatch(/^https?:\/\//);
    expect((await repoA.listAllSessionMedia(5))[0]?.id).toBe(row.id);
    await repoA.deleteSessionMedia(row.id);
    expect(await repoA.listSessionMedia(s.id)).toEqual([]);
  });

  it("token API: read-only bearer access to the owner's data", async () => {
    const s = await repoA.startSession("API session");
    const { token, row } = await repoA.createApiToken("itest");
    expect(token.startsWith("frog_")).toBe(true);
    expect(row.tokenHash).not.toContain(token);
    const get = (path: string, t = token) =>
      fetch(`${SITE_URL}/api${path}`, {
        headers: { authorization: `Bearer ${t}` },
      });

    const sessions = (await (await get("/v1/sessions")).json()) as {
      sessions: Row[];
    };
    expect(sessions.sessions.map((x) => x.id)).toContain(s.id);
    expect(sessions.sessions[0]).toHaveProperty("started_at");

    const exp = (await (await get("/v1/export")).json()) as Row;
    expect(exp.schema_version).toBe(1);
    expect((exp.sessions as Row[]).every((x) => x.owner_id === a.sub)).toBe(
      true,
    );

    expect((await get("/v1/sessions", "frog_nope")).status).toBe(401);
    expect(
      (
        await fetch(`${SITE_URL}/api/v1/sessions`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(405);

    await repoA.revokeApiToken(row.id);
    expect((await get("/v1/sessions")).status).toBe(401);
    expect(
      (await repoA.listApiTokens()).find((t) => t.id === row.id)?.revokedAt,
    ).not.toBeNull();
  });
});
