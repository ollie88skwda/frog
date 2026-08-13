import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import { logBilateralSet, makeExercise, startSessionWith } from "./spotlight-helpers";

// The Spotlight redesign replaced the old per-exercise live rest-average
// dock (`block-${name}-rest-avg`) with a single per-session rest stopwatch
// that stamps each committed set (`set-rest-stamp-{index}`) — see
// spotlight-rest.spec.ts, which owns that coverage now. This file keeps only
// the part of the original spec unrelated to that redesign: the Log
// Conditions chip's layout on a narrow phone.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
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
