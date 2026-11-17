import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logSet, makeExercise, startSessionWith } from "./spotlight-helpers";

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e`");
  await signIn(page);
});

test("steppers move weight by the unit step (5 lb default) and reps by 1, and Log states the values", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startSessionWith(page, await makeExercise(page, "Tiles"));
  await page.getByTestId("weight-field").fill("80");
  await page.getByTestId("reps-field").fill("8");
  await expect(page.getByTestId("log-set")).toHaveText("Log 80 lbs × 8");
  await page.getByTestId("weight-step-plus").click();
  await page.getByTestId("reps-step-plus").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("85");
  await expect(page.getByTestId("reps-field")).toHaveValue("9");
  await expect(page.getByTestId("log-set")).toHaveText("Log 85 lbs × 9");
  await page.getByTestId("weight-step-minus").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("80");
  await logSet(page);
  await expect(page.getByTestId("set-number")).toHaveText("Set 2");
});

test("390x844 entry screenshots", async ({ page }) => {
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
      path: `/tmp/frog-input-convex/entry-${mode}.png`,
    });
  }
});
