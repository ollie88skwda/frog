import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Session entry UX hand-fix (2026-11-25, fm/frog-ux-entry). Item 1 is the
// regression for the "typing into RIR lands in reps / tapping reps after RIR
// leaves the ruler on RIR" bug: whichever value was tapped last is the one
// the keyboard types into, the ruler drives and the underline marks.

const SHOTS = "docs/ux-audit/2026-11-25/frog-ux-entry";
// UX_SHOTS=before|after saves the evidence screenshots for the audit.
const shot = (page: Page, item: string) =>
  process.env.UX_SHOTS
    ? page.screenshot({ path: `${SHOTS}/${item}-${process.env.UX_SHOTS}.png` })
    : Promise.resolve();

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

test("item 1: the last tapped value owns the keyboard, the ruler and the highlight", async ({
  page,
}) => {
  const EX = await makeExercise(page, "UxRir");
  await startSessionWith(page, EX);
  // One set logged first, so the ruler is offered (item 2).
  await logBilateralSet(page, "50", "10");
  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("reps-field")).toBeVisible();

  // Tap reps, then RIR, then type: the digit must land in RIR, not reps.
  await page.getByTestId("reps-field").fill("10");
  await page.getByTestId("reps-field").click();
  await page.getByTestId("rir-column").click();
  await page.keyboard.type("3");
  await shot(page, "1");
  await expect(page.getByTestId("reps-field")).toHaveValue("10");
  await expect(page.getByTestId("rir-column")).toHaveValue("3");

  // Tap reps again: the ruler and the highlight move back onto reps.
  await page.getByTestId("reps-field").click();
  await expect(page.getByTestId("reps-ruler")).toBeVisible();
  await expect(page.getByTestId("rir-ruler")).toHaveCount(0);
  await expect(page.getByTestId("entry-col-reps")).toHaveAttribute(
    "data-active",
    "true",
  );
  await expect(page.getByTestId("entry-col-rir")).toHaveAttribute(
    "data-active",
    "false",
  );
  await page.keyboard.type("8");
  await expect(page.getByTestId("reps-field")).toHaveValue("8");
  await expect(page.getByTestId("rir-column")).toHaveValue("3");
});
