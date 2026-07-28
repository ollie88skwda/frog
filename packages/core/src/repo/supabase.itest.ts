import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { SEED_CONDITIONS } from "../db/seed-ids";
import { newId } from "../domain/ids";
import type { ImportedSession } from "../import/types";
import { SupabaseRepo } from "./supabase";

function localStatus(): { url: string; anonKey: string; serviceKey: string } {
  // vitest runs with cwd = packages/core; the supabase project is at the repo root
  const out = execSync("supabase status -o json", {
    cwd: "../..",
    encoding: "utf8",
  });
  // The CLI may print warnings (e.g. "Stopped services: ...") before the JSON.
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const url = json.API_URL ?? json.api_url;
  const anonKey = json.ANON_KEY ?? json.anon_key;
  const serviceKey = json.SERVICE_ROLE_KEY ?? json.service_role_key;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      `unexpected supabase status output: ${Object.keys(json).join(", ")}`,
    );
  }
  return { url, anonKey, serviceKey };
}

async function makeUser(url: string, anonKey: string, serviceKey: string) {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const email = `test-${newId()}@example.com`;
  const password = "integration-test-password";
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw new Error(signInError.message);
  return client;
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

describe("SupabaseRepo (integration, local supabase)", () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let repoA: SupabaseRepo;
  let repoB: SupabaseRepo;

  beforeAll(async () => {
    const { url, anonKey, serviceKey } = localStatus();
    clientA = await makeUser(url, anonKey, serviceKey);
    clientB = await makeUser(url, anonKey, serviceKey);
    repoA = new SupabaseRepo(clientA);
    repoB = new SupabaseRepo(clientB);
  });

  it("creates and lists exercises", async () => {
    const name = `Bench Press ${newId().slice(0, 8)}`;
    const created = await repoA.createExercise(name);
    expect(created.name).toBe(name);
    expect(created.isCustom).toBe(true);
    expect(created.ownerId).not.toBeNull();

    const listed = await repoA.listExercises();
    expect(listed.map((e) => e.id)).toContain(created.id);
  });

  it("starts a session and logs ordered sets", async () => {
    const ex = await repoA.createExercise(`Squat ${newId().slice(0, 8)}`);
    const session = await repoA.startSession();
    expect(session.startedAt).toBeGreaterThan(0);

    const se = await repoA.addExerciseToSession(session.id, ex.id);
    await repoA.logSet(se, { weightKg: 100, reps: 5 });
    await repoA.logSet(se, { weightKg: 102.5, reps: 3, rir: 1 });

    const { data } = await clientA
      .from("set_logs")
      .select("set_no, weight_kg, reps, rir")
      .eq("session_exercise_id", se)
      .order("set_no");
    expect(data).toEqual([
      { set_no: 0, weight_kg: 100, reps: 5, rir: null },
      { set_no: 1, weight_kg: 102.5, reps: 3, rir: 1 },
    ]);
  });

  it("ghost-prefills from the most recent prior session", async () => {
    const ex = await repoA.createExercise(`Deadlift ${newId().slice(0, 8)}`);

    // no history yet
    expect(await repoA.lastSetsForExercise(ex.id)).toEqual([]);

    const s1 = await repoA.startSession();
    const se1 = await repoA.addExerciseToSession(s1.id, ex.id);
    await repoA.logSet(se1, { weightKg: 140, reps: 5 });
    await repoA.logSet(se1, { weightKg: 150, reps: 3 });

    const s2 = await repoA.startSession();
    const se2 = await repoA.addExerciseToSession(s2.id, ex.id);

    // excluding the just-created (empty) session-exercise returns s1's sets in order
    const ghost = await repoA.lastSetsForExercise(ex.id, se2);
    expect(ghost).toEqual([
      { weightKg: 140, reps: 5, durationSec: null, distanceM: null },
      { weightKg: 150, reps: 3, durationSec: null, distanceM: null },
    ]);
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

    const first = await repoA.importSessions(sessions);
    expect(first).toEqual({
      imported: 3,
      skipped: 0,
      sets: 6,
      exercisesCreated: 1,
    });

    // Re-import: everything skipped, nothing duplicated.
    const second = await repoA.importSessions(sessions);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(3);

    // Sleep applies by local date, fills only sessions lacking a value.
    const d0 = new Date(base);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Pre-set a sleep value on session 0 — applySleep must not overwrite it.
    const { data: s0 } = await clientA
      .from("sessions")
      .select("id")
      .eq("started_at", base)
      .single();
    await repoA.updateSessionConditions(s0?.id as string, {
      [SEED_CONDITIONS.sleepH]: 9,
    });

    const map = new Map<string, number>([
      [iso(d0), 6.5],
      [iso(new Date(base + day)), 7.5],
    ]);
    const filled = await repoA.applySleep(map);
    expect(filled).toBe(1); // only session 1 (session 0 already had a value)

    const { data: after } = await clientA
      .from("sessions")
      .select("started_at, condition_values")
      .in("started_at", [base, base + day]);
    const byStart = new Map(
      (after ?? []).map((r) => [r.started_at, r.condition_values]),
    );
    expect(byStart.get(base)?.[SEED_CONDITIONS.sleepH]).toBe(9);
    expect(byStart.get(base + day)?.[SEED_CONDITIONS.sleepH]).toBe(7.5);
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
    const listed = await repoA.listMachines();
    const updated = listed.find((m) => m.id === machine.id);
    expect(updated?.settings).toEqual([{ label: "Seat height", value: 5 }]);
    expect(updated?.notes).toBe("lean forward");

    const ex = await repoA.createExercise(
      `Machine Row ${newId().slice(0, 8)}`,
      {
        machineId: machine.id,
        jointActions: ["shoulder-extension", "elbow-flexion"],
        muscleTargets: [{ muscle: "lats", tier: "A" }],
      },
    );
    expect(ex.machineId).toBe(machine.id);
    expect(ex.jointActions).toEqual(["shoulder-extension", "elbow-flexion"]);
    expect(ex.muscleTargets).toEqual([{ muscle: "lats", tier: "A" }]);

    await repoA.deleteMachine(machine.id);
    expect((await repoA.listMachines()).map((m) => m.id)).not.toContain(
      machine.id,
    );
    const after = (await repoA.listExercises()).find((e) => e.id === ex.id);
    expect(after?.machineId).toBeNull();
  });

  it("machines: RLS isolates users; seed classifications are visible", async () => {
    const machine = await repoA.createMachine({ name: "A's Leg Press" });
    const bMachines = await repoB.listMachines();
    expect(bMachines.map((m) => m.id)).not.toContain(machine.id);

    // The curated seeds carry classifications from the migration… (the bulk
    // free-exercise-db rows are unclassified — a few of them target muscles
    // outside the SBL taxonomy, e.g. neck, so they have no muscle targets.)
    const seeds = (await repoB.listExercises()).filter((e) => !e.isCustom);
    expect(seeds.length).toBeGreaterThan(0);
    // …except the neck-only rows: free-exercise-db's "neck" muscle has no SBL
    // key (scripts/import-free-exercise-db.ts drops it). Pinned by name so a
    // seed that silently loses its targets still fails here.
    expect(
      seeds
        .filter((e) => !e.muscleTargets?.length)
        .map((e) => e.name)
        .sort(),
    ).toEqual(NECK_ONLY_SEEDS);
    // …and stay read-only for clients.
    const squat = seeds.find((e) => e.name === "Squat");
    const { data: updatedRows } = await clientB
      .from("exercises")
      .update({ muscle_targets: [{ muscle: "abs", tier: "S" }] })
      .eq("id", squat?.id as string)
      .select();
    expect(updatedRows ?? []).toHaveLength(0);
  });

  it("machine photos: owner can upload, others cannot read", async () => {
    const machine = await repoA.createMachine({ name: "Photo Machine" });
    const pixel = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await repoA.uploadMachinePhoto(machine.id, pixel);

    const updated = (await repoA.listMachines()).find(
      (m) => m.id === machine.id,
    );
    expect(updated?.photoPath).toContain(machine.id);

    const url = await repoA.machinePhotoUrl(updated ?? machine);
    expect(url).toContain("machine-photos");

    // Another user cannot sign a URL for A's object path.
    const { data: crossSign } = await clientB.storage
      .from("machine-photos")
      .createSignedUrl(updated?.photoPath as string, 60);
    expect(crossSign?.signedUrl ?? null).toBeNull();
  });

  it("RLS: users cannot see or write each other's data", async () => {
    const exA = await repoA.createExercise(
      `Private Curl ${newId().slice(0, 8)}`,
    );
    const sessionA = await repoA.startSession("A's session");

    const bExercises = await repoB.listExercises();
    expect(bExercises.map((e) => e.id)).not.toContain(exA.id);

    const { data: bSessions } = await clientB.from("sessions").select("id");
    expect((bSessions ?? []).map((s) => s.id)).not.toContain(sessionA.id);

    // spoofing another user's owner_id must be rejected by RLS with-check
    const { data: aUser } = await clientA.auth.getUser();
    const now = Date.now();
    const { error } = await clientB.from("sessions").insert({
      id: newId(),
      created_at: now,
      updated_at: now,
      started_at: now,
      owner_id: aUser.user?.id,
    });
    expect(error).not.toBeNull();
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

  it("custom conditions carry type + unit", async () => {
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
  });

  it("tracked conditions: empty for a fresh user, upserts one row per metric", async () => {
    const metric = await repoA.createMetric({
      name: `Soreness ${newId().slice(0, 8)}`,
      type: "scale",
      scope: "session",
    });

    // A fresh user has no explicit tracked rows (defaults live in app code).
    const before = await repoA.listTrackedConditions();
    expect(before.some((t) => t.metricId === metric.id)).toBe(false);

    await repoA.setConditionTracked(metric.id, true);
    let mine = (await repoA.listTrackedConditions()).filter(
      (t) => t.metricId === metric.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].tracked).toBe(true);

    // Upsert: flipping to hidden updates the same row, never duplicates it.
    await repoA.setConditionTracked(metric.id, false);
    mine = (await repoA.listTrackedConditions()).filter(
      (t) => t.metricId === metric.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].tracked).toBe(false);

    // RLS: user B never sees A's tracked rows.
    const bRows = await repoB.listTrackedConditions();
    expect(bRows.some((t) => t.metricId === metric.id)).toBe(false);
  });
});
