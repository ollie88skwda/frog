import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M11 program library: open a curated catalog program, save it, and confirm it
// lands as a folder of routines in /train plus an active `programs` row.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function count(page: Page, sql: () => Promise<number>): Promise<number> {
  return page.evaluate(sql);
}

test("save a catalog program creates a named folder + routines + program row", async ({
  page,
}) => {
  await page.goto("/programs");

  // Filter chips narrow the list.
  await page.getByTestId("filter-level-beginner").click();
  await expect(
    page.getByTestId("program-card-full-body-foundations"),
  ).toBeVisible();

  await page.getByTestId("program-card-full-body-foundations").click();
  await expect(page).toHaveURL(/\/programs\/full-body-foundations$/);

  // Save enables once the exercise library (and thus the preview) has loaded.
  const save = page.getByTestId("save-program-btn");
  await expect(save).toBeEnabled();
  await save.click();

  // Lands on the routines home with the program's folder.
  await expect(page).toHaveURL(/\/train$/);
  await expect(
    page.getByTestId("folder-Full Body Foundations").first(),
  ).toBeVisible();

  // Server-side: an active library program tied to a folder of routines.
  const programs = await count(page, async () => {
    const { count } = await window.__frog.supabase
      .from("programs")
      .select("id", { count: "exact", head: true })
      .eq("source", "library")
      .eq("active", true)
      .is("deleted_at", null);
    return count ?? 0;
  });
  expect(programs).toBeGreaterThan(0);

  const routines = await page.evaluate(async () => {
    const s = window.__frog.supabase;
    const f = await s
      .from("routine_folders")
      .select("id")
      .eq("name", "Full Body Foundations")
      .is("deleted_at", null)
      .limit(1);
    const folderId = f.data?.[0]?.id as string | undefined;
    if (!folderId) return 0;
    const { count } = await s
      .from("routines")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folderId)
      .is("deleted_at", null);
    return count ?? 0;
  });
  expect(routines).toBeGreaterThan(0);
});
