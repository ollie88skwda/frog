import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// P4 round-trips: session conditions and a custom set-scope metric.

// Fixed seed id of the "Sleep (h)" condition metric (supabase seeds migration).
const SLEEP_ID = "00000000-0000-4000-8000-0000000000a1";

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("session conditions round-trip through the chip", async ({ page }) => {
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);

  await page.getByTestId("conditions-chip").click();
  await page.getByTestId(`condition-input-${SLEEP_ID}`).fill("7.5");
  await page.getByTestId("conditions-save-btn").click();
  await expect(page.getByTestId("conditions-chip")).toContainText("7.5h");

  // Reload: values restore from the server.
  await page.reload();
  await expect(page.getByTestId("conditions-chip")).toContainText("7.5h");
});

test("custom set metric: create, enable on an exercise, log a value", async ({ page }) => {
  const EX = `Machine Row ${Date.now()}`;
  const METRIC = `Seat height ${Date.now()}`;

  // Create exercise + metric, enable the metric for the exercise.
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.getByTestId("metric-name-input").fill(METRIC);
  await page.getByTestId("add-metric-btn").click();
  await expect(page.getByTestId(`metric-row-${METRIC}`)).toBeVisible();

  await page.getByTestId(`exercise-row-${EX}`).click();
  // .click() + retrying assertion instead of .check(): the controlled checkbox
  // re-renders from the query cache one microtask after the click, which
  // .check()'s instant verification races (app behavior is correct).
  const enable = page.getByTestId(`enable-metric-${METRIC}-${EX}`);
  await enable.click();
  await expect(enable).toBeChecked();

  // Log a set carrying the metric value.
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.getByRole("button", { name: "+RIR" }).click();

  const metricInput = page.locator(`[data-testid^="set-0-metric-"]`);
  await expect(metricInput).toBeVisible();
  await metricInput.fill("4");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-reps").blur();

  // The metric value landed in set_logs.metric_values.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { data, error } = await window.__sbl.supabase
          .from("set_logs")
          .select("metric_values")
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(error.message);
        const values = data?.[0]?.metric_values as Record<string, unknown> | null;
        return values ? Object.values(values)[0] : null;
      }),
    )
    .toBe(4);
});
