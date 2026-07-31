import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// B1: tierNameClass(null) used to alias the tier-S ("Best") brightness class,
// so every untiered exercise — 862 of 882 seed rows, and every hand-added
// custom exercise — rendered as if it were the app's top-rated pick for its
// muscle. A freshly created custom exercise (no muscleTargets) is the
// simplest real repro.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("an untiered custom exercise does not render at tier-S brightness", async ({
  page,
}) => {
  const NAME = `UntieredEx ${Date.now()}`;
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(NAME);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, NAME);

  const nameEl = page
    .getByTestId(`exercise-row-toggle-${NAME}`)
    .locator("span")
    .first();
  await expect(nameEl).toBeVisible();
  const className = (await nameEl.getAttribute("class")) ?? "";
  // text-ink-2 legitimately contains "text-ink" as a substring — match the
  // whole class token, not the tier-S class as a prefix of a different one.
  expect(className.split(/\s+/)).not.toContain("text-ink");
});
