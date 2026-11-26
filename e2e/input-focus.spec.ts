import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Guards the caret rule for numeric fields (boss r2 note 5, 2026-11-25):
// tapping a weight/reps box places a caret and selects nothing, reversing the
// earlier select-on-focus. Fails on the select-on-focus build (0..3 selected).

async function openLoggingRow(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
}

function selection(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const input = el as HTMLInputElement;
    return {
      value: input.value,
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  });
}

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("tapping a numeric field leaves a caret, not a selection", async ({
  page,
}) => {
  await openLoggingRow(page, `Focus ${Date.now()}`);
  const weight = page.getByTestId("weight-field");
  await weight.fill("100");
  await weight.evaluate((el) => (el as HTMLInputElement).blur());
  await weight.tap();
  // select-on-focus re-applied its selection a frame after focus.
  await page.waitForTimeout(100);
  const sel = await selection(page, "weight-field");
  expect(sel.value).toBe("100");
  expect(sel.start).toBe(sel.end);
});

test("text fields keep a normal caret", async ({ page }) => {
  await page.goto("/library");
  const search = page.getByTestId("exercise-search-input");
  await search.fill("bench");
  await search.evaluate((el) => (el as HTMLInputElement).blur());
  await search.tap();
  await page.waitForTimeout(100);
  await page.keyboard.press("End");
  await page.keyboard.type("x");
  await expect(search).toHaveValue("benchx");
});
