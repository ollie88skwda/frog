import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// Set-type menu (testid-contract.md "The spotlight input" + behavioural
// clause #7): the ⋯ menu offers exactly warm-up / per-side / delete — no
// superset or drop-set control exists anywhere in the session UI.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("warm-up marks the current set and shows on its mark once logged", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MenuWarmup");
  await startSessionWith(page, EX);

  await page.getByTestId("set-type-menu").click();
  await page.getByTestId("set-type-warmup").click();
  await logBilateralSet(page, "40", "12");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "warmup",
  );
});

test("per-side splits the current set's reps by side", async ({ page }) => {
  const EX = await makeExercise(page, "MenuPerSide");
  await startSessionWith(page, EX);

  await page.getByTestId("set-type-menu").click();
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("reps-field-left")).toBeVisible();
  await expect(page.getByTestId("reps-field-right")).toBeVisible();
});

test("delete removes the current set", async ({ page }) => {
  const EX = await makeExercise(page, "MenuDelete");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "50", "8");
  await logBilateralSet(page, "55", "6"); // set 1 now open

  // Reopen set 0 and delete it.
  await page.getByTestId("set-mark-0").click();
  await page.getByTestId("set-type-menu").click();
  await page.getByTestId("set-type-delete").click();

  const rows = await page.evaluate(async () => {
    const sb = window.__frog.supabase;
    const { data, error } = await sb
      .from("set_logs")
      .select("id")
      .eq("weight_kg", 50);
    if (error) throw new Error(error.message);
    return data;
  });
  expect(rows).toHaveLength(0);
});

test("the set-type menu offers no superset or drop-set control", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MenuNoSuperset");
  await startSessionWith(page, EX);

  await page.getByTestId("set-type-menu").click();
  await expect(page.getByTestId("set-type-warmup")).toBeVisible();
  await expect(page.getByTestId("set-type-perside")).toBeVisible();
  await expect(page.getByTestId("set-type-delete")).toBeVisible();

  await expect(page.getByText(/superset/i)).toHaveCount(0);
  await expect(page.getByText(/drop set/i)).toHaveCount(0);
});

test("no superset or drop-set control exists anywhere in the session screen", async ({
  page,
}) => {
  const A = await makeExercise(page, "NoSupersetGlobalA");
  const B = await makeExercise(page, "NoSupersetGlobalB");
  await startSessionWith(page, A);
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();

  // Sweep every visible affordance on the session screen for superset/drop
  // wording, not just the set-type menu — the old exercise-level ⋯ menu is
  // the other place this used to live.
  await expect(page.getByText(/superset/i)).toHaveCount(0);
  await expect(page.getByText(/drop set/i)).toHaveCount(0);
});
