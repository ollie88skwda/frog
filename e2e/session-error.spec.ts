import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Regression for the 2026-08-06 outage (docs/DECISIONS.md): a 400 on
// session_exercises (a schema-drifted column, a dropped connection, ...)
// used to leave `blocks` null forever, and `if (blocks === null) return
// null;` rendered a completely blank screen — no header, no error, nothing.
// The seed effect that fills `blocks` never got a second chance because the
// failing query was never retried by anything the user could see.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a failed session-exercises load shows an error, never a blank screen", async ({
  page,
}) => {
  await page.route("**/rest/v1/session_exercises*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "42703",
        message: "column set_logs_1.rir_min does not exist",
      }),
    });
  });

  await page.getByTestId("start-session-btn").click();
  await expect(page).toHaveURL(/\/session\//);

  // Queries retry twice with backoff (app.tsx) before the error state is
  // reached — well past the 5s default expect timeout on a loaded runner.
  await expect(page.getByTestId("session-error")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("session-loading")).not.toBeVisible();
  // The pre-fix bug: a blank screen with no header, no finish button, no
  // text of any kind — assert the page actually says something.
  await expect(
    page.getByText(/couldn't reach the (server|pond)/i),
  ).toBeVisible();

  // Retry, now that the drift is "fixed": the same screen recovers without
  // a full reload.
  await page.unroute("**/rest/v1/session_exercises*");
  await page.getByTestId("session-retry").click();
  await expect(page.getByTestId("session-error")).not.toBeVisible();
  await expect(page.getByTestId("end-session-btn")).toBeVisible();
});

test("a failed exercise load in the in-session picker shows an error, not an empty library", async ({
  page,
}) => {
  await page.route("**/rest/v1/exercises*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "42703",
        message: "column exercises.mechanic does not exist",
      }),
    });
  });

  // Full load with the route already installed, so nothing is cached.
  await page.goto("/train");
  await page.getByTestId("start-session-btn").click();

  // The picker auto-opens on a session with no blocks — this is the first
  // thing the user sees under exactly the drift being guarded against.
  await expect(page.getByTestId("picker-error")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("No exercises yet")).not.toBeVisible();
  await expect(
    page.getByText(/couldn't reach the (server|pond)/i),
  ).toBeVisible();

  await page.unroute("**/rest/v1/exercises*");
  await page.getByTestId("picker-retry").click();
  await expect(page.getByTestId("picker-error")).not.toBeVisible();
});
