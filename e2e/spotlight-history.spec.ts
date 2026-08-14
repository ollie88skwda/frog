import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  startSessionWith,
} from "./spotlight-helpers";

// Behavioural clause #7 (testid-contract.md): supersets and drop sets are
// gone from the session UI entirely, but a session carrying legacy
// superset_group / set_type='drop' data (logged before this redesign, or
// resumed mid-session) must still render its sets without erroring.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a session carrying legacy superset + drop-set data still renders on reload, with no superset/drop UI", async ({
  page,
}) => {
  const A = await makeExercise(page, "LegacyGroupedA");
  const B = await makeExercise(page, "LegacyGroupedB");

  await startSessionWith(page, A);
  await logBilateralSet(page, "80", "8");
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();
  await logBilateralSet(page, "60", "10");

  // Simulate pre-redesign data: link A and B into a superset, and mark A's
  // set as a legacy drop set — both concepts the new UI no longer offers a
  // way to create.
  await page.evaluate(
    async ({ exA }) => {
      const sb = window.__frog.supabase;
      const { data: ex, error: exErr } = await sb
        .from("exercises")
        .select("id")
        .eq("name", exA)
        .single();
      if (exErr) throw new Error(exErr.message);
      const { data: sessionExercises, error: seErr } = await sb
        .from("session_exercises")
        .select("id")
        .eq("exercise_id", (ex as { id: string }).id);
      if (seErr) throw new Error(seErr.message);
      const seId = (sessionExercises as { id: string }[])[0].id;
      const { error: groupErr } = await sb
        .from("session_exercises")
        .update({ superset_group: 1 })
        .eq("id", seId);
      if (groupErr) throw new Error(groupErr.message);
      const { error: dropErr } = await sb
        .from("set_logs")
        .update({ set_type: "drop" })
        .eq("session_exercise_id", seId);
      if (dropErr) throw new Error(dropErr.message);
    },
    { exA: A },
  );

  await page.reload();

  // The session still loads (no error state) and both exercises are intact.
  await expect(page.getByTestId("session-error")).toHaveCount(0);
  await expect(page.getByTestId("exercise-header")).toBeVisible();
  await page.getByTestId("exercise-header").click();
  await expect(page.getByTestId("exercise-sheet-row-0")).toContainText(A);
  await expect(page.getByTestId("exercise-sheet-row-1")).toContainText(B);
  await page.getByTestId("exercise-sheet-row-0").click();

  // A's logged (now legacy-drop-typed) set still renders as a mark, in some
  // completed state — just never through a drop-set-specific control.
  await expect(page.getByTestId("set-mark-0-state")).not.toHaveAttribute(
    "data-state",
    "todo",
  );

  // No surviving superset/drop-set wording anywhere on screen.
  await expect(page.getByText(/superset/i)).toHaveCount(0);
  await expect(page.getByText(/drop set/i)).toHaveCount(0);
});
