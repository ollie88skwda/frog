import { expect, test } from "@playwright/test";
import { EMAIL, PASSWORD, signIn } from "./helpers";

// Regression for the 2026-08-06 outage (docs/DECISIONS.md): the library
// already wired `isError`, but a failed load degraded straight into the
// same empty state as "you have no exercises" ("No specimens yet. Add your
// first above."). A user must never be told they have nothing when the
// truth is the request failed.

test.beforeEach(async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "run via `bun run e2e` (seeds the user)");
  await signIn(page);
});

test("a failed exercise list load shows an error, not an empty library", async ({
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

  await page.goto("/library");

  // Queries retry twice with backoff (app.tsx) before the error state is
  // reached — well past the 5s default expect timeout on a loaded runner.
  await expect(page.getByTestId("library-error")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(/couldn't reach the (server|pond)/i),
  ).toBeVisible();
  // Never the false "you have nothing" message.
  await expect(page.getByText("No specimens yet")).not.toBeVisible();
  await expect(page.getByText("No exercises yet")).not.toBeVisible();

  await page.unroute("**/api/query?fn=data:page&t=exercises*");
  await page.getByTestId("library-retry").click();
  await expect(page.getByTestId("library-error")).not.toBeVisible();
});
