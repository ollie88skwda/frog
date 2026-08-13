import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// M3 live PR banner: a set that beats a stored record raises an in-workout
// banner (naming the record type) and pins a medal to the winning row. The
// first-ever log of an exercise never PRs (nothing to compare).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function logFirstSet(page: Page, weight: string, reps: string) {
  await page.getByTestId("weight-field").fill(weight);
  await page.getByTestId("reps-field").fill(reps);
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
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
  await createExercise(page, EX);
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

  await page.getByTestId("session-finish").click();
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
  // The old committed-row medal badge has no contract equivalent under the
  // Spotlight redesign (testid-contract.md doesn't name one) — the banner
  // assertion above is this test's remaining PR-on-a-set coverage.

  // Regression: the banner used to sit on a ~5% alpha wash (bg-accent-soft),
  // reading as nearly see-through over whatever scrolled underneath it.
  const alpha = await page.getByTestId("pr-banner").evaluate((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    // Alpha only ever appears after the slash in `color(display-p3 r g b / a)`
    // or as the 4th slot of legacy `rgba()`. Everything else — `rgb()`, a
    // slashless `color()` on a P3 display — is opaque, and reading slot 3 of a
    // blind digit match there would pick up a colour channel instead.
    const slash = bg.match(/\/\s*([\d.]+)\s*\)$/);
    if (slash) return Number(slash[1]);
    const rgba = bg.match(/^rgba\(([^)]*)\)$/);
    const parts = rgba ? rgba[1].split(",") : [];
    return parts.length === 4 ? Number(parts[3]) : 1;
  });
  expect(alpha).toBe(1);
});
