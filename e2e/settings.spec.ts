import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M12: settings hub — device-local unit prefs persist, and the warm-up method
// editor edits the stored ramp. (First-day-of-week was a user_prefs setting;
// the week now hardcodes to Sunday everywhere — see docs/DECISIONS.md
// 2026-07-30 — and the picker here is gone.)

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("unit toggles persist across reload", async ({ page }) => {
  await page.goto("/settings");

  await page.getByTestId("unit-kg").click();
  await page.getByTestId("distance-unit-km").click();
  await page.getByTestId("measurement-unit-cm").click();

  const stored = await page.evaluate(() => ({
    unit: localStorage.getItem("unit"),
    distance: localStorage.getItem("distanceUnit"),
    measurement: localStorage.getItem("measurementUnit"),
  }));
  expect(stored).toEqual({ unit: "kg", distance: "km", measurement: "cm" });

  // The stored choice re-hydrates the active segment after a full reload.
  await page.reload();
  await expect(page.getByTestId("unit-kg")).toHaveClass(/bg-surface-active/);
  await expect(page.getByTestId("distance-unit-km")).toHaveClass(
    /bg-surface-active/,
  );
});

test("warm-up method editor adds, removes, and resets steps", async ({
  page,
}) => {
  await page.goto("/settings");

  // Default ramp = 3 steps (0..2).
  await expect(page.getByTestId("warmup-step-2")).toBeVisible();
  await expect(page.getByTestId("warmup-step-3")).toHaveCount(0);

  await page.getByTestId("warmup-add-step").click();
  await expect(page.getByTestId("warmup-step-3")).toBeVisible();

  // Editing marks the ramp custom (persisted to localStorage).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("warmupMethod")))
    .not.toBeNull();

  // Remove the first row → back to 3 rows (re-indexed 0..2).
  await page.getByTestId("warmup-remove-0").click();
  await expect(page.getByTestId("warmup-step-3")).toHaveCount(0);

  // Reset clears the override.
  await page.getByTestId("warmup-reset").click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("warmupMethod")))
    .toBeNull();
});
