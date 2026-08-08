import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Session rest reporting (2026-08-08 captain feedback): no session-wide
// average rest in the stats line — rest is a per-exercise gap, so each block
// header shows its own average once it has a committed set that carries one,
// and the Log Conditions chip stays fully visible on narrow phones.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

async function startSession(page: Page, name: string) {
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${name}`).click();
}

async function commitSet(page: Page, n: number, weight: string) {
  await page.getByTestId(`set-${n}-weight`).fill(weight);
  await page.getByTestId(`set-${n}-reps`).fill("5");
  await page.getByTestId(`set-${n}-add`).click();
}

test("stats line carries no session-wide rest; per-exercise rest avg appears in the block header", async ({
  page,
}) => {
  const EX = `RestAvg ${Date.now()}`;
  await makeExercise(page, EX);
  await startSession(page, EX);

  // First set of the exercise has no rest gap yet — no per-exercise average,
  // and the stats line never shows a session-wide rest average at all.
  await commitSet(page, 0, "100");
  await expect(page.getByTestId("session-stats")).toContainText("1 set");
  await expect(page.getByTestId("session-stats")).not.toContainText("rest");
  await expect(page.getByTestId("session-stats")).not.toContainText("avg");
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toBeHidden();

  // Commit a second set after a real rest gap → the block shows its own
  // average rest (mm:ss), which only makes sense per exercise.
  await page.waitForTimeout(2200);
  await commitSet(page, 1, "100");
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toBeVisible();
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toHaveText(
    /^rest \d+:\d{2} avg$/,
  );
  await expect(page.getByTestId("session-stats")).toContainText("2 sets");
  await expect(page.getByTestId("session-stats")).not.toContainText("rest");

  // The average survives a reload — it's computed from committed rows.
  await page.reload();
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toBeVisible();
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toHaveText(
    /^rest \d+:\d{2} avg$/,
  );
});

test("Log Conditions chip is fully visible on a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const EX = `RestChip ${Date.now()}`;
  await makeExercise(page, EX);
  await startSession(page, EX);
  await commitSet(page, 0, "100");

  const chip = page.getByTestId("conditions-chip");
  await expect(chip).toBeVisible();
  const chipBox = (await chip.boundingBox()) ?? { x: 0, y: 0, width: 0 };
  // The whole button (icon + label) fits on screen and isn't squeezed to a
  // sliver by the stats text (the pre-fix bug: shrink-0 stats crushed it) —
  // the stats line wraps / drops to its own row instead.
  expect(chipBox.width).toBeGreaterThanOrEqual(130);
  expect(chipBox.x).toBeGreaterThanOrEqual(0);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(320);

  // Still tappable mid-session: opens the conditions dialog.
  await chip.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
