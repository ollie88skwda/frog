import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// M5 exercise detail: log an exercise across two sessions, then the detail
// screen (reached from the library) shows the Summary chart + records panel +
// set-records table and a per-session History breakdown; the ⋯ menu duplicates
// the exercise into a fresh, history-free copy.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
  // Display kg so typed weights map 1:1 to the canonical store (app defaults lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

async function logSet(page: Page, index: number, weight: string, reps: string) {
  await page.getByTestId(`set-${index}-weight`).fill(weight);
  await page.getByTestId(`set-${index}-reps`).fill(reps);
  await page.getByTestId(`set-${index}-add`).click();
  await expect(page.getByTestId(`committed-${index}-type`)).toBeVisible();
}

async function logSessionWith(
  page: Page,
  exercise: string,
  sets: [string, string][],
) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${exercise}`).click();
  for (let i = 0; i < sets.length; i++) {
    await logSet(page, i, sets[i][0], sets[i][1]);
  }
  // Finish → save the workout (opens the finish overlay, then confirms).
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page).not.toHaveURL(/\/session\//);
}

test("summary chart + records + set-records + history across two sessions", async ({
  page,
}) => {
  const EX = `Detail ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  // Session 1 seeds the baselines (no PRs); session 2 lifts heavier → PR.
  await logSessionWith(page, EX, [
    ["100", "5"],
    ["100", "8"],
  ]);
  await logSessionWith(page, EX, [
    ["120", "5"],
    ["120", "3"],
  ]);

  // Open the detail screen from the library entry point.
  await page.goto("/library");
  await page.getByTestId(`open-exercise-${EX}`).click();
  await expect(page).toHaveURL(/\/exercises\//);
  await expect(page.getByTestId("exercise-detail-name")).toHaveText(EX);

  // Summary: chart renders and the heaviest-weight record reflects the 120 lift.
  await expect(page.getByTestId("summary-chart")).toBeVisible();
  await expect(page.getByTestId("record-heaviest_weight")).toContainText("120");

  // Switching metric chips keeps the chart mounted.
  await page.getByTestId("metric-chip-best_e1rm").click();
  await expect(page.getByTestId("summary-chart")).toBeVisible();

  // Set records: heaviest weight per rep count — 5 reps → 120 kg.
  await page.getByTestId("set-records-toggle").click();
  await expect(page.getByTestId("set-record-5")).toContainText("120");
  await expect(page.getByTestId("set-record-8")).toContainText("100");

  // History: one row per session (two), each linking to the workout.
  await page.getByTestId("tab-history").click();
  await expect(page.getByTestId(/^history-session-/)).toHaveCount(2);

  // A record row deep-links to the session it happened in.
  await page.getByTestId("tab-summary").click();
  await page.getByTestId("record-heaviest_weight").click();
  await expect(page).toHaveURL(/\/history\//);
});

test("duplicate exercise creates a history-free copy", async ({ page }) => {
  const EX = `Dup ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  await logSessionWith(page, EX, [["80", "5"]]);

  await page.goto("/library");
  await page.getByTestId(`open-exercise-${EX}`).click();
  const originalUrl = page.url();

  // ⋯ → Duplicate exercise → lands on a NEW exercise detail with a copy name.
  await page.getByTestId("exercise-more").click();
  await page.getByTestId("exercise-duplicate").click();
  await expect(page.getByTestId("exercise-detail-name")).toHaveText(`${EX} (copy)`);
  expect(page.url()).not.toBe(originalUrl);

  // The copy carries no history.
  await page.getByTestId("tab-history").click();
  await expect(page.getByTestId("history-empty")).toBeVisible();
});
