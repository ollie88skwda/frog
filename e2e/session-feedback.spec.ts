import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Session feedback batch (2026-11-21): numeric-only entry, Log navigation
// (next set while planned sets remain, else next exercise, never an
// auto-created set), exercise prev/next, machine controls in the header menu.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

async function addExerciseToSession(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${name}`).click();
  await expect(page.getByTestId("exercise-name")).toContainText(name);
}

test("weight, reps and RIR-style fields take numbers only, typed or pasted", async ({
  page,
}) => {
  await startSessionWith(page, await makeExercise(page, "NumOnly"));
  const weight = page.getByTestId("weight-field");
  const reps = page.getByTestId("reps-field");

  // Right keyboard for each.
  await expect(weight).toHaveAttribute("inputmode", "decimal");
  await expect(reps).toHaveAttribute("inputmode", "numeric");

  // Typing letters and symbols is dropped.
  await weight.fill("");
  await weight.pressSequentially("8a2-.5e");
  await expect(weight).toHaveValue("82.5");
  await reps.fill("");
  await reps.pressSequentially("1x0.5");
  await expect(reps).toHaveValue("105");

  // Pasting is cleaned the same way; only one decimal point survives.
  await weight.fill("");
  await weight.evaluate((el) => {
    const input = el as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    set?.call(input, "1.2.3 kg");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(weight).toHaveValue("1.23");
  await reps.fill("");
  await reps.evaluate((el) => {
    const input = el as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    set?.call(input, "-12.7 reps");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(reps).toHaveValue("127");
});

test("Log never creates a set; Add a set is the only way to add one", async ({
  page,
}) => {
  await startSessionWith(page, await makeExercise(page, "NoAuto"));
  await logBilateralSet(page, "60", "10");

  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.getByTestId("set-mark-1")).toHaveCount(0);
  await expect(page.getByTestId("log-set")).toHaveCount(0);
  await expect(page.getByTestId("sets-done")).toBeVisible();

  await page.getByTestId("add-set").click();
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "current",
  );
  await expect(page.getByTestId("log-set")).toBeVisible();
});

test("Log goes to the next exercise when the current one has no planned sets left", async ({
  page,
}) => {
  const A = await makeExercise(page, "NavA");
  const B = await makeExercise(page, "NavB");
  await startSessionWith(page, A);
  await addExerciseToSession(page, B);
  await page.getByTestId("exercise-prev").click();
  await expect(page.getByTestId("exercise-name")).toContainText(A);

  await logBilateralSet(page, "50", "8");
  await expect(page.getByTestId("exercise-name")).toContainText(B);
  // No stray set was added to A.
  await page.getByTestId("exercise-prev").click();
  await expect(page.getByTestId("exercise-name")).toContainText(A);
  await expect(page.getByTestId("set-mark-1")).toHaveCount(0);
});

test("Log stays on the exercise while planned sets remain", async ({
  page,
}) => {
  const A = await makeExercise(page, "PlanA");
  const B = await makeExercise(page, "PlanB");
  const routine = `PlanR ${Date.now()}`;
  await page.goto("/routines/new");
  await page.getByTestId("routine-name-input").fill(routine);
  for (const n of [A, B]) {
    await page.getByTestId("routine-add-exercise-btn").click();
    await page.getByTestId(`routine-pick-${n}`).click();
  }
  // Each exercise starts with 3 planned sets; fill all of A's.
  for (const [ex, set] of [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
  ]) {
    await page.getByTestId(`routine-ex-${ex}-set-${set}-weight`).fill("40");
    await page.getByTestId(`routine-ex-${ex}-set-${set}-reps`).fill("8");
  }
  await page.getByTestId("routine-save-btn").click();
  await expect(page).toHaveURL(/\/plan\?s=routines$/);
  await page.getByTestId(`routine-start-${routine}`).click();
  await expect(page).toHaveURL(/\/session\//);

  await expect(page.getByTestId("exercise-name")).toContainText(A);
  await logBilateralSet(page, "40", "8"); // set 1 of 3: stay
  await expect(page.getByTestId("exercise-name")).toContainText(A);
  await expect(page.getByTestId("set-number")).toContainText("Set 2");
  await logBilateralSet(page, "40", "8"); // set 2 of 3: stay
  await expect(page.getByTestId("exercise-name")).toContainText(A);
  await expect(page.getByTestId("set-number")).toContainText("Set 3");
  await logBilateralSet(page, "40", "8"); // set 3 of 3: move on
  await expect(page.getByTestId("exercise-name")).toContainText(B);
});

test("previous and next controls move between exercises", async ({ page }) => {
  const A = await makeExercise(page, "StripA");
  const B = await makeExercise(page, "StripB");
  await startSessionWith(page, A);
  await addExerciseToSession(page, B);

  await expect(page.getByTestId("exercise-next")).toBeDisabled();
  await page.getByTestId("exercise-prev").click();
  await expect(page.getByTestId("exercise-name")).toContainText(A);
  await expect(page.getByTestId("exercise-prev")).toBeDisabled();
  await page.getByTestId("exercise-next").click();
  await expect(page.getByTestId("exercise-name")).toContainText(B);
  await expect(page.getByTestId("exercise-strip")).toBeVisible();
});

test("Add machine lives in the exercise settings menu at the top, not beside the entry area", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MachineMenu");
  await startSessionWith(page, EX);

  // Not an always-visible button.
  await expect(page.getByTestId("exercise-machine-chip")).toHaveCount(0);
  // The settings button is in the header, above the entry panel.
  const menu = page.getByTestId(`block-${EX}-menu`);
  const panel = page.getByTestId("entry-panel");
  const menuBox = await menu.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(menuBox && panelBox && menuBox.y < panelBox.y).toBe(true);

  await menu.click();
  await page.getByTestId(`block-${EX}-machine`).click();
  await expect(page.getByTestId("machine-search")).toBeVisible();
});
