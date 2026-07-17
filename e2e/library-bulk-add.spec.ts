import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// Bulk-add: dictate/paste many exercise names at once, defaults filled in,
// editable later. Tooling only — no real exercise names originate here.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("bulk add creates one exercise per unique pasted name", async ({
  page,
}) => {
  const ts = Date.now();
  const foo = `Bulk Foo ${ts}`;
  const bar = `Bulk Bar ${ts}`;

  await page.goto("/library");
  await page.getByTestId("bulk-add-exercises-trigger").click();

  // Case-insensitive duplicate within the paste + a blank line both drop out.
  await page
    .getByTestId("bulk-add-textarea")
    .fill(`${foo}\n${bar}\nbulk foo ${ts}\n\n`);
  await expect(page.getByTestId("bulk-add-submit")).toHaveText(
    "Add 2 exercises",
  );

  await page.getByTestId("bulk-add-submit").click();

  // Optimistic: both rows appear immediately, dialog closes.
  await expect(page.getByTestId("bulk-add-textarea")).toBeHidden();
  await expect(page.getByTestId(`exercise-row-${foo}`)).toBeVisible();
  await expect(page.getByTestId(`exercise-row-${bar}`)).toBeVisible();
  // Only one row for the Foo name — the lowercase repeat was deduped, not
  // created as a second exercise.
  await expect(page.getByTestId(`exercise-row-${foo}`)).toHaveCount(1);

  await waitForExercise(page, foo);
  await waitForExercise(page, bar);
});

test("bulk add warns on duplicates against the library without blocking", async ({
  page,
}) => {
  const ts = Date.now();
  const existing = `Bulk Dup ${ts}`;
  const fresh = `Bulk New ${ts}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(existing);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${existing}`)).toBeVisible();
  await waitForExercise(page, existing);

  await page.getByTestId("bulk-add-exercises-trigger").click();
  await page.getByTestId("bulk-add-textarea").fill(`${existing}\n${fresh}`);

  await expect(page.getByTestId("bulk-add-duplicate-warning")).toContainText(
    "1 name",
  );
  await expect(page.getByTestId("bulk-add-duplicate-warning")).toContainText(
    existing,
  );

  // Default: skip duplicates checked — only the fresh name is counted.
  await expect(page.getByTestId("bulk-add-skip-duplicates")).toBeChecked();
  await expect(page.getByTestId("bulk-add-submit")).toHaveText(
    "Add 1 exercise",
  );

  // Unchecking forces the duplicate back in — warning, not a block.
  await page.getByTestId("bulk-add-skip-duplicates").uncheck();
  await expect(page.getByTestId("bulk-add-submit")).toHaveText(
    "Add 2 exercises",
  );
  await expect(page.getByTestId("bulk-add-submit")).toBeEnabled();

  // Re-check to add only the new exercise, leaving no duplicate row behind.
  await page.getByTestId("bulk-add-skip-duplicates").check();
  await page.getByTestId("bulk-add-submit").click();

  await expect(page.getByTestId(`exercise-row-${fresh}`)).toBeVisible();
  await expect(page.getByTestId(`exercise-row-${existing}`)).toHaveCount(1);
  await waitForExercise(page, fresh);
});
