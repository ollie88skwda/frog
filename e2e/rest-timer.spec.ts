import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Rest stopwatch: completing a set auto-starts a per-exercise up-counting
// stopwatch (docked above the mobile tab island); it never reaches a "done"
// state, has no target/preset, and is dismissed by Stop. Suppressed when the
// completed set is a drop set (drops chain into the next reduction with no
// rest).

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
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

  // Complete a normal set → the dock appears with no target/preset step.
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
  const start = await elapsedSec(page, EX);

  // Ticks up — no ceiling, no done-state to reach.
  await page.waitForTimeout(2200);
  const later = await elapsedSec(page, EX);
  expect(later).toBeGreaterThan(start);
  await expect(page.getByTestId(`rest-${EX}`)).toBeVisible();
});

test("Stop dismisses the stopwatch", async ({ page }) => {
  const EX = `RestStop ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

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
  await page.getByTestId("set-0-add").click();

  // The set logged (marker D) but no stopwatch started.
  await expect(page.getByTestId("committed-0-type")).toHaveText("D");
  await expect(page.getByTestId(`rest-${EX}`)).toBeHidden();
});
