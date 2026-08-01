import { expect, test } from "@playwright/test";
import { createExercise, EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// B1: tierNameClass(null) used to alias the tier-S ("Best") brightness class,
// so every untiered exercise — 862 of 882 seed rows, and every hand-added
// custom exercise — rendered as if it were the app's top-rated pick for its
// muscle. A freshly created custom exercise (no muscleTargets) is the
// simplest real repro.
//
// Second repro, same fix: the first pass landed untiered on `text-faint`
// alone, which is byte-identical to tier C ("Weak") — "unrated" read as
// "rated poorly" instead of "not rated". Untiered now also carries `italic`,
// which no real tier ever does, so the two can't collide.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("an untiered custom exercise does not render at tier-S brightness", async ({
  page,
}) => {
  const NAME = `UntieredEx ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, NAME);
  await waitForExercise(page, NAME);

  const nameEl = page
    .getByTestId(`exercise-row-toggle-${NAME}`)
    .locator("span")
    .first();
  await expect(nameEl).toBeVisible();
  const className = (await nameEl.getAttribute("class")) ?? "";
  const tokens = className.split(/\s+/);
  // text-ink-2 legitimately contains "text-ink" as a substring — match the
  // whole class token, not the tier-S class as a prefix of a different one.
  expect(tokens).not.toContain("text-ink");
  // Distinguishes "unrated" from a genuine tier-C ("Weak") exercise, which
  // shares the same text-faint brightness but is never italic.
  expect(tokens).toContain("text-faint");
  expect(tokens).toContain("italic");
});
