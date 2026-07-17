import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, rowCount, signIn, waitForExercise } from "./helpers";

// Parity port of the legacy Expo E2E (archived at tag expo-final,
// e2e/web.spec.ts): add exercise → session → log sets → ghost prefill →
// persistence. Storage is now Supabase-direct, so "relaunch" persistence is a
// reload against the server, and row counts are asserted through the app's own
// signed-in client (window.__sbl, VITE_E2E builds only) under RLS.





test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("core loop: add exercise, pick in session, persistence", async ({ page }) => {
  const EX = `Bench ${Date.now()}`;

  // 1) Library: add an exercise -> appears in the list and lands on the server.
  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  // 2) Train: start a session, pick the exercise (writes a session_exercise).
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId("set-0-weight")).toBeVisible();
  await expect.poll(() => rowCount(page, "sessions")).toBeGreaterThanOrEqual(1);
  await expect.poll(() => rowCount(page, "session_exercises")).toBeGreaterThanOrEqual(1);

  // 3) "Relaunch" (reload) -> data persists server-side.
  await page.goto("/library");
  await page.reload();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
});

test("log sets persists to set_logs, and ghost prefill shows the prior session", async ({
  page,
}) => {
  const EX = `Log ${Date.now()}`;

  await page.goto("/library");
  await page.getByTestId("exercise-name-input").fill(EX);
  await page.getByTestId("add-exercise-btn").click();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  // Session 1: log one set (135 x 5) — row commits on Enter once both are set.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  const before = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").fill("135");
  await page.getByTestId("set-0-reps").fill("5");
  await page.getByTestId("set-0-reps").press("Enter");
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // The committed row renders and the next active row appears.
  await expect(page.getByTestId("set-1-weight")).toBeVisible();

  // Session 2: ghost prefill surfaces the prior session's values as placeholders.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId("set-0-weight")).toHaveAttribute("placeholder", "135");
  await expect(page.getByTestId("set-0-reps")).toHaveAttribute("placeholder", "5");

  // Enter with empty fields adopts the ghost (tap-to-accept) and commits.
  const before2 = await rowCount(page, "set_logs");
  await page.getByTestId("set-0-weight").press("Enter");
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before2 + 1);
});
