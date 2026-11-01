import { expect, type Page, test } from "@playwright/test";
import { loadOrCreateTestAuth } from "../scripts/convex-test-auth";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  signInAs,
  waitForExercise,
} from "./helpers";

// Community sharing (frog-community-direction phase 1,
// docs/DECISIONS.md 2026-08-08): publishing a custom exercise makes it a
// global row (owner_id null + created_by), visible to every other account;
// shared rows are frozen (fork-on-edit instead of edit); duplicates warn
// client-side and the publish mutation's backstop returns the canonical row.

/** A second throwaway identity, minted with the same local test key
 * run-e2e.ts used for the first (E2E_TEST_KEY). Its `e2e-` sub is swept by
 * scripts/e2e-cleanup.ts. */
async function makeSecondUser(): Promise<{ email: string; token: string }> {
  const keyPath = process.env.E2E_TEST_KEY;
  if (!keyPath) throw new Error("E2E_TEST_KEY unset — run via `bun run e2e`");
  const auth = await loadOrCreateTestAuth(keyPath);
  const sub = `e2e-community-${Date.now()}`;
  return { email: `${sub}@frog.test`, token: await auth.mint(sub) };
}

/** Signs the bridge out and into another identity — the app sources its
 * token from the bridge, so the UI follows. */
async function switchUser(page: Page, email: string, token: string) {
  await page.evaluate(() => window.__frog.signOut());
  await signInAs(page, token, email);
  // Re-mount auth state in the app (landing on /auth signed-in bounces
  // straight back to /).
  await page.goto("/auth");
}

async function currentUserId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { data, error } = await window.__frog.db.auth.getUser();
    if (error) throw new Error(String(error));
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
        const { data, error } = await window.__frog.db
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
  await switchUser(page, second.email, second.token);
  await page.goto("/library");

  // Global (owner_id null) rows are readable by every signed-in user.
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
        const { data, error } = await window.__frog.db
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
        const { count, error } = await window.__frog.db
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
