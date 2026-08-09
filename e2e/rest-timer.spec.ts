import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Rest stopwatch: completing a set auto-starts a per-exercise up-counting
// stopwatch — an anchored pill above the block's log strip; it never reaches
// a "done" state, has no target/preset, and is dismissed by Stop (or by
// typing into the strip to start the next set). It's scoped to normal
// working sets on rep/weight-based exercises, so it's suppressed when the
// completed set is a drop set (drops chain into the next reduction with no
// rest) or a warm-up, and on duration/distance-type exercises (plank,
// running) where "resting between sets" isn't meaningful.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

/** Same, but for a duration exercise. Radix Select shows option labels, not
 * values (and @frog/core isn't resolvable from e2e/), so pick by label. */
async function makeDurationExercise(page: Page, name: string) {
  await page.goto("/library");
  await page.getByTestId("new-exercise-btn").click();
  await page.getByTestId("exercise-name-input").fill(name);
  await page.getByTestId("exercise-type-select").click();
  await page.getByRole("option", { name: "Duration", exact: true }).click();
  await page.getByTestId("add-exercise-btn").click();
  await waitForExercise(page, name);
}

async function elapsedSec(page: Page, name: string): Promise<number> {
  const txt = (await page.getByTestId(`rest-${name}-value`).innerText()).trim();
  const [m, s] = txt.split(":").map((n) => Number.parseInt(n, 10));
  return m * 60 + s;
}

test("stopwatch appears on commit and ticks up indefinitely", async ({
  page,
}) => {
  const EX = `Rest ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Complete a normal set → the pill appears with no target/preset step.
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  // The pill names the set it follows — one clock, tied to its set.
  await expect(page.getByTestId(`rest-${EX}-after`)).toHaveText(
    `after set 1 · ${EX}`,
  );
  const start = await elapsedSec(page, EX);

  // Ticks up — no ceiling, no done-state to reach.
  await page.waitForTimeout(2200);
  const later = await elapsedSec(page, EX);
  expect(later).toBeGreaterThan(start);
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();

  // Typing into the strip to start the next set auto-stops it — the rest
  // period ends when the next set begins, no Stop tap needed.
  await page.getByTestId("set-1-weight").fill("100");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("Stop dismisses the stopwatch", async ({ page }) => {
  const EX = `RestStop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-done").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  await page.getByTestId(`rest-${EX}-stop`).click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("suppressed when the completed set is a drop set", async ({ page }) => {
  const EX = `RestDrop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Mark the draft set as a Drop set, then complete it.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-drop").click();
  await page.getByTestId("set-0-weight").fill("60");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-done").click();

  // The set logged (marker D) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("D");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("suppressed when the completed set is a warm-up", async ({ page }) => {
  const EX = `RestWarmup ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Mark the draft set as a Warm-up, then complete it.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-warmup").click();
  await page.getByTestId("set-0-weight").fill("40");
  await page.getByTestId("set-0-reps").fill("10");
  await page.getByTestId("set-0-done").click();

  // The set logged (marker W) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("W");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();

  // The working set that follows still starts it.
  await page.getByTestId("set-1-weight").fill("100");
  await page.getByTestId("set-1-reps").fill("5");
  await page.getByTestId("set-1-done").click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
});

test("suppressed on a duration exercise", async ({ page }) => {
  const EX = `RestPlank ${Date.now()}`;
  await makeDurationExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-duration").fill("1:30");
  await page.getByTestId("set-0-done").click();

  // The set logged but no stopwatch started (the pill never renders).
  await expect(page.getByTestId("committed-0-duration")).toHaveText("1:30");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});
