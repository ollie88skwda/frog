import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  finishSession,
  logBilateralSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Boss session notes 2026-11-26 (docs/ux-audit/2026-11-26/session). One
// behavioural check per note; frames come from ux3-session-evidence.spec.ts.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
});

/** Horizontal offset of the exercise slide ~1 frame after `act`. */
async function offsetAfter(page: Page, act: () => Promise<void>) {
  await act();
  return page.getByTestId("exercise-slide").evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === "none" ? 0 : new DOMMatrix(t).m41;
  });
}

test("note 1: switching exercises slides the new one in from the direction of travel", async ({
  page,
}) => {
  const A = await makeExercise(page, "SlideA");
  const B = await makeExercise(page, "SlideB");
  await startSessionWith(page, A);
  // Opening the session never slides.
  await expect(page.getByTestId("exercise-slide")).not.toHaveAttribute(
    "data-dir",
    /./,
  );
  await page.getByTestId("session-menu").click();
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await expect(page.getByTestId("exercise-slide")).toHaveAttribute(
    "data-dir",
    "next",
  );
  await page.waitForTimeout(400);
  const back = await offsetAfter(page, () =>
    page.getByTestId("exercise-prev").click(),
  );
  await expect(page.getByTestId("exercise-name")).toHaveText(A);
  await expect(page.getByTestId("exercise-slide")).toHaveAttribute(
    "data-dir",
    "prev",
  );
  // Previous comes in from the left (negative x), and settles at 0.
  expect(back).toBeLessThan(0);
  await expect
    .poll(() =>
      page
        .getByTestId("exercise-slide")
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  // Fields still take focus and typing after the slide (iOS focus fix).
  await page.getByTestId("weight-field").click();
  await page.keyboard.type("42");
  await expect(page.getByTestId("weight-field")).toHaveValue("42");
});

test("note 2: set 1 with last time's numbers shows the ruler, on screen", async ({
  page,
}) => {
  const EX = await makeExercise(page, "Ruler1");
  await startSessionWith(page, EX);
  // A bare first set (nothing typed, no last time) stays keyboard-only.
  await page.getByTestId("weight-field").click();
  await expect(page.getByTestId("weight-ruler")).toHaveCount(0);
  await logBilateralSet(page, "50", "10");
  await finishSession(page);
  // Next workout: set 1 opens on last time's 50 (seeded value or grey
  // ghost); with a value to tune, the ruler is there (it used to wait for a
  // logged set in this session).
  await startSessionWith(page, EX);
  const w = page.getByTestId("weight-field");
  await w.click();
  expect((await w.inputValue()) || (await w.getAttribute("data-ghost"))).toBe(
    "50",
  );
  const ruler = page.getByTestId("weight-ruler");
  await expect(ruler).toBeInViewport({ ratio: 1 });
  await page.getByTestId("reps-field").click();
  await expect(page.getByTestId("reps-ruler")).toBeInViewport({ ratio: 1 });
});

test("notes 3 + 4: setup sheet has no preset icons; a position is typed on the number keypad", async ({
  page,
}) => {
  const EX = await makeExercise(page, "Setup");
  await startSessionWith(page, EX);
  await page.getByTestId("setup-add").click();
  await expect(page.getByTestId("setup-presets")).toBeVisible();
  await expect(
    page.getByTestId("setup-setting-seat").locator("svg"),
  ).toHaveCount(0);
  await expect(page.locator('[data-testid^="setup-value-"]')).toHaveCount(0);
  const pos = page.getByTestId("setup-position");
  await expect(pos).toHaveAttribute("inputmode", "decimal");
  await pos.fill("7");
  await expect(page.getByTestId("setup-notes")).toHaveValue("Seat 7");
  await page.getByTestId("setup-position-plus").click();
  await expect(page.getByTestId("setup-notes")).toHaveValue("Seat 8");
  await page.getByTestId("setup-setting-pad").click();
  await expect(pos).toHaveValue("");
  await pos.fill("3");
  await expect(page.getByTestId("setup-notes")).toHaveValue("Seat 8, Pad 3");
});
