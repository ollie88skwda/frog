import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  pullUpLogger,
  signIn,
  waitForExercise,
  waitForSetLogs,
} from "./helpers";

// Note 19 (library org redesign): the default library is a search-first flat
// list — Recent band → Favorites band → alphabetical remainder — with a
// two-level region → muscle filter, an equipment filter, and a "Yours"
// toggle. Muscle-grouped sections survive only inside a chosen muscle.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("default library is flat: search finds rows, no muscle sections", async ({
  page,
}) => {
  await page.goto("/library");
  // Search-first: typing narrows the flat list.
  await page.getByTestId("exercise-search-input").fill("Pushups");
  await expect(page.getByTestId("exercise-row-Pushups")).toBeVisible();
  // Deep-alphabet seed row is reachable through search too.
  await page.getByTestId("exercise-search-input").fill("Zottman");
  await expect(page.getByTestId("exercise-row-Zottman Curl")).toBeVisible();
  // No muscle sections in the default view — they exist only after a muscle
  // filter is picked (covered by machines.spec).
  await expect(page.getByTestId("muscle-group-quads")).not.toBeVisible();
});

test("region → muscle drill-down narrows the muscle options", async ({
  page,
}) => {
  await page.goto("/library");
  // Region filter: Legs narrows the muscle select to legs muscles.
  await page.getByTestId("exercise-region-select").click();
  await page.getByRole("option", { name: "Legs", exact: true }).click();
  await page.getByTestId("exercise-filter-select").click();
  // A legs muscle is offered; a chest muscle is not.
  await expect(
    page.getByRole("option", { name: "Quads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Pecs", exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
});

test("equipment filter narrows the flat list", async ({ page }) => {
  await page.goto("/library");
  await page.getByTestId("exercise-equipment-select").click();
  await page.getByRole("option", { name: "Barbell", exact: true }).click();
  // A barbell exercise is listed; a bodyweight exercise is filtered out.
  await expect(
    page.getByTestId("exercise-row-Barbell Bench Press - Medium Grip"),
  ).toBeVisible();
  await expect(page.getByTestId("exercise-row-Pushups")).not.toBeVisible();
});

test("'Yours' toggle shows only custom exercises", async ({ page }) => {
  const NAME = `Mine ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, NAME);
  await waitForExercise(page, NAME);
  await page.getByTestId("library-filter-yours").click();
  await expect(page.getByTestId(`exercise-row-${NAME}`)).toBeVisible();
  // A seed exercise is hidden behind the toggle.
  await expect(page.getByTestId("exercise-row-Pushups")).not.toBeVisible();
});

test("recently logged exercises surface in the Recent band", async ({
  page,
}) => {
  const EX = `Recent ${Date.now()}`;
  await page.goto("/library");
  await createExercise(page, EX);
  await waitForExercise(page, EX);

  // Log one set so the exercise appears in the 30-day window.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await pullUpLogger(page);
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-reps").press("Enter");
  await waitForSetLogs(page, EX, 1);

  await page.goto("/library");
  await expect(page.getByTestId("library-band-recent")).toBeVisible();
  await expect(
    page
      .locator('[data-testid="library-band-recent"]')
      .getByTestId(`exercise-row-${EX}`),
  ).toBeVisible();
});
