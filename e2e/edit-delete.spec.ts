import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, rowCount, signIn, waitForExercise } from "./helpers";

// G2 + G3: edit/delete logged data + exercise tags.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("edit a committed set; delete a set; both survive reload", async ({ page }) => {
  const EX = `EditLift ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  // Wait for the insert to land server-side before navigating — a full-page
  // goto aborts the optimistic create's in-flight request.
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  const before = await rowCount(page, "set_logs");
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Log two sets.
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-reps").press("Enter");
  await expect(page.getByTestId("set-1-weight")).toBeVisible();
  await page.getByTestId("set-1-weight").fill("110");
  await page.getByTestId("set-1-reps").fill("3");
  await page.getByTestId("set-1-reps").press("Enter");
  await expect(page.getByTestId("set-2-weight")).toBeVisible();
  // Both rows persisted → the optimistic temp ids have been swapped for real
  // ones, so edit/delete below target actual rows.
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 2);

  // Edit set 1: click the weight, change it, save.
  await page.getByTestId("committed-0-weight").click();
  await page.getByTestId("edit-0-weight").fill("105");
  await page.getByTestId("edit-0-save").click();
  await expect(page.getByTestId("committed-0-weight")).toHaveText("105");

  // Delete set 2 via the set-options (⋯) menu.
  await page.getByTestId("committed-1").hover();
  await page.getByTestId("set-menu-1").click();
  await page.getByTestId("set-menu-1-delete").click();
  await expect(page.getByTestId("committed-1")).not.toBeVisible();

  // Reload: edit persisted, deleted set stays gone.
  await page.reload();
  await expect(page.getByTestId("committed-0-weight")).toHaveText("105");
  await expect(page.getByTestId("committed-1")).not.toBeVisible();
});

test("delete a custom exercise removes it from the picker; tags round-trip", async ({ page }) => {
  const EX = `Tagged ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  // Tag it.
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  await page.getByTestId(`tag-input-${EX}`).fill("pull");
  await page.getByTestId(`tag-input-${EX}`).press("Enter");
  // Wait for the tag write to land server-side before reloading (reload aborts
  // in-flight requests).
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const { data, error } = await window.__sbl.supabase
          .from("exercises")
          .select("tags")
          .eq("name", name)
          .single();
        if (error) throw new Error(error.message);
        return (data?.tags as string[] | null) ?? [];
      }, EX),
    )
    .toContain("pull");
  await page.reload();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toContainText("pull");

  // Archive it (soft-delete; history kept). Confirm in the dialog.
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  await page.getByTestId(`archive-exercise-${EX}`).click();
  await page.getByTestId(`confirm-archive-${EX}`).click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).not.toBeVisible();

  // Gone from the session picker too.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page.getByTestId("pick-exercise-Squat")).toBeVisible();
  await expect(page.getByTestId(`pick-exercise-${EX}`)).not.toBeVisible();
  // Close the auto-opened picker before reaching the header.
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // End the session through the finish overlay.
  await page.getByTestId("end-session-btn").click();
  await page.getByTestId("finish-save").click();
});
