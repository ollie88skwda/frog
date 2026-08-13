import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// Stats band (testid-contract.md "Stats" + behavioural clause #6):
// stats-growth-toggle expands stats-growth-chart (absent when collapsed),
// and the expanded/collapsed state persists for the rest of the session.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("stats-growth-chart is absent until the toggle is tapped, then shows bars", async ({
  page,
}) => {
  const EX = await makeExercise(page, "StatsToggle");
  await startSessionWith(page, EX);

  await expect(page.getByTestId("stats-line")).toBeVisible();
  await expect(page.getByTestId("stats-growth-chart")).toHaveCount(0);

  // The chart falls back to "Not enough history yet." (no bars at all) until
  // there's at least a live top weight to show as today's bar — log a set first.
  await logBilateralSet(page, "60", "10");
  await page.getByTestId("stats-growth-toggle").click();
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();
  await expect(page.getByTestId("stats-growth-bar-0")).toBeVisible();

  await page.getByTestId("stats-growth-toggle").click();
  await expect(page.getByTestId("stats-growth-chart")).toHaveCount(0);
});

test("the expanded state survives logging further sets in the session", async ({
  page,
}) => {
  const EX = await makeExercise(page, "StatsPersistSets");
  await startSessionWith(page, EX);

  await page.getByTestId("stats-growth-toggle").click();
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();

  await logBilateralSet(page, "60", "10");
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();

  await logBilateralSet(page, "60", "9");
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();
});

test("the expanded state survives switching to another exercise in the same session", async ({
  page,
}) => {
  const A = await makeExercise(page, "StatsPersistSwitchA");
  const B = await makeExercise(page, "StatsPersistSwitchB");
  await startSessionWith(page, A);

  await page.getByTestId("stats-growth-toggle").click();
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();

  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(B);
  await expect(page.getByTestId("stats-growth-chart")).toBeVisible();
});
