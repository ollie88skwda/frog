import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "../domain/ids";
import { SupabaseRepo } from "./supabase";

function localStatus(): { url: string; anonKey: string; serviceKey: string } {
  // vitest runs with cwd = packages/core; the supabase project is at the repo root
  const out = execSync("supabase status -o json", {
    cwd: "../..",
    encoding: "utf8",
  });
  const json = JSON.parse(out);
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
      { weightKg: 140, reps: 5 },
      { weightKg: 150, reps: 3 },
    ]);
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
});
