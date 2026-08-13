import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, rowCount, signIn, waitForExercise } from "./helpers";

// Radix Select shows option labels, not values (and @frog/core isn't resolvable
// from e2e/), so map the exercise-type values this spec uses to their labels.
const TYPE_LABEL: Record<string, string> = {
  duration: "Duration",
  weighted_bodyweight: "Weighted bodyweight",
};

// M1 exercise types: per-type logging fields. A duration exercise logs time
// (typed as m:ss) with an inline stopwatch (`set-timer`); a weighted-
// bodyweight exercise's weight-field carries a "+kg"/"+lb" unit suffix and
// honours a per-exercise unit override, now set via the exercise ⋯ menu
// (session.tsx's ExerciseSettingsMenu — block-${name}-menu ->
// block-${name}-unit-kg/lb/default) rather than a clickable header.

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

  // Duration field (not weight/reps) with an inline stopwatch toggle.
  await expect(page.getByTestId("duration-field")).toBeVisible();
  await expect(page.getByTestId("set-timer")).toBeVisible();
  await expect(page.getByTestId("weight-field")).toHaveCount(0);

  await page.getByTestId("duration-field").fill("1:30");
  await page.getByTestId("log-set").click();

  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  // Wait for the background insert to land before reloading (a reload aborts
  // any in-flight request).
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // Persists as seconds and re-renders as m:ss after a reload.
  await page.reload();
  await page.getByTestId("set-mark-0").click();
  await expect(page.getByTestId("duration-field")).toHaveValue("1:30");
});

test("weighted-bodyweight exercise carries a +weight unit suffix and honours a per-exercise unit override", async ({
  page,
}) => {
  const EX = `WPullup ${Date.now()}`;
  await createTyped(page, EX, "weighted_bodyweight");

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  const weightRow = page.getByTestId("weight-field").locator("..");
  await expect(weightRow).toContainText("+");
  await expect(page.getByTestId("reps-field")).toBeVisible();

  // Override this exercise to kg via the exercise ⋯ menu → suffix reads +kg
  // regardless of the global display unit.
  await page.getByTestId(`block-${EX}-menu`).click();
  await page.getByTestId(`block-${EX}-unit-kg`).click();
  await expect(weightRow).toContainText("+kg");
  await expect(page.getByTestId(`block-${EX}-unit-clear`)).toBeVisible();

  // A logged set survives with the override in place.
  await page.getByTestId("weight-field").fill("20");
  await page.getByTestId("reps-field").fill("6");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  await page.getByTestId("set-mark-0").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("20");
});
