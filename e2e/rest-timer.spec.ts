import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// M3 rest countdown: a per-exercise target (set from the block header's own
// rest-timer control, left of the ⋯ menu) starts the docked countdown when a
// set is completed; ±15s adjusts it; it dismisses; and it is suppressed when the
// completed set is a drop set (drops chain with no rest).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

async function remainingSec(page: Page, name: string): Promise<number> {
  const txt = (await page.getByTestId(`rest-${name}-value`).innerText()).trim();
  const [m, s] = txt.split(":").map((n) => Number.parseInt(n, 10));
  return m * 60 + s;
}

test("target → countdown on commit, ±15s adjust, dismiss", async ({ page }) => {
  const EX = `Rest ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Set a 1:00 rest target from the block's own rest-timer control.
  await page.getByTestId(`block-${EX}-rest-timer`).click();
  await page.getByTestId(`block-${EX}-rest-60`).click();

  // Complete a normal set → the docked countdown appears near 1:00.
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  const start = await remainingSec(page, EX);
  expect(start).toBeGreaterThan(50);
  expect(start).toBeLessThanOrEqual(60);

  // +15s pushes the remaining time up.
  await page.getByTestId(`rest-${EX}-plus`).click();
  const bumped = await remainingSec(page, EX);
  expect(bumped).toBeGreaterThan(start + 8);

  // −15s pulls it back down.
  await page.getByTestId(`rest-${EX}-minus`).click();
  const dropped = await remainingSec(page, EX);
  expect(dropped).toBeLessThan(bumped - 8);

  // Dismiss removes the dock.
  await page.getByTestId(`rest-${EX}-dismiss`).click();
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});

test("rest timer is suppressed when the completed set is a drop set", async ({
  page,
}) => {
  const EX = `RestDrop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId(`block-${EX}-rest-timer`).click();
  await page.getByTestId(`block-${EX}-rest-60`).click();

  // Mark the draft set as a Drop set, then complete it.
  await page.getByTestId("set-0-type").click();
  await page.getByTestId("set-0-type-drop").click();
  await page.getByTestId("set-0-weight").fill("60");
  await page.getByTestId("set-0-reps").fill("8");
  await page.getByTestId("set-0-add").click();

  // The set logged (marker D) but no rest countdown started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("D");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});
