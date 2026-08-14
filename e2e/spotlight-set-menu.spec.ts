import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";
import {
  logBilateralSet,
  makeExercise,
  openSetTypeMenu,
  startSessionWith,
} from "./spotlight-helpers";

// Set-type menu (testid-contract.md "The spotlight input" + behavioural
// clause #7): the ⋯ menu offers exactly warm-up / per-side / delete — no
// superset or drop-set control exists anywhere in the session UI.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("warm-up marks the current set and shows on its mark once logged", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MenuWarmup");
  await startSessionWith(page, EX);

  await openSetTypeMenu(page);
  await page.getByTestId("set-type-warmup").click();
  await logBilateralSet(page, "40", "12");
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "warmup",
  );
});

test("per-side splits the current set's reps by side", async ({ page }) => {
  const EX = await makeExercise(page, "MenuPerSide");
  await startSessionWith(page, EX);

  await openSetTypeMenu(page);
  await page.getByTestId("set-type-perside").click();
  await expect(page.getByTestId("reps-field-left")).toBeVisible();
  await expect(page.getByTestId("reps-field-right")).toBeVisible();
});

test("delete removes the current set", async ({ page }) => {
  const EX = await makeExercise(page, "MenuDelete");
  await startSessionWith(page, EX);

  await logBilateralSet(page, "50", "8");
  await logBilateralSet(page, "55", "6"); // set 1 now open

  // Scoped by this exercise's own session_exercise, not a bare weight match
  // (the account's display unit isn't forced to kg here, so a raw "50"
  // filter would silently match zero rows even before deleting anything).
  const liveRowCount = async () =>
    page.evaluate(async (exerciseName) => {
      const sb = window.__frog.supabase;
      const { data: ex, error: exErr } = await sb
        .from("exercises")
        .select("id")
        .eq("name", exerciseName)
        .single();
      if (exErr) throw new Error(exErr.message);
      const { data: se, error: seErr } = await sb
        .from("session_exercises")
        .select("id")
        .eq("exercise_id", (ex as { id: string }).id)
        .single();
      if (seErr) throw new Error(seErr.message);
      const { count, error } = await sb
        .from("set_logs")
        .select("id", { count: "exact", head: true })
        .eq("session_exercise_id", (se as { id: string }).id)
        .eq("set_no", 0)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }, EX);
  expect(await liveRowCount()).toBe(1);

  // Reopen set 0 and delete it (same testid, two-tap confirm: the first
  // arms the delete, the second — label now "Confirm delete" — commits it).
  await page.getByTestId("set-mark-0").click();
  await openSetTypeMenu(page);
  await page.getByTestId("set-type-delete").click();
  await page.getByTestId("set-type-delete").click();

  await expect.poll(liveRowCount).toBe(0);
});

test("the set-type menu offers no superset or drop-set control", async ({
  page,
}) => {
  const EX = await makeExercise(page, "MenuNoSSType");
  await startSessionWith(page, EX);

  // set-type-delete only renders once reopened on an already-committed set
  // (session.tsx: onDelete is null for the still-open current set) — commit
  // one first so all three menu items are present to check.
  await logBilateralSet(page, "50", "5");
  await page.getByTestId("set-mark-0").click();

  await openSetTypeMenu(page);
  await expect(page.getByTestId("set-type-warmup")).toBeVisible();
  await expect(page.getByTestId("set-type-perside")).toBeVisible();
  await expect(page.getByTestId("set-type-delete")).toBeVisible();

  await expect(page.getByText(/superset/i)).toHaveCount(0);
  await expect(page.getByText(/drop set/i)).toHaveCount(0);
});

test("no superset or drop-set control exists anywhere in the session screen", async ({
  page,
}) => {
  const A = await makeExercise(page, "NoSSControlGlobalA");
  const B = await makeExercise(page, "NoSSControlGlobalB");
  await startSessionWith(page, A);
  await page.getByTestId("open-exercise-picker").click();
  await page.getByTestId(`pick-exercise-${B}`).click();

  // Sweep every visible affordance on the session screen for superset/drop
  // wording, not just the set-type menu — the old exercise-level ⋯ menu is
  // the other place this used to live.
  await expect(page.getByText(/superset/i)).toHaveCount(0);
  await expect(page.getByText(/drop set/i)).toHaveCount(0);
});
