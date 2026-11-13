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
  await page.route("**/api/query?fn=sessions:detail*", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        status: "error",
        errorMessage: "Server Error\nUncaught Error: simulated outage",
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
  await page.unroute("**/api/query?fn=sessions:detail*");
  await page.getByTestId("session-retry").click();
  await expect(page.getByTestId("session-error")).not.toBeVisible();
  await expect(page.getByTestId("session-finish")).toBeVisible();
});

test("a failed exercise load in the in-session picker shows an error, not an empty library", async ({
  page,
}) => {
  await page.route("**/api/query?fn=data:page&t=exercises*", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        status: "error",
        errorMessage: "Server Error\nUncaught Error: simulated outage",
      }),
    });
  });

  // Full load with the route already installed, so nothing is cached.
  await page.goto("/");
  await page.getByTestId("start-session-btn").click();

  // The picker still auto-opens on a session with no blocks (unchanged by
  // the redesign) — this is the first thing the user sees under exactly the
  // drift being guarded against. The session's own "No exercises yet."
  // empty state sits behind the dialog and stays in the DOM (Radix doesn't
  // unmount background content), so it isn't a meaningful assertion here —
  // what matters is the dialog itself shows an error, not its own empty list.
  await expect(page.getByTestId("picker-error")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(/couldn't reach the (server|pond)/i),
  ).toBeVisible();

  await page.unroute("**/api/query?fn=data:page&t=exercises*");
  await page.getByTestId("picker-retry").click();
  await expect(page.getByTestId("picker-error")).not.toBeVisible();
});
