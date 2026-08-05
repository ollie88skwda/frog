import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Auto-checkoff: once both weight AND reps carry a value, leaving the row
// commits the set (no separate checkmark tap needed) — the phantom-commit
// guard now only protects an INCOMPLETE row (weight typed, reps still
// empty) from silently committing on blur.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("filling only weight then tapping away does not commit a set", async ({
  page,
}) => {
  const EX = `Phantom ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");

  // Tap away from the row entirely — not Enter, not the checkmark, not
  // "Add set" — just focus leaving the row, e.g. tapping the page header.
  await page.getByRole("heading", { level: 1 }).click();

  // Reps was never filled, so the draft must still be sitting at index 0 —
  // if it phantom-committed, this row would have remounted as index 1 with
  // fresh empty state, and this assertion times out (bug repro).
  await expect(page.getByTestId("set-0-weight")).toHaveValue("100");
  await expect(page.getByTestId("committed-0")).not.toBeVisible();

  // No background insert should have fired either.
  expect(await rowCount(page, "set_logs")).toBe(before);
});

test("filling weight+reps then tapping away auto-checks off the set", async ({
  page,
}) => {
  const EX = `Checkoff ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");

  // No Enter, no checkmark, no "Add set" — leaving the row with both fields
  // filled is enough to check the set off.
  await page.getByRole("heading", { level: 1 }).click();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("set-1-weight")).toBeVisible();
});

test("the checkmark commits the filled draft row", async ({ page }) => {
  const EX = `Check ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
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

test("tapping the checkmark on a touch device commits exactly one set", async ({
  page,
}) => {
  // Regression: on a real touch device, tapping the checkmark while the reps
  // field still holds focus fires touchstart-driven blur (auto-checkoff)
  // *and* the button's click — a mousedown-preventDefault guard stops this on
  // desktop mice, but touch doesn't route through mousedown the same way, so
  // both `commit()` calls could land as two separate rows without the fix.
  const EX = `Tap ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").tap();

  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);
  await expect(page.getByTestId("committed-0")).toBeVisible();
  await expect(page.getByTestId("committed-1")).not.toBeVisible();
  await expect(page.getByTestId("set-1-weight")).toBeVisible();
});
