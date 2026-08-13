import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  fillSet,
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Marks band (testid-contract.md "Set band"): one column per set, data-state
// in {done, warmup, current, todo}, a ᴸᴿ side-tag on per-side sets, and
// tapping a mark reopens that finished set.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("marks progress todo -> current -> done as sets are logged", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksProgress");
  await startSessionWith(page, EX);

  // Set 0 is the open (current) set; everything after is todo.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "todo",
  );

  await logBilateralSet(page, "60", "10");

  // Set 0 is now done; set 1 (the next open set) is current.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "current",
  );
});

test("a completed warm-up set carries the warmup mark state, not done", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksWarmup");
  await startSessionWith(page, EX);

  await openSetTypeMenu(page);
  await page.getByTestId("set-type-warmup").click();
  await logBilateralSet(page, "40", "12");

  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "warmup",
  );

  // The next (normal) set logged carries the ordinary done state.
  await logBilateralSet(page, "80", "8");
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "done",
  );
});

test("a per-side set carries the ᴸᴿ tag on its mark; a bilateral one does not", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksSideTag");
  await startSessionWith(page, EX);

  await expect(page.getByTestId("set-mark-0-side-tag")).toHaveCount(0);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("set-mark-0-side-tag")).toBeVisible();
});

test("tapping a done mark reopens that finished set for editing", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksReopen");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "90", "6");
  await fillSet(page, "95", "4"); // set 1 now open, untouched values

  await page.getByTestId("set-mark-0").click();
  await expect(page.getByTestId("set-number")).toContainText("1");
  await expect(page.getByTestId("weight-field")).toHaveValue("90");
  await expect(page.getByTestId("reps-field")).toHaveValue("6");
});
