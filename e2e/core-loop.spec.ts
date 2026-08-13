import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  rowCount,
  signIn,
  waitForExercise,
} from "./helpers";

// Parity port of the legacy Expo E2E (archived at tag expo-final,
// e2e/web.spec.ts): add exercise → session → log sets → persistence.
// Storage is Supabase-direct, so "relaunch" persistence is a reload against
// the server, and row counts are asserted through the app's own signed-in
// client (window.__frog, VITE_E2E builds only) under RLS.
//
// Re-aimed for the Spotlight session screen (fm/frog-session-spotlight):
// the old draft/upcoming/committed row structure and its ghost-placeholder
// prefill are gone. Set 0's real (non-placeholder) prefill from a prior
// session is covered in spotlight-input.spec.ts; this file keeps only the
// exercise/session/reload persistence loop.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("core loop: add exercise, pick in session, persistence", async ({
  page,
}) => {
  const EX = `Bench ${Date.now()}`;

  // 1) Library: add an exercise -> appears in the list and lands on the server.
  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  // 2) Train: start a session, pick the exercise (writes a session_exercise).
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);
  await page.getByTestId(`pick-exercise-${EX}`).click();
  await expect(page.getByTestId("weight-field")).toBeVisible();
  await expect.poll(() => rowCount(page, "sessions")).toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => rowCount(page, "session_exercises"))
    .toBeGreaterThanOrEqual(1);

  // 3) "Relaunch" (reload) -> data persists server-side.
  await page.goto("/library");
  await page.reload();
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
});

test("logging a set via Log persists to set_logs and advances the spotlight", async ({
  page,
}) => {
  const EX = `Log ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();
  const before = await rowCount(page, "set_logs");
  await page.getByTestId("weight-field").fill("135");
  await page.getByTestId("reps-field").fill("5");
  await page.getByTestId("log-set").click();
  await expect.poll(() => rowCount(page, "set_logs")).toBe(before + 1);

  // Committing set 0 marks it done and advances the spotlight to set 1.
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  await expect(page.getByTestId("set-number")).toContainText("2");
});
