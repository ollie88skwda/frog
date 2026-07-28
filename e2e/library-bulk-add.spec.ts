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

test("bulk add bounds the insert fan-out and refetches the library once", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ts = Date.now();
  const names = Array.from(
    { length: 12 },
    (_, i) => `Bulk Wave ${i + 1} ${ts}`,
  );

  await page.goto("/library");
  await expect(page.getByTestId("bulk-add-exercises-trigger")).toBeVisible();

  let inFlight = 0;
  let peakInFlight = 0;
  let inserts = 0;
  let listFetches = 0;
  const isInsert = (r: { method(): string; url(): string }) =>
    r.method() === "POST" && r.url().includes("/rest/v1/exercises");
  page.on("request", (r) => {
    if (isInsert(r)) {
      inserts += 1;
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return;
    }
    // The library list query only — `order=name` excludes the per-name
    // existence probes `waitForExercise` runs.
    if (r.method() === "GET" && r.url().includes("order=name")) {
      listFetches += 1;
    }
  });
  const settled = (r: { method(): string; url(): string }) => {
    if (isInsert(r)) inFlight -= 1;
  };
  page.on("requestfinished", settled);
  page.on("requestfailed", settled);

  await page.getByTestId("bulk-add-exercises-trigger").click();
  await page.getByTestId("bulk-add-textarea").fill(names.join("\n"));
  await page.getByTestId("bulk-add-submit").click();

  for (const name of names) await waitForExercise(page, name);
  // Let the (single) coalesced invalidation refetch land before counting.
  await page.waitForTimeout(1500);

  expect(inserts).toBe(names.length);
  // Bounded worker pool: never the whole paste at once.
  expect(peakInFlight).toBeLessThanOrEqual(4);
  // Coalesced invalidation: the ~1 MB library is not re-downloaded per name.
  expect(listFetches).toBeLessThanOrEqual(2);
});

test("bulk add surfaces failed names and prefills them on reopen", async ({
  page,
}) => {
  // Every insert burns the mutation retry budget before it reports failure.
  test.setTimeout(60_000);
  const ts = Date.now();
  const names = Array.from({ length: 6 }, (_, i) => `Bulk Fail ${i + 1} ${ts}`);

  await page.goto("/library");
  await expect(page.getByTestId("bulk-add-exercises-trigger")).toBeVisible();
  await page.route("**/rest/v1/exercises*", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "e2e forced insert failure" }),
        })
      : route.continue(),
  );

  await page.getByTestId("bulk-add-exercises-trigger").click();
  await page.getByTestId("bulk-add-textarea").fill(names.join("\n"));
  await page.getByTestId("bulk-add-submit").click();

  // The dialog closes optimistically, so a partial failure has to be reported
  // after the fact rather than inside the dialog.
  const failures = page.getByTestId("bulk-add-failures");
  await expect(failures).toBeVisible({ timeout: 45_000 });
  await expect(failures).toContainText(`${names.length} names didn't save`);
  // Preview truncated at 5 so the notice can't become a wall of text.
  await expect(failures).toContainText("+1 more");
  // Optimistic rows rolled back — each create removes only its own row.
  await expect(page.getByTestId(`exercise-row-${names[0]}`)).toHaveCount(0);

  // Reopening is the retry path: the draft comes back with the FULL failed
  // list, not the truncated preview.
  await page.getByTestId("bulk-add-exercises-trigger").click();
  await expect(page.getByTestId("bulk-add-textarea")).toHaveValue(
    names.join("\n"),
  );
  await expect(page.getByTestId("bulk-add-submit")).toHaveText(
    `Add ${names.length} exercises`,
  );
});

test("bulk add clears its draft when the dialog is closed unsubmitted", async ({
  page,
}) => {
  await page.goto("/library");
  await page.getByTestId("bulk-add-exercises-trigger").click();
  await page.getByTestId("bulk-add-textarea").fill(`Bulk Draft ${Date.now()}`);
  await page.getByTestId("bulk-add-skip-duplicates").uncheck();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bulk-add-textarea")).toBeHidden();

  await page.getByTestId("bulk-add-exercises-trigger").click();
  await expect(page.getByTestId("bulk-add-textarea")).toHaveValue("");
  await expect(page.getByTestId("bulk-add-skip-duplicates")).toBeChecked();
});
