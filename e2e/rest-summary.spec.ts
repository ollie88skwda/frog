import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// Session rest reporting (2026-08-08 captain feedback, still true under the
// Spotlight redesign — apps/web/src/screens/session.tsx): no session-wide
// average rest in the stats line — rest is a per-exercise gap, computed from
// each committed set's stamped rest (set-rest-stamp-{index}) and shown in the
// exercise header once there's at least one gap to average.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExerciseAndStart(page: Page, label: string) {
  const name = await makeExercise(page, label);
  await startSessionWith(page, name);
  return name;
}

test("stats line carries no session-wide rest; per-exercise rest avg appears in the exercise header", async ({
  page,
}) => {
  const EX = await makeExerciseAndStart(page, "RestAvg");

  // First set of the exercise has no rest gap yet — no per-exercise average,
  // and the stats line never shows a session-wide rest average at all.
  await logBilateralSet(page, "100", "5");
  await expect(page.getByTestId("session-stats")).toContainText("1 set");
  await expect(page.getByTestId("session-stats")).not.toContainText("rest");
  await expect(page.getByTestId(`block-${EX}-rest-avg`)).toHaveCount(0);

  // Commit a second set after a real rest gap → the header shows its own
  // average rest (mm:ss), which only makes sense per exercise.
  await page.waitForTimeout(2200);
  await logBilateralSet(page, "100", "5"); // typing into weight-field stops the rest
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
}: {
  page: Page;
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const EX = await makeExercise(page, "RestChip");
  await startSessionWith(page, EX);
  await logBilateralSet(page, "100", "5");

  const chip = page.getByTestId("conditions-chip");
  await expect(chip).toBeVisible();
  const chipBox = (await chip.boundingBox()) ?? { x: 0, y: 0, width: 0 };
  expect(chipBox.width).toBeGreaterThanOrEqual(130);
  expect(chipBox.x).toBeGreaterThanOrEqual(0);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(320);

  await chip.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
