import { expect, test } from "@playwright/test";
import {
  createExercise,
  EMAIL,
  PASSWORD,
  signIn,
  waitForExercise,
} from "./helpers";

// Regression for the 2026-08-06 outage (docs/DECISIONS.md): `logSet` had no
// `onError`, so once a write exhausted its retries (app.tsx: mutations
// retry 3x) the failure was completely invisible — the optimistic row just
// sat there looking saved while nothing had actually persisted.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a set write that exhausts its retries shows an error with a retry", async ({
  page,
}) => {
  const EX = `LogError ${Date.now()}`;

  await page.goto("/library");
  await createExercise(page, EX);
  await expect(page.getByTestId(`exercise-row-${EX}`)).toBeVisible();
  await waitForExercise(page, EX);

  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();
  await page.getByTestId(`pick-exercise-${EX}`).click();

  // Fail every attempt (initial + all 3 retries) so the mutation's onError
  // actually fires.
  await page.route("**/rest/v1/set_logs*", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 500, body: "simulated outage" });
  });

  await page.getByTestId("weight-field").fill("100");
  await page.getByTestId("reps-field").fill("5");
  await page.getByTestId("log-set").click();

  // The optimistic row appears immediately regardless...
  await expect(page.getByTestId("set-mark-0-state")).toHaveAttribute(
    "data-state",
    "done",
  );
  // ...but once retries are exhausted, the failure must surface.
  await expect(page.getByTestId("set-sync-error")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(/couldn't reach the (server|pond)/i),
  ).toBeVisible();

  // Retry from the banner, now that the network is healthy again.
  await page.unroute("**/rest/v1/set_logs*");
  await page.getByTestId("set-sync-retry").click();
  await expect(page.getByTestId("set-sync-error")).not.toBeVisible();
});
