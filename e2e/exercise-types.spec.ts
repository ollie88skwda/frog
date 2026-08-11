import { expect, test } from "@playwright/test";
import {
  EMAIL,
  PASSWORD,
  pullUpLogger,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Radix Select shows option labels, not values (and @frog/core isn't resolvable
// from e2e/), so map the exercise-type values this spec uses to their labels.
const TYPE_LABEL: Record<string, string> = {
  duration: "Duration",
  weighted_bodyweight: "Weighted bodyweight",
};

// M1 exercise types: per-type logging columns. A duration exercise logs time
// (typed as m:ss) with an inline stopwatch; a weighted-bodyweight exercise
// shows a "+weight" column header and honours a per-exercise unit override.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function createTyped(
  page: import("@playwright/test").Page,
  name: string,
  type: string,
) {
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  // Radix Select: open the trigger, click the option by its exact label.
  await page.getByTestId("exercise-type-select").click();
  await page
    .getByRole("option", { name: TYPE_LABEL[type] ?? type, exact: true })
    .click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
}

test("duration exercise logs a typed m:ss time and shows the inline timer", async ({
  page,
}) => {
  const EX = `Plank ${Date.now()}`;
  await createTyped(page, EX, "duration");
  const before = await rowCount(page, "set_logs");

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Duration column (not weight/reps) with a stopwatch control.
  await pullUpLogger(page);
  await expect(page.getByTestId("set-0-duration")).toBeVisible();
  await expect(page.getByTestId("set-0-timer")).toBeVisible();
  await expect(page.getByTestId("set-0-weight")).toBeHidden();

  await page.getByTestId("set-0-duration").fill("1:30");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId("committed-0-duration")).toHaveText("1:30");

  // Wait for the background insert to land before reloading (a reload aborts
  // any in-flight request).
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // Persists as seconds and re-renders as m:ss after a reload.
  await page.reload();
  await expect(page.getByTestId("committed-0-duration")).toHaveText("1:30");
});

test("weighted-bodyweight exercise shows a +weight header and per-exercise unit override", async ({
  page,
}) => {
  const EX = `WPullup ${Date.now()}`;
  await createTyped(page, EX, "weighted_bodyweight");

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Added-weight label on the logger's weight field carries the "+" prefix;
  // the reps field is present.
  await pullUpLogger(page);
  const unitLabel = page.getByTestId("set-0-weight-unit");
  await expect(unitLabel).toContainText("+");
  await expect(page.getByTestId("set-0-reps")).toBeVisible();

  // Override this exercise to kg (ledger section ⋯ → Weight unit) → the
  // logger's label reads +kg regardless of the global unit.
  await page.getByTestId(`block-${EX}-menu`).click();
  await page.getByTestId(`block-${EX}-unit-kg`).click();
  await expect(unitLabel).toContainText("+kg");

  // A logged set survives with the override in place.
  await page.getByTestId("set-0-weight").fill("20");
  await page.getByTestId("set-0-reps").fill("6");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0-weight")).toHaveText("20");
});
