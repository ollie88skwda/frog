import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Exercise navigation (testid-contract.md "Context band"): tapping the
// header opens the exercise sheet, a row switches the spotlight to it, and
// the edge rail is always present alongside the position readout.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("the header shows name + position, and the edge rail is present", async ({
  page,
}) => {
  // EdgeDots renders nothing for a single-exercise session (session.tsx:
  // `if (total <= 1) return null`) — the rail only makes sense once there's
  // more than one position to show, so this needs a second exercise.
  const EX = await makeExercise(page, "NavHeader");
  const OTHER = await makeExercise(page, "NavHeaderOther");
  await startSessionWith(page, EX);
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${OTHER}`).click();

  await expect(page.getByTestId("exercise-name")).toHaveText(OTHER);
  await expect(page.getByTestId("exercise-position")).toContainText("2");
  await expect(page.getByTestId("exercise-edge-rail")).toBeVisible();
});

test("tapping the header opens the exercise sheet listing every exercise in the session", async ({
  page,
}) => {
  const A = await makeExercise(page, "NavSheetA");
  const B = await makeExercise(page, "NavSheetB");
  await startSessionWith(page, A);
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();

  await page.getByTestId("exercise-header").click();
  await expect(page.getByTestId("exercise-sheet")).toBeVisible();
  await expect(page.getByTestId("exercise-sheet-row-0")).toContainText(A);
  await expect(page.getByTestId("exercise-sheet-row-1")).toContainText(B);
});

test("picking a row in the exercise sheet switches the spotlight to that exercise", async ({
  page,
}) => {
  const A = await makeExercise(page, "NavSwitchA");
  const B = await makeExercise(page, "NavSwitchB");
  await startSessionWith(page, A);
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(B);

  await page.getByTestId("exercise-header").click();
  await page.getByTestId("exercise-sheet-row-0").click();
  await expect(page.getByTestId("exercise-sheet")).toBeHidden();
  await expect(page.getByTestId("exercise-name")).toHaveText(A);
  await expect(page.getByTestId("exercise-position")).toContainText("1");
});

test("exercise-position advances and a logged set on one exercise doesn't bleed into the next", async ({
  page,
}) => {
  const A = await makeExercise(page, "NavPositionA");
  const B = await makeExercise(page, "NavPositionB");
  await startSessionWith(page, A);
  await logBilateralSet(page, "50", "10");

  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-position")).toContainText("2");
  await expect(page.getByTestId("weight-field")).toHaveValue("");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
});

test("the machine chip reads a placeholder until a machine is attached", async ({
  page,
}) => {
  const EX = await makeExercise(page, "NavMachineChip");
  await startSessionWith(page, EX);
  await expect(page.getByTestId("exercise-machine-chip")).toContainText(
    "add machine",
  );
});
