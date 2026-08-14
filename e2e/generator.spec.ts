import { expect, type Page, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// M11 Trainer: answer the questionnaire → a generated program materializes into
// a folder of routines + an active `programs` row; the Next-workout card starts
// a routine session with the grid prefilled.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await page.addInitScript(() => localStorage.setItem("unit", "kg"));
  await signIn(page);
  // Independent of other program specs: clear any active program so the
  // Trainer shows the questionnaire.
  await page.evaluate(async () => {
    await window.__frog.supabase
      .from("programs")
      .update({ active: false })
      .eq("active", true);
  });
});

async function activeGeneratedPrograms(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { count } = await window.__frog.supabase
      .from("programs")
      .select("id", { count: "exact", head: true })
      .eq("source", "generated")
      .eq("active", true)
      .is("deleted_at", null);
    return count ?? 0;
  });
}

test("questionnaire generates a program and starts the next workout prefilled", async ({
  page,
}) => {
  await page.goto("/trainer");

  // Onboarding questionnaire is shown (no active program).
  await expect(page.getByTestId("q-goal")).toBeVisible();

  // Pick a small program: strength / beginner / 3 days / 45 min.
  await page.getByTestId("q-goal-strength").click();
  await page.getByTestId("q-experience-beginner").click();
  await page.getByTestId("q-days-3").click();
  await page.getByTestId("q-minutes-45").click();

  // Live preview renders once the library loads.
  await expect(page.getByTestId("generated-preview")).toBeVisible();

  const start = page.getByTestId("start-program-btn");
  await expect(start).toBeEnabled();
  await start.click();

  // Dashboard replaces the questionnaire once the program is active.
  await expect(page.getByTestId("next-workout-card")).toBeVisible();
  expect(await activeGeneratedPrograms(page)).toBe(1);

  // Start the next workout → a prefilled routine session.
  await page.getByTestId("start-next-workout-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  // The first exercise's spotlight is present (rep-range target seeded).
  await expect(page.getByTestId("reps-field")).toBeVisible();

  // The session carries routine provenance and at least one exercise block.
  const blocks = await page.evaluate(async () => {
    const s = window.__frog.supabase;
    const sess = await s
      .from("sessions")
      .select("id, routine_id")
      .is("ended_at", null)
      .not("routine_id", "is", null)
      .order("started_at", { ascending: false })
      .limit(1);
    const id = sess.data?.[0]?.id as string | undefined;
    if (!id) return 0;
    const { count } = await s
      .from("session_exercises")
      .select("id", { count: "exact", head: true })
      .eq("session_id", id)
      .is("deleted_at", null);
    return count ?? 0;
  });
  expect(blocks).toBeGreaterThan(0);
});
