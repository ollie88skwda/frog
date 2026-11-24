import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { makeExercise, startSessionWith } from "./spotlight-helpers";

// Swipe between exercises from anywhere on the session panel (restored after
// #125 narrowed it to the header row). Real touch events through CDP, so the
// React touch handlers on the panel root see exactly what a phone sends.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function swipe(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy = 0,
) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 8;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

async function centreOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("a horizontal swipe on the session body (not the header) moves between exercises", async ({
  page,
}) => {
  const A = await makeExercise(page, "SwipeA");
  const B = await makeExercise(page, "SwipeB");
  await startSessionWith(page, A);
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-name")).toHaveText(B);

  // Back to the first exercise with the prev button (unchanged behaviour).
  await page.getByTestId("exercise-prev").click();
  await expect(page.getByTestId("exercise-name")).toHaveText(A);

  // Start well below the header, on the set list in the body.
  const body = await centreOf(page, "set-mark-0");
  const header = await page.getByTestId(`block-${A}`).boundingBox();
  expect(body.y).toBeGreaterThan((header?.y ?? 0) + (header?.height ?? 0));

  // A mostly vertical drag is a scroll, not a swipe.
  await swipe(page, body, -70, 120);
  await expect(page.getByTestId("exercise-name")).toHaveText(A);

  // Swipe left → next exercise.
  await swipe(page, body, -160);
  await expect(page.getByTestId("exercise-name")).toHaveText(B);
  await expect(page.getByTestId("exercise-position")).toContainText("2");

  // Swipe right → back to the previous one.
  const body2 = await centreOf(page, "set-mark-0");
  await swipe(page, body2, 160);
  await expect(page.getByTestId("exercise-name")).toHaveText(A);
});

test("dragging the ruler adjusts the value and never swipes to another exercise", async ({
  page,
}) => {
  const A = await makeExercise(page, "SwipeRulerA");
  const B = await makeExercise(page, "SwipeRulerB");
  await startSessionWith(page, A);
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await page.getByTestId("exercise-prev").click();
  await expect(page.getByTestId("exercise-name")).toHaveText(A);

  await page.getByTestId("weight-field").fill("100");
  const ruler = page.getByTestId("weight-ruler");
  await ruler.scrollIntoViewIfNeeded();
  await swipe(page, await centreOf(page, "weight-ruler"), -160);
  // The drag moved the value up the scale, and the exercise stayed put.
  await expect(page.getByTestId("weight-field")).not.toHaveValue("100");
  await expect(page.getByTestId("exercise-name")).toHaveText(A);
});
