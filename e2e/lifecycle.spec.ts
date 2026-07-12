import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, rowCount, signIn } from "./helpers";

// G1: end session + resume-active on Train.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("start → resume restores sets → end → resume gone", async ({ page }) => {
  const EX = `Cycle ${Date.now()}`;

  // Close any sessions left open by other specs so "resume gone" is decisive.
  await page.evaluate(async () => {
    const { error } = await window.__sbl.supabase
      .from("sessions")
      .update({ ended_at: Date.now(), updated_at: Date.now() })
      .is("ended_at", null);
    if (error) throw new Error(error.message);
  });

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();

  // Start and log one set.
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  const sessionUrl = page.url();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("100");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-reps").blur();
  await expect(page.getByTestId("set-1-weight")).toBeVisible();
  // Ensure the background write landed before navigating away (goto is a full
  // page load and would abort the in-flight insert).
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // Train shows resume; resuming lands on the same session with the set restored.
  await page.goto("/");
  await expect(page.getByTestId("resume-session-btn")).toBeVisible();
  await page.getByTestId("resume-session-btn").click();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByTestId("committed-0-weight")).toHaveText("100");

  // End: ended_at stamped, resume disappears.
  await page.getByTestId("end-session-btn").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("resume-session-btn")).not.toBeVisible();
  const endedCount = await page.evaluate(async () => {
    const { count, error } = await window.__sbl.supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
  expect(endedCount).toBeGreaterThanOrEqual(1);
});
