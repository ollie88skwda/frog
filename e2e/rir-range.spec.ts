import { expect, type Page, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// RIR-as-range (report §3.4): the RIR modifier is two bounded numeric inputs
// (min/max), not a single number — mirrored on both the draft row (mid-
// logging) and a committed row's edit sheet, plus the collapsed preview badge
// on each. A pre-migration set carrying only the legacy scalar `rir` reads
// back as a zero-width range (min=max), never a fabricated spread.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

async function makeExercise(page: Page, name: string) {
  await page.goto("/library");
  await createExercise(page, name);
  await waitForExercise(page, name);
}

test("mid-logging: an RIR range fills the collapsed badge and commits as a pair", async ({
  page,
}) => {
  const EX = `RirRange ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  // Weight only, so far — auto-checkoff (weight+reps both filled) hasn't
  // armed yet, so opening the details sheet next can't race it.
  await page.getByTestId("set-0-weight").fill("100");

  await page.getByTestId("set-0-more").click();
  await page.getByTestId("set-0-rirmin").fill("1");
  await page.getByTestId("set-0-rirmax").fill("2");
  await expect(page.getByTestId("set-0-note")).toBeVisible(); // sheet is open
  await page.keyboard.press("Escape");

  // Live preview badge next to the details trigger, sheet closed.
  await expect(page.locator(`[data-testid="block-${EX}"]`)).toContainText(
    "@1-2",
  );

  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  // Committed row's own edit sheet reads the range back unchanged.
  await page.getByTestId("committed-0-weight").click();
  await expect(page.getByTestId("edit-0-rirmin")).toHaveValue("1");
  await expect(page.getByTestId("edit-0-rirmax")).toHaveValue("2");
});

test("min equal to max collapses to a single number, not a zero-width range", async ({
  page,
}) => {
  const EX = `RirEqual ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-more").click();
  await page.getByTestId("set-0-rirmin").fill("2");
  await page.getByTestId("set-0-rirmax").fill("2");
  await page.keyboard.press("Escape");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();

  const row = page.getByTestId("committed-0");
  await expect(row).toContainText("@2");
  await expect(row).not.toContainText("@2-2");
});

test("read-time compat: a legacy scalar-only rir reads back as min=max, never a fabricated range", async ({
  page,
}) => {
  const EX = `RirLegacy ${Date.now()}`;
  await makeExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-add").click();
  await expect(page.getByTestId("committed-0-weight")).toBeVisible();

  // Simulate a pre-migration row: only the legacy scalar `rir` column set,
  // the range columns null — exactly what a set logged before this feature
  // would look like. Scoped by this test's own exercise name, not "most
  // recent", so a set left over from another test in the same run can't
  // be the one that gets rewritten.
  await page.evaluate(async (exerciseName) => {
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
    const { data: sl, error: slErr } = await sb
      .from("set_logs")
      .select("id")
      .eq("session_exercise_id", (se as { id: string }).id)
      .single();
    if (slErr) throw new Error(slErr.message);
    const { error } = await sb
      .from("set_logs")
      .update({ rir: 2, rir_min: null, rir_max: null })
      .eq("id", (sl as { id: string }).id);
    if (error) throw new Error(error.message);
  }, EX);

  await page.reload();

  const row = page.getByTestId("committed-0");
  await expect(row).toContainText("@2");
  await expect(row).not.toContainText("@2-2");

  await page.getByTestId("committed-0-weight").click();
  await expect(page.getByTestId("edit-0-rirmin")).toHaveValue("2");
  await expect(page.getByTestId("edit-0-rirmax")).toHaveValue("2");
});
