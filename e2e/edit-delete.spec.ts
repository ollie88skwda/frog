import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  liveRowCount,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";
import { openSetTypeMenu } from "./spotlight-helpers";

// G2 + G3: edit/delete logged data + exercise tags.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("edit a committed set; delete a set; both survive reload", async ({
  page,
}) => {
  const EX = `EditLift ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  // Wait for the insert to land server-side before navigating — a full-page
  // goto aborts the optimistic create's in-flight request.
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  const before = await rowCount(page, "set_logs");
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Log two sets through the spotlight (Spotlight redesign — no separate
  // per-index "Add set" button; committing one advances to the next).
  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("5");
  await page.getByTestId("log-set").click();
  await page.getByTestId("weight-field").fill("110");
  await page.getByTestId("reps-field").fill("3");
  await page.getByTestId("log-set").click();
  // Both rows persisted → the optimistic temp ids have been swapped for real
  // ones, so edit/delete below target actual rows.
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 2);

  // Edit set 0: tap its mark to reopen it, change the weight, Log to save.
  await page.getByTestId("set-mark-0").click();
  await page.getByTestId("weight-field").fill("105");
  await page.getByTestId("log-set").click();

  // Delete set 1 via the set-type menu's Delete item.
  const liveBefore = await liveRowCount(page, "set_logs");
  await page.getByTestId("set-mark-1").click();
  await openSetTypeMenu(page);
  // First tap arms the confirm step; the second (same testid, label flips to
  // "Confirm delete") actually deletes.
  await page.getByTestId("set-type-delete").click();
  await page.getByTestId("set-type-delete").click();
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "todo",
  );
  // The removal above is optimistic — wait for the soft delete to land
  // server-side, otherwise the reload can abort the in-flight request and the
  // set comes back.
  await expect.poll(() => liveRowCount(page, "set_logs")).toBe(liveBefore - 1);

  // Reload: edit persisted, deleted set stays gone.
  await page.reload();
  await page.getByTestId("set-mark-0").click();
  await expect(page.getByTestId("weight-field")).toHaveValue("105");
  await expect(page.getByTestId("set-mark-1-state")).toHaveAttribute(
    "data-state",
    "todo",
  );
});

test("delete a custom exercise removes it from the picker; tags round-trip", async ({
  page,
}) => {
  const EX = `Tagged ${Date.now()}`;
  const copy = `${EX} (copy)`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  // The published row is frozen (community phase, docs/DECISIONS.md
  // 2026-08-08) — fork a private copy to get an editable row.
  await page.getByTestId(`exercise-row-toggle-${EX}`).click();
  await page.getByTestId(`fork-exercise-${EX}`).click();
  await expect(page.getByTestId(`exercise-row-${copy}`)).toBeVisible();
  await waitForExercise(page, copy);

  // Tag the private copy.
  await page.getByTestId(`exercise-row-toggle-${copy}`).click();
  await page.getByTestId(`tag-input-${copy}`).fill("pull");
  await page.getByTestId(`tag-input-${copy}`).press("Enter");
  // Wait for the tag write to land server-side before reloading (reload aborts
  // in-flight requests).
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const { data, error } = await window.__frog.supabase
          .from("exercises")
          .select("tags")
          .eq("name", name)
          .single();
        if (error) throw new Error(error.message);
        return (data?.tags as string[] | null) ?? [];
      }, copy),
    )
    .toContain("pull");
  await page.reload();
  await page.getByTestId("exercise-search-input").fill(copy);
  await expect(page.getByTestId(`exercise-row-${copy}`)).toContainText("pull");

  // Archive it (soft-delete; history kept). Confirm in the dialog.
  await page.getByTestId(`exercise-row-toggle-${copy}`).click();
  await page.getByTestId(`archive-exercise-${copy}`).click();
  await page.getByTestId(`confirm-archive-${copy}`).click();
  await expect(page.getByTestId(`exercise-row-${copy}`)).not.toBeVisible();

  // Gone from the session picker too (the published shared original stays —
  // only the private copy was deleted).
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page.getByTestId("pick-exercise-Squat")).toBeVisible();
  await expect(page.getByTestId(`pick-exercise-${copy}`)).not.toBeVisible();
  // Close the auto-opened picker before reaching the header.
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  // End the session through the finish overlay.
  await page.getByTestId("session-finish").click();
  await page.getByTestId("finish-save").click();
});
