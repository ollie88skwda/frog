import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  fieldValue,
  fillSet,
  finishSession,
  logBilateralSet,
  logSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Spotlight input contract (testid-contract.md, "Behavioural contract the
// tests may assume" #1-4): a set opens pre-filled from last session with no
// user action, both fields are always directly typeable, weight/reps-adjust
// buttons mutate immediately, and data-beat/*-compare react to the value
// relative to last session.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a brand-new exercise's first set opens empty, with no last-time row", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightFresh");
  await startSessionWith(page, EX);

  await expect(page.getByTestId("weight-field")).toHaveValue("");
  await expect(page.getByTestId("reps-field")).toHaveValue("");
  await expect(page.getByTestId("last-time-row")).toBeHidden();
});

test("opening a set pre-fills from last session's same set index, with no user action", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightPrefill");

  // Session 1: two sets, distinct values so set index is unambiguous.
  await startSessionWith(page, EX);
  await logBilateralSet(page, "80", "10");
  await logBilateralSet(page, "85", "8");
  await finishSession(page);

  // Session 2: opening the exercise, set 0's fields already carry session
  // 1's set-0 values — before any tap on weight-field/reps-field/last-time.
  await startSessionWith(page, EX);
  await expect(page.getByTestId("weight-field")).toHaveValue("80");
  await expect(page.getByTestId("reps-field")).toHaveValue("10");
  await expect(page.getByTestId("last-time-row")).toContainText("80");
  await expect(page.getByTestId("last-time-row")).toContainText("10");

  // Committing set 0 advances to set 1, pre-filled from session 1's set 1.
  await logSet(page);
  await expect(page.getByTestId("weight-field")).toHaveValue("85");
  await expect(page.getByTestId("reps-field")).toHaveValue("8");
});

test("both fields accept direct typing at any time, with no preliminary tap", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightType");
  await startSessionWith(page, EX);

  // No click/focus on anything else first — fill() drives straight into the
  // field, exactly the "never requires a preliminary tap" contract clause.
  await page.getByTestId("weight-field").fill("62.5");
  await page.getByTestId("reps-field").fill("12");
  await expect(page.getByTestId("weight-field")).toHaveValue("62.5");
  await expect(page.getByTestId("reps-field")).toHaveValue("12");
});

test("weight-adjust and reps-adjust mutate the field immediately, no dialog", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightAdjust");
  await startSessionWith(page, EX);

  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("weight-adjust-5").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("105");
  await page.getByTestId("weight-adjust-10").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("115");
  await page.getByTestId("weight-adjust-15").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("130");
  await page.getByTestId("weight-adjust--1").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("129");
  await page.getByTestId("weight-adjust--5").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("124");
  await page.getByTestId("weight-adjust--10").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("114");
  await page.getByTestId("weight-adjust--15").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("99");

  await page.getByTestId("reps-field").fill("5");
  await page.getByTestId("reps-adjust-1").click();
  await expect(page.getByTestId("reps-field")).toHaveValue("6");
  await page.getByTestId("reps-adjust-2").click();
  await expect(page.getByTestId("reps-field")).toHaveValue("8");
  await page.getByTestId("reps-adjust--1").click();
  await expect(page.getByTestId("reps-field")).toHaveValue("7");
  await page.getByTestId("reps-adjust--2").click();
  await expect(page.getByTestId("reps-field")).toHaveValue("5");

  // No dialog/sheet opened by any of the above.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("weight and reps never go below zero, however many times a jump is pressed", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightFloor");
  await startSessionWith(page, EX);

  await page.getByTestId("weight-field").fill("8");
  for (let i = 0; i < 4; i++)
    await page.getByTestId("weight-adjust--5").click();
  expect(await fieldValue(page, "weight-field")).toBeGreaterThanOrEqual(0);

  await page.getByTestId("reps-field").fill("1");
  for (let i = 0; i < 4; i++) await page.getByTestId("reps-adjust--2").click();
  expect(await fieldValue(page, "reps-field")).toBeGreaterThanOrEqual(0);
});

test("beating last session's value flips data-beat true and states the gain", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightBeat");

  await startSessionWith(page, EX);
  await logBilateralSet(page, "100", "5");
  await finishSession(page);

  await startSessionWith(page, EX);
  // Opens matching last time — same as last, not a beat. The data-beat
  // container isn't itself a named hook, so find it as whichever ancestor
  // carries the attribute and wraps weight-compare.
  const weightRow = page
    .locator("[data-beat]")
    .filter({ has: page.getByTestId("weight-compare") });
  await expect(page.getByTestId("weight-compare")).toContainText(
    /same as last/i,
  );

  // Push weight above last session's value.
  await page.getByTestId("weight-adjust-5").click();
  await expect(weightRow).toHaveAttribute("data-beat", "true");
  await expect(page.getByTestId("weight-compare")).toContainText("+5");

  // Drop back below last session's value.
  await page.getByTestId("weight-adjust--10").click();
  await expect(weightRow).toHaveAttribute("data-beat", "false");
  await expect(page.getByTestId("weight-compare")).not.toContainText(
    /same as last/i,
  );
});

test("reps-compare mirrors the same beat/same/below contract independently of weight", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightRepsBeat");

  await startSessionWith(page, EX);
  await logBilateralSet(page, "100", "5");
  await finishSession(page);

  await startSessionWith(page, EX);
  const repsRow = page
    .locator("[data-beat]")
    .filter({ has: page.getByTestId("reps-compare") });
  await expect(page.getByTestId("reps-compare")).toContainText(/same as last/i);

  await page.getByTestId("reps-adjust-1").click();
  await expect(repsRow).toHaveAttribute("data-beat", "true");
  await expect(page.getByTestId("reps-compare")).toContainText("+1");
});

test("typing values and switching exercises does not commit a set (Log is the only commit path)", async ({
  page,
}) => {
  const EX = await makeExercise(page, "SpotlightNoPhantom");
  const OTHER = await makeExercise(page, "SpotlightNoPhantomOther");

  await startSessionWith(page, EX);
  await fillSet(page, "100", "5");

  // Add a second exercise (pre-Spotlight surface, unchanged by this
  // contract) and switch to it via the header sheet, without pressing Log.
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${OTHER}`).click();
  await page.getByTestId("exercise-header").click();
  await expect(page.getByTestId("exercise-sheet")).toBeVisible();
  await page.getByTestId("exercise-sheet-row-0").click();

  // Back on EX, the set must still be uncommitted — index 0 is the only set,
  // so its mark reads "current" (the open/active set), never "done".
  await expect(page.getByTestId("exercise-name")).toHaveText(EX);
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "current",
  );
});
