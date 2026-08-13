import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { fillSet, logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// Rest stopwatch (testid-contract.md "Rest" + behavioural clause #5): exactly
// one count-UP stopwatch, starting on commit, stopping on first input to the
// next set or on Stop, stamping set-rest-stamp-{index} against the set it
// followed. No countdown, no second timer.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

function toSeconds(mmss: string): number {
  const [m, s] = mmss.trim().split(":").map((n) => Number.parseInt(n, 10));
  return m * 60 + s;
}

test("commit starts exactly one count-up stopwatch, never a countdown", async ({
  page,
}) => {
  const EX = await makeExercise(page, "RestStart");
  await startSessionWith(page, EX);

  await expect(page.getByTestId("rest-stopwatch")).toHaveCount(0);
  await logBilateralSet(page, "100", "5");

  // Exactly one stopwatch on screen — never a per-exercise or per-set second
  // instance sitting alongside it.
  await expect(page.getByTestId("rest-stopwatch")).toHaveCount(1);
  const elapsed = page.getByTestId("rest-elapsed");
  await expect(elapsed).toBeVisible();
  const first = toSeconds(await elapsed.innerText());

  await page.waitForTimeout(2200);
  const later = toSeconds(await elapsed.innerText());
  expect(later).toBeGreaterThan(first); // up, never down
});

test("first input to the next set stops the stopwatch and stamps the prior set's rest", async ({
  page,
}) => {
  const EX = await makeExercise(page, "RestStopOnInput");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "100", "5");
  await expect(page.getByTestId("rest-stopwatch")).toBeVisible();
  await page.waitForTimeout(1200);

  // Any input to the next (now-current) set stops it — typing into weight
  // is enough, no Log required.
  await page.getByTestId("weight-field").fill("105");
  await expect(page.getByTestId("rest-stopwatch")).toHaveCount(0);

  await expect(page.getByTestId("set-rest-stamp-0")).toBeVisible();
});

test("rest-stop manually stops the stopwatch and stamps the same way", async ({
  page,
}) => {
  const EX = await makeExercise(page, "RestStopButton");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "100", "5");
  await expect(page.getByTestId("rest-stopwatch")).toBeVisible();
  await page.waitForTimeout(1200);

  await page.getByTestId("rest-stop").click();
  await expect(page.getByTestId("rest-stopwatch")).toHaveCount(0);
  await expect(page.getByTestId("set-rest-stamp-0")).toBeVisible();
});

test("each committed set gets its own rest stamp, keyed to the set it followed", async ({
  page,
}) => {
  const EX = await makeExercise(page, "RestStampPerSet");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "50", "10");
  await page.waitForTimeout(1200);
  await fillSet(page, "55", "8"); // stops the rest after set 0
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("rest-stopwatch")).toBeVisible();
  await page.getByTestId("rest-stop").click();

  await expect(page.getByTestId("set-rest-stamp-0")).toBeVisible();
  await expect(page.getByTestId("set-rest-stamp-1")).toBeVisible();
});

test("warm-up and the very first set of the exercise still follow the same single-stopwatch model", async ({
  page,
}) => {
  // Not asserting suppression here (the contract doesn't say warm-ups are
  // exempt) — only that whatever the implementation does, it never produces
  // a second concurrent stopwatch instance.
  const EX = await makeExercise(page, "RestWarmupModel");
  await startSessionWith(page, EX);

  await page.getByTestId("set-type-menu").click();
  await page.getByTestId("set-type-warmup").click();
  await logBilateralSet(page, "40", "12");

  expect(await page.getByTestId("rest-stopwatch").count()).toBeLessThanOrEqual(1);
});
