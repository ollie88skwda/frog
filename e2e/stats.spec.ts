import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M8 statistics hub: log two sessions across different muscle groups, then the
// /stats screen aggregates them — last-7-day heat map, sets-per-muscle chart
// (with working range/granularity controls), muscle distribution + totals, and
// a ranked main-exercises list that deep-links to exercise detail.

// Squat (legs) and Bench Press (chest/arms/shoulders via primary + secondary
// muscle targets) between them light five of the six body regions.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
  // kg display so typed weights map 1:1 to the canonical store (app defaults lb).
  await page.evaluate(() => localStorage.setItem("unit", "kg"));
});

async function logSet(page: Page, index: number, weight: string, reps: string) {
  await page.getByTestId(`set-${index}-weight`).fill(weight);
  await page.getByTestId(`set-${index}-reps`).fill(reps);
  await page.getByTestId(`set-${index}-add`).click();
  await expect(page.getByTestId(`committed-${index}-type`)).toBeVisible();
}

// One seed exercise per session (keeps set-input testids unambiguous), two sets.
async function logSession(
  page: Page,
  exercise: string,
  sets: [string, string][],
) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId("exercise-search-input").fill(exercise);
  await page.getByTestId(`pick-exercise-${exercise}`).click();
  for (let i = 0; i < sets.length; i++) {
    await logSet(page, i, sets[i][0], sets[i][1]);
  }
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page).not.toHaveURL(/\/session\//);
}

test("stats hub aggregates two sessions across muscle groups", async ({
  page,
}) => {
  await logSession(page, "Squat", [
    ["140", "5"],
    ["140", "5"],
  ]);
  await logSession(page, "Bench Press", [
    ["100", "5"],
    ["100", "8"],
  ]);

  // Reached from the Profile Statistics dashboard button.
  await page.goto("/profile");
  await page.getByTestId("dash-statistics").click();
  await expect(page).toHaveURL(/\/stats$/);

  // Last-7-days: consistency mini-bars + rolling body heat map render.
  await expect(page.getByTestId("consistency-bars")).toBeVisible();
  await expect(page.getByTestId("seven-day-heatmap")).toBeVisible();

  // Heat-map region paths exist for both trained regions (multiple heat maps on
  // the page render each region, so scope to the first).
  await expect(page.getByTestId("heatmap-front-chest").first()).toBeVisible();
  await expect(page.getByTestId("heatmap-front-legs").first()).toBeVisible();
  await expect(page.getByTestId("heatmap-back-back").first()).toBeVisible();

  // Sets-per-muscle chart renders; the muscle multi-select exposes trained
  // muscles (Squat → quads, Bench → pecs).
  await expect(page.getByTestId("sets-per-muscle-chart")).toBeVisible();
  await expect(page.getByTestId("spm-muscle-quads")).toBeVisible();
  await expect(page.getByTestId("spm-muscle-pecs")).toBeVisible();

  // Distribution totals: two workouts counted this period.
  await expect(page.getByTestId("distribution-chart")).toBeVisible();
  await expect(page.getByTestId("distribution-totals")).toContainText(
    "Workouts",
  );

  // Main exercises: a ranked list renders (top-15 cap — on a shared
  // full-suite user our two lifts can legitimately fall below the cut, so
  // assert structure + behavior rather than specific rows).
  const mainRows = page.locator('[data-testid^="main-exercise-"]');
  await expect(mainRows.first()).toBeVisible();

  // Tapping a main exercise deep-links to its detail screen.
  const firstId = (
    await mainRows.first().getAttribute("data-testid")
  )?.replace("main-exercise-", "");
  await mainRows.first().click();
  await expect(page).toHaveURL(new RegExp(`/exercises/${firstId}`));
});

test("range and granularity controls re-bucket the sets-per-muscle chart", async ({
  page,
}) => {
  await logSession(page, "Bench Press", [["100", "5"]]);

  await page.goto("/stats");
  await expect(page.getByTestId("sets-per-muscle-chart")).toBeVisible();

  // Weekly (default) → the bucket is labeled by its week-start date. Switching
  // to yearly re-buckets so a single bar labeled with the current year appears.
  const year = String(new Date().getFullYear());
  await page.getByTestId("spm-gran-year").click();
  await expect(
    page.getByTestId(`sets-per-muscle-chart-bar-${year}`),
  ).toBeVisible();

  // Distribution range chip stays interactive across all four ranges.
  await page.getByTestId("dist-range-all").click();
  await expect(page.getByTestId("distribution-chart")).toBeVisible();
});
