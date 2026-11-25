import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Guards select-on-focus for numeric fields (components/ui/select-on-focus.ts):
// tapping a weight/reps box selects its whole value, so typing replaces the
// number instead of appending to it or landing mid-number.

const EVIDENCE = process.env.UX_EVIDENCE_DIR;

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

test("tapping a numeric field selects its value; typing replaces it", async ({
  page,
}) => {
  await openLoggingRow(page, `Focus ${Date.now()}`);
  const weight = page.getByTestId("weight-field");
  await weight.fill("100");
  await weight.evaluate((el) => (el as HTMLInputElement).blur());

  await weight.tap();
  if (EVIDENCE) {
    // Before/after evidence: the tapped field in day and night, then the value
    // after typing "80". Tag = before|after (UX_EVIDENCE_TAG).
    const tag = process.env.UX_EVIDENCE_TAG ?? "after";
    await page.waitForTimeout(300);
    for (const mode of ["night", "day"] as const) {
      await page.evaluate(
        (m) => document.documentElement.setAttribute("data-mode", m),
        mode,
      );
      await page.screenshot({
        path: `${EVIDENCE}/select-on-focus-${mode}-${tag}.png`,
      });
    }
    await page.keyboard.type("80");
    await page.screenshot({ path: `${EVIDENCE}/type-replaces-${tag}.png` });
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await weight.evaluate((el) => (el as HTMLInputElement).blur());
    await weight.fill("100");
    await weight.evaluate((el) => (el as HTMLInputElement).blur());
    await weight.tap();
  }
  await expect
    .poll(() => selection(page, "weight-field"))
    .toEqual({ value: "100", start: 0, end: 3 });

  await page.keyboard.type("80");
  await expect(weight).toHaveValue("80");
});

test("text fields keep a normal caret (no select-on-focus)", async ({
  page,
}) => {
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
