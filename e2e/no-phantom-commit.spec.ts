import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, rowCount, signIn, waitForExercise } from "./helpers";

// Regression for the phantom auto-commit bug: filling weight+reps then simply
// tapping/tabbing away (no Enter, no checkmark, no "Add set") must NOT commit
// a set. Only an explicit action commits — the checkmark being one of them.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("filling weight+reps then tapping away does not commit a set", async ({
  page,
}) => {
  const EX = `Phantom ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");

  // Tap away from the row entirely — not Enter, not the checkmark, not
  // "Add set" — just focus leaving the row, e.g. tapping the page header.
  await page.getByRole("heading", { level: 1 }).click();

  // The draft must still be sitting at index 0 with the typed values —
  // if it phantom-committed, this row would have remounted as index 1 with
  // fresh empty state, and this assertion times out (bug repro).
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("set-0-reps")).toHaveValue("5");
  await expect(page.getByTestId("committed-0")).not.toBeVisible();

  // No background insert should have fired either.
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("the checkmark commits the filled draft row", async ({ page }) => {
  const EX = `Check ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");

  // No Enter, no "Add set" — the checkmark alone must commit.
  await page.getByTestId("set-0-done").click();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // The committed row renders and the next active row appears.
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("set-1-weight")).toBeVisible();
});
