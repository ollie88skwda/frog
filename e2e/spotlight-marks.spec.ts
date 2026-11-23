import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  fillSet,
  fillSide,
  finishSession,
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

  // Ad-hoc session (no routine seed): one set is offered. Marks exist only
  // for committed sets plus the open one; Log never creates another.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
  await expect(page.getByTestId("set-mark-1")).toHaveCount(0);

  await logBilateralSet(page, "60", "10");

  // Set 0 is done and NO new set was created by Log.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.getByTestId("set-mark-1")).toHaveCount(0);

  // "Add a set" is the only way to get set 1, and it opens as current.
  await page.getByTestId("add-set").click();
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

test("a per-side set carries the L+R tag on its mark; a bilateral one does not", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksSideTag");
  await startSessionWith(page, EX);

  // The side-tag is only computed for a COMMITTED set's mark (session.tsx:
  // `paired` is hardcoded false on the live "current" mark regardless of
  // the per-side toggle) — it needs an actual logged pair to check.
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await fillSide(page, "left", "40", "8");
  await fillSide(page, "right", "40", "8");
  await page.getByTestId("log-set").click();
  await expect(page.getByTestId("set-mark-0-side-tag")).toBeVisible();

  // A bilateral set logged next carries no side-tag on its own mark.
  await page.getByTestId("add-set").click();
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click(); // toggle off
  await logBilateralSet(page, "45", "10");
  await expect(page.getByTestId("set-mark-1-side-tag")).toHaveCount(0);
});

test("an uneven per-side set shows both sides in the set list, not just the left", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MarksUneven");
  await startSessionWith(page, EX);
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await fillSide(page, "left", "30", "10");
  await fillSide(page, "right", "30", "8");
  await page.getByTestId("log-set").click();

  const sides = page.getByTestId("set-mark-0-sides");
  await expect(sides).toBeVisible();
  await expect(sides).toContainText(/30 (kg|lbs?) × 10/);
  await expect(sides).toContainText(/30 (kg|lbs?) × 8/);
  await expect(sides.getByRole("img", { name: "left side" })).toBeVisible();
  await expect(sides.getByRole("img", { name: "right side" })).toBeVisible();
  // Both sides are shown, so the generic L+R tag is not.
  await expect(page.getByTestId("set-mark-0-side-tag")).toHaveCount(0);

  // Next time, the Now row's "last" hint shows both sides too.
  await finishSession(page);
  await startSessionWith(page, EX);
  const last = page.getByTestId("set-mark-last-sides");
  await expect(last).toContainText(/30 (kg|lbs?) × 10/);
  await expect(last).toContainText(/30 (kg|lbs?) × 8/);
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
