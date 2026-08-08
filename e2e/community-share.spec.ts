import { execSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Community sharing (frog-community-direction phase 1,
// docs/DECISIONS.md 2026-08-08): publishing a custom exercise makes it a
// global row (owner_id null + created_by), visible to every other account;
// shared rows are RLS-immutable (fork-on-edit instead of edit); duplicates
// warn client-side and the publish RPC's backstop returns the canonical row.

// The second account needs the service role — local-only, same pattern as
// scripts/seed-e2e.ts (no service key exists for the hosted project).
function localSupabase() {
  const raw = execSync("supabase status -o json", { encoding: "utf8" });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  return {
    url: status.API_URL ?? status.api_url,
    anonKey: status.ANON_KEY ?? status.anon_key,
    serviceKey: status.SERVICE_ROLE_KEY ?? status.service_role_key,
  };
}

async function makeSecondUser(): Promise<{ email: string; password: string }> {
  const { url, serviceKey } = localSupabase();
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const email = `e2e-community-${Date.now()}@frog.test`;
  const password = "e2e-community-password-123";
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return { email, password };
}

/** Signs the bridge's supabase-js client out and into another account — the
 * app's own client sources its token from the bridge, so the UI follows. */
async function switchUser(page: Page, email: string, password: string) {
  await page.evaluate(
    async ({ email, password }) => {
      const bridge = window.__frog.supabase;
      await bridge.auth.signOut();
      const { error } = await bridge.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
    },
    { email, password },
  );
  // Re-mount auth state in the app (RequireAuth redirects through /auth on
  // sign-out; landing there signed-in bounces straight back to /).
  await page.goto("/auth");
}

async function currentUserId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { data, error } = await window.__frog.supabase.auth.getUser();
    if (error) throw new Error(error.message);
    return data.user.id;
  });
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a custom exercise publishes: owner_id null + created_by", async ({
  page,
}) => {
  const name = `Community Exercise ${Date.now()}`;
  const authorId = await currentUserId(page);

  await page.goto("/library");
  await createExercise(page, name);

  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { data, error } = await window.__frog.supabase
          .from("exercises")
          .select("owner_id, created_by, is_custom")
          .eq("name", n)
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        return data;
      }, name),
    )
    .toEqual([{ owner_id: null, created_by: authorId, is_custom: true }]);
});

test("a second account sees the published exercise", async ({ page }) => {
  const name = `Community Exercise ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);

  const second = await makeSecondUser();
  await switchUser(page, second.email, second.password);
  await page.goto("/library");

  // RLS admits owner_id null rows for every authenticated user.
  await page.getByTestId("exercise-search-input").fill(name);
  await expect(page.getByTestId(`exercise-row-${name}`)).toBeVisible();
});

test("shared rows are frozen: no Edit, private-copy fork, shared badge", async ({
  page,
}) => {
  const name = `Frozen Shared ${Date.now()}`;
  const authorId = await currentUserId(page);
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);

  // Library row: quiet "shared" badge, no Edit/Archive in the expanded panel
  // — a "Make a private copy" fork instead.
  await page.goto("/library");
  await page.getByTestId("exercise-search-input").fill(name);
  await expect(page.getByTestId(`exercise-row-${name}`)).toBeVisible();
  await expect(page.getByTestId(`shared-badge-${name}`)).toBeVisible();
  await page.getByTestId(`exercise-row-toggle-${name}`).click();
  await expect(page.getByTestId(`fork-exercise-${name}`)).toBeVisible();
  await expect(page.getByTestId(`edit-exercise-${name}`)).toHaveCount(0);

  // Detail screen: the ⋯ menu drops Edit for a shared row; the duplicate
  // action reads as the private-copy fork.
  await page.getByTestId(`open-exercise-${name}`).click();
  await page.getByTestId("exercise-more").click();
  await expect(page.getByTestId("exercise-edit")).toHaveCount(0);
  await expect(page.getByTestId("exercise-duplicate")).toContainText(
    "Make a private copy",
  );

  // Forking creates a private copy owned by the author (created_by null).
  await page.getByTestId("exercise-duplicate").click();
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { data, error } = await window.__frog.supabase
          .from("exercises")
          .select("owner_id, created_by")
          .eq("name", n)
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        return data;
      }, `${name} (copy)`),
    )
    .toEqual([{ owner_id: authorId, created_by: null }]);
});

test("duplicate names warn client-side; the server backstop returns the canonical row", async ({
  page,
}) => {
  const name = `Dupe Target ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);

  // Fresh load so the client list carries the published row, then re-enter
  // the same name: blurring warns "already in the shared library".
  await page.goto("/library");
  await page.getByTestId("exercise-search-input").fill(name);
  await expect(page.getByTestId(`exercise-row-${name}`)).toBeVisible();
  await page.getByTestId("new-exercise-btn").click();
  const input = page.getByTestId("exercise-name-input");
  await input.fill(name);
  await input.press("Tab");
  await expect(page.getByTestId("exercise-editor-duplicate")).toContainText(
    "shared library",
  );

  // Saving anyway still hits the publish RPC's case-insensitive backstop:
  // the canonical row is returned and no second row is created.
  await page.getByTestId("add-exercise-btn").click();
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const { count, error } = await window.__frog.supabase
          .from("exercises")
          .select("id", { count: "exact", head: true })
          .ilike("name", n)
          .is("deleted_at", null);
        if (error) throw new Error(error.message);
        return count ?? 0;
      }, name),
    )
    .toBe(1);
});
