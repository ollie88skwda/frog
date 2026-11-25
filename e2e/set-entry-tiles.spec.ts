import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logSet,
  makeExercise,
  openRulerSet,
  startSessionWith,
} from "./spotlight-helpers";

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e`");
  await signIn(page);
});

test("the ruler moves weight by the unit step (1 lb default) and reps by 1, and Log states the values", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startSessionWith(page, await makeExercise(page, "Tiles"));
  await openRulerSet(page);
  await page.getByTestId("weight-field").fill("80");
  await page.getByTestId("reps-field").fill("8");
  await expect(page.getByTestId("log-set")).toHaveText("Log 80 lbs × 8");
  await page.getByTestId("reps-ruler").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("reps-field")).toHaveValue("9");
  await page.getByTestId("weight-field").focus();
  await page.getByTestId("weight-ruler").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("weight-field")).toHaveValue("81");
  await expect(page.getByTestId("log-set")).toHaveText("Log 81 lbs × 9");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("weight-field")).toHaveValue("80");
  await logSet(page);
  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("set-number")).toContainText("Set 3");
});

test("390x844 entry screenshots", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await startSessionWith(page, await makeExercise(page, "Shots"));
  await page.getByTestId("weight-field").fill("80");
  await page.getByTestId("reps-field").fill("8");
  for (const mode of ["day", "night"]) {
    await page.emulateMedia({
      colorScheme: mode === "night" ? "dark" : "light",
    });
    await page.evaluate(
      (m) => document.documentElement.setAttribute("data-mode", m),
      mode,
    );
    await page.screenshot({
      path: testInfo.outputPath(`entry-${mode}.png`),
    });
  }
});
