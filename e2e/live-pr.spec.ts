import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn, waitForExercise } from "./helpers";

// M3 live PR banner: a set that beats a stored record raises an in-workout
// banner (naming the record type) and pins a medal to the winning row. The
// first-ever log of an exercise never PRs (nothing to compare).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function logFirstSet(page: Page, weight: string, reps: string) {
  await page.getByTestId("set-0-weight").fill(weight);
  await page.getByTestId("set-0-reps").fill(reps);
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0")).toBeVisible();
}

async function setLogCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { count } = await window.__frog.supabase
      .from("set_logs")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  });
}

test("beating a prior session raises the PR banner + medal; first log never PRs", async ({
  page,
}) => {
  const EX = `PR ${Date.now()}`;
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, EX);

  // Session 1: first-ever log → no PR banner (baseline only).
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logFirstSet(page, "100", "5");
  await expect(page.getByTestId("pr-banner")).toBeHidden();

  // Ensure the set is persisted before finishing (the records snapshot for
  // session 2 fetches from the DB).
  await expect.poll(() => setLogCount(page)).toBeGreaterThan(0);

  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
  await expect(page).toHaveURL(/\/history\//);

  // Session 2: a heavier set beats the stored bests → banner + medal.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await logFirstSet(page, "120", "5");

  await expect(page.getByTestId("pr-banner")).toBeVisible();
  await expect(page.getByTestId("pr-banner-types")).toContainText(
    "Heaviest weight",
  );
  await expect(page.getByTestId("committed-0-medal")).toBeVisible();

  // Regression: the banner used to sit on a ~5% alpha wash (bg-accent-soft),
  // reading as nearly see-through over whatever scrolled underneath it.
  const alpha = await page.getByTestId("pr-banner").evaluate((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    const parts = bg.match(/[\d.]+/g) ?? [];
    return parts.length === 4 ? Number(parts[3]) : 1;
  });
  expect(alpha).toBe(1);
});
